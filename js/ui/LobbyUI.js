import { supabase } from '../supabase.js';

export class LobbyUI {
    constructor(app, contentDiv) {
        this.app = app;
        this.container = contentDiv;
        this.lobby = null;
        this.players = [];
        this.teamName = null;
        this.isHost = false;
        this.realtimeChannel = null;
        
        this.formations = {
            '4-4-2': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['ES', 'CC', 'CC', 'ED'], ['ATT', 'ATT'] ],
            '4-3-3': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CC', 'CDC', 'CC'], ['AS', 'ATT', 'AD'] ],
            '3-5-2': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['COC'], ['ATT', 'ATT'] ],
            '3-4-3': [ ['POR'], ['DC', 'DC', 'DC'], ['ES', 'CC', 'CC', 'ED'], ['AT', 'ATT', 'AT'] ],
            '4-2-3-1': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC', 'CDC'], ['AS', 'COC', 'AD'], ['ATT'] ],
            '5-3-2': [ ['POR'], ['TS', 'DC', 'DC', 'DC', 'TD'], ['CC', 'CDC', 'CC'], ['ATT', 'ATT'] ],
            '4-2-4': [ ['POR'], ['TS', 'DC', 'DC', 'TD'], ['CDC', 'CDC'], ['AS', 'ATT', 'ATT', 'AD'] ]
        };
    }

    async init() {
        this.teamName = this.app.authUI.profile?.team_name || 'Team Sconosciuto';
        this.renderLobbyMenu();
    }

    renderLobbyMenu() {
        this.container.innerHTML = `
            <div class="setup-container">
                <h2 class="setup-title">MULTIPLAYER LOBBY</h2>
                
                <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem;">
                    <div style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 2rem; border-radius: 12px; text-align: center;">
                        <h3 style="color: var(--accent); margin-bottom: 1rem;">Crea una nuova Stanza</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Crea un codice e condividilo con i tuoi amici (massimo 4 giocatori totali).</p>
                        <div id="mode-selector" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; text-align: left;">
                            <div class="mode-option selected" data-value="classica" style="padding: 12px; border: 2px solid var(--accent); background: rgba(59,130,246, 0.15); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: bold; color: white;">Modalità Classica</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Draft al buio, vince il miglior team.</div>
                                </div>
                                <span style="font-size: 0.7rem; padding: 3px 6px; border-radius: 4px; background: #10b981; color: white; font-weight: bold;">CLASSIFICATA</span>
                            </div>
                            <div class="mode-option" data-value="budget" style="padding: 12px; border: 2px solid var(--border-color); background: rgba(0,0,0, 0.3); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: bold; color: white;">Modalità Budget</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Crea l'11 perfetto con massimo 200M.</div>
                                </div>
                                <span style="font-size: 0.7rem; padding: 3px 6px; border-radius: 4px; background: #10b981; color: white; font-weight: bold;">CLASSIFICATA</span>
                            </div>
                            <div class="mode-option" data-value="custom" style="padding: 12px; border: 2px solid var(--border-color); background: rgba(0,0,0, 0.3); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: bold; color: white;">Modalità Custom</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Impostazioni libere per divertirsi.</div>
                                </div>
                                <span style="font-size: 0.7rem; padding: 3px 6px; border-radius: 4px; background: rgba(255,255,255,0.2); color: white;">AMICHEVOLE</span>
                            </div>
                        </div>
                        <button id="btn-create" class="btn btn-primary" style="width: 100%;">Crea Stanza</button>
                    </div>

                    <div style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 2rem; border-radius: 12px; text-align: center;">
                        <h3 style="color: #FFD700; margin-bottom: 1rem;">Unisciti a una Stanza</h3>
                        <input type="text" id="join-code" placeholder="Codice 4 Lettere/Numeri" maxlength="4" style="width: 100%; padding: 0.8rem; margin-bottom: 1rem; text-align: center; text-transform: uppercase; font-weight: bold; letter-spacing: 5px; background: rgba(0,0,0,0.5); color: white; border: 1px solid var(--border-color); border-radius: 6px;">
                        <button id="btn-join" class="btn btn-secondary" style="width: 100%;">Unisciti</button>
                    </div>
                    
                    <button id="btn-back-menu" class="btn" style="background: transparent; color: white;">Torna Indietro</button>
                </div>
            </div>
        `;

        const modeOptions = this.container.querySelectorAll('.mode-option');
        modeOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                modeOptions.forEach(o => {
                    o.classList.remove('selected');
                    o.style.borderColor = 'var(--border-color)';
                    o.style.background = 'rgba(0,0,0,0.3)';
                });
                opt.classList.add('selected');
                opt.style.borderColor = 'var(--accent)';
                opt.style.background = 'rgba(59,130,246, 0.15)';
            });
        });

        document.getElementById('btn-create').onclick = async () => await this.createLobby();
        document.getElementById('btn-join').onclick = async () => await this.joinLobby(document.getElementById('join-code').value.trim().toUpperCase());
        document.getElementById('btn-back-menu').onclick = () => this.app.startHome();
    }

    generateCode() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    async createLobby() {
        const selectedModeOpt = this.container.querySelector('.mode-option.selected');
        const mode = selectedModeOpt ? selectedModeOpt.getAttribute('data-value') : 'classica';
        const code = this.generateCode();
        
        // Ensure user is authenticated
        const user = this.app.authUI.currentUser;
        if (!user) return alert("Devi essere loggato.");

        document.getElementById('btn-create').textContent = "Creazione...";

        const { data, error } = await supabase
            .from('lobbies')
            .insert([{ code, host_id: user.id, mode, draft_state: { formations: {} } }])
            .select()
            .single();

        if (error) {
            alert("Errore nella creazione della lobby.");
            return;
        }

        this.lobby = data;
        await this.addUserToLobby(user.id, 1);
        this.subscribeToLobby();
    }

    async joinLobby(code) {
        if (code.length !== 4) return alert("Il codice deve essere di 4 caratteri.");
        
        const user = this.app.authUI.currentUser;
        if (!user) return alert("Devi essere loggato.");

        document.getElementById('btn-join').textContent = "Connessione...";

        const { data: lobbyData, error: lobbyError } = await supabase
            .from('lobbies')
            .select('*')
            .eq('code', code)
            .eq('status', 'waiting')
            .single();

        if (lobbyError || !lobbyData) {
            alert("Lobby non trovata o già in gioco.");
            document.getElementById('btn-join').textContent = "Unisciti";
            return;
        }

        this.lobby = lobbyData;

        // Count current players to assign turn_position
        const { count } = await supabase
            .from('lobby_players')
            .select('*', { count: 'exact' })
            .eq('lobby_id', this.lobby.id);
            
        if (count >= 4) {
            alert("Lobby piena!");
            document.getElementById('btn-join').textContent = "Unisciti";
            return;
        }

        await this.addUserToLobby(user.id, count + 1);
        this.subscribeToLobby();
    }

    async addUserToLobby(userId, position) {
        await supabase
            .from('lobby_players')
            .insert([{ lobby_id: this.lobby.id, user_id: userId, turn_position: position }]);
    }

    async subscribeToLobby() {
        const user = this.app.authUI.currentUser;
        this.isHost = this.lobby.host_id === user.id;

        // Render Waiting Room
        this.renderWaitingRoom();

        // Fetch initial players
        await this.fetchPlayers();

        // Set up Realtime listener for players joining
        this.realtimeChannel = supabase.channel(`lobby:${this.lobby.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'lobby_players' },
                () => this.fetchPlayers()
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'lobbies' },
                (payload) => {
                    this.lobby = payload.new;
                    if (this.lobby.status === 'drafting') {
                        this.startDraftingPhase();
                    } else {
                        this.updateWaitingRoomUI();
                    }
                }
            )
            .subscribe();
    }

    async fetchPlayers() {
        const { data, error } = await supabase
            .from('lobby_players')
            .select('user_id, profiles(username)')
            .eq('lobby_id', this.lobby.id);
            
        if (!error) {
            this.players = data;
            this.updateWaitingRoomUI();
        }
    }

    renderWaitingRoom() {
        let accordionHtml = '';
        Object.keys(this.formations).forEach(f => {
            const rows = [...this.formations[f]].reverse();
            let pitchContent = '';
            rows.forEach(row => {
                pitchContent += `<div class="mini-pitch-row">`;
                row.forEach(role => {
                    pitchContent += `
                        <div class="mini-player">
                            <div class="mini-shirt"></div>
                            <div class="mini-role">${role}</div>
                        </div>
                    `;
                });
                pitchContent += `</div>`;
            });

            accordionHtml += `
                <div class="formation-item" data-form="${f}">
                    <div class="formation-header">
                        <span class="formation-name">${f}</span>
                        <button class="btn-confirm-formation" style="display: none;">✔</button>
                    </div>
                    <div class="formation-body">
                        <div class="mini-pitch">
                            ${pitchContent}
                        </div>
                    </div>
                </div>
            `;
        });

        this.container.innerHTML = `
            <div class="setup-container" style="max-width: 600px; margin: 0 auto; text-align: center;">
                <h2 style="color: var(--accent); margin-bottom: 0.5rem;">LOBBY: <span style="letter-spacing: 5px; font-family: monospace; background: rgba(255,255,255,0.1); padding: 0.2rem 1rem; border-radius: 4px;">${this.lobby.code}</span></h2>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Modalità: ${this.lobby.mode.toUpperCase()}</p>
                
                <div id="players-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
                    <!-- Players will be injected here -->
                </div>

            </div>

            <div id="formation-selection" style="text-align: center; margin-top: 2rem;">
                <h3 style="font-size: 1.5rem; margin-bottom: 1.5rem;">SELEZIONA IL TUO MODULO</h3>
                <div class="formation-accordion" id="formation-accordion-container">
                    ${accordionHtml}
                </div>
            </div>

            <div class="setup-container" style="max-width: 600px; margin: 0 auto; text-align: center;">
                ${this.isHost ? `
                    <button id="btn-start-game" class="btn btn-primary" style="width: 100%; padding: 1.2rem; font-size: 1.2rem; display: none;">AVVIA IL DRAFT</button>
                    <p id="host-msg" style="color: var(--text-muted); margin-top: 1rem; font-size: 0.9rem;">In attesa che tutti i giocatori scelgano il modulo...</p>
                ` : `
                    <p style="color: var(--text-muted); margin-top: 1rem; font-size: 1.1rem; font-weight: bold;">In attesa che l'Host avvii la partita...</p>
                `}
            </div>
        `;

        const accordionContainer = document.getElementById('formation-accordion-container');
        const formationItems = accordionContainer.querySelectorAll('.formation-item');
        formationItems.forEach(item => {
            const header = item.querySelector('.formation-header');
            const confirmBtn = item.querySelector('.btn-confirm-formation');
            const f = item.getAttribute('data-form');

            header.addEventListener('click', (e) => {
                if (e.target === confirmBtn || confirmBtn.contains(e.target)) return;
                const isActive = item.classList.contains('active');
                formationItems.forEach(i => {
                    i.classList.remove('active');
                    i.querySelector('.btn-confirm-formation').style.display = 'none';
                });
                if (!isActive) {
                    item.classList.add('active');
                    confirmBtn.style.display = 'flex';
                }
            });

            confirmBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Visual feedback: collapse accordion
                item.classList.remove('active');
                confirmBtn.style.display = 'none';

                const draftState = this.lobby.draft_state || {};
                const currentFormations = draftState.formations || {};
                currentFormations[this.app.authUI.currentUser.id] = f;
                
                await supabase.from('lobbies').update({ 
                    draft_state: {
                        ...draftState,
                        formations: currentFormations
                    }
                }).eq('id', this.lobby.id);
            });
        });

        if (this.isHost) {
            document.getElementById('btn-start-game').onclick = async () => {
                await supabase
                    .from('lobbies')
                    .update({ status: 'drafting' })
                    .eq('id', this.lobby.id);
            };
        }
        
        this.updateWaitingRoomUI();
    }

    updateWaitingRoomUI() {
        const list = document.getElementById('players-list');
        if (!list) return;

        const formations = (this.lobby.draft_state && this.lobby.draft_state.formations) ? this.lobby.draft_state.formations : {};

        list.innerHTML = this.players.map((p, idx) => {
            const hasPicked = formations[p.user_id];
            const isMe = p.user_id === this.app.authUI.currentUser.id;
            const readinessHtml = hasPicked 
                ? `<span style="color: #16a34a; font-size: 0.9rem;">Pronto (${formations[p.user_id]})</span>` 
                : `<span style="color: #e11d48; font-size: 0.9rem;">In scelta...</span>`;
            
            return `
                <div style="background: rgba(0,0,0,0.3); padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; font-weight: bold; font-size: 1.1rem; color: ${isMe ? 'var(--accent)' : 'white'}; display: flex; justify-content: space-between; align-items: center;">
                    <span>Giocatore ${idx + 1}: ${p.profiles.username}</span>
                    ${readinessHtml}
                </div>
            `;
        }).join('');

        if (this.isHost) {
            const btnStart = document.getElementById('btn-start-game');
            const hostMsg = document.getElementById('host-msg');
            const allReady = this.players.length >= 2 && this.players.every(p => formations[p.user_id]);
            
            if (allReady) {
                btnStart.style.display = 'block';
                hostMsg.style.display = 'none';
            } else {
                btnStart.style.display = 'none';
                hostMsg.style.display = 'block';
                if (this.players.length < 2) {
                    hostMsg.textContent = "In attesa di almeno un altro giocatore...";
                } else {
                    hostMsg.textContent = "In attesa che tutti i giocatori scelgano il modulo...";
                }
            }
        }
    }

    startDraftingPhase() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
        
        // Tell GameApp to transition to Multiplayer Draft Phase
        this.app.startMultiplayerDraft(this.lobby, this.players, this.teamName);
    }
}
