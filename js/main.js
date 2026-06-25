import { GameState, GAME_PHASES } from './state/GameState.js';
import { DraftUI } from './ui/DraftUI.js';
import { SeasonUI } from './ui/SeasonUI.js';
import { AuthUI } from './ui/AuthUI.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { MultiplayerDraftUI } from './ui/MultiplayerDraftUI.js';
import { MultiplayerSeasonUI } from './ui/MultiplayerSeasonUI.js';
import { LeaderboardUI } from './ui/LeaderboardUI.js';

window.showAlert = function(message, title = "YES PASSION dice") {
    let modal = document.getElementById('custom-alert-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-alert-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,20,50,0.8); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); z-index: 9999; display: flex; justify-content: center; align-items: center;';
        
        const content = document.createElement('div');
        content.className = 'cl-card';
        content.style.cssText = 'background: linear-gradient(145deg, rgba(20,30,50,0.9), rgba(10,15,30,0.9)); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 2rem; border-radius: 16px; width: 90%; max-width: 450px; color: white; display: flex; flex-direction: column; gap: 1.5rem;';
        
        const titleEl = document.createElement('h3');
        titleEl.id = 'custom-alert-title';
        titleEl.style.cssText = 'margin: 0; font-size: 1.2rem; font-weight: 600; color: #f3f4f6; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;';
        
        const msgEl = document.createElement('p');
        msgEl.id = 'custom-alert-message';
        msgEl.style.cssText = 'margin: 0; font-size: 1rem; color: #cbd5e1; line-height: 1.5;';
        
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 0.5rem;';
        
        const btnOk = document.createElement('button');
        btnOk.textContent = 'Ok';
        btnOk.style.cssText = 'padding: 0.5rem 2rem; font-weight: 600; border-radius: 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); color: white; cursor: pointer; transition: all 0.2s ease;';
        btnOk.onmouseover = () => btnOk.style.background = 'rgba(255, 255, 255, 0.2)';
        btnOk.onmouseout = () => btnOk.style.background = 'rgba(255, 255, 255, 0.1)';
        
        btnOk.onclick = () => {
            modal.style.display = 'none';
        };
        
        btnContainer.appendChild(btnOk);
        content.appendChild(titleEl);
        content.appendChild(msgEl);
        content.appendChild(btnContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);
    }
    
    document.getElementById('custom-alert-title').textContent = title;
    document.getElementById('custom-alert-message').textContent = message;
    modal.style.display = 'flex';
};

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

    startMultiplayerSeason() {
        this.state.setPhase('MP_SEASON_INIT');
    }

    startLeaderboard() {
        this.state.setPhase('LEADERBOARD');
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
            globalHeader.style.display = (state.phase === GAME_PHASES.INIT || state.phase === 'HOME' || state.phase === 'SETUP' || state.phase === 'LEADERBOARD') ? 'none' : 'block';
        }

        switch(state.phase) {
            case GAME_PHASES.INIT:
                // loader handled in index.html
                break;
            case 'HOME':
                this.renderHomeMenu(content);
                break;
            case 'LEADERBOARD':
                if (!this.leaderboardUI) {
                    this.leaderboardUI = new LeaderboardUI(this, content);
                }
                this.leaderboardUI.init();
                break;
            case 'MP_LOBBY':
                if (!this.lobbyUI) {
                    this.lobbyUI = new LobbyUI(this, content);
                }
                this.lobbyUI.init();
                break;
            case 'MP_DRAFT':
                if (!this.mpDraftUI) {
                    this.mpDraftUI = new MultiplayerDraftUI(this, content);
                    this.mpDraftUI.init();
                }
                break;
            case 'MP_SEASON_INIT':
                if (!this.mpSeasonUI) {
                    this.mpSeasonUI = new MultiplayerSeasonUI(this, content);
                    this.mpSeasonUI.init();
                }
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
            <div class="setup-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 70vh;">
                <h1 class="setup-title" style="margin-bottom: 0.5rem; text-align: center; text-shadow: 0 0 20px rgba(255,255,255,0.3); font-size: 3rem; letter-spacing: 2px;">BENTORNATO, <span id="display-username">${this.authUI.profile?.username?.toUpperCase() || 'MANAGER'}</span></h1>
                
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.8rem; margin-bottom: 3rem;">
                    <button id="btn-edit-user" class="btn btn-secondary" style="width: 220px; padding: 0.5rem 1rem; font-size: 0.9rem; border-radius: 20px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease; color: white;">MODIFICA PROFILO</button>
                    <button id="btn-leaderboard" class="btn btn-primary" style="width: 220px; padding: 0.5rem 1rem; font-size: 0.9rem; border-radius: 20px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease; color: white;">CLASSIFICHE</button>
                </div>

                <div id="profile-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,20,50,0.8); backdrop-filter: blur(10px); z-index: 1000; justify-content: center; align-items: center;">
                    <div style="background: linear-gradient(145deg, #0a192f, #020c1b); border: 1px solid rgba(255,255,255,0.2); padding: 2rem; border-radius: 16px; width: 90%; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                        <h2 style="color: white; margin-bottom: 1.5rem; text-align: center;">MODIFICA PROFILO</h2>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            <div>
                                <label style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.3rem; display: block;">Nome Utente</label>
                                <input type="text" id="input-username" value="${this.authUI.profile?.username || ''}" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white;">
                            </div>
                            <div>
                                <label style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.3rem; display: block;">Nome Squadra (Es: FC Dream Team)</label>
                                <input type="text" id="input-teamname" value="${this.authUI.profile?.team_name || ''}" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white;">
                            </div>
                            <div>
                                <label style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.3rem; display: block;">Cambio Password (Opzionale)</label>
                                <input type="password" id="input-password" placeholder="Nuova password" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white; margin-bottom: 0.5rem;">
                                <input type="password" id="input-password-confirm" placeholder="Conferma nuova password" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); color: white;">
                            </div>
                            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                                <button id="btn-save-profile" class="btn btn-primary" style="flex: 1;">Salva</button>
                                <button id="btn-close-modal" class="btn btn-secondary" style="flex: 1;">Annulla</button>
                            </div>
                            <div id="profile-error" style="color: #ef4444; font-size: 0.9rem; margin-top: 0.5rem; text-align: center;"></div>
                        </div>
                    </div>
                </div>

                <p style="text-align: center; color: var(--text-muted); margin-bottom: 1.5rem; font-size: 1.1rem;">Seleziona una modalità di gioco</p>
                
                <div class="setup-modes" style="max-width: 800px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
                    
                    <button id="btn-sp" class="cl-card" style="width: 100%; border: 1px solid rgba(255, 255, 255, 0.3); padding: 2rem; border-radius: 16px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); cursor: pointer; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.3s ease;">
                        <span style="color: #f3f4f6; font-weight: 500; font-size: 1.8rem; letter-spacing: 2px; text-shadow: 0 0 15px rgba(243,244,246,0.2);">SINGLE PLAYER</span>
                        <span style="color: #cbd5e1; font-size: 1rem;">Gioca da solo e competi nelle Leaderboard Globali.</span>
                    </button>
                    
                    <button id="btn-mp" class="cl-card" style="width: 100%; border: 1px solid rgba(255, 255, 255, 0.3); padding: 2rem; border-radius: 16px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); cursor: pointer; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.3s ease;">
                        <span style="color: #e5e7eb; font-weight: 500; font-size: 1.8rem; letter-spacing: 2px; text-shadow: 0 0 15px rgba(229,231,235,0.2);">MULTIPLAYER</span>
                        <span style="color: #cbd5e1; font-size: 1rem;">Crea o unisciti a una lobby con i tuoi amici (Fino a 4 giocatori).</span>
                    </button>
                    
                    <button id="btn-logout" class="btn btn-secondary" style="margin-top: 2rem; width: 200px; margin-left: auto; margin-right: auto; display: block; border-radius: 20px; background: rgba(239, 68, 68, 0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(239, 68, 68, 0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.2); color: #ef4444; transition: all 0.3s ease;">Logout</button>
                </div>
            </div>
        `;

        const requireTeamName = () => {
            if (!this.authUI.profile?.team_name) {
                window.showAlert("Per giocare devi prima impostare il Nome della tua Squadra!");
                document.getElementById('profile-modal').style.display = 'flex';
                return false;
            }
            return true;
        };

        document.getElementById('btn-sp').onclick = () => {
            if (requireTeamName()) {
                this.state.teamName = this.authUI.profile.team_name;
                this.state.setPhase(GAME_PHASES.DRAFT);
            }
        };
        
        document.getElementById('btn-mp').onclick = () => {
            if (requireTeamName()) {
                this.startMultiplayerLobby();
            }
        };

        const btnLeaderboard = document.getElementById('btn-leaderboard');
        if (btnLeaderboard) {
            btnLeaderboard.onclick = () => {
                this.startLeaderboard();
            };
        }
        
        document.getElementById('btn-logout').onclick = () => {
            this.authUI.logout();
        };

        const modal = document.getElementById('profile-modal');
        document.getElementById('btn-edit-user').onclick = () => {
            modal.style.display = 'flex';
        };
        document.getElementById('btn-close-modal').onclick = () => {
            modal.style.display = 'none';
        };

        document.getElementById('btn-save-profile').onclick = async () => {
            const btn = document.getElementById('btn-save-profile');
            const errorDiv = document.getElementById('profile-error');
            const newName = document.getElementById('input-username').value.trim();
            const newTeam = document.getElementById('input-teamname').value.trim();
            const newPwd = document.getElementById('input-password').value;
            const confirmPwd = document.getElementById('input-password-confirm').value;

            if (!newName || !newTeam) {
                errorDiv.textContent = "Nome Utente e Nome Squadra sono obbligatori.";
                return;
            }

            if (newPwd !== "" && newPwd !== confirmPwd) {
                errorDiv.textContent = "Le password non coincidono!";
                return;
            }

            btn.textContent = "Salvataggio...";
            errorDiv.textContent = "";

            const err = await this.authUI.updateProfile(newName, newTeam, newPwd);
            if (err) {
                errorDiv.textContent = err.message || "Errore nel salvataggio.";
                btn.textContent = "Salva";
            } else {
                document.getElementById('display-username').textContent = newName.toUpperCase();
                document.getElementById('input-password').value = "";
                document.getElementById('input-password-confirm').value = "";
                modal.style.display = 'none';
                btn.textContent = "Salva";
            }
        };
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GameApp();
});
