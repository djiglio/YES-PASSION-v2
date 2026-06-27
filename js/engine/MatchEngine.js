export const AVAILABLE_FORMATIONS = {
    '3-1-4-2': [ ['POR'], ['DC', 'DC', 'DC'], ['CDC'], ['ES', 'CC', 'CC', 'ED'], ['ATT', 'ATT'] ],
    '3-4-1-2': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['COC'], ['ATT', 'ATT'] ],
    '3-4-2-1': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['COC', 'COC'], ['ATT'] ],
    '3-4-3': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['AS', 'ATT', 'AD'] ],
    '3-4-3 Rombo': [ ['POR'], ['DC', 'DC', 'DC'], ['CDC'], ['ES', 'ED'], ['COC'], ['AS', 'ATT', 'AD'] ],
    '3-5-2': [ ['POR'], ['DC', 'DC', 'DC'], ['CDC', 'CDC'], ['ES', 'COC', 'ED'], ['ATT', 'ATT'] ],
    '4-1-2-1-2': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC'], ['CC', 'CC'], ['COC'], ['ATT', 'ATT'] ],
    '4-1-3-2': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC'], ['ES', 'CC', 'ED'], ['ATT', 'ATT'] ],
    '4-1-4-1': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC'], ['ES', 'CC', 'CC', 'ED'], ['ATT'] ],
    '4-2-3-1': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC', 'CDC'], ['COC', 'AT', 'COC'], ['ATT'] ],
    '4-2-3-1 Largo': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC', 'CDC'], ['ES', 'COC', 'ED'], ['ATT'] ],
    '4-2-4': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CC', 'CC'], ['AS', 'ATT', 'ATT', 'AD'] ],
    '4-3-1-2': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CC', 'CC', 'CC'], ['COC'], ['ATT', 'ATT'] ],
    '4-3-3': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CC', 'CC', 'CC'], ['AS', 'ATT', 'AD'] ],
    '4-3-3 Falso 9': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CC', 'CC', 'CC'], ['AS', 'AT', 'AD'] ],
    '5-1-2-2': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['CDC'], ['CC', 'CC'], ['ATT', 'ATT'] ],
    '5-2-1-2': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['CC', 'CC'], ['COC'], ['ATT', 'ATT'] ],
    '5-2-3': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['CC', 'CC'], ['AS', 'ATT', 'AD'] ],
    '5-4-1': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['ES', 'CC', 'CC', 'ED'], ['ATT'] ],
    '5-3-1-1': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['CC', 'CC', 'CC'], ['AT'], ['ATT'] ]
};

