import { supabase } from '../supabase.js';
import { DataLoader } from '../data/DataLoader.js';

export class MultiplayerDraftUI {
    constructor(app, contentDiv) {
        this.app = app;
        this.container = contentDiv;
        this.lobby = this.app.state.mpLobby;
        this.players = this.app.state.mpPlayers; 
        this.teamName = this.app.state.teamName;
        
        this.formations = {
            '4-4-2': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['ES', 'CC', 'CC', 'ED'], ['ATT', 'ATT'] ],
            '4-3-3': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CC', 'CDC', 'CC'], ['AS', 'ATT', 'AD'] ],
            '3-5-2': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['COC'], ['ATT', 'ATT'] ],
            '3-4-3': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['AT', 'ATT', 'AT'] ],
            '4-2-3-1': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC', 'CDC'], ['AS', 'COC', 'AD'], ['ATT'] ],
            '5-3-2': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['CC', 'CDC', 'CC'], ['ATT', 'ATT'] ],
            '4-2-4': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC', 'CDC'], ['AS', 'ATT', 'ATT', 'AD'] ]
        };

        this.playersData = [];
        this.realtimeChannel = null;
        this.timerInterval = null;
        this.selectedPlayer = null;
        this.currentSeasonName = '';
        this.draftState = null;
    }

    async init() {
        this.container.innerHTML = `<div class="loader">Inizializzazione Draft...</div>`;
        this.players.sort((a, b) => (a.turn_position || 0) - (b.turn_position || 0));
        this.currentUser = this.app.authUI.currentUser;
        this.isHost = this.lobby.host_id === this.currentUser.id;

        const { data } = await supabase.from('lobbies').select('draft_state').eq('id', this.lobby.id).single();
        if (data && data.draft_state) {
            this.draftState = data.draft_state;
        } else {
            this.draftState = { formations: {} };
        }

        if (this.draftState.initialized) {
            await this.loadSeasonData(this.draftState.currentSeasonId);
        } else if (this.isHost && Object.keys(this.draftState.formations || {}).length === this.players.length) {
            if (!this.initializing) {
                this.initializing = true;
                await this.initializeDraftState();
            }
        }

        this.subscribeToDraftState();
        this.render();
    }

    async loadSeasonData(seasonId) {
        if (!seasonId) return;
        const rawData = await DataLoader.loadSeason(seasonId);
        let flattened = [];
        rawData.teams.forEach(team => {
            team.players.forEach(p => {
                flattened.push({ ...p, Squadra: team.name });
            });
        });
        this.playersData = flattened;
        this.currentSeasonName = rawData.season_name || `20${seasonId}-${parseInt(seasonId)+1}`;
    }

    generateSnakeOrder() {
        const order = [];
        const n = this.players.length;
        for (let r = 0; r < 11; r++) {
            let roundOrder = [];
            for (let i = 0; i < n; i++) roundOrder.push(i);
            if (r % 2 !== 0) roundOrder.reverse();
            order.push(...roundOrder);
        }
        return order;
    }

    async initializeDraftState() {
        const availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        const seasonId = availableSeasons[Math.floor(Math.random() * availableSeasons.length)];
        
        await this.loadSeasonData(seasonId);

        const allTeams = [...new Set(this.playersData.map(p => p.Squadra))];
        const randomTeam = allTeams[Math.floor(Math.random() * allTeams.length)];

        const initialRosters = {};
        this.players.forEach(p => {
            const form = this.draftState.formations[p.user_id] || '4-4-2';
            const layout = this.formations[form];
            const slots = [];
            let slotId = 0;
            layout.forEach(row => {
                row.forEach(role => {
                    slots.push({ id: slotId++, requiredRole: role, player: null });
                });
            });
            initialRosters[p.user_id] = slots;
        });

        this.draftState = {
            ...this.draftState,
            initialized: true,
            currentSeasonId: seasonId,
            currentTeam: randomTeam,
            current_pick_number: 0,
            snake_order: this.generateSnakeOrder(),
            rosters: initialRosters,
            deadline: Date.now() + 32000
        };

        await this.saveDraftState();
    }

    async saveDraftState() {
        await supabase.from('lobbies').update({ draft_state: this.draftState }).eq('id', this.lobby.id);
    }

    async subscribeToDraftState() {
        this.realtimeChannel = supabase.channel(`draft:${this.lobby.id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${this.lobby.id}` },
                async (payload) => {
                    const incomingSeasonId = payload.new.draft_state ? payload.new.draft_state.currentSeasonId : null;
                    const oldSeasonId = this.draftState ? this.draftState.currentSeasonId : null;
                    const seasonChanged = incomingSeasonId && incomingSeasonId !== oldSeasonId;

                    this.draftState = payload.new.draft_state || { formations: {} };
                    
                    if (this.draftState.initialized && seasonChanged) {
                        await this.loadSeasonData(this.draftState.currentSeasonId);
                        this.selectedPlayer = null;
                    }
                    
                    if (this.isHost && !this.draftState.initialized && Object.keys(this.draftState.formations || {}).length === this.players.length) {
                        if (!this.initializing) {
                            this.initializing = true;
                            await this.initializeDraftState();
                        }
                    }

                    if (this.draftState.current_pick_number >= this.players.length * 11 && this.isHost && payload.new.status !== 'simulating') {
                        await supabase.from('lobbies').update({ status: 'simulating', draft_state: this.draftState }).eq('id', this.lobby.id);
                    }

                    if (payload.new.status === 'simulating') {
                        this.endDraft();
                    } else {
                        this.render();
                    }
                }
            )
            .subscribe();
            
        this.startLocalTimer();
    }

    startLocalTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.draftState || !this.draftState.initialized) return;
            const round = Math.floor(this.draftState.current_pick_number / this.players.length);
            if (round >= 11) {
                clearInterval(this.timerInterval);
                return;
            }

            const timeRemainingMs = Math.max(0, this.draftState.deadline - Date.now());
            const secondsLeft = Math.ceil(timeRemainingMs / 1000);
            
            const timerEl = document.getElementById('draft-timer');
            if (timerEl) {
                timerEl.textContent = secondsLeft;
                if (secondsLeft <= 5) timerEl.style.color = '#ef4444';
                else timerEl.style.color = 'var(--text-color)';
            }

            if (secondsLeft <= 0) {
                const turnIndex = this.draftState.snake_order[this.draftState.current_pick_number];
                const activeUser = this.players[turnIndex];
                if (this.isHost) {
                    this.draftState.deadline = Date.now() + 32000; 
                    this.handleAutoPick(activeUser.user_id);
                }
            }
        }, 1000);
    }

    getPriceTierClass(valueNum) {
        const val = parseFloat(valueNum) || 0;
        if (val >= 50000000) return 'budget-tier-high';
        if (val >= 15000000) return 'budget-tier-med';
        return 'budget-tier-low';
    }

    render() {
        if (this.app.state.phase !== 'MP_DRAFT') return;
        
        if (!this.draftState || !this.draftState.initialized) {
            this.container.innerHTML = `
                <div style="text-align:center; padding: 3rem;">
                    <h2>Inizializzazione Draft in corso...</h2>
                    <div class="loader" style="margin-top:2rem;">Attendere...</div>
                </div>
            `;
            return;
        }

        const round = Math.floor(this.draftState.current_pick_number / this.players.length);
        if (round >= 11) {
            this.container.innerHTML = `<div style="text-align:center; padding:3rem;"><h2>Draft Completato!</h2><p>In attesa della simulazione server...</p></div>`;
            return;
        }

        const turnIndex = this.draftState.snake_order[this.draftState.current_pick_number];
        const activeUser = this.players[turnIndex];
        const isMyTurn = activeUser.user_id === this.currentUser.id;
        
        let nextUser = null;
        if (this.draftState.current_pick_number + 1 < this.draftState.snake_order.length) {
            const nextTurnIndex = this.draftState.snake_order[this.draftState.current_pick_number + 1];
            nextUser = this.players[nextTurnIndex];
        }

        const isBudget = this.lobby.mode === 'budget';
        const isBlind = this.lobby.mode === 'classica' || this.lobby.mode === 'budget';

        const draftedByMap = {};
        Object.keys(this.draftState.rosters).forEach(uid => {
            const rosterSlots = this.draftState.rosters[uid];
            rosterSlots.forEach(slot => {
                if (slot.player) draftedByMap[slot.player.Nome] = uid;
            });
        });

        const myRoster = this.draftState.rosters[this.currentUser.id];
        const myForm = this.draftState.formations[this.currentUser.id];
        const layoutRows = this.formations[myForm];

        let mySpent = 0;
        if (isBudget) {
            myRoster.forEach(s => {
                if (s.player && s.player.ValueNum) {
                    mySpent += parseFloat(s.player.ValueNum);
                }
            });
        }
        const budgetPercent = Math.min((mySpent / 200000000) * 100, 100);
        let budgetColor = '#10b981';
        if (budgetPercent > 70) budgetColor = '#f59e0b';
        if (budgetPercent > 90) budgetColor = '#ef4444';

        let pitchHtml = '';
        let tempIndex = 0;
        const rowsWithSlots = [];
        layoutRows.forEach(rowRoles => {
            let rowSlots = [];
            rowRoles.forEach(() => {
                rowSlots.push(myRoster[tempIndex++]);
            });
            rowsWithSlots.push(rowSlots);
        });

        [...rowsWithSlots].reverse().forEach((rowSlots, rowIdx) => {
            pitchHtml += `<div class="pitch-row" style="z-index: ${10 - rowIdx}; align-items: flex-start;">`;
            rowSlots.forEach(slot => {
                const isFilled = slot.player !== null;
                const isGold = isFilled && slot.player.Overall >= 85 && !isBlind;
                const displayOvr = isFilled ? (isBlind ? '' : slot.player.Overall) : '';
                const p = slot.player;
                let shortName = '';
                if (isFilled && p) {
                    shortName = p.Nome.replace(/^[A-Z]\.\s*/i, '');
                }

                pitchHtml += `
                    <div class="slot-wrapper ${isFilled ? 'filled-wrapper' : 'empty-wrapper'}" data-slot-id="${slot.id}" style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 10; position: relative;">
                        <div class="slot ${isFilled ? 'filled' : ''} ${isGold ? 'gold-card' : ''}">
                            ${displayOvr ? `<span class="slot-ovr-inside">${displayOvr}</span>` : ''}
                        </div>
                        ${isFilled ? `
                            <div class="card-name-outside">
                                ${isBudget && p.Value ? `<div class="budget-tag-pitch ${this.getPriceTierClass(p.ValueNum)}" style="font-size: 0.7rem; padding: 1px 4px; margin-bottom: 2px;">${p.Value}</div>` : ''}
                                <span style="font-size: 0.8rem;">${shortName}</span>
                            </div>
                        ` : `
                            <div class="slot-role">${slot.requiredRole}</div>
                        `}
                    </div>
                `;
            });
            pitchHtml += `</div>`;
        });

        let teamPlayers = this.playersData.filter(p => p.Squadra === this.draftState.currentTeam);
        
        const roleOrder = ['POR', 'TD', 'TS', 'DC', 'ED', 'ES', 'CC', 'CDC', 'COC', 'AD', 'AS', 'AT', 'ATT'];
        const getRoleRank = (ruoloString) => {
            const primary = ruoloString.split(',')[0].trim();
            const index = roleOrder.indexOf(primary);
            return index === -1 ? 99 : index;
        };

        if (isBlind) {
            teamPlayers.sort((a, b) => {
                const rankA = getRoleRank(a.Ruolo);
                const rankB = getRoleRank(b.Ruolo);
                if (rankA !== rankB) return rankA - rankB;
                return a.Nome.localeCompare(b.Nome);
            });
        } else {
            teamPlayers.sort((a, b) => b.Overall - a.Overall);
        }

        const activeRoster = this.draftState.rosters[activeUser.user_id];
        const activeRemainingRoles = new Set();
        activeRoster.forEach(slot => {
            if (slot.player === null) activeRemainingRoles.add(slot.requiredRole);
        });

        const playerColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#eab308'];
        const getPlayerColor = (uid) => {
            const idx = this.players.findIndex(p => p.user_id === uid);
            return playerColors[idx % playerColors.length];
        };

        let compatibleCount = 0;

        let teamHtml = teamPlayers.map((p, originalIdx) => {
            const isGold = p.Overall >= 85 && !isBlind;
            const displayOvr = isBlind ? '?' : p.Overall;
            const isMyTurnAndSelected = isMyTurn && this.selectedPlayer && this.selectedPlayer.Nome === p.Nome;
            
            const drafterId = draftedByMap[p.Nome];
            const pRoles = p.Ruolo.split(',').map(r => r.trim());
            const isCompatible = pRoles.some(r => activeRemainingRoles.has(r));

            if (!drafterId && isCompatible) {
                compatibleCount++;
            }

            let extraStyle = '';
            let extraClass = '';
            
            if (drafterId) {
                const color = getPlayerColor(drafterId);
                extraStyle = `border: 2px solid ${color}; background: rgba(0,0,0,0.6); opacity: 0.7;`;
                extraClass = 'disabled';
            } else if (!isCompatible) {
                extraStyle = `opacity: 0.4; filter: grayscale(100%);`;
                extraClass = 'disabled';
            } else if (!isMyTurn) {
                extraClass = 'disabled';
            }

            return `
            <div class="roster-player ${isMyTurnAndSelected ? 'selected' : ''} ${extraClass}" data-idx="${originalIdx}" style="${extraStyle}">
                <div class="p-left">
                    ${displayOvr ? `<span class="p-ovr ${isGold ? 'text-gold' : ''}">${displayOvr}</span>` : ''}
                    <span class="p-name">${p.Nome}</span>
                    ${isBudget && p.Value ? `<span class="budget-tag-roster ${this.getPriceTierClass(p.ValueNum)}">${p.Value}</span>` : ''}
                </div>
                <div class="p-right">
                    <span class="p-role">${p.Ruolo}</span>
                </div>
            </div>
            `;
        }).join('');

        if (compatibleCount === 0) {
            teamHtml += `
                <div class="no-players-msg" style="margin-top: 1rem;">
                    Nessun giocatore compatibile con i ruoli rimasti per <b>${activeUser.profiles.username}</b>.
                    ${isMyTurn ? `<button id="btn-skip-team" class="btn" style="margin-top: 1rem;">Ripesca Squadra</button>` : ''}
                </div>
            `;
        }

        this.container.innerHTML = `
            <div class="draft-container">
                <div class="draft-left">
                    <div class="draft-header-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.4); border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.9rem; color: var(--text-muted);">Turno Corrente:</span>
                            <span style="font-size: 1.2rem; font-weight: bold; color: ${isMyTurn ? 'var(--accent)' : 'white'};"><span class="aura-role">${isMyTurn ? 'IL TUO TURNO' : activeUser.profiles.username}</span></span>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Tempo Rimasto</span>
                            <span id="draft-timer" style="font-size: 2rem; font-weight: bold; font-family: monospace;">--</span>
                        </div>
                        <div style="display: flex; flex-direction: column; text-align: right;">
                            <span style="font-size: 0.9rem; color: var(--text-muted);">Prossimo:</span>
                            <span style="font-size: 1rem; color: white;">${nextUser ? nextUser.profiles.username : '-'}</span>
                            <span class="picks-badge" style="margin-top: 4px;">${11 - round}/11</span>
                        </div>
                    </div>
                    ${isBudget ? `
                    <div class="budget-container" style="margin-bottom: 15px; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <div class="budget-bar" style="width: 100%; height: 20px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; position: relative;">
                            <div class="budget-fill" style="height: 100%; background: ${budgetColor}; width: ${budgetPercent}%; transition: width 0.3s ease, background 0.3s ease;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.9rem;">
                            <span style="color: white;">Spesi: <b>€${(mySpent/1000000).toFixed(1)}M</b></span>
                            <span style="color: ${budgetPercent > 90 ? '#ef4444' : 'white'};">Rimanenti: <b>€${((200000000 - mySpent)/1000000).toFixed(1)}M</b> / €200M</span>
                        </div>
                    </div>` : ''}
                    <div class="pitch-container" style="position: relative;">
                        <div class="pitch-bg">
                            <div class="pitch-lines"></div>
                        </div>
                        <div class="pitch-players">
                            ${pitchHtml}
                        </div>
                    </div>
                </div>
                <div class="draft-right">
                    <div class="draft-team-info" style="display: flex; justify-content: space-between; align-items: center; padding-right: 0.5rem; margin-bottom: 10px;">
                        <h3 style="margin: 0; font-size: 1.2rem;">${this.draftState.currentTeam} <span class="season-badge" style="font-size: 0.8rem;">${this.currentSeasonName}</span></h3>
                    </div>
                    <div class="roster-list">
                        ${teamHtml}
                    </div>
                </div>
            </div>
        `;

        if (isMyTurn) {
            this.attachDraftEvents(teamPlayers);
        }
    }

    attachDraftEvents(teamPlayers) {
        const players = this.container.querySelectorAll('.roster-player:not(.disabled)');
        players.forEach(p => {
            p.addEventListener('click', (e) => {
                players.forEach(el => el.classList.remove('selected'));
                const el = e.currentTarget;
                el.classList.add('selected');
                this.selectedPlayer = teamPlayers[el.getAttribute('data-idx')];
                
                this.highlightCompatibleSlots();

                if (window.innerWidth <= 1024) {
                    const pitch = this.container.querySelector('.pitch-container');
                    if (pitch) pitch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });

        const btnSkip = this.container.querySelector('#btn-skip-team');
        if (btnSkip) {
            btnSkip.addEventListener('click', () => {
                this.skipAndRerollTeam();
            });
        }

        const emptyWrappers = this.container.querySelectorAll('.empty-wrapper');
        emptyWrappers.forEach(s => {
            s.addEventListener('click', (e) => {
                if (!this.selectedPlayer) return;
                const slotId = parseInt(e.currentTarget.getAttribute('data-slot-id'));
                this.assignPlayerToSlot(slotId);
            });
        });
    }

    highlightCompatibleSlots() {
        const wrappers = this.container.querySelectorAll('.empty-wrapper');
        wrappers.forEach(el => el.classList.remove('compatible'));

        if (!this.selectedPlayer) return;

        const playerRoles = this.selectedPlayer.Ruolo.split(',').map(r => r.trim());
        const myRoster = this.draftState.rosters[this.currentUser.id];

        wrappers.forEach(el => {
            const slotId = parseInt(el.getAttribute('data-slot-id'));
            const requiredRole = myRoster[slotId].requiredRole;
            
            if (playerRoles.includes(requiredRole)) {
                el.classList.add('compatible');
            }
        });
    }

    async assignPlayerToSlot(slotId) {
        const myRoster = this.draftState.rosters[this.currentUser.id];
        const slot = myRoster[slotId];
        const playerRoles = this.selectedPlayer.Ruolo.split(',').map(r => r.trim());

        if (!playerRoles.includes(slot.requiredRole)) {
            alert(`Azione non consentita! ${this.selectedPlayer.Nome} è un ${this.selectedPlayer.Ruolo}, non può giocare come ${slot.requiredRole}.`);
            return;
        }

        if (this.lobby.mode === 'budget') {
            let spent = 0;
            myRoster.forEach(s => { if (s.player) spent += (parseFloat(s.player.ValueNum) || 0) });
            const cost = parseFloat(this.selectedPlayer.ValueNum) || 0;
            if (spent + cost > 200000000) {
                alert(`Fondi insufficienti per acquistare ${this.selectedPlayer.Nome}. Sforeresti i 200M.`);
                return;
            }
        }

        slot.player = this.selectedPlayer;
        this.selectedPlayer = null;
        await this.advanceTurn();
    }

    async skipAndRerollTeam() {
        const availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        const seasonId = availableSeasons[Math.floor(Math.random() * availableSeasons.length)];
        const rawData = await DataLoader.loadSeason(seasonId);
        const randomTeam = rawData.teams[Math.floor(Math.random() * rawData.teams.length)];
        
        this.draftState.currentSeasonId = seasonId;
        this.draftState.currentTeam = randomTeam.name;
        await this.loadSeasonData(seasonId);
        await this.saveDraftState();
    }

    async advanceTurn() {
        this.draftState.current_pick_number++;
        this.draftState.deadline = Date.now() + 32000;

        if (this.draftState.current_pick_number % this.players.length === 0 && this.draftState.current_pick_number < this.players.length * 11) {
            const availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
            const seasonId = availableSeasons[Math.floor(Math.random() * availableSeasons.length)];
            const rawData = await DataLoader.loadSeason(seasonId);
            const randomTeam = rawData.teams[Math.floor(Math.random() * rawData.teams.length)];
            this.draftState.currentSeasonId = seasonId;
            this.draftState.currentTeam = randomTeam.name;
            await this.loadSeasonData(seasonId);
        }

        await this.saveDraftState();

        if (this.draftState.current_pick_number >= this.players.length * 11) {
            if (this.isHost) {
                await supabase.from('lobbies').update({ status: 'simulating', draft_state: this.draftState }).eq('id', this.lobby.id);
            }
        }
    }

    async handleAutoPick(userId) {
        if (!this.isHost) return;
        
        const roster = this.draftState.rosters[userId];
        const remainingRoles = new Set();
        roster.forEach(slot => {
            if (slot.player === null) remainingRoles.add(slot.requiredRole);
        });

        const draftedByMap = {};
        Object.keys(this.draftState.rosters).forEach(uid => {
            this.draftState.rosters[uid].forEach(slot => {
                if (slot.player) draftedByMap[slot.player.Nome] = uid;
            });
        });

        const teamPlayers = this.playersData.filter(p => p.Squadra === this.draftState.currentTeam);
        const filtered = teamPlayers.filter(p => {
            if (draftedByMap[p.Nome]) return false;
            const pRoles = p.Ruolo.split(',').map(r => r.trim());
            return pRoles.some(r => remainingRoles.has(r));
        });

        let selectedP = null;
        if (filtered.length > 0) {
            filtered.sort((a, b) => b.Overall - a.Overall);
            selectedP = filtered[0];
        } else {
            await this.skipAndRerollTeam();
            return;
        }

        const pRoles = selectedP.Ruolo.split(',').map(r => r.trim());
        const slotToFill = roster.find(s => s.player === null && pRoles.includes(s.requiredRole));
        
        if (slotToFill) {
            slotToFill.player = selectedP;
            await this.advanceTurn();
        }
    }

    async endDraft() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);
        
        this.app.state.mpLobby.draft_state = this.draftState;
        this.app.startMultiplayerSeason();
    }
}
