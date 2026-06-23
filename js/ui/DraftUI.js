import { DataLoader } from '../data/DataLoader.js';

export class DraftUI {
    constructor(gameState, containerElement) {
        this.state = gameState;
        this.container = containerElement;
        
        this.availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        this.formations = {
            '4-4-2': [
                ['POR'],
                ['TS', 'DC', 'DC', 'TD'],
                ['ES', 'CC', 'CC', 'ED'],
                ['ATT', 'ATT']
            ],
            '4-3-3': [
                ['POR'],
                ['TS', 'DC', 'DC', 'TD'],
                ['CC', 'CDC', 'CC'],
                ['AS', 'ATT', 'AD']
            ],
            '3-5-2': [
                ['POR'],
                ['DC', 'DC', 'DC'],
                ['ES', 'CC', 'CC', 'ED'],
                ['COC'],
                ['ATT', 'ATT']
            ],
            '3-4-3': [
                ['POR'],
                ['DC', 'DC', 'DC'],
                ['ES', 'CC', 'CC', 'ED'],
                ['AT', 'ATT', 'AT']
            ],
            '4-2-3-1': [
                ['POR'],
                ['TS', 'DC', 'DC', 'TD'],
                ['CDC', 'CDC'],
                ['AS', 'COC', 'AD'],
                ['ATT']
            ],
            '5-3-2': [
                ['POR'],
                ['TS', 'DC', 'DC', 'DC', 'TD'],
                ['CC', 'CDC', 'CC'],
                ['ATT', 'ATT']
            ],
            '4-2-4': [
                ['POR'],
                ['TS', 'DC', 'DC', 'TD'],
                ['CDC', 'CDC'],
                ['AS', 'ATT', 'ATT', 'AD']
            ]
        };

        // Draft state
        this.slots = []; 
        this.currentTeam = null;
        this.currentSeasonName = null;
        this.picksRemaining = 11;
        this.selectedPlayer = null;
        this.blindDraft = false;
        
        this.budgetMode = false;
        this.budgetMax = 250000000; // 250M default
        this.budgetSpent = 0;
    }

    async init() {
        this.renderFormationSelector();
    }

