import { GameState, GAME_PHASES } from './state/GameState.js';
import { DraftUI } from './ui/DraftUI.js';

class GameApp {
    constructor() {
        this.state = new GameState();
        this.state.subscribe(this.render.bind(this));
        
        this.init();
    }

    init() {
        this.state.setPhase(GAME_PHASES.INIT);
        
        // Start the actual draft phase immediately for testing
        setTimeout(() => {
            this.state.setPhase(GAME_PHASES.DRAFT);
        }, 500);
    }

    render(state) {
        const statusBar = document.getElementById('current-phase');
        const content = document.getElementById('game-content');

        if (statusBar) {
            statusBar.textContent = `Fase Attuale: ${state.phase}`;
        }

        switch(state.phase) {
            case GAME_PHASES.INIT:
                content.innerHTML = `<div class="loader">Caricamento Motore di Gioco...</div>`;
                break;
            case GAME_PHASES.DRAFT:
                if (!this.draftUI) {
                    this.draftUI = new DraftUI(state, content);
                    this.draftUI.init();
                }
                break;
            case GAME_PHASES.SEASON_INIT:
                content.innerHTML = `
                    <h2>Stagione ${state.currentSeason.name}</h2>
                    <p>La tua squadra è pronta con modulo ${state.userTeam.formation}</p>
                    <p>Valori Squadra: ATT ${state.userTeam.stats.att} | CC ${state.userTeam.stats.mid} | DIF ${state.userTeam.stats.def} | POR ${state.userTeam.stats.gk}</p>
                    <button id="btn-start-match" class="btn">Gioca Prossima Partita</button>
                `;
                break;
        }
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GameApp();
});
