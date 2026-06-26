import { DataLoader } from '../data/DataLoader.js';
import { StatsEngine } from '../engine/StatsEngine.js';
import { supabase } from '../supabase.js';
import { AVAILABLE_FORMATIONS } from '../engine/MatchEngine.js';

export class DraftUI {
    constructor(gameState, containerElement) {
        this.state = gameState;
        this.container = containerElement;
        
        this.availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
        this.formations = AVAILABLE_FORMATIONS;

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

    handleBack() {
        if (this.slots && this.slots.length > 0 && this.picksRemaining < 11 && this.picksRemaining > 0) {
            window.showAlert("Non puoi tornare indietro durante un draft in corso!");
            return true;
        }

        const formationSelection = document.getElementById('formation-selection');
        const modeSelection = document.getElementById('mode-selection');
        
        if (formationSelection && formationSelection.style.display === 'block') {
            formationSelection.style.display = 'none';
            if (modeSelection) modeSelection.style.display = 'flex';
            const customPanel = document.getElementById('custom-panel');
            if(customPanel) customPanel.style.display = 'none';
            return true; // intercepted
        }

        return false; // let GameApp handle it
    }

    renderFormationSelector() {
        let html = `
            <div class="logo-centered">
                <div class="yes-part"><span style="color:#008c45">Y</span><span style="color:#f4f9ff">E</span><span style="color:#cd212a">S</span></div>
                <div class="passion-part">PASSION</div>
            </div>

            <div id="mode-selection" style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem;">
                <div class="mode-btn" id="mode-classic">
                    <h3>Classica</h3>
                    <p>Draft al buio su tutte le stagioni, nessun limite di spesa. Costruisci il tuo dream team affidandoti alla sorte.</p>
                </div>
                <div class="mode-btn" id="mode-budget">
                    <h3>Budget (200M)</h3>
                    <p>Draft al buio su tutte le stagioni. Crea l'11 perfetto senza sforare il tetto salariale di 200 Milioni.</p>
                </div>
                <div class="mode-btn" id="mode-custom">
                    <h3>Custom</h3>
                    <p>Personalizza ogni singolo aspetto: budget, punteggi, difficoltà e annata calcistica.</p>
                </div>

                <div id="custom-panel" class="custom-settings" style="display: none;">
                    <div class="setting-row">
                        <label>Mostra Punteggi (NO Draft al buio)</label>
                        <input type="checkbox" id="custom-show-ovr" style="width: 24px; height: 24px;">
                    </div>
                    
                    <div class="setting-row">
                        <label>Limite Budget</label>
                        <input type="checkbox" id="custom-budget" style="width: 24px; height: 24px;">
                    </div>
                    <div id="custom-budget-slider-container" style="display: none; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                        <div style="display:flex; justify-content:space-between; color: var(--accent); font-weight:bold;">
                            <span>100M</span>
                            <span id="custom-budget-val">200M</span>
                            <span>500M</span>
                        </div>
                        <input type="range" id="custom-budget-slider" min="100" max="500" step="10" value="200" style="width: 100%;">
                    </div>

                    <div class="setting-row">
                        <label>Stagione Singola</label>
                        <select id="custom-season" class="custom-select">
                            <option value="all">Tutte (Casuali)</option>
                            <option value="15">2014-15</option>
                            <option value="16">2015-16</option>
                            <option value="17">2016-17</option>
                            <option value="18">2017-18</option>
                            <option value="19">2018-19</option>
                            <option value="20">2019-20</option>
                            <option value="21">2020-21</option>
                            <option value="22">2021-22</option>
                            <option value="23">2022-23</option>
                        </select>
                    </div>

                    <div class="setting-row">
                        <label>Difficoltà (Re-roll massimi)</label>
                        <select id="custom-reroll" class="custom-select">
                            <option value="3">Facile (3 Re-roll)</option>
                            <option value="1" selected>Media (1 Re-roll)</option>
                            <option value="0">Difficile (Nessun Re-roll)</option>
                        </select>
                    </div>
                    
                    <button class="btn" id="btn-custom-confirm" style="margin-top: 1rem;">Conferma Personalizzazione</button>
                </div>
            </div>

            <div id="formation-selection" style="display: none; text-align: center; margin-top: 2rem;">
                <h3 style="font-size: 1.5rem; margin-bottom: 1.5rem;">SELEZIONA IL MODULO PER INIZIARE</h3>
                <div class="formation-accordion" id="formation-accordion-container">
                    <!-- Generato via JS -->
                </div>
            </div>
        `;
        this.container.innerHTML = html;

        const modeSelection = document.getElementById('mode-selection');
        const formationSelection = document.getElementById('formation-selection');
        const customPanel = document.getElementById('custom-panel');

        // Setup custom budget slider logic
        const customBudgetCheck = document.getElementById('custom-budget');
        const customBudgetSliderContainer = document.getElementById('custom-budget-slider-container');
        const customBudgetSlider = document.getElementById('custom-budget-slider');
        const customBudgetVal = document.getElementById('custom-budget-val');
        
        customBudgetCheck.addEventListener('change', (e) => {
            customBudgetSliderContainer.style.display = e.target.checked ? 'flex' : 'none';
        });
        customBudgetSlider.addEventListener('input', (e) => {
            customBudgetVal.textContent = e.target.value + 'M';
        });

        // Mode: Classic
        document.getElementById('mode-classic').addEventListener('click', () => {
            this.blindDraft = true;
            this.budgetMode = false;
            this.rerollsLeft = 1;
            this.customSeason = 'all';
            
            modeSelection.style.display = 'none';
            formationSelection.style.display = 'block';
        });

        // Mode: Budget
        document.getElementById('mode-budget').addEventListener('click', () => {
            this.blindDraft = true;
            this.budgetMode = true;
            this.budgetMax = 200000000;
            this.rerollsLeft = 1;
            this.customSeason = 'all';
            
            modeSelection.style.display = 'none';
            formationSelection.style.display = 'block';
        });

        // Mode: Custom Toggle
        document.getElementById('mode-custom').addEventListener('click', () => {
            customPanel.style.display = customPanel.style.display === 'none' ? 'flex' : 'none';
        });

        // Mode: Custom Confirm
        document.getElementById('btn-custom-confirm').addEventListener('click', () => {
            this.blindDraft = !document.getElementById('custom-show-ovr').checked;
            this.budgetMode = customBudgetCheck.checked;
            this.budgetMax = parseInt(customBudgetSlider.value) * 1000000;
            this.rerollsLeft = parseInt(document.getElementById('custom-reroll').value);
            this.customSeason = document.getElementById('custom-season').value;
            
            modeSelection.style.display = 'none';
            formationSelection.style.display = 'block';
        });

        // Genera Accordion Moduli
        const accordionContainer = document.getElementById('formation-accordion-container');
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
                    </div>
                    <div class="formation-body">
                        <div class="mini-pitch">
                            <div class="mini-pitch-bg">
                                <div class="mini-pitch-lines">
                                    <div class="penalty-arc top"></div>
                                    <div class="penalty-area top"></div>
                                    <div class="penalty-arc bottom"></div>
                                    <div class="penalty-area bottom"></div>
                                </div>
                            </div>
                            <div class="mini-pitch-players">
                                ${pitchContent}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        accordionContainer.innerHTML = accordionHtml;

        // Gestione Accordion
        const formationItems = accordionContainer.querySelectorAll('.formation-item');
        formationItems.forEach(item => {
            const f = item.getAttribute('data-form');

            item.addEventListener('click', (e) => {
                const isActive = item.classList.contains('active');
                
                if (!isActive) {
                    // Chiudi tutti
                    formationItems.forEach(i => {
                        i.classList.remove('active');
                    });
                    // Se non era attivo, aprilo
                    item.classList.add('active');
                } else {
                    // Se è già attivo e ci clicca di nuovo, conferma
                    this.budgetSpent = 0;
                    
                    if (this.customSeason && this.customSeason !== 'all') {
                        this.availableSeasons = [parseInt(this.customSeason)];
                    } else {
                        this.availableSeasons = [15, 16, 17, 18, 19, 20, 21, 22, 23];
                    }

                    this.startDraft(f);
                }
            });
        });
    }

    async startDraft(formation) {

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await StatsEngine.markSeasonStart(user.id, false, this.budgetMode);
            }
        } catch(e) { console.error(e); }

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

