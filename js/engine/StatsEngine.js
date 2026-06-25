import { supabase } from '../supabase.js';

export class StatsEngine {
    
    static async updateSeasonStats(userId, isMultiplayer, seasonStats) {
        // Fetch current profile stats
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error("Error fetching profile for stats update", error);
            return;
        }

        const prefix = isMultiplayer ? 'mp_' : 'sp_';
        const updates = {};

        // Helper to safely get current value
        const getVal = (key) => profile[prefix + key] || 0;

        // If it's an abandon
        if (seasonStats.isAbandon) {
            updates[`${prefix}abandons`] = getVal('abandons') + 1;
            // Also counts as a season played but no other stats incremented?
            // Actually, usually an abandon counts as a season played, to reflect on avg points.
            updates[`${prefix}seasons_played`] = getVal('seasons_played') + 1;
        } else {
            // Normal season completion
            updates[`${prefix}seasons_played`] = getVal('seasons_played') + 1;
            updates[`${prefix}total_points`] = getVal('total_points') + (seasonStats.points || 0);
            updates[`${prefix}matches_played`] = getVal('matches_played') + (seasonStats.matches || 38);
            updates[`${prefix}matches_won`] = getVal('matches_won') + (seasonStats.won || 0);
            updates[`${prefix}matches_drawn`] = getVal('matches_drawn') + (seasonStats.drawn || 0);
            updates[`${prefix}matches_lost`] = getVal('matches_lost') + (seasonStats.lost || 0);
            updates[`${prefix}goals_scored`] = getVal('goals_scored') + (seasonStats.goalsScored || 0);
            updates[`${prefix}goals_conceded`] = getVal('goals_conceded') + (seasonStats.goalsConceded || 0);

            // Qualifications
            const pos = seasonStats.position;
            if (pos === 1) updates[`${prefix}scudetti_won`] = getVal('scudetti_won') + 1;
            if (pos >= 1 && pos <= 4) updates[`${prefix}champions_qualifications`] = getVal('champions_qualifications') + 1;
            if (pos === 5) updates[`${prefix}europa_qualifications`] = getVal('europa_qualifications') + 1;
            if (pos === 6) updates[`${prefix}conference_qualifications`] = getVal('conference_qualifications') + 1;
            if (pos >= 18) updates[`${prefix}relegations`] = getVal('relegations') + 1;
        }

        // Calculate averages
        const totalSeasons = updates[`${prefix}seasons_played`] || getVal('seasons_played');
        const abandons = updates[`${prefix}abandons`] !== undefined ? updates[`${prefix}abandons`] : getVal('abandons');
        const totalPoints = updates[`${prefix}total_points`] !== undefined ? updates[`${prefix}total_points`] : getVal('total_points');

        if (totalSeasons > 0) {
            updates[`${prefix}avg_points`] = parseFloat((totalPoints / totalSeasons).toFixed(2));
            updates[`${prefix}abandon_rate`] = parseFloat(((abandons / totalSeasons) * 100).toFixed(2));
        }

        // Push updates
        await supabase.from('profiles').update(updates).eq('id', userId);
    }

    static async getLeaderboard(isMultiplayer = false) {
        const prefix = isMultiplayer ? 'mp_' : 'sp_';
        
        // We only fetch users who have played at least 1 season in this mode
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                id,
                username,
                team_name,
                ${prefix}seasons_played,
                ${prefix}total_points,
                ${prefix}avg_points,
                ${prefix}matches_played,
                ${prefix}matches_won,
                ${prefix}matches_drawn,
                ${prefix}matches_lost,
                ${prefix}goals_scored,
                ${prefix}goals_conceded,
                ${prefix}scudetti_won,
                ${prefix}champions_qualifications,
                ${prefix}europa_qualifications,
                ${prefix}conference_qualifications,
                ${prefix}relegations,
                ${prefix}abandons,
                ${prefix}abandon_rate
            `)
            .gt(`${prefix}seasons_played`, 0);

        if (error) {
            console.error("Error fetching leaderboard", error);
            return [];
        }

        // Map it to generic names to make UI rendering easier
        return data.map(row => ({
            id: row.id,
            username: row.username,
            team_name: row.team_name,
            seasons_played: row[`${prefix}seasons_played`],
            total_points: row[`${prefix}total_points`],
            avg_points: row[`${prefix}avg_points`],
            matches_played: row[`${prefix}matches_played`],
            matches_won: row[`${prefix}matches_won`],
            matches_drawn: row[`${prefix}matches_drawn`],
            matches_lost: row[`${prefix}matches_lost`],
            goals_scored: row[`${prefix}goals_scored`],
            goals_conceded: row[`${prefix}goals_conceded`],
            scudetti_won: row[`${prefix}scudetti_won`],
            champions_qualifications: row[`${prefix}champions_qualifications`],
            europa_qualifications: row[`${prefix}europa_qualifications`],
            conference_qualifications: row[`${prefix}conference_qualifications`],
            relegations: row[`${prefix}relegations`],
            abandons: row[`${prefix}abandons`],
            abandon_rate: row[`${prefix}abandon_rate`]
        }));
    }
}
