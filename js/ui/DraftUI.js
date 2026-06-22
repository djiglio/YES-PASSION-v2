import { DataLoader } from '../data/DataLoader.js';

export class DraftUI {
    constructor(gameState, containerElement) {
        this.state = gameState;
        this.container = containerElement;
        
        this.availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        this.formations = {
            '4-4-2': ['POR', 'TD', 'DC', 'DC', 'TS', 'ED', 'CC', 'CC', 'ES', 'ATT', 'ATT'],
            '4-3-3': ['POR', 'TD', 'DC', 'DC', 'TS', 'CC', 'CDC', 'CC', 'AD', 'ATT', 'AS'],
            '3-5-2': ['POR', 'DC', 'DC', 'DC', 'ED', 'CC', 'CDC', 'CC', 'ES', 'ATT', 'ATT']
        };

        // Draft state
        this.slots = []; 
        this.currentTeam = null;
        this.currentSeasonName = null;
        this.picksRemaining = 11;
        this.selectedPlayer = null;
    }

    async init() {
        this.renderFormationSelector();
    }

    renderFormationSelector() {
        let html = `
            <div class="draft-setup">
                <h2>Seleziona il Modulo</h2>
                <div class="formation-options">
                    ${Object.keys(this.formations).map(f => `<button class="btn formation-btn" data-form="${f}">${f}</button>`).join('')}
                </div>
            </div>
        `;
        this.container.innerHTML = html;

        this.container.querySelectorAll('.formation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.startDraft(e.target.getAttribute('data-form')));
        });
    }

    async startDraft(formation) {
        this.state.userTeam.formation = formation;
        const layout = this.formations[formation];
        
        // Initialize empty slots
        this.slots = layout.map((role, index) => ({
            id: index,
            requiredRole: role,
            player: null
        }));

        this.picksRemaining = 11;
        this.renderDraftBoard();
        await this.rollNextTeam();
    }

    async rollNextTeam() {
        if (this.picksRemaining === 0) {
            this.finishDraft();
            return;
        }

        this.renderDraftBoard(true); // show loading

        const randomSeasonId = this.availableSeasons[Math.floor(Math.random() * this.availableSeasons.length)];
        const seasonData = await DataLoader.loadSeason(randomSeasonId);
        
        if (!seasonData) {
            alert("Errore nel caricamento dei dati.");
            return;
        }

        const teams = seasonData.teams;
        const randomTeam = teams[Math.floor(Math.random() * teams.length)];

        this.currentTeam = randomTeam;
        this.currentSeasonName = seasonData.season_name;
        this.selectedPlayer = null;

        this.renderDraftBoard();
    }

    renderDraftBoard(isLoading = false) {
        // Pitch section
        let pitchHtml = `<div class="pitch">`;
        this.slots.forEach(slot => {
            const isFilled = slot.player !== null;
            pitchHtml += `
                <div class="slot ${isFilled ? 'filled' : ''}" data-slot-id="${slot.id}">
                    <div class="slot-role">${slot.requiredRole}</div>
                    ${isFilled ? `
                        <div class="slot-name">${slot.player.Nome}</div>
                        <div class="slot-ovr">${slot.player.Overall}</div>
                    ` : `<div class="slot-empty">Vuoto</div>`}
                </div>
            `;
        });
        pitchHtml += `</div>`;

        // Team selection section
        let teamHtml = '';
        if (isLoading) {
            teamHtml = `<div class="loader">Estrazione prossima squadra...</div>`;
        } else if (this.currentTeam) {
            teamHtml = `
                <div class="draft-team-info">
                    <h3>${this.currentTeam.name} <span class="season-badge">${this.currentSeasonName}</span></h3>
                    <p>Scegli un giocatore compatibile con i tuoi slot vuoti.</p>
                </div>
                <div class="roster-list">
                    ${this.currentTeam.players.map((p, idx) => `
                        <div class="roster-player ${this.selectedPlayer === idx ? 'selected' : ''}" data-idx="${idx}">
                            <span class="p-role">${p.Ruolo}</span>
                            <span class="p-name">${p.Nome}</span>
                            <span class="p-ovr">${p.Overall}</span>
                        </div>
                    `).join('')}
                </div>
                <button id="btn-assign" class="btn" disabled>Assegna allo Slot</button>
            `;
        }

        this.container.innerHTML = `
            <div class="draft-container">
                <div class="draft-left">
                    <h2>La Tua Formazione (${this.state.userTeam.formation})</h2>
                    <p>Scelte rimanenti: ${this.picksRemaining}</p>
                    ${pitchHtml}
                </div>
                <div class="draft-right">
                    ${teamHtml}
                </div>
            </div>
        `;

        this.attachDraftEvents();
    }

    attachDraftEvents() {
        if (!this.currentTeam) return;

        // Player selection
        const players = this.container.querySelectorAll('.roster-player');
        players.forEach(p => {
            p.addEventListener('click', (e) => {
                players.forEach(el => el.classList.remove('selected'));
                const el = e.currentTarget;
                el.classList.add('selected');
                this.selectedPlayer = this.currentTeam.players[el.getAttribute('data-idx')];
                
                // Highlight compatible empty slots
                this.highlightCompatibleSlots();
            });
        });

        // Slot assignment
        const slots = this.container.querySelectorAll('.slot:not(.filled)');
        slots.forEach(s => {
            s.addEventListener('click', (e) => {
                if (!this.selectedPlayer) return;
                const slotId = parseInt(e.currentTarget.getAttribute('data-slot-id'));
                this.assignPlayerToSlot(slotId);
            });
        });
    }

    highlightCompatibleSlots() {
        const slotsElements = this.container.querySelectorAll('.slot:not(.filled)');
        slotsElements.forEach(el => el.classList.remove('compatible'));

        if (!this.selectedPlayer) return;

        const playerRoles = this.selectedPlayer.Ruolo.split(',').map(r => r.trim());

        slotsElements.forEach(el => {
            const slotId = parseInt(el.getAttribute('data-slot-id'));
            const requiredRole = this.slots[slotId].requiredRole;
            
            // Allow exact match or if player can play that role
            if (playerRoles.includes(requiredRole)) {
                el.classList.add('compatible');
            }
        });
    }

    assignPlayerToSlot(slotId) {
        const slot = this.slots[slotId];
        const playerRoles = this.selectedPlayer.Ruolo.split(',').map(r => r.trim());

        if (!playerRoles.includes(slot.requiredRole)) {
            alert(`Azione non consentita! ${this.selectedPlayer.Nome} è un ${this.selectedPlayer.Ruolo}, non può giocare come ${slot.requiredRole}. Scegli uno slot compatibile o un altro giocatore.`);
            return; // Blocca l'assegnazione
        }

        // Assign
        slot.player = this.selectedPlayer;
        this.picksRemaining--;
        this.rollNextTeam();
    }

    finishDraft() {
        const draftedPlayers = this.slots.map(s => s.player);
        this.state.completeDraft(draftedPlayers);
        
        this.container.innerHTML = `
            <div class="draft-complete">
                <h2>Draft Completato!</h2>
                <p>La tua squadra è pronta.</p>
                <button id="btn-to-season" class="btn">Vai alla Scelta Stagione</button>
            </div>
        `;

        document.getElementById('btn-to-season').addEventListener('click', () => {
            // Randomly select a season for the championship
            const randomSeasonId = this.availableSeasons[Math.floor(Math.random() * this.availableSeasons.length)];
            DataLoader.loadSeason(randomSeasonId).then(seasonData => {
                this.state.startSeason(seasonData);
            });
        });
    }
}