        let attempts = 0;
        let randomSeasonId;
        let seasonData;
        let randomTeam;
        let combo;

        do {
            randomSeasonId = this.availableSeasons[Math.floor(Math.random() * this.availableSeasons.length)];
            seasonData = await DataLoader.loadSeason(randomSeasonId);
            
            if (!seasonData) {
                window.showAlert("Errore nel caricamento dei dati.");
                return;
            }

            const teams = seasonData.teams;
            randomTeam = teams[Math.floor(Math.random() * teams.length)];
            combo = `${randomSeasonId}-${randomTeam.name}`;
            attempts++;
        } while (this.extractedCombos && this.extractedCombos.includes(combo) && attempts < 50);

        if (!this.extractedCombos) this.extractedCombos = [];
        this.extractedCombos.push(combo);

        this.currentTeam = randomTeam;
        this.currentSeasonName = seasonData.season_name;
        this.selectedPlayer = null;

        this.renderDraftBoard();
    }

    renderDraftBoard(isLoading = false) {
        // Pitch section with rows
        let pitchHtml = ``;
        
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
        [...rowsWithSlots].reverse().forEach((rowSlots, rowIdx) => {
            pitchHtml += `<div class="pitch-row" style="z-index: ${10 - rowIdx}; align-items: flex-start;">`;
            rowSlots.forEach(slot => {
                const isFilled = slot.player !== null;
                const isGold = isFilled && slot.player.Overall >= 85 && !this.blindDraft;
                const displayOvr = isFilled ? (this.blindDraft ? '' : slot.player.Overall) : '';
                const p = slot.player;
                let shortName = '';
                if (isFilled && p) {
                    shortName = p.Nome;
                    // Remove initial dot: "Z. Ibrahimovic" -> "Ibrahimovic", "A. Del Piero" -> "Del Piero"
                    shortName = shortName.replace(/^[A-Z]\.\s*/i, '');
                }

                pitchHtml += `
                    <div class="slot-wrapper ${isFilled ? 'filled-wrapper' : 'empty-wrapper'}" data-slot-id="${slot.id}" style="display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 10; position: relative;">
                        <div class="slot ${isFilled ? 'filled' : ''} ${isGold ? 'gold-card' : ''}">
                            ${displayOvr ? `<span class="slot-ovr-inside">${displayOvr}</span>` : ''}
                        </div>
                        ${isFilled ? `
                            <div class="card-name-outside">
                                ${this.budgetMode && p.Value ? `<div class="budget-tag-pitch ${this.getPriceTierClass(p.ValueNum)}" style="font-size: 0.7rem; padding: 1px 4px; margin-bottom: 2px;">${p.Value}</div>` : ''}
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
                const roleOrder = ['POR', 'TD', 'TS', 'DC', 'ED', 'ES', 'CC', 'CDC', 'COC', 'AD', 'AS', 'AT', 'ATT'];
                const getRoleRank = (ruoloString) => {
                    const primary = ruoloString.split(',')[0].trim();
                    const index = roleOrder.indexOf(primary);
                    return index === -1 ? 99 : index;
                };

                filteredPlayers.sort((a, b) => {
                    const rankA = getRoleRank(a.player.Ruolo);
                    const rankB = getRoleRank(b.player.Ruolo);
                    if (rankA !== rankB) return rankA - rankB;
                    return a.player.Nome.localeCompare(b.player.Nome);
                });
            } else {
                filteredPlayers.sort((a, b) => b.player.Overall - a.player.Overall);
            }

            teamHtml = `
                <div class="draft-team-info" style="display: flex; justify-content: space-between; align-items: center; padding-right: 0.5rem;">
                    <h3 style="margin: 0;">${this.currentTeam.name} <span class="season-badge">${this.currentSeasonName}</span></h3>
                    ${this.rerollsLeft > 0 ? `<button id="btn-reroll-team" class="btn" style="background: var(--danger-color, #ef4444); font-size: 0.8rem; padding: 0.4rem 0.8rem; border-radius: 6px;">Cambia (${this.rerollsLeft})</button>` : ''}
                </div>
                <div class="roster-list">
                    ${filteredPlayers.length > 0 ? filteredPlayers.map(item => {
                        const p = item.player;
                        const isGold = p.Overall >= 85 && !this.blindDraft;
                        const displayOvr = this.blindDraft ? '?' : p.Overall;
                        return `
                        <div class="roster-player ${this.selectedPlayer && this.selectedPlayer.Nome === p.Nome ? 'selected' : ''}" data-idx="${item.originalIdx}">
                            <div class="p-left">
                                ${displayOvr ? `<span class="p-ovr ${isGold ? 'text-gold' : ''}">${displayOvr}</span>` : ''}
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
                                    <span>${11 - this.picksRemaining}/11</span>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div style="display: flex; justify-content: flex-end; width: 100%; margin-bottom: 10px;">
                            <span class="picks-badge">${11 - this.picksRemaining}/11</span>
                        </div>
                        `}
                    </div>
                    <div class="pitch-container" style="pointer-events: none; position: relative;">
                        <div class="pitch-bg">
                            <div class="pitch-lines"></div>
                        </div>
                        <div class="pitch-players">
                            ${pitchHtml}
                        </div>
                    </div>
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

        const btnReroll = this.container.querySelector('#btn-reroll-team');
        if (btnReroll) {
            btnReroll.addEventListener('click', () => {
                if (this.rerollsLeft > 0) {
                    this.rerollsLeft--;
                    this.rollNextTeam();
                }
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

        wrappers.forEach(el => {
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
            window.showAlert(`Azione non consentita! ${this.selectedPlayer.Nome} è un ${this.selectedPlayer.Ruolo}, non può giocare come ${slot.requiredRole}. Scegli uno slot compatibile o un altro giocatore.`);
            return;
        }

        if (this.budgetMode) {
            this.budgetSpent = parseFloat(this.budgetSpent) || 0;
            this.budgetMax = parseFloat(this.budgetMax) || 250000000;
            const playerCost = parseFloat(this.selectedPlayer.ValueNum) || 0;
            
            if (this.budgetSpent + playerCost > this.budgetMax) {
                window.showAlert(`Fondi insufficienti! Acquistando ${this.selectedPlayer.Nome} sforeresti il budget di €${((this.budgetSpent + playerCost - this.budgetMax)/1000000).toFixed(1)}M. (DEBUG: spent=${this.budgetSpent}, cost=${playerCost}, max=${this.budgetMax})`);
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

        const draftedPlayers = this.slots.map(s => {
            if (s.player) s.player.DeployedRole = s.requiredRole;
            return s.player;
        });
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
                    this.state.gameMode = this.budgetMode ? 'budget' : 'classica';
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
