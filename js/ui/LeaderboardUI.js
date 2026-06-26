import { StatsEngine } from '../engine/StatsEngine.js';

export class LeaderboardUI {
    constructor(app, containerElement) {
        this.app = app;
        this.container = containerElement;
        this.uiState = 'SELECTION'; // 'SELECTION' or 'LEADERBOARD'
        this.currentMode = 'sp'; // 'sp' or 'mp'
        this.isBudget = false;
        this.sortColumn = 'avg_points';
        this.sortDesc = true;
        this.data = [];
        this.columnsExpanded = false;
        
        // Show global header
        const gh = document.getElementById('global-header');
        if (gh) gh.style.display = 'flex';
    }

    async init() {
        this.uiState = 'SELECTION';
        this.columnsExpanded = false;
        this.render();
    }

    async loadData() {
        this.renderLoader();
        const rawData = await StatsEngine.getLeaderboard(this.currentMode === 'mp', this.isBudget);
        this.data = rawData.map(row => {
            const completed_seasons = Math.max(0, row.seasons_played - row.abandons);
            return {
                ...row,
                completed_seasons,
                avg_points: completed_seasons > 0 ? (row.total_points / completed_seasons) : 0
            };
        });
        this.sortData();
        this.render();
    }

    sortData() {
        this.data.sort((a, b) => {
            let valA = a[this.sortColumn] || 0;
            let valB = b[this.sortColumn] || 0;
            
            // Handle strings (like team_name or username)
            if (typeof valA === 'string') {
                return this.sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
            
            return this.sortDesc ? valB - valA : valA - valB;
        });
    }

    handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDesc = !this.sortDesc; // Toggle order
        } else {
            this.sortColumn = column;
            this.sortDesc = true; // Default desc for new column
        }
        this.sortData();
        this.render();
    }

    renderLoader() {
        this.container.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100%; color:var(--accent);">
                <h2>Caricamento Classifica...</h2>
            </div>
        `;
    }

    handleBack() {
        if (this.uiState !== 'SELECTION') {
            this.uiState = 'SELECTION';
            this.render();
            return true;
        }
        return false;
    }

    render() {

        if (this.uiState === 'SELECTION') {
            this.renderSelection();
        } else {
            this.renderLeaderboard();
        }
    }

    renderSelection() {
        this.container.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 2rem; align-items: center; justify-content: center; min-height: 80vh;">
                <h1 style="font-size: 2.5rem; text-shadow: 0 0 15px rgba(0,230,255,0.5); color: var(--accent); margin:0;">CLASSIFICHE</h1>
                
                <div id="select-sp" style="width: 100%; background: rgba(0,20,50,0.8); border: 2px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 3rem; text-align: center; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.transform='translateY(-5px)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.transform='translateY(0)';">
                    <h2 style="font-size: 2rem; color: white; margin-bottom: 0.5rem;">SINGLE PLAYER</h2>
                    <p style="color: var(--text-muted); margin: 0;">Consulta le classifiche delle tue carriere solitarie</p>
                </div>

                <div id="select-mp" style="width: 100%; background: rgba(0,20,50,0.8); border: 2px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 3rem; text-align: center; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.transform='translateY(-5px)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.transform='translateY(0)';">
                    <h2 style="font-size: 2rem; color: white; margin-bottom: 0.5rem;">MULTIPLAYER</h2>
                    <p style="color: var(--text-muted); margin: 0;">Confronta i tuoi risultati con quelli degli altri manager</p>
                </div>
            </div>
        `;

        document.getElementById('select-sp').onclick = () => {
            this.currentMode = 'sp';
            this.uiState = 'LEADERBOARD';
            this.loadData();
        };

        document.getElementById('select-mp').onclick = () => {
            this.currentMode = 'mp';
            this.uiState = 'LEADERBOARD';
            this.loadData();
        };
    }

    renderLeaderboard() {
        const renderSortIcon = (col) => {
            if (this.sortColumn !== col) return '';
            return this.sortDesc ? ' ↓' : ' ↑';
        };

        const displayStyle = this.columnsExpanded ? '' : 'display: none;';
        const thStyle = "padding: 1rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); user-select: none; transition: color 0.2s; white-space: nowrap;";
        const thStyleSec = `${thStyle} ${displayStyle}`;
        const tdStyleSec = `padding: 1rem; ${displayStyle}`;

        const thHoverClass = "class='sortable-th'"; 

        this.container.innerHTML = `
            <style>
                .sortable-th:hover { color: var(--accent); }
                .sub-tab-container { display: flex; background: rgba(0,20,50,0.8); border: 1px solid rgba(255,255,255,0.2); border-radius: 16px 16px 0 0; }
                .lb-sub-tab { flex: 1; text-align: center; padding: 1rem; cursor: pointer; font-weight: bold; border-bottom: 2px solid transparent; transition: all 0.2s; color: rgba(255,255,255,0.5); }
                .lb-sub-tab.active { color: white; border-bottom: 2px solid var(--accent); background: rgba(255,255,255,0.05); }
                .table-wrapper { overflow-x: auto; }
            </style>
            
            <div style="max-width: 1200px; margin: 0 auto; padding: 2rem 1rem;">
                <h1 class="header-title" style="font-size: 2.5rem; text-shadow: 0 0 15px rgba(0,230,255,0.5); color: var(--accent); margin:0 0 2rem 0; text-transform: uppercase; text-align: center;">
                    ${this.currentMode === 'sp' ? 'SINGLE PLAYER' : 'MULTIPLAYER'}
                </h1>

                <div class="sub-tab-container">
                    <div id="sub-tab-classic" class="lb-sub-tab ${!this.isBudget ? 'active' : ''}">CLASSICA</div>
                    <div id="sub-tab-budget" class="lb-sub-tab ${this.isBudget ? 'active' : ''}">BUDGET</div>
                </div>
                
                <div style="background: rgba(0,20,50,0.8); border-left: 1px solid rgba(255,255,255,0.2); border-right: 1px solid rgba(255,255,255,0.2); padding: 1rem; display: flex; justify-content: flex-end;">
                    <button id="btn-expand-cols" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.5rem 1rem;">
                        ${this.columnsExpanded ? 'Comprimi Colonne' : 'Espandi Colonne'}
                    </button>
                </div>

                <div class="table-wrapper" style="background: rgba(0,20,50,0.8); border: 1px solid rgba(255,255,255,0.2); border-top: none; border-radius: 0 0 16px 16px;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead style="background: rgba(0,0,0,0.6); color: var(--text-muted); font-size: 0.9rem;">
                            <tr>
                                <th ${thHoverClass} style="${thStyle}" data-col="username">Manager${renderSortIcon('username')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="avg_points">Media Punti${renderSortIcon('avg_points')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="completed_seasons">Stagioni${renderSortIcon('completed_seasons')}</th>
                                
                                <th ${thHoverClass} style="${thStyleSec}" data-col="scudetti_won">Scudetti 🏆${renderSortIcon('scudetti_won')}</th>
                                <th ${thHoverClass} style="${thStyleSec}" data-col="champions_qualifications">CHA${renderSortIcon('champions_qualifications')}</th>
                                <th ${thHoverClass} style="${thStyleSec}" data-col="europa_qualifications">EUR${renderSortIcon('europa_qualifications')}</th>
                                <th ${thHoverClass} style="${thStyleSec}" data-col="conference_qualifications">CON${renderSortIcon('conference_qualifications')}</th>
                                <th ${thHoverClass} style="${thStyleSec}" data-col="relegations">RET${renderSortIcon('relegations')}</th>
                                <th ${thHoverClass} style="${thStyleSec}" data-col="abandons">Abbandoni${renderSortIcon('abandons')}</th>
                                <th ${thHoverClass} style="${thStyleSec}" data-col="abandon_rate">Tasso Abb. %${renderSortIcon('abandon_rate')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.data.length === 0 ? `
                                <tr><td colspan="10" style="text-align:center; padding: 2rem; color:var(--text-muted);">Nessun dato disponibile. Gioca una stagione!</td></tr>
                            ` : this.data.map((row, index) => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'}; transition: background 0.2s;">
                                    <td style="padding: 1rem;"><strong>${row.username}</strong></td>
                                    <td style="padding: 1rem; color: var(--accent); font-weight: bold;">${row.avg_points.toFixed(2)}</td>
                                    <td style="padding: 1rem;">${row.completed_seasons}</td>
                                    
                                    <td style="${tdStyleSec}; color: #fbbf24; font-weight: bold;">${row.scudetti_won}</td>
                                    <td style="${tdStyleSec}; color: #10b981;">${row.champions_qualifications}</td>
                                    <td style="${tdStyleSec}; color: #f59e0b;">${row.europa_qualifications}</td>
                                    <td style="${tdStyleSec}; color: #14b8a6;">${row.conference_qualifications}</td>
                                    <td style="${tdStyleSec}; color: #ef4444;">${row.relegations}</td>
                                    <td style="${tdStyleSec}; color: #f97316;">${row.abandons}</td>
                                    <td style="${tdStyleSec}; color: ${row.abandon_rate > 20 ? '#ef4444' : '#cbd5e1'};">${row.abandon_rate.toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.attachLeaderboardEvents();
    }

    attachLeaderboardEvents() {
        // Sub tabs
        document.getElementById('sub-tab-classic').onclick = async () => {
            if (!this.isBudget) return;
            this.isBudget = false;
            await this.loadData();
        };

        document.getElementById('sub-tab-budget').onclick = async () => {
            if (this.isBudget) return;
            this.isBudget = true;
            await this.loadData();
        };

        // Expand columns globally
        const btnExpand = document.getElementById('btn-expand-cols');
        if (btnExpand) {
            btnExpand.onclick = () => {
                this.columnsExpanded = !this.columnsExpanded;
                this.render(); // Re-render to apply the style display block/none
            };
        }

        // Sorting
        const thElements = this.container.querySelectorAll('th.sortable-th');
        thElements.forEach(th => {
            th.addEventListener('click', () => {
                const col = th.getAttribute('data-col');
                if (col) this.handleSort(col);
            });
        });
    }

    cleanup() {
    }
}
