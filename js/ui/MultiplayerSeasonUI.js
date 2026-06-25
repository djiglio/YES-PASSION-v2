import { MatchEngine } from '../engine/MatchEngine.js';
import { DataLoader } from '../data/DataLoader.js';
import { supabase } from '../supabase.js';

export class MultiplayerSeasonUI {
    constructor(app, containerElement) {
        this.app = app;
        this.state = app.state;
        this.container = containerElement;
        
        this.lobby = this.state.mpLobby;
        this.players = this.state.mpPlayers;
        this.currentUser = this.app.authUI.currentUser;
        this.isHost = this.lobby.host_id === this.currentUser.id;
        
        this.seasonState = this.lobby.season_state || null;
        this.realtimeChannel = null;
        
        this.isSimulatingFast = false;
        this.fastSimTimeout = null;
    }

    async init() {
        if (!this.seasonState) {
            this.container.innerHTML = `<div class="loader">Attesa generazione calendario dall'Host...</div>`;
            if (this.isHost) {
                await this.generateAndPushSeason();
            }
        }

        this.subscribeToUpdates();
        if (this.seasonState) {
            this.render();
        }
    }

    async generateAndPushSeason() {
        // Load the season data
        const seasonId = this.lobby.draft_state.currentSeasonId;
        const rawData = await DataLoader.loadSeason(seasonId);
        
        // Use GameState to generate the initial season state
        const initialState = this.state.initMultiplayerSeason(rawData, this.lobby.draft_state, this.players);
        
        // Push to supabase
        const { data, error } = await supabase.from('lobbies')
            .update({ season_state: initialState })
            .eq('id', this.lobby.id)
            .select()
            .single();
            
        if (!error && data) {
            this.seasonState = data.season_state;
            this.render();
        }
    }