    renderFormationSelector() {
        let html = `
            <div class="draft-setup">
                <h2>Impostazioni Draft</h2>
                
                <div class="settings-panel" style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="blind-draft-toggle" style="width: 20px; height: 20px; accent-color: var(--accent);">
                        Draft al buio (Nascondi Overall)
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 1.1rem; font-weight: 600;">
                        <input type="checkbox" id="budget-draft-toggle" style="width: 20px; height: 20px; accent-color: var(--accent);" checked>
                        Modalità Budget (Tetto Salariale)
                    </label>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.8rem;">Nella modalità Budget dovrai formare gli 11 titolari senza superare i €150M disponibili!</p>
                </div>

                <h3>Seleziona il Modulo</h3>
                <div class="formation-options" style="flex-wrap: wrap;">
                    ${Object.keys(this.formations).map(f => `<button class="btn formation-btn" data-form="${f}">${f}</button>`).join('')}
                </div>
            </div>
        `;
        this.container.innerHTML = html;

        this.container.querySelectorAll('.formation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.blindDraft = document.getElementById('blind-draft-toggle').checked;
                this.budgetMode = document.getElementById('budget-draft-toggle').checked;
                this.budgetSpent = 0;
                this.startDraft(e.target.getAttribute('data-form'));
            });
        });
    }

    async startDraft(formation) {
        this.state.userTeam.formation = formation;
        const layoutRows = this.formations[formation];
        
        // Flatten the array of rows into a single array for slots logic, but keep the row structure for rendering
        this.slots = [];
        this.layoutRows = layoutRows;
        
        let slotId = 0;
        layoutRows.forEach(row => {
            row.forEach(role => {
                this.slots.push({
                    id: slotId++,
                    requiredRole: role,
                    player: null
                });
            });
        });

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
        // Pitch section with rows
        let pitchHtml = `<div class="pitch-container"><div class="pitch">`;
        
        // Reconstruct rows from flat slots array
        let slotIndex = 0;
        // The formation array is always built from the GK (row 0) to ST (row n).
        // Since we want the attackers at the top visually, we should reverse the rows when rendering!
        const reversedRows = [...this.layoutRows].reverse();
        
        // Because we reversed the rows for visual representation, we need to carefully match slot IDs.
        // Actually, let's build the HTML by iterating backwards over the layout.
        // First, let's map the flat slots back to rows to keep their original IDs correct.
        const rowsWithSlots = [];
        let tempIndex = 0;
        this.layoutRows.forEach(rowRoles => {
            let rowSlots = [];
            rowRoles.forEach(() => {
                rowSlots.push(this.slots[tempIndex++]);
            });
            rowsWithSlots.push(rowSlots);
        });

        // Now iterate in reverse (Attackers at top, GK at bottom)
        [...rowsWithSlots].reverse().forEach(rowSlots => {
            pitchHtml += `<div class="pitch-row">`;
            rowSlots.forEach(slot => {
                const isFilled = slot.player !== null;
                const isGold = isFilled && slot.player.Overall >= 85 && !this.blindDraft;
                const displayOvr = isFilled ? (this.blindDraft ? '?' : slot.player.Overall) : '';
                const p = slot.player;
                
                pitchHtml += `
                    <div class="slot-wrapper" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <div class="slot ${isFilled ? 'filled' : ''} ${isGold ? 'gold-card' : ''}" data-slot-id="${slot.id}">
                            ${isFilled ? `
                                <div class="card-top" style="display: flex; flex-direction: column; align-items: center; width: 100%; padding-top: 4px;">
                                    <div class="card-ovr">${displayOvr}</div>
                                    <div class="card-role" style="color: ${this.getRoleColor(p.Ruolo.split(',')[0])}">${p.Ruolo.split(',')[0]}</div>
                                </div>
                                <div class="card-img-placeholder"></div>
                                ${this.budgetMode ? `<div class="budget-tag-pitch ${this.getPriceTierClass(p.ValueNum)}">${p.Value || ''}</div>` : ''}
                            ` : `
                                <div class="slot-role">${slot.requiredRole}</div>
                            `}
                        </div>
                        ${isFilled ? `<div class="card-name-outside">${slot.player.Nome}</div>` : `<div class="card-name-outside" style="opacity: 0; user-select: none;">-</div>`}
                    </div>
                `;
            });
            pitchHtml += `</div>`;
        });
        pitchHtml += `</div></div>`;

        let teamHtml = '';
        if (isLoading) {
            teamHtml = `<div class="loader-container"><div class="loader">Ricerca prossima squadra...</div></div>`;
        } else if (this.currentTeam) {
            const draftedNames = new Set(this.slots.filter(s => s.player !== null).map(s => s.player.Nome));
            const remainingRoles = new Set();
            this.slots.forEach(slot => {
                if (slot.player === null) {
                    remainingRoles.add(slot.requiredRole);
                }
            });

            const filteredPlayers = this.currentTeam.players
                .map((p, idx) => ({ player: p, originalIdx: idx }))
                .filter(item => {
                    if (draftedNames.has(item.player.Nome)) return false;
                    const pRoles = item.player.Ruolo.split(',').map(r => r.trim());
                    return pRoles.some(r => remainingRoles.has(r));
                });
            
            if (this.blindDraft) {
                filteredPlayers.sort((a, b) => a.player.Nome.localeCompare(b.player.Nome));
            } else {
                filteredPlayers.sort((a, b) => b.player.Overall - a.player.Overall);
            }

            teamHtml = `
                <div class="draft-team-info">
                    <h3>${this.currentTeam.name} <span class="season-badge">${this.currentSeasonName}</span></h3>
                </div>
                <div class="roster-list">
                    ${filteredPlayers.length > 0 ? filteredPlayers.map(item => {
                        const p = item.player;
                        const isGold = p.Overall >= 85 && !this.blindDraft;
                        const displayOvr = this.blindDraft ? '?' : p.Overall;
                        return `
                        <div class="roster-player ${this.selectedPlayer && this.selectedPlayer.Nome === p.Nome ? 'selected' : ''}" data-idx="${item.originalIdx}">
                            <div class="p-left">
                                <span class="p-ovr ${isGold ? 'text-gold' : ''}">${displayOvr}</span>
                                <span class="p-name">${p.Nome}</span>
                                ${this.budgetMode && p.Value ? `<span class="budget-tag-roster ${this.getPriceTierClass(p.ValueNum)}">${p.Value}</span>` : ''}
                            </div>
                            <div class="p-right">
                                <span class="p-role">${p.Ruolo}</span>
                            </div>
                        </div>
                        `;
                    }).join('') : `
                        <div class="no-players-msg">
                            Nessun giocatore compatibile con i ruoli rimasti. 
                            <button id="btn-skip-team" class="btn" style="margin-top: 1rem;">Ripesca Squadra</button>
                        </div>
                    `}
                </div>
            `;
        }

        this.container.innerHTML = `
            <div class="draft-container">
                <div class="draft-left">
                    <div class="draft-header-info">
                        ${this.budgetMode ? `
                        <div class="budget-header-wrapper">
                            <div class="budget-bar-container">
                                <div class="budget-fill" style="width: ${Math.min((this.budgetSpent / this.budgetMax) * 100, 100)}%; background: ${this.budgetSpent > this.budgetMax ? 'var(--danger-color, #ef4444)' : 'var(--accent)'};"></div>
                                <div class="budget-text" style="display:flex; justify-content:space-between; padding: 0 15px;">
                                    <span>BUDGET: €${(this.budgetSpent/1000000).toFixed(1)}M <span style="opacity:0.6; font-weight:normal;">/ €${(this.budgetMax/1000000).toFixed(1)}M</span></span>
                                    <span>Scelte rimanenti: ${this.picksRemaining}</span>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div style="display: flex; justify-content: flex-end; width: 100%; margin-bottom: 10px;">
                            <span class="picks-badge">Scelte rimanenti: ${this.picksRemaining}</span>
                        </div>
                        `}
                    </div>
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

        const players = this.container.querySelectorAll('.roster-player');
        players.forEach(p => {
            p.addEventListener('click', (e) => {
                players.forEach(el => el.classList.remove('selected'));
                const el = e.currentTarget;
                el.classList.add('selected');
                this.selectedPlayer = this.currentTeam.players[el.getAttribute('data-idx')];
                
                this.highlightCompatibleSlots();

                // Auto-scroll on mobile
                if (window.innerWidth <= 767) {
                    const pitch = this.container.querySelector('.pitch-container');
                    if (pitch) pitch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });

        const btnSkip = this.container.querySelector('#btn-skip-team');
        if (btnSkip) {
            btnSkip.addEventListener('click', () => {
                this.rollNextTeam();
            });
        }

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
            return;
        }

        if (this.budgetMode) {
            this.budgetSpent = parseFloat(this.budgetSpent) || 0;
            this.budgetMax = parseFloat(this.budgetMax) || 250000000;
            const playerCost = parseFloat(this.selectedPlayer.ValueNum) || 0;
            
            if (this.budgetSpent + playerCost > this.budgetMax) {
                alert(`Fondi insufficienti! Acquistando ${this.selectedPlayer.Nome} sforeresti il budget di €${((this.budgetSpent + playerCost - this.budgetMax)/1000000).toFixed(1)}M. (DEBUG: spent=${this.budgetSpent}, cost=${playerCost}, max=${this.budgetMax})`);
                return;
            }
            this.budgetSpent += playerCost;
        }

        slot.player = this.selectedPlayer;
        this.picksRemaining--;
        this.rollNextTeam();
    }

    getPriceTierClass(valueNum) {
        const val = parseFloat(valueNum) || 0;
        if (val >= 50000000) return 'budget-tier-high';
        if (val >= 15000000) return 'budget-tier-med';
        return 'budget-tier-low';
    }

    getRoleColor(role) {
        const r = role.trim();
        if (['ATT', 'AT', 'AD', 'AS'].includes(r)) return '#ef4444'; // Red for attackers
        if (['CC', 'CDC', 'COC', 'ED', 'ES'].includes(r)) return '#10b981'; // Green for midfielders
        if (['DC', 'TS', 'TD', 'ASA', 'ADA'].includes(r)) return '#3b82f6'; // Blue for defenders
        if (r === 'POR') return '#eab308'; // Yellow for GK
        return '#888';
    }

    finishDraft() {
        this.blindDraft = false;

        const draftedPlayers = this.slots.map(s => s.player);
        this.state.completeDraft(draftedPlayers);
        
        this.renderDraftBoard();

        const stats = this.calculateTeamStats();

        const rightContainer = this.container.querySelector('.draft-right');
        if (rightContainer) {
            rightContainer.innerHTML = `
                <div class="draft-complete-stats" style="display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; height: 100%;">
                    <h2 style="font-size: 2.2rem; margin-bottom: 1rem; color: var(--accent); text-transform: uppercase; text-shadow: 0 0 10px rgba(0, 230, 255, 0.5);">Squadra Completa!</h2>
                    
                    <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 12px; width: 100%; margin-bottom: 2rem; border: 1px solid var(--border-color);">
                        <h3 style="font-size: 1.8rem; margin-bottom: 1.5rem;">OVR Totale: <span style="color: var(--accent); font-size: 2.2rem; margin-left: 10px;">${stats.total}</span></h3>
                        
                        <div style="display: flex; justify-content: space-around; width: 100%; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
                            <div style="display: flex; flex-direction: column;">
                                <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">ATT</span>
                                <span style="font-size: 1.5rem; font-weight: 900; color: #fff;">${stats.att}</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">CEN</span>
                                <span style="font-size: 1.5rem; font-weight: 900; color: #fff;">${stats.mid}</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">DIF</span>
                                <span style="font-size: 1.5rem; font-weight: 900; color: #fff;">${stats.def}</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span style="color: var(--text-muted); font-weight: 800; font-size: 1rem;">POR</span>
                                <span style="font-size: 1.5rem; font-weight: 900; color: #fff;">${stats.gk}</span>
                            </div>
                        </div>
                    </div>
                    
                    <button id="btn-to-season" class="btn" style="font-size: 1.2rem; padding: 1rem 2rem; width: 100%;">Inizia la Stagione</button>
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

    calculateTeamStats() {
        const stats = { total: 0, att: 0, mid: 0, def: 0, gk: 0 };
        const counts = { att: 0, mid: 0, def: 0, gk: 0 };

        this.slots.forEach(s => {
            const r = s.requiredRole;
            const ovr = s.player.Overall;
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
}
