export class MatchEngine {
    /**
     * Simulates a match between two teams
     * @param {Object} homeTeam 
     * @param {Object} awayTeam 
     */
    static simulateMatch(homeTeam, awayTeam) {
        const homeAdvantage = 1.05; 

        // Weighting midfield control
        const homeMidControl = homeTeam.stats.mid * homeAdvantage;
        const awayMidControl = awayTeam.stats.mid;
        
        // Attack vs Defense Power
        const homeAttackPower = (homeTeam.stats.att * 0.7 + homeMidControl * 0.3) * homeAdvantage;
        const awayDefensePower = (awayTeam.stats.def * 0.8 + awayTeam.stats.gk * 0.2);

        const awayAttackPower = (awayTeam.stats.att * 0.7 + awayMidControl * 0.3);
        const homeDefensePower = (homeTeam.stats.def * 0.8 + homeTeam.stats.gk * 0.2) * homeAdvantage;

        // Calculate goals
        let homeGoals = this.calculateGoals(homeAttackPower, awayDefensePower);
        let awayGoals = this.calculateGoals(awayAttackPower, homeDefensePower);

        // Generate events (names of scorers, minutes)
        const events = this.generateMatchEvents(homeGoals, awayGoals, homeTeam, awayTeam);

        return {
            homeTeam: homeTeam.name,
            awayTeam: awayTeam.name,
            homeScore: homeGoals,
            awayScore: awayGoals,
            events: events
        };
    }

    static calculateGoals(attackPower, defensePower) {
        if (defensePower === 0) defensePower = 1; // Prevent division by zero
        const ratio = attackPower / defensePower;
        
        // Base expected goals for a balanced match is around 1.2
        let expectedGoals = Math.max(0.1, (ratio - 0.85) * 4); 
        
        // RNG Variance (-0.4 to +0.4 expected goals shift)
        const luckFactor = (Math.random() * 0.8) - 0.4; 
        expectedGoals += luckFactor;

        let actualGoals = Math.round(expectedGoals);
        if (actualGoals < 0) actualGoals = 0;
        
        // Rare chance of explosion
        if (Math.random() > 0.95 && actualGoals > 0) {
            actualGoals += Math.floor(Math.random() * 2) + 1; 
        }

        return actualGoals;
    }

    static generateMatchEvents(homeGoals, awayGoals, homeTeam, awayTeam) {
        const events = [];
        
        const createGoalEvents = (goals, teamObj, isHome) => {
            for (let i = 0; i < goals; i++) {
                const minute = Math.floor(Math.random() * 90) + 1;
                let scorer = "Sconosciuto";
                let isPenalty = Math.random() < 0.1; // 10% chance for a penalty

                if (teamObj.squad && teamObj.squad.length > 0) {
                    // Bias towards attackers
                    const rand = Math.random();
                    let targetRole = 'ATT';
                    if (rand > 0.7) targetRole = 'CC'; // Midfielders
                    if (rand > 0.9) targetRole = 'DC'; // Defenders

                    const candidates = teamObj.squad.filter(p => p.Ruolo && p.Ruolo.includes(targetRole));
                    if (candidates.length > 0) {
                        scorer = candidates[Math.floor(Math.random() * candidates.length)].Nome;
                    } else {
                        scorer = teamObj.squad[Math.floor(Math.random() * teamObj.squad.length)].Nome;
                    }
                }

                events.push({
                    minute: minute,
                    team: teamObj.name,
                    scorer: scorer,
                    isHome: isHome,
                    isPenalty: isPenalty
                });
            }
        };

        createGoalEvents(homeGoals, homeTeam, true);
        createGoalEvents(awayGoals, awayTeam, false);

        // Sort events chronologically
        events.sort((a, b) => a.minute - b.minute);
        return events;
    }
}