    subscribeToUpdates() {
        this.realtimeChannel = supabase.channel(`lobby-season-${this.lobby.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${this.lobby.id}` },
                (payload) => {
                    if (payload.new.season_state) {
                        this.seasonState = payload.new.season_state;
                        this.handleStateUpdate();
                    }
                }
            )
            .subscribe();
    }

    handleStateUpdate() {
        // If we received new match results and the matchday advanced, animate it!
        if (this.seasonState.lastMatchResults && !this.isHost) { // Host animates immediately before pushing
            this.renderLiveResults(this.seasonState.lastMatchResults);
        } else {
            this.render();
        }
    }

    render() {
        if (!this.seasonState) return;

        if (this.seasonState.isFinished || this.seasonState.matchday > 38) {
            this.renderEndSeason();
            return;
        }

        const matchdayMatches = this.seasonState.schedule[this.seasonState.matchday - 1];
        
        // Find match involving this user, or any human user if user is eliminated (not applicable here)
        let userMatch = matchdayMatches.find(m => m.home === this.currentUser.id || m.away === this.currentUser.id);
        if (!userMatch) userMatch = matchdayMatches[0]; // fallback if watching

        let html = `
            <div class="season-container">
                <div class="season-left">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                        <h2>Classifica <span style="font-size:1rem; color:var(--text-muted);">(Giornata ${this.seasonState.matchday}/38)</span></h2>
                        <span class="season-badge" style="font-size: 1.1rem; font-weight: 800; padding: 0.4rem 1rem; background: rgba(0, 230, 255, 0.1); border: 1px solid var(--border-color); color: var(--accent);">Stagione: ${this.seasonState.seasonInfo.name}</span>
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
                        ${this.seasonState.standings.map((t, idx) => `
                        <div class="s-row ${t.id === this.currentUser.id ? 's-user' : ''} ${t.isUser ? 's-human' : ''} ${this.getZoneClass(idx)}">
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
                            ${this.isHost ? `
                                ${!this.isSimulatingFast ? `
                                    <button id="btn-play-day" class="btn">Gioca Giornata</button>
                                    <button id="btn-sim-fast" class="btn btn-secondary">Simula Automatica (5s/giornata)</button>
                                    <button id="btn-sim-all" class="btn btn-danger">Simula Tutto Subito</button>
                                ` : `
                                    <button id="btn-stop-sim" class="btn btn-danger">Ferma Simulazione</button>
                                `}
                            ` : `<div style="text-align:center; padding:1rem; color:var(--text-muted);">In attesa dell'Host...</div>`}
                        </div>
                        
                        <div id="match-results-area" class="match-results-area"></div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEvents();
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
        if (!this.isHost) return;

        const btnPlay = document.getElementById('btn-play-day');
        const btnSimFast = document.getElementById('btn-sim-fast');
        const btnSimAll = document.getElementById('btn-sim-all');
        const btnStopSim = document.getElementById('btn-stop-sim');

        if (btnPlay) btnPlay.addEventListener('click', () => this.simulateMatchday());
        if (btnSimFast) btnSimFast.addEventListener('click', () => {
            this.isSimulatingFast = true;
            this.render();
            this.fastSimLoop();
        });
        if (btnSimAll) btnSimAll.addEventListener('click', () => this.simulateAllRemaining());
        if (btnStopSim) btnStopSim.addEventListener('click', () => {
            this.isSimulatingFast = false;
            clearTimeout(this.fastSimTimeout);
            this.render();
        });
    }

    async simulateMatchday() {
        if (this.seasonState.matchday > 38) return;

        const matches = this.seasonState.schedule[this.seasonState.matchday - 1];
        let matchResults = [];

        matches.forEach(m => {
            const homeT = this.seasonState.standings.find(t => t.id === m.home);
            const awayT = this.seasonState.standings.find(t => t.id === m.away);
            const result = MatchEngine.simulateMatch(homeT, awayT);
            matchResults.push(result);
        });

        // Apply results to a clone of the state
        let nextState = JSON.parse(JSON.stringify(this.seasonState));
        this.updateStateStandings(nextState, matchResults);
        nextState.matchday++;
        nextState.lastMatchResults = matchResults;
        
        if (nextState.matchday > 38) {
            nextState.isFinished = true;
        }

        // Host animates immediately, then pushes
        this.seasonState = nextState;
        this.renderLiveResults(matchResults, true);
    }

    updateStateStandings(state, matchResults) {
        matchResults.forEach(res => {
            const homeT = state.standings.find(t => t.id === res.homeId);
            const awayT = state.standings.find(t => t.id === res.awayId);

            homeT.played++; awayT.played++;
            homeT.gf += res.homeScore; homeT.ga += res.awayScore; homeT.gd = homeT.gf - homeT.ga;
            awayT.gf += res.awayScore; awayT.ga += res.homeScore; awayT.gd = awayT.gf - awayT.ga;

            if (res.homeScore > res.awayScore) { homeT.won++; homeT.points += 3; awayT.lost++; } 
            else if (res.homeScore < res.awayScore) { awayT.won++; awayT.points += 3; homeT.lost++; } 
            else { homeT.drawn++; awayT.drawn++; homeT.points += 1; awayT.points += 1; }
        });

        // Sort standings
        state.standings.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return a.name.localeCompare(b.name);
        });
    }

    renderLiveResults(matchResults, isHostPushing = false) {
        const resultsArea = document.getElementById('match-results-area');
        if (!resultsArea) return;

        let userMatchResult = matchResults.find(m => m.homeId === this.currentUser.id || m.awayId === this.currentUser.id);
        if (!userMatchResult) userMatchResult = matchResults[0];

        resultsArea.innerHTML = `
            <div class="user-result" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 12px; margin-top: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="color: var(--accent); text-transform: uppercase; font-size: 0.9rem; margin: 0;">Risultato Live</h4>
                    <span id="live-timer" style="background: rgba(255, 0, 0, 0.2); border: 1px solid red; color: white; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: bold; font-family: monospace;">0'</span>
                </div>
                <div class="scoreline" style="display: flex; justify-content: center; align-items: center; gap: 1.5rem; font-size: 1.5rem; font-weight: 900; white-space: nowrap;">
                    <span style="flex:1; text-align:right; overflow: hidden; text-overflow: ellipsis;">${userMatchResult.homeTeam}</span>
                    <span id="live-score" style="background: rgba(0, 230, 255, 0.1); border: 1px solid rgba(0, 230, 255, 0.3); color: var(--accent); padding: 0.5rem 1rem; border-radius: 8px; min-width: 80px; text-align: center;">0 - 0</span>
                    <span style="flex:1; text-align:left; overflow: hidden; text-overflow: ellipsis;">${userMatchResult.awayTeam}</span>
                </div>
                
                <div class="scorers-container" style="display: flex; justify-content: space-between; margin-top: 1.5rem; font-size: 0.9rem; color: var(--text-muted); min-height: 80px;">
                    <div id="live-home-scorers" style="flex: 1; text-align: right; padding-right: 1.5rem; border-right: 1px solid rgba(255,255,255,0.1);"></div>
                    <div id="live-away-scorers" style="flex: 1; text-align: left; padding-left: 1.5rem;"></div>
                </div>
                <div id="live-controls" style="margin-top: 1rem; text-align: center;"></div>
            </div>
        `;

        if (this.isHost && !this.isSimulatingFast) {
            document.getElementById('btn-play-day').disabled = true;
            document.getElementById('btn-sim-fast').disabled = true;
            document.getElementById('btn-sim-all').disabled = true;
        }

        this.animateMatch(userMatchResult, isHostPushing);
    }

    animateMatch(userResult, isHostPushing) {
        let currentMinute = 0;
        let currentHomeScore = 0;
        let currentAwayScore = 0;
        
        const homeEvents = userResult.events.filter(e => e.isHome).sort((a,b) => a.minute - b.minute);
        const awayEvents = userResult.events.filter(e => !e.isHome).sort((a,b) => a.minute - b.minute);

        const timerEl = document.getElementById('live-timer');
        const scoreEl = document.getElementById('live-score');
        const homeScorersEl = document.getElementById('live-home-scorers');
        const awayScorersEl = document.getElementById('live-away-scorers');

        const interval = setInterval(async () => {
            currentMinute++;
            if (timerEl) timerEl.innerText = currentMinute + "'";

            const hEvents = homeEvents.filter(e => e.minute === currentMinute);
            const aEvents = awayEvents.filter(e => e.minute === currentMinute);

            hEvents.forEach(e => {
                currentHomeScore++;
                homeScorersEl.innerHTML += `<div>${e.scorer} <strong>${e.minute}'</strong></div>`;
            });

            aEvents.forEach(e => {
                currentAwayScore++;
                awayScorersEl.innerHTML += `<div><strong>${e.minute}'</strong> ${e.scorer}</div>`;
            });

            if (hEvents.length > 0 || aEvents.length > 0) {
                if (scoreEl) scoreEl.innerText = `${currentHomeScore} - ${currentAwayScore}`;
            }

            if (currentMinute >= 90) {
                clearInterval(interval);
                if (timerEl) {
                    timerEl.innerText = "FINALE";
                    timerEl.style.background = "rgba(0, 230, 255, 0.2)";
                    timerEl.style.color = "var(--accent)";
                }
                
                this.updateStandingsUIOnly();

                if (isHostPushing) {
                    await supabase.from('lobbies').update({ season_state: this.seasonState }).eq('id', this.lobby.id);
                }

                if (this.isHost) {
                    if (!this.isSimulatingFast) {
                        const controls = document.getElementById('live-controls');
                        if (controls) {
                            controls.innerHTML = `<button id="btn-next-day" class="btn">Avanti</button>`;
                            document.getElementById('btn-next-day').addEventListener('click', () => this.render());
                        }
                    } else {
                        this.fastSimTimeout = setTimeout(() => this.fastSimLoop(), 1000);
                    }
                }
            }
        }, 30);
    }

    updateStandingsUIOnly() {
        const table = this.container.querySelector('.standings-table');
        if (!table) return;

        let html = `
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
            ${this.seasonState.standings.map((t, idx) => `
            <div class="s-row ${t.id === this.currentUser.id ? 's-user' : ''} ${t.isUser ? 's-human' : ''} ${this.getZoneClass(idx)}">
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
        `;
        table.innerHTML = html;
    }

    async fastSimLoop() {
        if (!this.isSimulatingFast || this.seasonState.matchday > 38) {
            this.isSimulatingFast = false;
            this.render();
            return;
        }
        await this.simulateMatchday();
    }

    async simulateAllRemaining() {
        this.container.innerHTML = `<div class="loader">Simulazione Campionato in corso...</div>`;
        
        let nextState = JSON.parse(JSON.stringify(this.seasonState));

        while (nextState.matchday <= 38) {
            const matches = nextState.schedule[nextState.matchday - 1];
            let matchResults = [];

            matches.forEach(m => {
                const homeT = nextState.standings.find(t => t.id === m.home);
                const awayT = nextState.standings.find(t => t.id === m.away);
                matchResults.push(MatchEngine.simulateMatch(homeT, awayT));
            });

            this.updateStateStandings(nextState, matchResults);
            nextState.matchday++;
        }
        
        nextState.isFinished = true;
        this.seasonState = nextState;
        
        await supabase.from('lobbies').update({ season_state: this.seasonState }).eq('id', this.lobby.id);
        this.renderEndSeason();
    }

    async renderEndSeason() {
        if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);

        const pos = this.seasonState.standings.findIndex(t => t.id === this.currentUser.id) + 1;
        const totalPoints = this.seasonState.standings.find(t => t.id === this.currentUser.id).points;
        const myTeam = this.seasonState.standings.find(t => t.id === this.currentUser.id);

        if (this.isHost) {
            // Update leaderboards via edge function or direct
            try {
                // Here we'd call the edge function if available, but for now we'll let users read results
                await supabase.from('lobbies').update({ status: 'finished' }).eq('id', this.lobby.id);
            } catch(e) {}
        }

        let html = `
            <div class="end-season-container" style="text-align: center; max-width: 800px; margin: 0 auto; padding: 3rem;">
                <h1 style="color: var(--accent); font-size: 3rem; margin-bottom: 1rem; text-shadow: 0 0 20px rgba(0, 230, 255, 0.5);">STAGIONE CONCLUSA</h1>
                <h2>Hai terminato in ${pos}ª Posizione con ${totalPoints} Punti.</h2>
                
                <div style="display: flex; gap: 2rem; justify-content: center; margin: 2rem 0;">
                    <div style="background: rgba(0,0,0,0.5); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                        <h3>Statistiche Squadra</h3>
                        <p>Vittorie: ${myTeam.won}</p>
                        <p>Pareggi: ${myTeam.drawn}</p>
                        <p>Sconfitte: ${myTeam.lost}</p>
                        <p>Gol Fatti: ${myTeam.gf}</p>
                        <p>Gol Subiti: ${myTeam.ga}</p>
                    </div>
                    
                    <div style="background: rgba(0,0,0,0.5); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); flex: 1;">
                        <h3>Classifica Finale</h3>
                        <div style="max-height: 200px; overflow-y: auto; text-align: left;">
                            ${this.seasonState.standings.slice(0,5).map((t, i) => `
                                <div style="display: flex; justify-content: space-between; padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); ${t.isUser ? 'color: var(--accent); font-weight: bold;' : ''}">
                                    <span>${i+1}. ${t.name}</span>
                                    <span>${t.points} pt</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <button id="btn-back-menu" class="btn btn-primary" style="padding: 1rem 3rem; font-size: 1.2rem;">Torna al Menu Principale</button>
            </div>
        `;

        this.container.innerHTML = html;
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            this.app.startHome();
        });
    }
}
