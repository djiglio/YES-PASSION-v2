import { GameState, GAME_PHASES } from './state/GameState.js';
import { DraftUI } from './ui/DraftUI.js';
import { SeasonUI } from './ui/SeasonUI.js';

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

        const globalHeader = document.getElementById('global-header');
        if (globalHeader) {
            // Hide on INIT, HOME, and SETUP (Module selection)
            globalHeader.style.display = (state.phase === GAME_PHASES.INIT || state.phase === 'HOME' || state.phase === 'SETUP') ? 'none' : 'block';
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
                if (!this.seasonUI) {
                    this.seasonUI = new SeasonUI(state, content);
                    this.seasonUI.init();
                }
                break;
        }
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GameApp();
});
