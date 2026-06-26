import { MatchEngine } from '../engine/MatchEngine.js';
import { DataLoader } from '../data/DataLoader.js';
import { StatsEngine } from '../engine/StatsEngine.js';
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
        if (this.players) {
            this.players.sort((a, b) => (a.turn_position || 0) - (b.turn_position || 0));
            this.playerColors = {};
            const colors = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6'];
            this.players.forEach((p, idx) => {
                this.playerColors[p.user_id] = colors[idx % colors.length];
            });
        }

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
        try {
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
                
            if (error) {
                window.showAlert("Supabase Error: " + error.message);
                console.error(error);
            } else if (data) {
                this.seasonState = data.season_state;
                this.render();
            }
        } catch (err) {
            window.showAlert("Errore generazione calendario: " + err.message);
            console.error(err);
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
                        <h2>Classifica <span id="season-matchday-counter" style="font-size:1rem; color:var(--text-muted);">(Giornata ${this.seasonState.matchday}/38)</span></h2>
                        <span class="season-badge" style="font-size: 1.1rem; font-weight: 800; padding: 0.4rem 1rem; background: rgba(0, 230, 255, 0.1); border: 1px solid var(--border-color); color: var(--accent);">${this.seasonState.seasonInfo.name}</span>
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
                                <div class="s-team" style="${t.isUser ? `color: ${this.playerColors ? this.playerColors[t.id] : 'var(--accent)'}; font-weight: bold;` : ''}">${t.name}</div>
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
            matchResults.push({
                homeId: m.home,
                awayId: m.away,
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                homeCleanSheet: result.homeCleanSheet,
                awayCleanSheet: result.awayCleanSheet,
                events: result.events,
                homeTeam: result.homeTeam,
                awayTeam: result.awayTeam
            });
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
            
            // --- Update Player Stats ---
            if (!state.playerStats) state.playerStats = {};
            if (res.events) {
                res.events.forEach(e => {
                    const isUserTeam = e.isHome ? homeT.isUser : awayT.isUser;
                    const teamId = e.isHome ? res.homeId : res.awayId;
                    if (e.scorer && e.scorer !== "Sconosciuto") {
                        const key = `${e.scorer}_${e.team}`;
                        if (!state.playerStats[key]) state.playerStats[key] = { name: e.scorer, team: e.team, teamId: teamId, goals: 0, assists: 0, cleanSheets: 0, isUser: isUserTeam };
                        state.playerStats[key].goals++;
                    }
                    if (e.assistman) {
                        const key = `${e.assistman}_${e.team}`;
                        if (!state.playerStats[key]) state.playerStats[key] = { name: e.assistman, team: e.team, teamId: teamId, goals: 0, assists: 0, cleanSheets: 0, isUser: isUserTeam };
                        state.playerStats[key].assists++;
                    }
                });
            }

            const updateCleanSheets = (teamObj) => {
                if (!teamObj.squad) return;
                teamObj.squad.forEach(p => {
                    if (p.Ruolo && (p.Ruolo.includes('POR') || p.Ruolo.includes('DC') || p.Ruolo.includes('TS') || p.Ruolo.includes('TD'))) {
                        const key = `${p.Nome}_${teamObj.name}`;
                        if (!state.playerStats[key]) state.playerStats[key] = { name: p.Nome, team: teamObj.name, teamId: teamObj.id, goals: 0, assists: 0, cleanSheets: 0, isUser: teamObj.isUser };
                        state.playerStats[key].cleanSheets++;
                    }
                });
            };

            if (res.homeCleanSheet) updateCleanSheets(homeT);
            if (res.awayCleanSheet) updateCleanSheets(awayT);
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

        const counterEl = document.getElementById('season-matchday-counter');
        if (counterEl) {
            counterEl.textContent = `(Giornata ${this.seasonState.matchday - 1}/38)`;
        }

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

        if (this.liveInterval) clearInterval(this.liveInterval);

        this.liveInterval = setInterval(async () => {
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
                clearInterval(this.liveInterval);
                this.liveInterval = null;
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
                } else {
                    if (this.seasonState.isFinished || this.seasonState.matchday > 38) {
                        setTimeout(() => {
                            this.renderEndSeason();
                        }, 2500);
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
            <div class="s-row ${t.id === this.currentUser.id ? 's-user' : ''} ${t.isUser ? 's-human' : ''} ${this.getZoneClass(idx)}" style="${t.isUser ? `border-left: 4px solid ${this.playerColors ? this.playerColors[t.id] : 'var(--accent)'};` : ''}">
                    <div class="s-pos">${idx + 1}</div>
                    <div class="s-team" style="${t.isUser ? `color: ${this.playerColors ? this.playerColors[t.id] : 'var(--accent)'}; font-weight: bold;` : ''}">${t.name}</div>
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
                const result = MatchEngine.simulateMatch(homeT, awayT);
                matchResults.push({
                    homeId: m.home,
                    awayId: m.away,
                    homeScore: result.homeScore,
                    awayScore: result.awayScore,
                    homeCleanSheet: result.homeCleanSheet,
                    awayCleanSheet: result.awayCleanSheet,
                    events: result.events,
                    homeTeam: result.homeTeam,
                    awayTeam: result.awayTeam
                });
            });

            this.updateStateStandings(nextState, matchResults);
            nextState.matchday++;
        }
        
        nextState.isFinished = true;
        this.seasonState = nextState;
        
        await supabase.from('lobbies').update({ season_state: this.seasonState }).eq('id', this.lobby.id);
        this.renderEndSeason();
    }

    getTopStats() {
        const players = Object.values(this.seasonState.playerStats || {});
        
        // Compute MVP Score
        players.forEach(p => {
            p.mvpScore = p.goals + p.assists;
        });

        const topScorers = [...players].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 10);
        const topAssists = [...players].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 10);
        const mvp = [...players].sort((a, b) => b.mvpScore - a.mvpScore || b.goals - a.goals)[0];

        // User stats
        const userPlayers = players.filter(p => p.teamId === this.currentUser.id);
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

    async renderEndSeason() {
        if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);

        const pos = this.seasonState.standings.findIndex(t => t.id === this.currentUser.id) + 1;
        const userTeam = this.seasonState.standings.find(t => t.id === this.currentUser.id);
        const topStats = this.getTopStats();

        let outcomeMsg = '';
        if (pos === 1) outcomeMsg = '<p style="font-size: 1.5rem; color: #fbbf24; font-weight: bold; margin-bottom: 0.5rem; text-shadow: 0 0 10px rgba(251,191,36,0.3);">CAMPIONE D\'ITALIA</p>';
        else if (pos <= 4) outcomeMsg = '<p style="font-size: 1.2rem; color: #60a5fa; font-weight: bold; margin-bottom: 0.5rem;">Champions League</p>';
        else if (pos === 5) outcomeMsg = '<p style="font-size: 1.2rem; color: #f97316; font-weight: bold; margin-bottom: 0.5rem;">Europa League</p>';
        else if (pos === 6) outcomeMsg = '<p style="font-size: 1.2rem; color: #10b981; font-weight: bold; margin-bottom: 0.5rem;">Conference League</p>';
        else if (pos >= 18) outcomeMsg = '<p style="font-size: 1.2rem; color: #ef4444; font-weight: bold; margin-bottom: 0.5rem;">Retrocesso</p>';

        // Push stats to Supabase
        const isBudget = this.lobby && this.lobby.settings && this.lobby.settings.isBudget ? true : false;
        await StatsEngine.updateSeasonStats(this.currentUser.id, true, isBudget, {
            isAbandon: false,
            position: pos,
            points: userTeam.points,
            matches: userTeam.played,
            won: userTeam.won,
            drawn: userTeam.drawn,
            lost: userTeam.lost,
            goalsScored: userTeam.gf,
            goalsConceded: userTeam.ga
        });

        if (this.isHost) {
            // Update leaderboards via edge function or direct
            try {
                // Here we'd call the edge function if available, but for now we'll let users read results
                await supabase.from('lobbies').update({ status: 'finished' }).eq('id', this.lobby.id);
            } catch(e) {}
        }

        const roleOrder = { 'POR': 1, 'TD': 2, 'DC': 3, 'TS': 4, 'CDC': 5, 'ED': 6, 'CC': 7, 'ES': 8, 'COC': 9, 'AD': 10, 'AT': 11, 'AS': 12, 'ATT': 13 };
        const myRoster = this.lobby.draft_state.rosters[this.currentUser.id] || [];
        let sortedSquad = myRoster.filter(s => s.player).map(s => s.player).sort((a, b) => {
            const roleA = (a.DeployedRole || a.Ruolo).split(',')[0].trim();
            const roleB = (b.DeployedRole || b.Ruolo).split(',')[0].trim();
            return (roleOrder[roleA] || 99) - (roleOrder[roleB] || 99);
        });

        let rosterHtml = `
            <div style="margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto;">
                <h3 class="table-title" style="margin-bottom: 1rem; text-align: center;">La Tua Rosa</h3>
                <div class="stats-table-wrapper">
                    <table class="standings-table inner-table" style="width: 100%; text-align: center; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="padding: 0.8rem 1.2rem;">Ruolo</th>
                                <th style="text-align: left; padding: 0.8rem 1.2rem;">Nome</th>
                                <th style="padding: 0.8rem 1.2rem;">OVR</th>
                                <th style="padding: 0.8rem 1.2rem;">Gol</th>
                                <th style="padding: 0.8rem 1.2rem;">Assist</th>
                                ${isBudget ? '<th style="padding: 0.8rem 1.2rem;">Valore</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        const playerStats = this.seasonState.playerStats || {};
        
        sortedSquad.forEach(player => {
            const statKey = `${player.Nome}_${userTeam.name}`;
            const stats = playerStats[statKey] || { goals: 0, assists: 0 };
            
            let valueHtml = '';
            if (isBudget) {
                valueHtml = `<td style="color: #10b981; font-weight: bold; padding: 0.8rem 1.2rem;">€${player.Value}</td>`;
            }
            
            const ovrColor = player.Overall > 85 ? 'gold' : 'white';
            
            rosterHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <td style="font-weight: bold; color: var(--accent); padding: 0.8rem 1.2rem;">${player.DeployedRole || player.Ruolo}</td>
                    <td style="font-weight: bold; color: white; text-align: left; padding: 0.8rem 1.2rem;">${player.Nome}</td>
                    <td style="font-weight: bold; color: ${ovrColor}; font-size: 1rem; padding: 0.8rem 1.2rem;">${player.Overall}</td>
                    <td style="color: #cbd5e1; padding: 0.8rem 1.2rem;">${stats.goals}</td>
                    <td style="color: #cbd5e1; padding: 0.8rem 1.2rem;">${stats.assists}</td>
                    ${valueHtml}
                </tr>
            `;
        });
        rosterHtml += `</tbody></table></div></div>`;

        this.container.innerHTML = `
            <div class="end-season-header" style="text-align:center; padding: 2rem 1rem;">
                <h2 style="font-size: 3rem; color: var(--accent); margin-bottom: 0.5rem; text-shadow: 0 0 15px rgba(0,230,255,0.5);">Stagione Multiplayer Conclusa!</h2>
                <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">Hai terminato il campionato al <strong>${pos}° posto</strong>.</p>
                ${outcomeMsg}
                <p style="font-size: 1.2rem; color: var(--text-muted); margin-bottom: 2rem;">Punti Totali: <strong style="color: #fff;">${userTeam.points}</strong> (V: ${userTeam.won} | N: ${userTeam.drawn} | P: ${userTeam.lost})</p>
                <button id="btn-back-menu" class="btn" style="font-size: 1.2rem; padding: 1rem 3rem;">Torna al Menu Principale</button>
            </div>
            
            ${rosterHtml}
            
            <div class="stats-grid">
                <div class="stats-card user-stats-card">
                    <h3 class="stats-card-title">${userTeam.name}</h3>
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

                <div class="stats-card mvp-card">
                    <h3 class="mvp-title">Miglior Giocatore (MVP)</h3>
                    <div class="mvp-icon">🏆</div>
                    <strong class="mvp-name">${topStats.mvp ? topStats.mvp.name : '-'}</strong>
                    <span class="mvp-team">${topStats.mvp ? topStats.mvp.team : '-'}</span>
                    <div class="mvp-stats">
                        <strong>${topStats.mvp ? topStats.mvp.goals : 0}</strong> Gol | <strong>${topStats.mvp ? topStats.mvp.assists : 0}</strong> Assist
                    </div>
                </div>
            </div>

            <div class="tables-grid">
                <div class="stats-table-wrapper">
                    <h3 class="table-title">Classifica Finale</h3>
                    <div class="standings-table inner-table" style="overflow-x: auto;"></div>
                </div>

                <div class="stats-table-wrapper">
                    <h3 class="table-title">Capocannoniere (Top 10)</h3>
                    <div class="stats-list">
                        ${topStats.topScorers.map((p, idx) => `
                            <div class="stats-list-item ${p.isUser ? 'is-user' : ''}" style="${p.isUser ? `border-left-color: ${this.playerColors ? this.playerColors[p.teamId] : 'var(--accent)'};` : ''}">
                                <div><span class="rank-num">${idx + 1}.</span> <strong>${p.name}</strong> <span class="team-name" style="${p.isUser ? `color: ${this.playerColors ? this.playerColors[p.teamId] : 'var(--accent)'}; font-weight: bold;` : ''}">(${p.team})</span></div>
                                <strong class="stat-highlight">${p.goals}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="stats-table-wrapper">
                    <h3 class="table-title">Miglior Assistman (Top 10)</h3>
                    <div class="stats-list">
                        ${topStats.topAssists.map((p, idx) => `
                            <div class="stats-list-item ${p.isUser ? 'is-user' : ''}" style="${p.isUser ? `border-left-color: ${this.playerColors ? this.playerColors[p.teamId] : 'var(--accent)'};` : ''}">
                                <div><span class="rank-num">${idx + 1}.</span> <strong>${p.name}</strong> <span class="team-name" style="${p.isUser ? `color: ${this.playerColors ? this.playerColors[p.teamId] : 'var(--accent)'}; font-weight: bold;` : ''}">(${p.team})</span></div>
                                <strong class="stat-highlight">${p.assists}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <br><br>
        `;
        
        // Render Final Standings Table
        const table = this.container.querySelector('.tables-grid .inner-table');
        if (table) {
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
            rowsHtml += this.seasonState.standings.map((t, idx) => `
                <div class="s-row ${t.id === this.currentUser.id ? 's-user' : ''} ${t.isUser ? 's-human' : ''} ${this.getZoneClass(idx)}">
                    <div class="s-pos">${idx + 1}</div>
                    <div class="s-team" style="${t.isUser ? `color: ${this.playerColors ? this.playerColors[t.id] : 'var(--accent)'}; font-weight: bold;` : ''}">${t.name}</div>
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

        document.getElementById('btn-back-menu').addEventListener('click', () => {
            this.app.startHome();
        });
    }
}
