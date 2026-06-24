import { supabase } from '../supabase.js';

export class LobbyUI {
    constructor(app, contentDiv) {
        this.app = app;
        this.container = contentDiv;
        this.lobby = null;
        this.players = [];
        this.realtimeChannel = null;
        this.teamName = '';
    }

    async init() {
        this.renderTeamNameSelection();
    }

    renderTeamNameSelection() {
        this.container.innerHTML = `
            <div class="setup-container">
                <h2 class="setup-title">Nome Squadra</h2>
                <p style="color: var(--text-muted); text-align: center; margin-bottom: 2rem;">Come si chiamerà il tuo club in questo campionato multiplayer?</p>
                
                <div style="max-width: 400px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem;">
                    <input type="text" id="mp-team-name" placeholder="Es: F.C. Edoardo" class="input-team-name" style="padding: 1rem; border-radius: 8px; border: 1px solid var(--accent); background: rgba(0,0,0,0.5); color: white; font-size: 1.2rem; text-align: center;">
                    <button id="btn-confirm-team" class="btn btn-primary" style="padding: 1rem;">Conferma e Vai alla Lobby</button>
                    <button id="btn-back" class="btn btn-secondary">Annulla</button>
                </div>
            </div>
        `;

        document.getElementById('btn-confirm-team').onclick = () => {
            const name = document.getElementById('mp-team-name').value.trim();
            if (name) {
                this.teamName = name;
                this.renderLobbyMenu();
            } else {
                alert("Inserisci un nome valido.");
            }
        };

        document.getElementById('btn-back').onclick = () => {
            this.app.startHome();
        };
    }

    renderLobbyMenu() {
        this.container.innerHTML = `
            <div class="setup-container">
                <h2 class="setup-title">MULTIPLAYER LOBBY</h2>
                
                <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem;">
                    <div style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 2rem; border-radius: 12px; text-align: center;">
                        <h3 style="color: var(--accent); margin-bottom: 1rem;">Crea una nuova Stanza</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Crea un codice e condividilo con i tuoi amici (massimo 4 giocatori totali).</p>
                        <select id="lobby-mode" style="width: 100%; padding: 0.8rem; margin-bottom: 1rem; background: rgba(0,0,0,0.5); color: white; border: 1px solid var(--border-color); border-radius: 6px;">
                            <option value="classica">Modalità Classica (Classificata)</option>
                            <option value="budget">Modalità Budget (Classificata)</option>
                            <option value="custom">Modalità Custom (Non Classificata)</option>
                        </select>
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

        document.getElementById('btn-create').onclick = async () => await this.createLobby();
        document.getElementById('btn-join').onclick = async () => await this.joinLobby(document.getElementById('join-code').value.trim().toUpperCase());
        document.getElementById('btn-back-menu').onclick = () => this.renderTeamNameSelection();
    }

    generateCode() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    async createLobby() {
        const mode = document.getElementById('lobby-mode').value;
        const code = this.generateCode();
        
        // Ensure user is authenticated
        const user = this.app.authUI.currentUser;
        if (!user) return alert("Devi essere loggato.");

        document.getElementById('btn-create').textContent = "Creazione...";

        const { data, error } = await supabase
            .from('lobbies')
            .insert([{ code, host_id: user.id, mode }])
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
                    if (payload.new.status === 'drafting') {
                        this.startDraftingPhase();
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
        this.container.innerHTML = `
            <div class="setup-container" style="max-width: 600px; margin: 0 auto; text-align: center;">
                <h2 style="color: var(--accent); margin-bottom: 0.5rem;">LOBBY: <span style="letter-spacing: 5px; font-family: monospace; background: rgba(255,255,255,0.1); padding: 0.2rem 1rem; border-radius: 4px;">${this.lobby.code}</span></h2>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Modalità: ${this.lobby.mode.toUpperCase()}</p>
                
                <div id="players-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
                    <!-- Players will be injected here -->
                </div>

                ${this.isHost ? `
                    <button id="btn-start-game" class="btn btn-primary" style="width: 100%; padding: 1.2rem; font-size: 1.2rem; display: none;">AVVIA IL DRAFT</button>
                    <p id="host-msg" style="color: var(--text-muted); margin-top: 1rem; font-size: 0.9rem;">In attesa di altri giocatori...</p>
                ` : `
                    <p style="color: var(--text-muted); margin-top: 1rem; font-size: 1.1rem; font-weight: bold;">In attesa che l'Host avvii la partita...</p>
                `}
            </div>
        `;

        if (this.isHost) {
            document.getElementById('btn-start-game').onclick = async () => {
                await supabase
                    .from('lobbies')
                    .update({ status: 'drafting' })
                    .eq('id', this.lobby.id);
            };
        }
    }

    updateWaitingRoomUI() {
        const list = document.getElementById('players-list');
        if (!list) return;

        list.innerHTML = this.players.map((p, idx) => `
            <div style="background: rgba(0,0,0,0.3); padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; font-weight: bold; font-size: 1.1rem; color: ${p.user_id === this.app.authUI.currentUser.id ? 'var(--accent)' : 'white'};">
                Giocatore ${idx + 1}: ${p.profiles.username}
            </div>
        `).join('');

        if (this.isHost) {
            const btnStart = document.getElementById('btn-start-game');
            const hostMsg = document.getElementById('host-msg');
            // Allow starting with 2, 3, or 4 players
            if (this.players.length >= 2) {
                btnStart.style.display = 'block';
                hostMsg.style.display = 'none';
            } else {
                btnStart.style.display = 'none';
                hostMsg.style.display = 'block';
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
