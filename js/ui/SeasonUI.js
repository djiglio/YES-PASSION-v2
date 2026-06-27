import { MatchEngine } from '../engine/MatchEngine.js';
import { supabase } from '../supabase.js';
import { StatsEngine } from '../engine/StatsEngine.js';

export class SeasonUI {
    constructor(gameState, containerElement) {
        this.state = gameState;
        this.container = containerElement;
        this.isSimulatingFast = false;
        this.fastSimTimeout = null;
    }

    init() {
        this.render();
    }

    render() {
        if (this.state.matchday > this.state.schedule.length) {
            this.renderEndSeason();
            return;
        }

        const currentMatches = this.state.schedule[this.state.matchday - 1];
        const userMatch = currentMatches.find(m => m.home === 'user_team' || m.away === 'user_team');
        const homeTeamName = this.getTeamName(userMatch.home);
        const awayTeamName = this.getTeamName(userMatch.away);

        let html = `
            <div class="season-container">
                <div class="season-left">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                        <h2 style="background: linear-gradient(135deg, #e2e8f0 0%, #ffffff 50%, #94a3b8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 500; font-size: 1.5rem; letter-spacing: 2px; filter: drop-shadow(0 0 10px rgba(255,255,255,0.4)); margin:0;">Classifica <span style="font-size:1rem; color:var(--text-muted);">(Giornata ${this.state.matchday}/${this.state.schedule.length})</span></h2>
                        <span class="season-badge" style="font-size: 1.1rem; font-weight: 800; padding: 0.4rem 1rem; background: rgba(0, 230, 255, 0.1); border: 1px solid var(--border-color); color: var(--accent);">Stagione: ${this.state.currentSeason.season_name}</span>
                    </div>
                    <div class="standings-table">
                        <div class="s-row s-header">
                            <div class="s-pos">#</div>
                            <div class="s-team">Squadra</div>
                            <div class="s-pts">PT</div>
                            <div class="s-stat">G</div>
                            <div class="s-stat">V</div>
                            <div class="s-stat">N</div>
                            <div class="s-stat">P</div>
                            <div class="s-stat">DR</div>
                        </div>
                        ${this.state.standings.map((t, idx) => `
                        <div class="s-row ${t.isUser ? 's-user' : ''} ${this.getZoneClass(idx)}">
                                <div class="s-pos">${idx + 1}</div>
                                <div class="s-team">${t.name}</div>
                                <div class="s-pts">${t.points}</div>
                                <div class="s-stat">${t.played}</div>
                                <div class="s-stat">${t.won}</div>
                                <div class="s-stat">${t.drawn}</div>
                                <div class="s-stat">${t.lost}</div>
                                <div class="s-stat">${t.gd}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="season-right">
                    <div class="next-match-card">
                        <div class="sim-controls">
                            ${this.isSimulatingFast ? `
                                <button id="btn-stop-sim" class="btn btn-danger">Ferma Simulazione</button>
                            ` : `
                                <button id="btn-play-day" class="btn">Gioca Giornata</button>
                                <button id="btn-sim-fast" class="btn btn-secondary">Simula Automatica (5s/giornata)</button>
                                <button id="btn-sim-all" class="btn btn-danger">Simula Tutto Subito</button>
                            `}
                        </div>
                        
                        <div id="match-results-area" class="match-results-area"></div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEvents();
    }

    handleBack() {
        if (this.state.phase === 'MATCHDAY') {
            window.showAlert("Non puoi tornare indietro durante il match!");
            return true;
        }
        if (this.state.phase === 'SEASON_INIT') {
            if (this.state.isFinished || this.state.matchday > this.state.schedule.length) {
                const globalBackBtn = document.getElementById('global-back-btn');
                if (globalBackBtn) {
                    globalBackBtn.innerHTML = '<span style="font-size: 1.4rem; line-height: 1;">&larr;</span> Indietro';
                }
                this.state.setPhase('HOME');
                return true;
            }
            window.showAlert("Non puoi tornare indietro durante il campionato!");
            return true;
        }
        return false;
    }