export class MatchEngine {
    static generateCPUSquad(teamPlayers) {
        if (!teamPlayers || teamPlayers.length === 0) return [];

        const formations = Object.values(AVAILABLE_FORMATIONS).map(rows => rows.flat());
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
                bestOvr = -1;
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

    static calculateTeamPowers(squad) {
        let attSum = 0, attCount = 0;
        let midSum = 0, midCount = 0;
        let defSum = 0, defCount = 0;
        let gkSum = 0, gkCount = 0;

        squad.forEach(player => {
            const role = player.Ruolo || '';
            const ovr = parseInt(player.Overall, 10) || 50;
            
            if (role.includes('POR')) { gkSum += ovr; gkCount++; }
            else if (['DC', 'TS', 'TD', 'ASA', 'ADA'].some(r => role.includes(r))) { defSum += ovr; defCount++; }
            else if (['CDC', 'CC', 'COC', 'ES', 'ED'].some(r => role.includes(r))) { midSum += ovr; midCount++; }
            else { attSum += ovr; attCount++; }
        });

        const calcPower = (sum, count) => {
            if (count === 0) return 0;
            const avg = sum / count;
            return (avg * 0.8) + (sum * 0.2);
        };

        return {
            att: calcPower(attSum, attCount),
            mid: calcPower(midSum, midCount),
            def: calcPower(defSum, defCount),
            gk: calcPower(gkSum, gkCount)
        };
    }

    /**
     * Simulates a match between two teams
     * @param {Object} homeTeam 
     * @param {Object} awayTeam 
     */
    static simulateMatch(homeTeam, awayTeam) {
        let homeSquad = homeTeam.squad || [];
        if (!homeTeam.isUser && homeTeam.fullRoster && homeTeam.fullRoster.length > 0) {
            homeSquad = this.generateCPUSquad(homeTeam.fullRoster);
            homeTeam.squad = homeSquad; 
        }

        let awaySquad = awayTeam.squad || [];
        if (!awayTeam.isUser && awayTeam.fullRoster && awayTeam.fullRoster.length > 0) {
            awaySquad = this.generateCPUSquad(awayTeam.fullRoster);
            awayTeam.squad = awaySquad;
        }

        const homePowers = this.calculateTeamPowers(homeSquad);
        const awayPowers = this.calculateTeamPowers(awaySquad);

        const homeAdvantage = 1.05; 

        // Weighting midfield control
        const homeMidControl = homePowers.mid * homeAdvantage;
        const awayMidControl = awayPowers.mid;
        
        // Attack vs Defense Power
        const homeAttackPower = (homePowers.att * 0.7 + homeMidControl * 0.3) * homeAdvantage;
        const awayDefensePower = (awayPowers.def * 0.8 + awayPowers.gk * 0.2);

        const awayAttackPower = (awayPowers.att * 0.7 + awayMidControl * 0.3);
        const homeDefensePower = (homePowers.def * 0.8 + homePowers.gk * 0.2) * homeAdvantage;

        // Calculate goals
        let homeGoals = this.calculateGoals(homeAttackPower, awayDefensePower);
        let awayGoals = this.calculateGoals(awayAttackPower, homeDefensePower);

        // Generate events (names of scorers, minutes)
        const events = this.generateMatchEvents(homeGoals, awayGoals, homeTeam, awayTeam);

        return {
            homeId: homeTeam.id,
            awayId: awayTeam.id,
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
            expectedGoals = 5.4 * Math.pow(ratio, 4); // Stronger team scores much more
        } else {
            expectedGoals = 5.4 * Math.pow(ratio, 5); // Weaker team scores much less
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
            // Use Overall^3 to reasonably favor better players (prevents 50+ goal anomalies)
            const totalWeight = candidates.reduce((sum, p) => sum + Math.pow(p.Overall, 3), 0);
            let rand = Math.random() * totalWeight;
            for (let p of candidates) {
                const weight = Math.pow(p.Overall, 3);
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
                    const roleGroups = {
                        'ATT': ['ATT', 'AT', 'AD', 'AS'],
                        'CC': ['CC', 'CDC', 'COC', 'ED', 'ES'],
                        'DC': ['DC', 'TS', 'TD', 'ASA', 'ADA']
                    };

                    if (isPenalty) {
                        // Penalty taker is usually the best player (heavy weighting by OVR)
                        scorer = pickWeightedPlayer(teamObj.squad.filter(p => p.Ruolo && !p.Ruolo.includes('POR')));
                    } else {
                        // Bias towards attackers (50%), Midfielders (35%), Defenders (15%)
                        const rand = Math.random();
                        let targetRole = 'ATT';
                        if (rand > 0.50) targetRole = 'CC';
                        if (rand > 0.85) targetRole = 'DC';

                        let finalAllowedRoles = roleGroups[targetRole];
                        
                        if (targetRole === 'ATT') {
                            const subRand = Math.random();
                            if (subRand <= 0.55) finalAllowedRoles = ['ATT'];
                            else finalAllowedRoles = ['AT', 'AS', 'AD'];
                        } else if (targetRole === 'CC') {
                            const subRand = Math.random();
                            if (subRand <= 0.50) finalAllowedRoles = ['COC'];
                            else if (subRand <= 0.85) finalAllowedRoles = ['CC', 'ES', 'ED'];
                            else finalAllowedRoles = ['CDC'];
                        }

                        let candidates = teamObj.squad.filter(p => {
                            if (!p.Ruolo) return false;
                            const pRoles = p.Ruolo.split(',').map(r => r.trim());
                            return pRoles.some(r => finalAllowedRoles.includes(r));
                        });

                        // Fallback to broader role group if no specific sub-role is available
                        if (candidates.length === 0) {
                            candidates = teamObj.squad.filter(p => {
                                if (!p.Ruolo) return false;
                                const pRoles = p.Ruolo.split(',').map(r => r.trim());
                                return pRoles.some(r => roleGroups[targetRole].includes(r));
                            });
                        }

                        if (candidates.length > 0) {
                            scorer = pickWeightedPlayer(candidates);
                        } else {
                            scorer = pickWeightedPlayer(teamObj.squad.filter(p => p.Ruolo && !p.Ruolo.includes('POR')));
                        }
                    }

                    // Generate assistman (70% chance if not penalty)
                    if (!isPenalty && Math.random() > 0.3) {
                        const assistRand = Math.random();
                        let assistRole = 'CC'; // Midfielders primarily
                        if (assistRand > 0.6) assistRole = 'ATT'; // Attackers
                        if (assistRand > 0.85) assistRole = 'DC'; // Defenders / Fullbacks

                        const assistCandidates = teamObj.squad.filter(p => {
                            if (!p.Ruolo || p.Nome === scorer) return false;
                            const pRoles = p.Ruolo.split(',').map(r => r.trim());
                            return pRoles.some(r => roleGroups[assistRole].includes(r));
                        });

                        if (assistCandidates.length > 0) {
                            assistman = pickWeightedPlayer(assistCandidates);
                        } else {
                            const remaining = teamObj.squad.filter(p => p.Nome !== scorer && p.Ruolo && !p.Ruolo.includes('POR'));
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
