import { GameState, GAME_PHASES } from './state/GameState.js';
import { DraftUI } from './ui/DraftUI.js';
import { SeasonUI } from './ui/SeasonUI.js';
import { AuthUI } from './ui/AuthUI.js';
import { LobbyUI } from './ui/LobbyUI.js';

class GameApp {
    constructor() {
        this.state = new GameState();
        this.state.subscribe(this.render.bind(this));
        
        this.authUI = new AuthUI(this);
        
        this.init();
    }

    async init() {
        this.state.setPhase(GAME_PHASES.INIT);
        
        // Check Auth Session
        const isLoggedIn = await this.authUI.checkSession();
        if (isLoggedIn) {
            this.startHome();
        } else {
            this.authUI.render();
        }
    }

    startHome() {
        this.state.setPhase('HOME'); // Placeholder for Home Menu
    }

    startMultiplayerLobby() {
        this.state.setPhase('MP_LOBBY');
    }

    startMultiplayerDraft(lobby, players, teamName) {
        this.state.mpLobby = lobby;
        this.state.mpPlayers = players;
        this.state.teamName = teamName;
        this.state.setPhase('MP_DRAFT');
    }

    render(state) {
        const statusBar = document.getElementById('current-phase');
        const content = document.getElementById('game-content');

        if (statusBar) {
            statusBar.textContent = `Fase Attuale: ${state.phase}`;
        }

        const globalHeader = document.getElementById('global-header');
        if (globalHeader) {
            // Hide on INIT, HOME, and SETUP (Module selection)
            globalHeader.style.display = (state.phase === GAME_PHASES.INIT || state.phase === 'HOME' || state.phase === 'SETUP') ? 'none' : 'block';
        }

        switch(state.phase) {
            case GAME_PHASES.INIT:
                // loader handled in index.html
                break;
            case 'HOME':
                this.renderHomeMenu(content);
                break;
            case 'MP_LOBBY':
                if (!this.lobbyUI) {
                    this.lobbyUI = new LobbyUI(this, content);
                }
                this.lobbyUI.init();
                break;
            case 'MP_DRAFT':
                content.innerHTML = `<div class="loader">Caricamento Draft Multiplayer...</div>`;
                // TODO: Instantiate MultiplayerDraftUI
                break;
            case GAME_PHASES.DRAFT:
                if (!this.draftUI) {
                    this.draftUI = new DraftUI(state, content);
                    this.draftUI.init();
                }
                break;
            case GAME_PHASES.SEASON_INIT:
                if (!this.seasonUI) {
                    this.seasonUI = new SeasonUI(state, content);
                    this.seasonUI.init();
                }
                break;
        }
    }

    renderHomeMenu(content) {
        content.innerHTML = `
            <div class="setup-container">
                <h1 class="setup-title" style="margin-bottom: 0.2rem;">BENTORNATO, <span id="display-username">${this.authUI.profile?.username?.toUpperCase() || 'MANAGER'}</span></h1>
                
                <div style="text-align: center; margin-bottom: 2rem;">
                    <button id="btn-edit-user" class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Modifica Nome</button>
                    <div id="edit-user-box" style="display: none; margin-top: 0.5rem; gap: 0.5rem; justify-content: center;">
                        <input type="text" id="input-username" value="${this.authUI.profile?.username || ''}" style="padding: 0.3rem; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.5); color: white;">
                        <button id="btn-save-user" class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Salva</button>
                    </div>
                </div>

                <p style="text-align: center; color: var(--text-muted); margin-bottom: 2rem;">Seleziona una modalità di gioco</p>
                
                <div class="setup-modes" style="max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem;">
                    
                    <button id="btn-sp" class="mode-card" style="width: 100%; border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 12px; background: var(--card-bg); cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 0.5rem; transition: border-color 0.2s;">
                        <span style="color: var(--accent); font-weight: 800; font-size: 1.2rem;">SINGLE PLAYER</span>
                        <span style="color: #cbd5e1; font-size: 0.9rem;">Gioca da solo e competi nelle Leaderboard Globali.</span>
                    </button>
                    
                    <button id="btn-mp" class="mode-card" style="width: 100%; border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 12px; background: var(--card-bg); cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 0.5rem; transition: border-color 0.2s;">
                        <span style="color: #FFD700; font-weight: 800; font-size: 1.2rem;">MULTIPLAYER DRAFT</span>
                        <span style="color: #cbd5e1; font-size: 0.9rem;">Crea o unisciti a una lobby con i tuoi amici (Fino a 4 giocatori).</span>
                    </button>
                    
                    <button id="btn-logout" class="btn btn-secondary" style="margin-top: 1rem; margin-left: auto; margin-right: auto; display: block;">Esci dall'Account</button>
                </div>
            </div>
        `;

        document.getElementById('btn-sp').onclick = () => {
            this.state.setPhase(GAME_PHASES.DRAFT);
        };
        
        document.getElementById('btn-mp').onclick = () => {
            this.startMultiplayerLobby();
        };
        
        document.getElementById('btn-logout').onclick = () => {
            this.authUI.logout();
        };

        const editBox = document.getElementById('edit-user-box');
        document.getElementById('btn-edit-user').onclick = () => {
            editBox.style.display = 'flex';
        };

        document.getElementById('btn-save-user').onclick = async () => {
            const newName = document.getElementById('input-username').value;
            if (newName && newName.trim().length > 0) {
                await this.authUI.updateUsername(newName.trim());
                document.getElementById('display-username').textContent = newName.trim().toUpperCase();
                editBox.style.display = 'none';
            }
        };
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GameApp();
});