    getTeamName(id) {
        return this.state.standings.find(t => t.id === id)?.name || id;
    }

    getZoneClass(idx) {
        if (idx === 0) return 's-scudetto';
        if (idx >= 1 && idx <= 3) return 's-champions';
        if (idx === 4) return 's-europa';
        if (idx === 5) return 's-conference';
        if (idx >= 17 && idx <= 19) return 's-relegation';
        return '';
    }

    attachEvents() {
        const btnPlay = document.getElementById('btn-play-day');
        const btnSimFast = document.getElementById('btn-sim-fast');
        const btnSimAll = document.getElementById('btn-sim-all');
        const btnStopSim = document.getElementById('btn-stop-sim');

        if (btnPlay) btnPlay.addEventListener('click', () => this.simulateMatchday());
        if (btnSimFast) btnSimFast.addEventListener('click', () => this.startFastSim());
        if (btnSimAll) btnSimAll.addEventListener('click', () => this.simulateRemainingSeason());
        if (btnStopSim) btnStopSim.addEventListener('click', () => this.stopFastSim());

    }

    simulateMatchday() {
        if (this.state.matchday > this.state.schedule.length) return;

        const currentMatches = this.state.schedule[this.state.matchday - 1];
        
        // Aggiorna dinamicamente l'intestazione e il riquadro della partita durante la simulazione veloce
        const dayHeader = this.container.querySelector('.season-left h2 span');
        if (dayHeader) {
            dayHeader.textContent = `(Giornata ${this.state.matchday}/${this.state.schedule.length})`;
        }

        const userMatch = currentMatches.find(m => m.home === 'user_team' || m.away === 'user_team');

        const matchResults = [];
        let userMatchResult = null;

        currentMatches.forEach(match => {
            const homeT = this.state.standings.find(t => t.id === match.home);
            const awayT = this.state.standings.find(t => t.id === match.away);

            const result = MatchEngine.simulateMatch(homeT, awayT);
            matchResults.push({
                homeId: match.home,
                awayId: match.away,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                homeCleanSheet: result.homeCleanSheet,
                awayCleanSheet: result.awayCleanSheet,
                events: result.events
            });

            if (match.home === 'user_team' || match.away === 'user_team') {
                userMatchResult = result;
            }
        });

        // Setup the UI for animation
        const resultsArea = document.getElementById('match-results-area');
        if (resultsArea) {
            resultsArea.innerHTML = `
                <div class="user-result" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 12px; margin-top: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="color: var(--accent); text-transform: uppercase; font-size: 0.9rem; margin: 0;">Risultato Live</h4>
                        <span id="live-timer" style="background: rgba(255, 0, 0, 0.2); border: 1px solid red; color: white; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: bold; font-family: monospace;">0'</span>
                    </div>
                    <div class="scoreline" style="display: flex; justify-content: center; align-items: center; gap: 1.5rem; font-size: 1.5rem; font-weight: 900; white-space: nowrap;">
                        <span style="flex:1; text-align:right; overflow: hidden; text-overflow: ellipsis;">${userMatchResult.homeId === 'user_team' ? 'TU' : userMatchResult.homeTeam}</span>
                        <span id="live-score" style="background: rgba(0, 230, 255, 0.1); border: 1px solid rgba(0, 230, 255, 0.3); color: var(--accent); padding: 0.5rem 1rem; border-radius: 8px; min-width: 80px; text-align: center;">0 - 0</span>
                        <span style="flex:1; text-align:left; overflow: hidden; text-overflow: ellipsis;">${userMatchResult.awayId === 'user_team' ? 'TU' : userMatchResult.awayTeam}</span>
                    </div>
                    
                    <div class="scorers-container" style="display: flex; justify-content: space-between; margin-top: 1.5rem; font-size: 0.9rem; color: var(--text-muted); min-height: 80px;">
                        <div id="live-home-scorers" style="flex: 1; text-align: right; padding-right: 1.5rem; border-right: 1px solid rgba(255,255,255,0.1);"></div>
                        <div id="live-away-scorers" style="flex: 1; text-align: left; padding-left: 1.5rem;"></div>
                    </div>
                    <div id="live-controls" style="margin-top: 1rem; text-align: center;"></div>
                </div>
            `;

            // Disabilita i bottoni durante l'animazione se non siamo in sim veloce
            if (!this.isSimulatingFast) {
                document.getElementById('btn-play-day').disabled = true;
                document.getElementById('btn-sim-fast').disabled = true;
                document.getElementById('btn-sim-all').disabled = true;
            }

            // Start animation
            this.animateMatch(userMatchResult, matchResults);
        }
    }

