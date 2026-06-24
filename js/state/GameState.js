export const GAME_PHASES = {
    INIT: 'INIT',
    DRAFT: 'DRAFT',
    SEASON_INIT: 'SEASON_INIT',
    MATCHDAY: 'MATCHDAY',
    END_SEASON: 'END_SEASON'
};

export class GameState {
    constructor() {
        this.phase = GAME_PHASES.INIT;
        this.userTeam = {
            formation: null,
            squad: [],
            stats: { att: 0, mid: 0, def: 0, gk: 0 },
            points: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            wins: 0,
            draws: 0,
            losses: 0
        };
        this.currentSeason = null;
        this.matchday = 1;
        this.schedule = [];
        this.standings = [];
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this));
    }

    setPhase(newPhase) {
        this.phase = newPhase;
        this.notifyListeners();
    }

    startDraft(formation) {
        this.userTeam.formation = formation;
        this.setPhase(GAME_PHASES.DRAFT);
    }

    completeDraft(draftedPlayers) {
        this.userTeam.squad = draftedPlayers;
        this.calculateUserTeamStats();
        // Transition will be handled by main flow after picking season
    }

    calculateUserTeamStats() {
        // Basic calculation: average of players by role
        // A more complex one would factor the formation properly
        const squad = this.userTeam.squad;
        if (squad.length === 0) return;

        let attSum = 0, attCount = 0;
        let midSum = 0, midCount = 0;
        let defSum = 0, defCount = 0;
        let gkSum = 0, gkCount = 0;

        squad.forEach(player => {
            const role = player.Ruolo; // Assuming Italian roles like ATT, CC, DC, POR
            const ovr = parseInt(player.Overall, 10);
            
            if (role.includes('POR')) { gkSum += ovr; gkCount++; }
            else if (['DC', 'TS', 'TD', 'ASA', 'ADA'].some(r => role.includes(r))) { defSum += ovr; defCount++; }
            else if (['CDC', 'CC', 'COC', 'ES', 'ED'].some(r => role.includes(r))) { midSum += ovr; midCount++; }
            else { attSum += ovr; attCount++; }
        });

        this.userTeam.stats = {
            att: attCount > 0 ? Math.round(attSum / attCount) : 0,
            mid: midCount > 0 ? Math.round(midSum / midCount) : 0,
            def: defCount > 0 ? Math.round(defSum / defCount) : 0,
            gk: gkCount > 0 ? Math.round(gkSum / gkCount) : 0
        };
    }

    startSeason(seasonData) {
        this.currentSeason = seasonData;
        this.matchday = 1;
        this.playerStats = {}; // To track goals, assists, clean sheets

        // 1. Sort teams by real points and remove the worst
        let teams = [...this.currentSeason.teams];
        teams.sort((a, b) => a.real_points - b.real_points);
        teams.shift(); // Remove the lowest team

        // 2. Add user team
        const userTeamObj = {
            id: 'user_team',
            name: 'La Tua Squadra',
            isUser: true,
            stats: this.userTeam.stats,
            players: this.userTeam.squad // map to players, mapped to squad in init standings
        };
        teams.push(userTeamObj);

        // 3. Initialize Standings
        this.standings = teams.map(t => {
            let squadToUse = t.isUser ? (t.players || []) : this.generateCPUSquad(t.players);
            return {
                id: t.id,
                name: t.name,
                isUser: t.isUser || false,
                points: 0,
                played: 0,
                won: 0,
                drawn: 0,
                lost: 0,
                gf: 0,
                ga: 0,
                gd: 0,
                stats: t.isUser ? t.stats : {
                    att: t.squad_strength.att_ovr,
                    mid: t.squad_strength.mid_ovr,
                    def: t.squad_strength.def_ovr,
                    gk: t.squad_strength.gk_ovr
                },
                squad: squadToUse,
                fullRoster: t.isUser ? null : t.players
            };
        });

        // 4. Generate Schedule (Round Robin)
        this.schedule = this.generateRoundRobin(teams);

        this.setPhase(GAME_PHASES.SEASON_INIT);
    }

    generateCPUSquad(teamPlayers) {
        if (!teamPlayers || teamPlayers.length === 0) return [];

        const formations = [
            ['POR', 'DC', 'DC', 'TS', 'TD', 'CC', 'CC', 'ES', 'ED', 'ATT', 'ATT'], // 4-4-2
            ['POR', 'DC', 'DC', 'TS', 'TD', 'CDC', 'CC', 'CC', 'AS', 'AD', 'ATT'], // 4-3-3
            ['POR', 'DC', 'DC', 'DC', 'CC', 'CC', 'ES', 'ED', 'COC', 'ATT', 'ATT'], // 3-5-2
            ['POR', 'DC', 'DC', 'TS', 'TD', 'CDC', 'CDC', 'COC', 'AS', 'AD', 'ATT'] // 4-2-3-1
        ];
        const chosenFormation = formations[Math.floor(Math.random() * formations.length)];
        
        let squad = [];
        let availablePlayers = [...teamPlayers];
        
        chosenFormation.forEach(role => {
            let bestIdx = -1;
            let bestOvr = -1;
            
            for (let i = 0; i < availablePlayers.length; i++) {
                const p = availablePlayers[i];
                if (p.Ruolo && p.Ruolo.includes(role) && p.Overall > bestOvr) {
                    bestOvr = p.Overall;
                    bestIdx = i;
                }
            }
            
            if (bestIdx === -1) {
                for (let i = 0; i < availablePlayers.length; i++) {
                    const p = availablePlayers[i];
                    if (p.Overall > bestOvr) {
                        bestOvr = p.Overall;
                        bestIdx = i;
                    }
                }
            }
            
            if (bestIdx !== -1) {
                squad.push(availablePlayers[bestIdx]);
                availablePlayers.splice(bestIdx, 1);
            }
        });
        
        return squad;
    }

    generateRoundRobin(teams) {
        let schedule = [];
        const n = teams.length;
        let dummy = null;
        
        let teamIds = teams.map(t => t.id);

        for (let round = 0; round < n - 1; round++) {
            let matchday = [];
            for (let i = 0; i < n / 2; i++) {
                let home = teamIds[i];
                let away = teamIds[n - 1 - i];
                // Alternate home/away for the first element
                if (i === 0 && round % 2 === 1) {
                    [home, away] = [away, home];
                }
                matchday.push({ home, away });
            }
            schedule.push(matchday);
            // Rotate array: keep index 0, shift others right
            teamIds.splice(1, 0, teamIds.pop());
        }

        // Second half of the season (reverse home/away AND reverse matchday order)
        let secondHalf = schedule.map(matchday => 
            matchday.map(match => ({ home: match.away, away: match.home }))
        ).reverse();

        return schedule.concat(secondHalf);
    }

    updateStandings(matchResults) {
        matchResults.forEach(res => {
            const homeT = this.standings.find(t => t.id === res.homeId);
            const awayT = this.standings.find(t => t.id === res.awayId);

            homeT.played++;
            awayT.played++;
            homeT.gf += res.homeScore;
            homeT.ga += res.awayScore;
            homeT.gd = homeT.gf - homeT.ga;

            awayT.gf += res.awayScore;
            awayT.ga += res.homeScore;
            awayT.gd = awayT.gf - awayT.ga;

            if (res.homeScore > res.awayScore) {
                homeT.won++;
                homeT.points += 3;
                awayT.lost++;
            } else if (res.homeScore < res.awayScore) {
                awayT.won++;
                awayT.points += 3;
                homeT.lost++;
            } else {
                homeT.drawn++;
                awayT.drawn++;
                homeT.points += 1;
                awayT.points += 1;
            }

            // --- Update Player Stats ---
            if (res.events) {
                res.events.forEach(e => {
                    const isUserTeam = e.isHome ? homeT.isUser : awayT.isUser;
                    if (e.scorer && e.scorer !== "Sconosciuto") {
                        const key = `${e.scorer}_${e.team}`;
                        if (!this.playerStats[key]) this.playerStats[key] = { name: e.scorer, team: e.team, goals: 0, assists: 0, cleanSheets: 0, isUser: isUserTeam };
                        this.playerStats[key].goals++;
                    }
                    if (e.assistman) {
                        const key = `${e.assistman}_${e.team}`;
                        if (!this.playerStats[key]) this.playerStats[key] = { name: e.assistman, team: e.team, goals: 0, assists: 0, cleanSheets: 0, isUser: isUserTeam };
                        this.playerStats[key].assists++;
                    }
                });
            }

            const updateCleanSheets = (teamObj) => {
                if (!teamObj.squad) return;
                teamObj.squad.forEach(p => {
                    // Only GK and DEF get clean sheet stats
                    if (p.Ruolo && (p.Ruolo.includes('POR') || p.Ruolo.includes('DC') || p.Ruolo.includes('TS') || p.Ruolo.includes('TD'))) {
                        const key = `${p.Nome}_${teamObj.name}`;
                        if (!this.playerStats[key]) this.playerStats[key] = { name: p.Nome, team: teamObj.name, goals: 0, assists: 0, cleanSheets: 0, isUser: teamObj.isUser };
                        this.playerStats[key].cleanSheets++;
                    }
                });
            };

            if (res.homeCleanSheet) updateCleanSheets(homeT);
            if (res.awayCleanSheet) updateCleanSheets(awayT);
        });

        // Sort standings
        this.standings.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            return b.gf - a.gf;
        });

        // Update user stats
        const u = this.standings.find(t => t.isUser);
        if (u) {
            this.userTeam.points = u.points;
            this.userTeam.goalsFor = u.gf;
            this.userTeam.goalsAgainst = u.ga;
            this.userTeam.wins = u.won;
            this.userTeam.draws = u.drawn;
            this.userTeam.losses = u.lost;
        }

        this.notifyListeners();
    }

    getTopStats() {
        const players = Object.values(this.playerStats);
        
        // Compute MVP Score
        players.forEach(p => {
            p.mvpScore = p.goals + p.assists;
        });

        const topScorers = [...players].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 10);
        const topAssists = [...players].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 10);
        const mvp = [...players].sort((a, b) => b.mvpScore - a.mvpScore || b.goals - a.goals)[0];

        // User stats
        const userPlayers = players.filter(p => p.isUser);
        const userTopScorer = [...userPlayers].sort((a, b) => b.goals - a.goals)[0] || { name: '-', goals: 0 };
        const userTopAssist = [...userPlayers].sort((a, b) => b.assists - a.assists)[0] || { name: '-', assists: 0 };
        const userCleanSheets = userPlayers.length > 0 ? Math.max(...userPlayers.map(p => p.cleanSheets)) : 0;

        return {
            topScorers,
            topAssists,
            mvp,
            userStats: {
                topScorer: userTopScorer,
                topAssist: userTopAssist,
                cleanSheets: userCleanSheets
            }
        };
    }
}
