import { supabase } from '../supabase.js';

export class StatsEngine {
    
    // Gets the correct column prefix
    static getPrefix(isMultiplayer, isBudget) {
        const mode = isMultiplayer ? 'mp' : 'sp';
        const type = isBudget ? 'budget' : 'classic';
        return `${mode}_${type}_`;
    }

    // Called when the user starts a draft. Instantly adds an abandon penalty.
    // This penalty is removed if the season finishes correctly.
    static async markSeasonStart(userId, isMultiplayer, isBudget) {
        const prefix = this.getPrefix(isMultiplayer, isBudget);

        // Fetch current profile stats to get the values to increment
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`${prefix}seasons_played, ${prefix}abandons`)
            .eq('id', userId)
            .single();

        if (error) {
            console.error("Error fetching profile for season start", error);
            return;
        }

        const currentSeasons = profile[`${prefix}seasons_played`] || 0;
        const currentAbandons = profile[`${prefix}abandons`] || 0;

        const updates = {
            [`${prefix}seasons_played`]: currentSeasons + 1,
            [`${prefix}abandons`]: currentAbandons + 1
        };

        // Recalculate abandon rate
        if (updates[`${prefix}seasons_played`] > 0) {
            updates[`${prefix}abandon_rate`] = parseFloat(((updates[`${prefix}abandons`] / updates[`${prefix}seasons_played`]) * 100).toFixed(2));
        }

        await supabase.from('profiles').update(updates).eq('id', userId);
    }

    static async updateSeasonStats(userId, isMultiplayer, isBudget, seasonStats) {
        const prefix = this.getPrefix(isMultiplayer, isBudget);

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error("Error fetching profile for stats update", error);
            return;
        }

        const getVal = (key) => profile[prefix + key] || 0;
        const updates = {};

        // We assume seasons_played was already incremented in markSeasonStart.
        // We remove the abandon penalty because the season was finished successfully.
        const currentAbandons = getVal('abandons');
        updates[`${prefix}abandons`] = Math.max(0, currentAbandons - 1);

        // Add stats
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

        // Calculate averages
        const totalSeasons = getVal('seasons_played'); // do not read from updates, since we didn't update it here
        const abandons = updates[`${prefix}abandons`];
        const totalPoints = updates[`${prefix}total_points`];
        const completedSeasons = totalSeasons - abandons;

        if (completedSeasons > 0) {
            updates[`${prefix}avg_points`] = parseFloat((totalPoints / completedSeasons).toFixed(2));
        } else {
            updates[`${prefix}avg_points`] = 0;
        }

        if (totalSeasons > 0) {
            updates[`${prefix}abandon_rate`] = parseFloat(((abandons / totalSeasons) * 100).toFixed(2));
        }

        // Push updates
        await supabase.from('profiles').update(updates).eq('id', userId);
    }

    static async getLeaderboard(isMultiplayer = false, isBudget = false) {
        const prefix = this.getPrefix(isMultiplayer, isBudget);
        
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