    animateMatch(userResult, matchResults) {
        let currentMinute = 0;
        let currentHomeScore = 0;
        let currentAwayScore = 0;
        
        const homeEvents = userResult.events.filter(e => e.isHome).sort((a,b) => a.minute - b.minute);
        const awayEvents = userResult.events.filter(e => !e.isHome).sort((a,b) => a.minute - b.minute);

        const timerEl = document.getElementById('live-timer');
        const scoreEl = document.getElementById('live-score');
        const homeScorersEl = document.getElementById('live-home-scorers');
        const awayScorersEl = document.getElementById('live-away-scorers');

        const interval = setInterval(() => {
            currentMinute++;
            if (timerEl) timerEl.innerText = currentMinute + "'";

            // Check events for this minute
            const hEvents = homeEvents.filter(e => e.minute === currentMinute);
            const aEvents = awayEvents.filter(e => e.minute === currentMinute);

            hEvents.forEach(e => {
                currentHomeScore++;
                homeScorersEl.innerHTML += `<div>${e.scorer} <strong>${e.minute}'</strong> ${e.isPenalty ? '<span style="color:var(--accent); font-weight:bold; font-size: 0.8rem;">(RIG)</span>' : ''}</div>`;
            });

            aEvents.forEach(e => {
                currentAwayScore++;
                awayScorersEl.innerHTML += `<div><strong>${e.minute}'</strong> ${e.isPenalty ? '<span style="color:var(--accent); font-weight:bold; font-size: 0.8rem;">(RIG)</span> ' : ''}${e.scorer}</div>`;
            });

            if (hEvents.length > 0 || aEvents.length > 0) {
                if (scoreEl) scoreEl.innerText = `${currentHomeScore} - ${currentAwayScore}`;
            }

            if (currentMinute >= 90) {
                clearInterval(interval);
                if (timerEl) {
                    timerEl.innerText = "FINALE";
                    timerEl.style.background = "rgba(0, 230, 255, 0.2)";
                    timerEl.style.borderColor = "var(--accent)";
                    timerEl.style.color = "var(--accent)";
                }
                
                // End of match: update standings
                this.state.updateStandings(matchResults);
                this.state.matchday++;
                this.updateStandingsUIOnly();

                if (!this.isSimulatingFast) {
                    const controls = document.getElementById('live-controls');
                    if (controls) {
                        controls.innerHTML = `<button id="btn-next-day" class="btn">Avanti</button>`;
                        document.getElementById('btn-next-day').addEventListener('click', () => this.render());
                    }
                } else {
                    // In fast sim, wait 1.5s then proceed to next matchday
                    this.fastSimTimeout = setTimeout(() => this.fastSimLoop(), 1500);
                }
            }
        }, 30); // 30ms per minute = 2.7s for a full match
    }

    updateStandingsUIOnly() {
        // Just updates the left panel to show changes immediately before clicking Avanti
        const table = this.container.querySelector('.standings-table');
        if (!table) return;
        
        let rowsHtml = `
            <div class="s-row s-header">
                <div class="s-pos">#</div>
                <div class="s-team">Squadra</div>
                <div class="s-pts">PT</div>
                <div class="s-stat">G</div>
                <div class="s-stat">V</div>
                <div class="s-stat">N</div>
                <div class="s-stat">P</div>
                <div class="s-stat">DR</div>
            </div>
        `;
        
        rowsHtml += this.state.standings.map((t, idx) => `
            <div class="s-row ${t.isUser ? 's-user' : ''} ${this.getZoneClass(idx)}">
                <div class="s-pos">${idx + 1}</div>
                <div class="s-team">${t.name}</div>
                <div class="s-pts">${t.points}</div>
                <div class="s-stat">${t.played}</div>
                <div class="s-stat">${t.won}</div>
                <div class="s-stat">${t.drawn}</div>
                <div class="s-stat">${t.lost}</div>
                <div class="s-stat">${t.gd}</div>
            </div>
        `).join('');

        table.innerHTML = rowsHtml;
    }

