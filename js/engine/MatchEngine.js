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
            homeCleanSheet: awayGoals === 0,
            awayCleanSheet: homeGoals === 0,
            events: events
        };
    }

    static calculateGoals(attackPower, defensePower) {
        if (defensePower === 0) defensePower = 1;
        
        const ratio = attackPower / defensePower;
        
        // Increase the exponent to make the strong teams dominate weak teams more consistently
        let expectedGoals;
        if (ratio >= 1) {
            expectedGoals = 1.2 * Math.pow(ratio, 4); // Stronger team scores much more
        } else {
            expectedGoals = 1.2 * Math.pow(ratio, 5); // Weaker team scores much less
        }
        
        // Add a bit of random match-day variance (-0.2 to +0.2 xG)
        const luckFactor = (Math.random() * 0.4) - 0.2; 
        expectedGoals += luckFactor;
        
        if (expectedGoals < 0.1) expectedGoals = 0.1;

        // Generate goals using Poisson distribution
        return this.getPoissonRandom(expectedGoals);
    }

    static getPoissonRandom(lambda) {
        let L = Math.exp(-lambda);
        let k = 0;
        let p = 1;
        do {
            k++;
            p *= Math.random();
        } while (p > L);
        return k - 1;
    }

    static generateMatchEvents(homeGoals, awayGoals, homeTeam, awayTeam) {
        const events = [];
        
        const pickWeightedPlayer = (candidates) => {
            if (!candidates || candidates.length === 0) return null;
            // Use Overall^5 to strongly favor better players for scoring/assisting
            const totalWeight = candidates.reduce((sum, p) => sum + Math.pow(p.Overall, 5), 0);
            let rand = Math.random() * totalWeight;
            for (let p of candidates) {
                const weight = Math.pow(p.Overall, 5);
                if (rand <= weight) return p.Nome;
                rand -= weight;
            }
            return candidates[0].Nome;
        };

        const createGoalEvents = (goals, teamObj, isHome) => {
            for (let i = 0; i < goals; i++) {
                const minute = Math.floor(Math.random() * 90) + 1;
                let scorer = "Sconosciuto";
                let assistman = null;
                let isPenalty = Math.random() < 0.1; // 10% chance for a penalty

                if (teamObj.squad && teamObj.squad.length > 0) {
                    // Bias towards attackers
                    const rand = Math.random();
                    let targetRole = 'ATT';
                    if (rand > 0.7) targetRole = 'CC'; // Midfielders
                    if (rand > 0.9) targetRole = 'DC'; // Defenders

                    const candidates = teamObj.squad.filter(p => p.Ruolo && p.Ruolo.includes(targetRole));
                    if (candidates.length > 0) {
                        scorer = pickWeightedPlayer(candidates);
                    } else {
                        scorer = pickWeightedPlayer(teamObj.squad);
                    }

                    // Generate assistman (70% chance if not penalty)
                    if (!isPenalty && Math.random() > 0.3) {
                        const assistRand = Math.random();
                        let assistRole = 'CC'; // Midfielders primarily
                        if (assistRand > 0.6) assistRole = 'ATT'; // Attackers
                        if (assistRand > 0.85) assistRole = 'DC'; // Defenders / Fullbacks

                        const assistCandidates = teamObj.squad.filter(p => p.Ruolo && p.Ruolo.includes(assistRole) && p.Nome !== scorer);
                        if (assistCandidates.length > 0) {
                            assistman = pickWeightedPlayer(assistCandidates);
                        } else {
                            const remaining = teamObj.squad.filter(p => p.Nome !== scorer && !p.Ruolo.includes('POR'));
                            if (remaining.length > 0) {
                                assistman = pickWeightedPlayer(remaining);
                            }
                        }
                    }
                }

                events.push({
                    minute: minute,
                    team: teamObj.name,
                    scorer: scorer,
                    assistman: assistman,
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
