import { supabase } from '../supabase.js';
import { DataLoader } from '../data/DataLoader.js';
import { AVAILABLE_FORMATIONS } from '../engine/MatchEngine.js';

export class MultiplayerDraftUI {
    constructor(app, contentDiv) {
        this.app = app;
        this.container = contentDiv;
        this.lobby = this.app.state.mpLobby;
        this.players = this.app.state.mpPlayers; 
        this.teamName = this.app.state.teamName;
        
        this.formations = AVAILABLE_FORMATIONS;

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

    handleBack() {
        window.showAlert("Non puoi tornare indietro durante il draft multiplayer!");
        return true;
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
        
        let baseOrder = [];
        for (let i = 0; i < n; i++) baseOrder.push(i);
        
        // Shuffle baseOrder (Fisher-Yates)
        for (let i = baseOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [baseOrder[i], baseOrder[j]] = [baseOrder[j], baseOrder[i]];
        }
        
        for (let r = 0; r < 11; r++) {
            let roundOrder = [...baseOrder];
            if (r % 2 !== 0) roundOrder.reverse();
            order.push(...roundOrder);
        }
        return order;
    }

    async initializeDraftState() {
        const availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        let seasonId;
        if (this.draftState.customSettings && this.draftState.customSettings.customSeason && this.draftState.customSettings.customSeason !== 'all') {
            seasonId = parseInt(this.draftState.customSettings.customSeason);
        } else {
            seasonId = availableSeasons[Math.floor(Math.random() * availableSeasons.length)];
        }
        
        await this.loadSeasonData(seasonId);

        const allTeams = [...new Set(this.playersData.map(p => p.Squadra))];
        const randomTeam = allTeams[Math.floor(Math.random() * allTeams.length)];

        const combo = `${seasonId}-${randomTeam}`;

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
            extractedCombos: [combo],
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
                        // We no longer automatically transition. The host must click 'Avvia Stagione' from the summary screen.
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
            
            const progressBar = document.getElementById('draft-progress-bar');
            if (progressBar) {
                const percent = Math.min(100, Math.max(0, (timeRemainingMs / 32000) * 100));
                progressBar.style.width = `${percent}%`;
                if (percent <= 20) progressBar.style.background = '#ef4444';
                else if (percent <= 50) progressBar.style.background = '#f59e0b';
                else progressBar.style.background = '#10b981';
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
        
        const existingCarousel = document.getElementById('pitches-carousel');
        if (existingCarousel) {
            this.savedScrollLeft = existingCarousel.scrollLeft;
        }

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
            this.renderSummary();
            return;
        }

        const turnIndex = this.draftState.snake_order[this.draftState.current_pick_number];
        const activeUser = this.players[turnIndex];
        const isMyTurn = activeUser.user_id === this.currentUser.id;

        let shouldSnapToMe = false;
        if (this.lastPickNumber !== this.draftState.current_pick_number) {
            this.lastPickNumber = this.draftState.current_pick_number;
            if (isMyTurn) {
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                this.showTurnBanner();
                shouldSnapToMe = true;
            }
        }
        
        let nextUser = null;
        if (this.draftState.current_pick_number + 1 < this.draftState.snake_order.length) {
            const nextTurnIndex = this.draftState.snake_order[this.draftState.current_pick_number + 1];
            nextUser = this.players[nextTurnIndex];
        }

        let isBudget = this.lobby.mode === 'budget';
        let isBlind = this.lobby.mode === 'classica' || this.lobby.mode === 'budget';
        let budgetMax = 200000000;

        if (this.lobby.mode === 'custom' && this.draftState && this.draftState.customSettings) {
            isBlind = this.draftState.customSettings.isBlind;
            isBudget = this.draftState.customSettings.isBudget;
            budgetMax = this.draftState.customSettings.budgetMax;
        }

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
        const remainingPercent = Math.max(((budgetMax - mySpent) / budgetMax) * 100, 0);
        let budgetColor = '#10b981';
        if (remainingPercent < 30) budgetColor = '#f59e0b';
        if (remainingPercent < 10) budgetColor = '#ef4444';

        const playerColors = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6'];
        const getPlayerColor = (uid) => {
            const idx = this.players.findIndex(p => p.user_id === uid);
            return playerColors[idx % playerColors.length];
        };

        let carouselHtml = `<div class="pitches-carousel" id="pitches-carousel" style="display: flex; overflow-x: ${isMyTurn ? 'hidden' : 'auto'}; scroll-snap-type: x mandatory; gap: 1rem; padding-bottom: 1rem; scroll-behavior: smooth; scrollbar-width: none; -ms-overflow-style: none;">
            <style>.pitches-carousel::-webkit-scrollbar { display: none; }</style>`;
        
        this.players.forEach((player, pIdx) => {
            const isCurrentUserPitch = player.user_id === this.currentUser.id;
            const playerColor = getPlayerColor(player.user_id);
            const playerColorClass = `player-color-${(pIdx % 4) + 1}`;
            const teamName = player.profiles.team_name || 'Squadra';
            const roster = this.draftState.rosters[player.user_id];
            const form = this.draftState.formations[player.user_id];
            const layoutRows = this.formations[form];

            let singlePitchHtml = '';
            let tempIndex = 0;
            const rowsWithSlots = [];
            layoutRows.forEach(rowRoles => {
                let rowSlots = [];
                rowRoles.forEach(() => {
                    rowSlots.push(roster[tempIndex++]);
                });
                rowsWithSlots.push(rowSlots);
            });

            [...rowsWithSlots].reverse().forEach((rowSlots, rowIdx) => {
                singlePitchHtml += `<div class="pitch-row" style="z-index: ${10 - rowIdx}; align-items: flex-start;">`;
                rowSlots.forEach(slot => {
                    const isFilled = slot.player !== null;
                    const isGold = isFilled && slot.player.Overall >= 85 && !isBlind;
                    const displayOvr = isFilled ? (isBlind ? '' : slot.player.Overall) : '';
                    const p = slot.player;
                    let shortName = '';
                    if (isFilled && p) {
                        shortName = p.Nome.replace(/^[A-Z]\.\s*/i, '');
                    }

                    singlePitchHtml += `
                        <div class="slot-wrapper ${isFilled ? 'filled-wrapper' : 'empty-wrapper'}" data-slot-id="${slot.id}" data-owner-id="${player.user_id}" style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 10; position: relative; ${!isCurrentUserPitch ? 'pointer-events: none;' : ''}">
                            <div class="slot ${isFilled ? `filled ${playerColorClass}` : ''} ${isGold ? 'gold-card' : ''}" style="${isFilled ? `border-color: ${playerColor};` : ''}">
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
                singlePitchHtml += `</div>`;
            });

            carouselHtml += `
                <div class="pitch-container-wrapper" id="pitch-wrapper-${player.user_id}" style="flex: 0 0 100%; scroll-snap-align: center; position: relative;">
                    <div style="text-align: center; margin-bottom: 0.5rem; font-weight: bold; font-size: 1.1rem; color: ${playerColor}; text-shadow: 0 0 5px rgba(0,0,0,0.5);">
                        ${player.profiles.username} - ${teamName}
                    </div>
                    <div class="pitch-container" style="position: relative; width: 100%;">
                        <div class="pitch-bg">
                            <div class="pitch-lines"></div>
                        </div>
                        <div class="pitch-players">
                            ${singlePitchHtml}
                        </div>
                    </div>
                </div>
            `;
        });
        
        carouselHtml += `</div>`;

        let dotsHtml = `<div class="carousel-dots" style="display: flex; justify-content: center; gap: 8px; margin-top: -5px; margin-bottom: 15px;">`;
        this.players.forEach((player, pIdx) => {
            dotsHtml += `<div class="carousel-dot" data-index="${pIdx}" style="width: 10px; height: 10px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.6); background: transparent; cursor: pointer; transition: all 0.3s ease;"></div>`;
        });
        dotsHtml += `</div>`;

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
                </div>
                <div class="p-right">
                    <span class="p-role">${p.Ruolo}</span>
                    ${isBudget && p.Value ? `<span class="budget-tag-roster ${this.getPriceTierClass(p.ValueNum)}">${p.Value}</span>` : ''}
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
                <div class="draft-left" style="overflow: hidden;">
                    <div class="draft-header-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 15px; padding: 10px; background: rgba(0,0,0,0.4); border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 0.9rem; color: var(--text-muted);">Turno Corrente:</span>
                            <span style="font-size: 1.2rem; font-weight: bold; color: ${isMyTurn ? 'var(--accent)' : 'white'};"><span class="aura-role">${isMyTurn ? 'IL TUO TURNO' : activeUser.profiles.username}</span></span>
                            ${nextUser ? `
                            <span style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">Prossimo: <span style="color: white; font-weight: bold;">${nextUser.profiles.username}</span></span>
                            ` : ''}
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-size: 0.8rem; color: var(--text-muted);">Tempo Rimasto</span>
                            <span id="draft-timer" style="font-size: 2rem; font-weight: bold; font-family: monospace;">--</span>
                            <span class="picks-badge" style="margin-top: 4px;">${11 - round}/11</span>
                        </div>
                    </div>
                    ${isBudget ? `
                    <div class="budget-container" style="margin-bottom: 15px;">
                        <div class="budget-bar-container">
                            <div class="budget-fill" style="background: ${budgetColor}; width: ${remainingPercent}%;"></div>
                        </div>
                        <span class="budget-text-below">Budget: ${((budgetMax - mySpent)/1000000).toFixed(1)}M / ${(budgetMax/1000000).toFixed(1)}M</span>
                    </div>` : ''}
                    
                    ${carouselHtml}
                    ${dotsHtml}

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
            </div>
            ${isMyTurn ? `
                <div style="position: fixed; bottom: 0; left: 0; width: 100%; height: 6px; background: rgba(0,0,0,0.5); z-index: 1000;">
                    <div id="draft-progress-bar" style="height: 100%; width: 100%; background: #10b981; transition: width 1s linear, background 0.3s;"></div>
                </div>
            ` : ''}
        `;

        const newCarousel = this.container.querySelector('#pitches-carousel');
        if (newCarousel && this.savedScrollLeft !== undefined) {
            newCarousel.scrollLeft = this.savedScrollLeft;
        }

        if (isMyTurn) {
            this.attachDraftEvents(teamPlayers);
        }

        setTimeout(() => {
            const carousel = this.container.querySelector('#pitches-carousel');
            const dots = this.container.querySelectorAll('.carousel-dot');
            if (carousel && dots.length > 0) {
                if (shouldSnapToMe) {
                    const myPitch = document.getElementById(`pitch-wrapper-${this.currentUser.id}`);
                    if (myPitch) {
                        const scrollLeft = myPitch.offsetLeft - carousel.offsetLeft;
                        carousel.scrollTo({ left: scrollLeft, behavior: 'smooth' });
                        this.savedScrollLeft = scrollLeft;
                    }
                }

                const updateDots = () => {
                    const scrollLeft = carousel.scrollLeft;
                    const width = carousel.offsetWidth || 1;
                    const index = Math.round(scrollLeft / width);
                    dots.forEach((dot, i) => {
                        dot.style.background = i === index ? 'rgba(255,255,255,0.9)' : 'transparent';
                        dot.style.transform = i === index ? 'scale(1.2)' : 'scale(1)';
                    });
                };

                carousel.addEventListener('scroll', updateDots);

                dots.forEach((dot, i) => {
                    dot.style.cursor = isMyTurn ? 'default' : 'pointer';
                    dot.addEventListener('click', () => {
                        if (isMyTurn) return;
                        const width = carousel.offsetWidth;
                        carousel.scrollTo({ left: i * width, behavior: 'smooth' });
                    });
                });
                
                updateDots();
            }
        }, 50);
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
                    const pitch = document.getElementById(`pitch-wrapper-${this.currentUser.id}`);
                    if (pitch) {
                        const y = pitch.getBoundingClientRect().top + window.scrollY - 70;
                        window.scrollTo({ top: y, behavior: 'smooth' });
                    }
                }
            });
        });

        const btnSkip = this.container.querySelector('#btn-skip-team');
        if (btnSkip) {
            btnSkip.addEventListener('click', () => {
                this.skipAndRerollTeam();
            });
        }

        const emptyWrappers = this.container.querySelectorAll(`.empty-wrapper[data-owner-id="${this.currentUser.id}"]`);
        emptyWrappers.forEach(s => {
            s.addEventListener('click', (e) => {
                if (!this.selectedPlayer) return;
                const slotId = parseInt(e.currentTarget.getAttribute('data-slot-id'));
                this.assignPlayerToSlot(slotId);
            });
        });
    }

    highlightCompatibleSlots() {
        const wrappers = this.container.querySelectorAll(`.empty-wrapper[data-owner-id="${this.currentUser.id}"]`);
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
            window.showAlert(`Azione non consentita! ${this.selectedPlayer.Nome} è un ${this.selectedPlayer.Ruolo}, non può giocare come ${slot.requiredRole}.`);
            return;
        }

        let isBudget = this.lobby.mode === 'budget';
        let budgetMax = 200000000;
        
        if (this.lobby.mode === 'custom' && this.draftState && this.draftState.customSettings) {
            isBudget = this.draftState.customSettings.isBudget;
            budgetMax = this.draftState.customSettings.budgetMax;
        }

        if (isBudget) {
            let spent = 0;
            myRoster.forEach(s => { if (s.player) spent += (parseFloat(s.player.ValueNum) || 0) });
            const cost = parseFloat(this.selectedPlayer.ValueNum) || 0;
            if (spent + cost > budgetMax) {
                window.showAlert(`Fondi insufficienti per acquistare ${this.selectedPlayer.Nome}. Sforeresti il limite di ${(budgetMax/1000000).toFixed(0)}M.`);
                return;
            }
        }

        slot.player = this.selectedPlayer;
        this.selectedPlayer = null;
        await this.advanceTurn();
    }

    async skipAndRerollTeam() {
        const availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        
        let attempts = 0;
        let seasonId;
        let rawData;
        let randomTeam;
        let combo;
        
        if (!this.draftState.extractedCombos) this.draftState.extractedCombos = [];

        do {
            if (this.draftState.customSettings && this.draftState.customSettings.customSeason && this.draftState.customSettings.customSeason !== 'all') {
                seasonId = parseInt(this.draftState.customSettings.customSeason);
            } else {
                seasonId = availableSeasons[Math.floor(Math.random() * availableSeasons.length)];
            }
            rawData = await DataLoader.loadSeason(seasonId);
            randomTeam = rawData.teams[Math.floor(Math.random() * rawData.teams.length)];
            combo = `${seasonId}-${randomTeam.name}`;
            attempts++;
        } while (this.draftState.extractedCombos.includes(combo) && attempts < 50);
        
        this.draftState.extractedCombos.push(combo);
        
        this.draftState.currentSeasonId = seasonId;
        this.draftState.currentTeam = randomTeam.name;
        this.draftState.deadline = Date.now() + 32000;
        await this.loadSeasonData(seasonId);
        await this.saveDraftState();
    }

    async advanceTurn() {
        this.draftState.current_pick_number++;
        this.draftState.deadline = Date.now() + 32000;

        if (this.draftState.current_pick_number % this.players.length === 0 && this.draftState.current_pick_number < this.players.length * 11) {
            const availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
            
            let attempts = 0;
            let seasonId;
            let rawData;
            let randomTeam;
            let combo;
            
            if (!this.draftState.extractedCombos) this.draftState.extractedCombos = [];

            do {
                if (this.draftState.customSettings && this.draftState.customSettings.customSeason && this.draftState.customSettings.customSeason !== 'all') {
                    seasonId = parseInt(this.draftState.customSettings.customSeason);
                } else {
                    seasonId = availableSeasons[Math.floor(Math.random() * availableSeasons.length)];
                }
                rawData = await DataLoader.loadSeason(seasonId);
                randomTeam = rawData.teams[Math.floor(Math.random() * rawData.teams.length)];
                combo = `${seasonId}-${randomTeam.name}`;
                attempts++;
            } while (this.draftState.extractedCombos.includes(combo) && attempts < 50);
            
            this.draftState.extractedCombos.push(combo);
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

    calculateTeamStats(userId = this.currentUser.id) {
        const stats = { total: 0, att: 0, mid: 0, def: 0, gk: 0 };
        const counts = { att: 0, mid: 0, def: 0, gk: 0 };
        const myRoster = this.draftState.rosters[userId];

        myRoster.forEach(s => {
            const r = s.requiredRole;
            const ovr = s.player ? s.player.Overall : 0;
            stats.total += ovr;

            if (['ATT', 'AT', 'AD', 'AS'].includes(r)) {
                stats.att += ovr; counts.att++;
            } else if (['CC', 'CDC', 'COC', 'ED', 'ES'].includes(r)) {
                stats.mid += ovr; counts.mid++;
            } else if (['DC', 'TS', 'TD', 'ASA', 'ADA'].includes(r)) {
                stats.def += ovr; counts.def++;
            } else if (r === 'POR') {
                stats.gk += ovr; counts.gk++;
            }
        });

        return {
            total: Math.round(stats.total / 11),
            att: counts.att > 0 ? Math.round(stats.att / counts.att) : 0,
            mid: counts.mid > 0 ? Math.round(stats.mid / counts.mid) : 0,
            def: counts.def > 0 ? Math.round(stats.def / counts.def) : 0,
            gk: counts.gk > 0 ? Math.round(stats.gk / counts.gk) : 0
        };
    }

    renderSummary() {
        const playerColors = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6'];
        const getPlayerColor = (uid) => {
            const idx = this.players.findIndex(p => p.user_id === uid);
            return playerColors[idx % playerColors.length];
        };

        let carouselHtml = `<div class="pitches-carousel" id="summary-pitches-carousel" style="display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 1rem; padding-bottom: 1rem; scroll-behavior: smooth; scrollbar-width: none; -ms-overflow-style: none;">
            <style>#summary-pitches-carousel::-webkit-scrollbar { display: none; }</style>`;
            
        this.players.forEach((player, pIdx) => {
            const playerColor = getPlayerColor(player.user_id);
            const playerColorClass = `player-color-${(pIdx % 4) + 1}`;
            const teamName = player.profiles.team_name || 'Squadra';
            const roster = this.draftState.rosters[player.user_id];
            const form = this.draftState.formations[player.user_id];
            const layoutRows = this.formations[form];

            let singlePitchHtml = '';
            let tempIndex = 0;
            const rowsWithSlots = [];
            layoutRows.forEach(rowRoles => {
                let rowSlots = [];
                rowRoles.forEach(() => {
                    rowSlots.push(roster[tempIndex++]);
                });
                rowsWithSlots.push(rowSlots);
            });

            [...rowsWithSlots].reverse().forEach((rowSlots, rowIdx) => {
                singlePitchHtml += `<div class="pitch-row" style="z-index: ${10 - rowIdx}; align-items: flex-start;">`;
                rowSlots.forEach(slot => {
                    const p = slot.player;
                    const isFilled = p !== null;
                    const isGold = isFilled && p.Overall >= 85;
                    const displayOvr = isFilled ? p.Overall : '';
                    let shortName = '';
                    if (isFilled) {
                        shortName = p.Nome.replace(/^[A-Z]\.\s*/i, '');
                    }

                    singlePitchHtml += `
                        <div class="slot-wrapper filled-wrapper" style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 10; position: relative; pointer-events: none;">
                            <div class="slot ${isFilled ? `filled ${playerColorClass}` : ''} ${isGold ? 'gold-card' : ''}" style="${isFilled ? `border-color: ${playerColor};` : ''}">
                                <span class="slot-ovr-inside">${displayOvr}</span>
                            </div>
                            <div class="card-name-outside">
                                <span style="font-size: 0.8rem;">${shortName}</span>
                            </div>
                        </div>
                    `;
                });
                singlePitchHtml += `</div>`;
            });

            carouselHtml += `
                <div class="pitch-container-wrapper" id="summary-pitch-wrapper-${player.user_id}" style="flex: 0 0 100%; scroll-snap-align: center; position: relative;">
                    <div style="text-align: center; margin-bottom: 0.5rem; font-weight: bold; font-size: 1.1rem; color: ${playerColor}; text-shadow: 0 0 5px rgba(0,0,0,0.5);">
                        ${player.profiles.username} - ${teamName}
                    </div>
                    <div class="pitch-container" style="position: relative; width: 100%;">
                        <div class="pitch-bg">
                            <div class="pitch-lines"></div>
                        </div>
                        <div class="pitch-players">
                            ${singlePitchHtml}
                        </div>
                    </div>
                </div>
            `;
        });
        
        carouselHtml += `</div>`;

        let dotsHtml = `<div class="carousel-dots" style="display: flex; justify-content: center; gap: 8px; margin-top: -5px; margin-bottom: 15px;">`;
        this.players.forEach((player, pIdx) => {
            dotsHtml += `<div class="carousel-dot" data-index="${pIdx}" style="width: 10px; height: 10px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.6); background: transparent; cursor: pointer; transition: all 0.3s ease;"></div>`;
        });
        dotsHtml += `</div>`;

        const playerStatsArray = this.players.map(p => this.calculateTeamStats(p.user_id));
        const initialStats = this.calculateTeamStats();

        this.container.innerHTML = `
            <div class="draft-container">
                <div class="draft-left" style="overflow: hidden; padding-top: 2rem;">
                    ${carouselHtml}
                    ${dotsHtml}
                </div>
                <div class="draft-right">
                    <div class="draft-complete-stats" style="display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; height: 100%;">
                        
                        <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 12px; width: 100%; margin-bottom: 2rem; border: 1px solid var(--border-color);">
                            <h3 style="font-size: 1.8rem; margin-bottom: 1.5rem;">OVR Totale: <span id="summary-ovr-tot" style="color: var(--accent); font-size: 2.2rem; margin-left: 10px;">${initialStats.total}</span></h3>
                            
                            <div style="display: flex; justify-content: space-around; width: 100%; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">ATT</span>
                                    <span id="summary-ovr-att" style="font-size: 1.5rem; font-weight: 900; color: #fff;">${initialStats.att}</span>
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">CEN</span>
                                    <span id="summary-ovr-cen" style="font-size: 1.5rem; font-weight: 900; color: #fff;">${initialStats.mid}</span>
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">DIF</span>
                                    <span id="summary-ovr-dif" style="font-size: 1.5rem; font-weight: 900; color: #fff;">${initialStats.def}</span>
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">POR</span>
                                    <span id="summary-ovr-por" style="font-size: 1.5rem; font-weight: 900; color: #fff;">${initialStats.gk}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${this.isHost ? `
                            <button id="btn-to-season" class="btn" style="font-size: 1.2rem; padding: 1rem 2rem; width: 100%;">Avvia Stagione</button>
                        ` : `
                            <p style="color: var(--text-muted); font-size: 1.1rem; margin-top: 1rem; font-weight: bold;">In attesa che l'Host avvii il campionato...</p>
                        `}
                    </div>
                </div>
            </div>
        `;

        if (this.isHost) {
            document.getElementById('btn-to-season').addEventListener('click', async () => {
                const btn = document.getElementById('btn-to-season');
                btn.disabled = true;
                btn.textContent = "Avvio in corso...";
                await supabase.from('lobbies').update({ status: 'simulating', draft_state: this.draftState }).eq('id', this.lobby.id);
            });
        }

        setTimeout(() => {
            const carousel = this.container.querySelector('#summary-pitches-carousel');
            const dots = this.container.querySelectorAll('.carousel-dot');
            if (carousel && dots.length > 0) {
                const updateDots = () => {
                    const scrollLeft = carousel.scrollLeft;
                    const width = carousel.offsetWidth || 1;
                    const index = Math.round(scrollLeft / width);
                    dots.forEach((dot, i) => {
                        dot.style.background = i === index ? 'rgba(255,255,255,0.9)' : 'transparent';
                        dot.style.transform = i === index ? 'scale(1.2)' : 'scale(1)';
                    });
                    
                    const activeStats = playerStatsArray[index] || playerStatsArray[0];
                    const elTot = document.getElementById('summary-ovr-tot');
                    const elAtt = document.getElementById('summary-ovr-att');
                    const elCen = document.getElementById('summary-ovr-cen');
                    const elDif = document.getElementById('summary-ovr-dif');
                    const elPor = document.getElementById('summary-ovr-por');
                    if (elTot) elTot.textContent = activeStats.total;
                    if (elAtt) elAtt.textContent = activeStats.att;
                    if (elCen) elCen.textContent = activeStats.mid;
                    if (elDif) elDif.textContent = activeStats.def;
                    if (elPor) elPor.textContent = activeStats.gk;
                };

                carousel.addEventListener('scroll', updateDots);

                dots.forEach((dot, i) => {
                    dot.addEventListener('click', () => {
                        const width = carousel.offsetWidth;
                        carousel.scrollTo({ left: i * width, behavior: 'smooth' });
                    });
                });
                
                // Initial snap to user pitch
                const myPitch = document.getElementById(`summary-pitch-wrapper-${this.currentUser.id}`);
                if (myPitch) {
                    const scrollLeft = myPitch.offsetLeft - carousel.offsetLeft;
                    carousel.scrollTo({ left: scrollLeft, behavior: 'auto' });
                }
                
                updateDots();
            }
        }, 50);
    }

    async endDraft() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.realtimeChannel) supabase.removeChannel(this.realtimeChannel);
        
        this.app.state.mpLobby.draft_state = this.draftState;
        this.app.startMultiplayerSeason();
    }

    showTurnBanner() {
        const existing = document.getElementById('turn-banner');
        if (existing) existing.remove();
        
        const banner = document.createElement('div');
        banner.id = 'turn-banner';
        banner.innerHTML = `
            <div style="
                background: linear-gradient(135deg, rgba(255, 0, 50, 0.3), rgba(200, 0, 30, 0.1));
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 100, 100, 0.5);
                box-shadow: 0 8px 32px 0 rgba(255, 0, 50, 0.3), inset 0 0 10px rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                padding: 0.8rem 1.5rem;
                color: white;
                font-weight: 800;
                font-size: 1rem;
                letter-spacing: 2px;
                text-align: center;
                text-transform: uppercase;
                white-space: nowrap;
            ">
                È IL TUO TURNO!
            </div>
        `;
        banner.style.position = 'fixed';
        banner.style.bottom = '30px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%) translateY(150px)';
        banner.style.opacity = '0';
        banner.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        banner.style.zIndex = '9999';
        
        document.body.appendChild(banner);
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                banner.style.transform = 'translateX(-50%) translateY(0)';
                banner.style.opacity = '1';
            });
        });
        
        setTimeout(() => {
            banner.style.transform = 'translateX(-50%) translateY(150px)';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 600);
        }, 3000);
    }
}