    startFastSim() {
        this.isSimulatingFast = true;
        this.render(); // Mostra il bottone "Ferma"
        this.fastSimLoop();
    }

    fastSimLoop() {
        if (!this.isSimulatingFast || this.state.matchday > this.state.schedule.length) {
            this.isSimulatingFast = false;
            this.render();
            return;
        }

        this.simulateMatchday();
        // The animation inside animateMatch() handles the timeout to call fastSimLoop again
    }

    stopFastSim() {
        this.isSimulatingFast = false;
        clearTimeout(this.fastSimTimeout);
        this.render();
    }

    simulateRemainingSeason() {
        while(this.state.matchday <= this.state.schedule.length) {
            const currentMatches = this.state.schedule[this.state.matchday - 1];
            const matchResults = [];
            currentMatches.forEach(match => {
                const homeT = this.state.standings.find(t => t.id === match.home);
                const awayT = this.state.standings.find(t => t.id === match.away);
                const result = MatchEngine.simulateMatch(homeT, awayT);
                matchResults.push({
                    homeId: match.home,
                    awayId: match.away,
                    homeScore: result.homeScore,
                    awayScore: result.awayScore,
                    homeCleanSheet: result.homeCleanSheet,
                    awayCleanSheet: result.awayCleanSheet,
                    events: result.events
                });
            });
            this.state.updateStandings(matchResults);
            this.state.matchday++;
        }
        this.render();
    }

