import { StatsEngine } from '../engine/StatsEngine.js';

export class LeaderboardUI {
    constructor(app, containerElement) {
        this.app = app;
        this.container = containerElement;
        this.currentMode = 'sp'; // 'sp' or 'mp'
        this.isBudget = false;
        this.sortColumn = 'avg_points';
        this.sortDesc = true;
        this.data = [];
        this.expandedMobile = false;
    }

    async init() {
        this.renderLoader();
        await this.loadData();
        this.render();
    }

    async loadData() {
        this.data = await StatsEngine.getLeaderboard(this.currentMode === 'mp', this.isBudget);
        this.sortData();
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

    render() {
        const renderSortIcon = (col) => {
            if (this.sortColumn !== col) return '';
            return this.sortDesc ? ' ↓' : ' ↑';
        };

        const thStyle = "padding: 1rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); user-select: none; transition: color 0.2s; white-space: nowrap;";
        const thHoverClass = "class='sortable-th'"; 

        this.container.innerHTML = `
            <style>
                .sortable-th:hover { color: var(--accent); }
                .lb-tab { padding: 1rem 2rem; border-radius: 20px 20px 0 0; cursor: pointer; transition: all 0.3s; font-weight: bold; border: 1px solid transparent; flex: 1; text-align: center; }
                .lb-tab.active { background: rgba(0,20,50,0.8); border-color: rgba(255,255,255,0.2); border-bottom-color: transparent; color: var(--accent); }
                .lb-tab:not(.active) { background: rgba(0,0,0,0.5); color: var(--text-muted); }
                
                .sub-tab-container { display: flex; background: rgba(0,20,50,0.8); border-left: 1px solid rgba(255,255,255,0.2); border-right: 1px solid rgba(255,255,255,0.2); }
                .lb-sub-tab { flex: 1; text-align: center; padding: 0.8rem; cursor: pointer; font-weight: bold; border-bottom: 2px solid transparent; transition: all 0.2s; color: rgba(255,255,255,0.5); }
                .lb-sub-tab.active { color: white; border-bottom: 2px solid var(--accent); background: rgba(255,255,255,0.05); }

                /* Mobile responsiveness */
                @media (max-width: 768px) {
                    .sec-col { display: ${this.expandedMobile ? 'table-cell' : 'none'}; }
                    .table-wrapper { overflow-x: auto; }
                    .lb-tab { padding: 0.8rem 0.5rem; font-size: 0.9rem; }
                    .header-title { font-size: 1.8rem !important; }
                }
            </style>
            
            <div style="max-width: 1200px; margin: 0 auto; padding: 2rem 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h1 class="header-title" style="font-size: 2.5rem; text-shadow: 0 0 15px rgba(0,230,255,0.5); color: var(--accent); margin:0;">CLASSIFICA</h1>
                    <button id="btn-back" class="btn btn-secondary">Torna alla Home</button>
                </div>
                
                <div style="display: flex; gap: 0.5rem; margin-bottom: -1px; position: relative; z-index: 10;">
                    <div id="tab-sp" class="lb-tab ${this.currentMode === 'sp' ? 'active' : ''}">SINGLE PLAYER</div>
                    <div id="tab-mp" class="lb-tab ${this.currentMode === 'mp' ? 'active' : ''}">MULTIPLAYER</div>
                </div>

                <div class="sub-tab-container">
                    <div id="sub-tab-classic" class="lb-sub-tab ${!this.isBudget ? 'active' : ''}">CLASSICA</div>
                    <div id="sub-tab-budget" class="lb-sub-tab ${this.isBudget ? 'active' : ''}">BUDGET</div>
                </div>
                
                <div style="background: rgba(0,20,50,0.8); border: 1px solid rgba(255,255,255,0.2); border-top: none; padding: 1rem; display: flex; justify-content: flex-end;">
                    <button id="btn-expand-mobile" class="btn btn-secondary" style="display: none; font-size: 0.8rem; padding: 0.5rem 1rem;">
                        ${this.expandedMobile ? 'Riduci Colonne' : 'Espandi Colonne'}
                    </button>
                </div>

                <div class="table-wrapper" style="background: rgba(0,20,50,0.8); border: 1px solid rgba(255,255,255,0.2); border-top: none; border-radius: 0 0 16px 16px;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead style="background: rgba(0,0,0,0.6); color: var(--text-muted); font-size: 0.9rem;">
                            <tr>
                                <th ${thHoverClass} style="${thStyle}" data-col="username">Manager${renderSortIcon('username')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="team_name">Squadra${renderSortIcon('team_name')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="avg_points">Media Punti${renderSortIcon('avg_points')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="scudetti_won">Scudetti 🏆${renderSortIcon('scudetti_won')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="total_points">Punti Totali${renderSortIcon('total_points')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="seasons_played">Stagioni${renderSortIcon('seasons_played')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="matches_played">Partite${renderSortIcon('matches_played')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="matches_won">V${renderSortIcon('matches_won')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="matches_drawn">N${renderSortIcon('matches_drawn')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="matches_lost">P${renderSortIcon('matches_lost')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="goals_scored">GF${renderSortIcon('goals_scored')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="goals_conceded">GS${renderSortIcon('goals_conceded')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="abandons">Abbandoni${renderSortIcon('abandons')}</th>
                                <th ${thHoverClass} style="${thStyle}" class="sec-col" data-col="abandon_rate">Tasso Abb. %${renderSortIcon('abandon_rate')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.data.length === 0 ? `
                                <tr><td colspan="14" style="text-align:center; padding: 2rem; color:var(--text-muted);">Nessun dato disponibile. Gioca una stagione!</td></tr>
                            ` : this.data.map((row, index) => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'}; transition: background 0.2s;">
                                    <td style="padding: 1rem;"><strong>${row.username}</strong></td>
                                    <td class="sec-col" style="padding: 1rem; color: #cbd5e1;">${row.team_name}</td>
                                    <td style="padding: 1rem; color: var(--accent); font-weight: bold;">${row.avg_points.toFixed(2)}</td>
                                    <td style="padding: 1rem; color: #fbbf24; font-weight: bold;">${row.scudetti_won}</td>
                                    <td class="sec-col" style="padding: 1rem;">${row.total_points}</td>
                                    <td class="sec-col" style="padding: 1rem;">${row.seasons_played}</td>
                                    <td class="sec-col" style="padding: 1rem;">${row.matches_played}</td>
                                    <td class="sec-col" style="padding: 1rem; color: #10b981;">${row.matches_won}</td>
                                    <td class="sec-col" style="padding: 1rem; color: #60a5fa;">${row.matches_drawn}</td>
                                    <td class="sec-col" style="padding: 1rem; color: #ef4444;">${row.matches_lost}</td>
                                    <td class="sec-col" style="padding: 1rem;">${row.goals_scored}</td>
                                    <td class="sec-col" style="padding: 1rem;">${row.goals_conceded}</td>
                                    <td class="sec-col" style="padding: 1rem; color: #f59e0b;">${row.abandons}</td>
                                    <td class="sec-col" style="padding: 1rem; color: ${row.abandon_rate > 20 ? '#ef4444' : '#cbd5e1'};">${row.abandon_rate.toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Check if mobile to show expand button
        if (window.innerWidth <= 768) {
            document.getElementById('btn-expand-mobile').style.display = 'inline-block';
        }

        this.attachEvents();
    }

    attachEvents() {
        document.getElementById('btn-back').onclick = () => {
            this.app.startHome();
        };

        // Main tabs
        document.getElementById('tab-sp').onclick = async () => {
            if (this.currentMode === 'sp') return;
            this.currentMode = 'sp';
            await this.init();
        };

        document.getElementById('tab-mp').onclick = async () => {
            if (this.currentMode === 'mp') return;
            this.currentMode = 'mp';
            await this.init();
        };

        // Sub tabs
        document.getElementById('sub-tab-classic').onclick = async () => {
            if (!this.isBudget) return;
            this.isBudget = false;
            await this.init();
        };

        document.getElementById('sub-tab-budget').onclick = async () => {
            if (this.isBudget) return;
            this.isBudget = true;
            await this.init();
        };

        // Expand mobile
        const btnExpand = document.getElementById('btn-expand-mobile');
        if (btnExpand) {
            btnExpand.onclick = () => {
                this.expandedMobile = !this.expandedMobile;
                this.render(); // Re-render to apply the class state
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
}