    async renderEndSeason() {
        const globalBackBtn = document.getElementById('global-back-btn');
        if (globalBackBtn) {
            globalBackBtn.innerHTML = '<span style="font-size: 1.4rem; line-height: 1;">&larr;</span> Menu';
        }

        const userTeam = this.state.standings.find(t => t.isUser);
        const finalPosition = this.state.standings.findIndex(t => t.isUser) + 1;
        const topStats = this.state.getTopStats();
        const isBudget = this.state.gameMode === 'budget';
        // Push stats to Supabase if logged in, but only once per run ID
        const { data: { session } } = await supabase.auth.getSession();
        const claimedKey = `stats_claimed_${this.state.id}`;

        if (session && session.user && !this.statsSaved && !localStorage.getItem(claimedKey)) {
            this.statsSaved = true;
            localStorage.setItem(claimedKey, 'true');
            await StatsEngine.updateSeasonStats(session.user.id, false, isBudget, {
                isAbandon: false,
                position: finalPosition,
                points: userTeam.points,
                matches: userTeam.played,
                won: userTeam.won,
                drawn: userTeam.drawn,
                lost: userTeam.lost,
                goalsScored: userTeam.gf,
                goalsConceded: userTeam.ga
            });
        }

        let outcomeMsg = '';
        if (finalPosition === 1) outcomeMsg = '<p style="font-size: 1.5rem; color: #fbbf24; font-weight: bold; margin-bottom: 0.5rem; text-shadow: 0 0 10px rgba(251,191,36,0.3);">CAMPIONE D\'ITALIA</p>';
        else if (finalPosition <= 4) outcomeMsg = '<p style="font-size: 1.2rem; color: #60a5fa; font-weight: bold; margin-bottom: 0.5rem;">Champions League</p>';
        else if (finalPosition === 5) outcomeMsg = '<p style="font-size: 1.2rem; color: #f97316; font-weight: bold; margin-bottom: 0.5rem;">Europa League</p>';
        else if (finalPosition === 6) outcomeMsg = '<p style="font-size: 1.2rem; color: #10b981; font-weight: bold; margin-bottom: 0.5rem;">Conference League</p>';
        else if (finalPosition >= 18) outcomeMsg = '<p style="font-size: 1.2rem; color: #ef4444; font-weight: bold; margin-bottom: 0.5rem;">Retrocesso</p>';

        const roleOrder = { 'POR': 1, 'TD': 2, 'DC': 3, 'TS': 4, 'CDC': 5, 'ED': 6, 'CC': 7, 'ES': 8, 'COC': 9, 'AD': 10, 'AT': 11, 'AS': 12, 'ATT': 13 };
        let sortedSquad = [...this.state.userTeam.squad].filter(p => p).sort((a, b) => {
            const roleA = (a.DeployedRole || a.Ruolo).split(',')[0].trim();
            const roleB = (b.DeployedRole || b.Ruolo).split(',')[0].trim();
            return (roleOrder[roleA] || 99) - (roleOrder[roleB] || 99);
        });

        let rosterHtml = `
            <div class="stats-table-wrapper roster-wrapper">
                <h3 class="table-title">La Tua Rosa</h3>
                <div style="overflow-x: auto;">
                    <table class="roster-table">
                        <thead>
                            <tr>
                                <th>Ruolo</th>
                                <th style="text-align: left;">Nome</th>
                                <th>OVR</th>
                                <th>Gol</th>
                                <th>Assist</th>
                                ${isBudget ? '<th>Valore</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        const playerStats = this.state.playerStats || {};
        
        sortedSquad.forEach(player => {
            const statKey = `${player.Nome}_${this.state.teamName}`;
            const stats = playerStats[statKey] || { goals: 0, assists: 0 };
            
            let valueHtml = '';
            if (isBudget) {
                valueHtml = `<td style="color: #10b981; font-weight: bold;">${player.Value}</td>`;
            }
            
            const ovrColor = player.Overall >= 85 ? 'gold' : 'white';
            const shortName = player.Nome.replace(/^[A-Z]\.\s+/, '');
            
            rosterHtml += `
                <tr>
                    <td style="font-weight: bold; color: var(--accent);">${player.DeployedRole || player.Ruolo}</td>
                    <td style="font-weight: bold; color: white; text-align: left; white-space: nowrap;">${shortName}</td>
                    <td style="font-weight: bold; color: ${ovrColor};">${player.Overall}</td>
                    <td style="color: #cbd5e1;">${stats.goals}</td>
                    <td style="color: #cbd5e1;">${stats.assists}</td>
                    ${valueHtml}
                </tr>
            `;
        });
        rosterHtml += `</tbody></table></div></div>`;

        this.container.innerHTML = `
            <div class="end-season-header" style="text-align:center; padding: 2rem 1rem;">
                <h2 style="background: linear-gradient(135deg, #e2e8f0 0%, #ffffff 50%, #94a3b8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 500; font-size: 3rem; letter-spacing: 2px; filter: drop-shadow(0 0 10px rgba(255,255,255,0.4)); margin-bottom: 0.5rem;">Stagione ${this.state.currentSeason.season_name} Conclusa!</h2>
                <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">Hai terminato il campionato al <strong>${finalPosition}° posto</strong>.</p>
                ${outcomeMsg}
                <p style="font-size: 1.2rem; color: var(--text-muted); margin-bottom: 2rem;">Punti Totali: <strong style="color: #fff;">${userTeam.points}</strong> (V: ${userTeam.won} | N: ${userTeam.drawn} | P: ${userTeam.lost})</p>
            </div>
            
            <div class="end-season-grid">
                <!-- 1. La Tua Rosa -->
                ${rosterHtml}
                
                <!-- 2. La Tua Squadra -->
                <div class="stats-card user-stats-card">
                    <h3 class="stats-card-title">${this.state.teamName || 'La Tua Squadra'}</h3>
                    <div class="stat-item">
                        <span class="stat-label">Miglior Marcatore</span><br>
                        <strong class="stat-value">${topStats.userStats.topScorer.name}</strong> <span class="stat-highlight">(${topStats.userStats.topScorer.goals} Gol)</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Miglior Assistman</span><br>
                        <strong class="stat-value">${topStats.userStats.topAssist.name}</strong> <span class="stat-highlight">(${topStats.userStats.topAssist.assists} Assist)</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Clean Sheets (Portiere/Difesa)</span><br>
                        <strong class="stat-value">${topStats.userStats.cleanSheets}</strong>
                    </div>
                </div>

                <!-- 3. MVP -->
                <div class="stats-card mvp-card">
                    <h3 class="mvp-title">Miglior Giocatore (MVP)</h3>
                    <div class="mvp-icon">🏆</div>
                    <strong class="mvp-name">${topStats.mvp ? topStats.mvp.name : '-'}</strong>
                    <span class="mvp-team">${topStats.mvp ? topStats.mvp.team : '-'}</span>
                    <div class="mvp-stats">
                        <strong>${topStats.mvp ? topStats.mvp.goals : 0}</strong> Gol | <strong>${topStats.mvp ? topStats.mvp.assists : 0}</strong> Assist
                    </div>
                </div>

                <!-- 4. Classifica Finale -->
                <div class="stats-table-wrapper standings-wrapper">
                    <h3 class="table-title">Classifica Finale</h3>
                    <div class="standings-table inner-table" style="overflow-x: auto;"></div>
                </div>

                <!-- 5. Capocannoniere -->
                <div class="stats-table-wrapper scorers-wrapper">
                    <h3 class="table-title">Capocannoniere (Top 10)</h3>
                    <div class="stats-list">
                        ${topStats.topScorers.map((p, idx) => `
                            <div class="stats-list-item ${p.isUser ? 'is-user' : ''}">
                                <div><span class="rank-num">${idx + 1}.</span> <strong>${p.name}</strong> <span class="team-name">(${p.team})</span></div>
                                <strong class="stat-highlight">${p.goals}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- 6. Miglior Assistman -->
                <div class="stats-table-wrapper assists-wrapper">
                    <h3 class="table-title">Miglior Assistman (Top 10)</h3>
                    <div class="stats-list">
                        ${topStats.topAssists.map((p, idx) => `
                            <div class="stats-list-item ${p.isUser ? 'is-user' : ''}">
                                <div><span class="rank-num">${idx + 1}.</span> <strong>${p.name}</strong> <span class="team-name">(${p.team})</span></div>
                                <strong class="stat-highlight">${p.assists}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <br><br>
        `;
        // Re-use updateStandingsUIOnly but point it to the inner table
        const table = this.container.querySelector('.end-season-grid .inner-table');
        if (table) {
            let rowsHtml = `
                <div class="s-row s-header" style="grid-template-columns: 25px 1fr 30px 25px 25px 25px 30px 45px;">
                    <div class="s-pos">#</div>
                    <div class="s-team">Squadra</div>
                    <div class="s-pts">PT</div>
                    <div class="s-stat">V</div>
                    <div class="s-stat">N</div>
                    <div class="s-stat">P</div>
                    <div class="s-stat">DR</div>
                    <div class="s-stat">R</div>
                </div>
            `;
            rowsHtml += this.state.standings.map((t, idx) => `
                <div class="s-row ${t.isUser ? 's-user' : ''} ${this.getZoneClass(idx)}" style="grid-template-columns: 25px 1fr 30px 25px 25px 25px 30px 45px;">
                    <div class="s-pos">${idx + 1}</div>
                    <div class="s-team">${t.name}</div>
                    <div class="s-pts">${t.points}</div>
                    <div class="s-stat">${t.won}</div>
                    <div class="s-stat">${t.drawn}</div>
                    <div class="s-stat">${t.lost}</div>
                    <div class="s-stat">${t.gd}</div>
                    <div class="s-stat" style="font-size: 0.8rem;">${t.gf}/${t.ga}</div>
                </div>
            `).join('');
            table.innerHTML = rowsHtml;
        }
    }
}
