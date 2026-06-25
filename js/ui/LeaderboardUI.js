import { StatsEngine } from '../engine/StatsEngine.js';

export class LeaderboardUI {
    constructor(app, containerElement) {
        this.app = app;
        this.container = containerElement;
        this.currentMode = 'sp'; // 'sp' or 'mp'
        this.sortColumn = 'avg_points';
        this.sortDesc = true;
        this.data = [];
    }

    async init() {
        this.renderLoader();
        await this.loadData();
        this.render();
    }

    async loadData() {
        this.data = await StatsEngine.getLeaderboard(this.currentMode === 'mp');
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
        const thHoverClass = "class='sortable-th'"; // we'll handle hover via a <style> block

        this.container.innerHTML = `
            <style>
                .sortable-th:hover { color: var(--accent); }
                .lb-tab { padding: 1rem 2rem; border-radius: 20px 20px 0 0; cursor: pointer; transition: all 0.3s; font-weight: bold; border: 1px solid transparent; }
                .lb-tab.active { background: rgba(0,20,50,0.8); border-color: rgba(255,255,255,0.2); border-bottom-color: transparent; color: var(--accent); }
                .lb-tab:not(.active) { background: rgba(0,0,0,0.5); color: var(--text-muted); }
            </style>
            
            <div style="max-width: 1200px; margin: 0 auto; padding: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h1 style="font-size: 2.5rem; text-shadow: 0 0 15px rgba(0,230,255,0.5); color: var(--accent);">CLASSIFICA GLOBALE</h1>
                    <button id="btn-back" class="btn btn-secondary">Torna alla Home</button>
                </div>
                
                <div style="display: flex; gap: 0.5rem; margin-bottom: -1px; position: relative; z-index: 10;">
                    <div id="tab-sp" class="lb-tab ${this.currentMode === 'sp' ? 'active' : ''}">SINGLE PLAYER</div>
                    <div id="tab-mp" class="lb-tab ${this.currentMode === 'mp' ? 'active' : ''}">MULTIPLAYER</div>
                </div>
                
                <div style="background: rgba(0,20,50,0.8); border: 1px solid rgba(255,255,255,0.2); border-radius: 0 16px 16px 16px; overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead style="background: rgba(0,0,0,0.6); color: var(--text-muted); font-size: 0.9rem;">
                            <tr>
                                <th ${thHoverClass} style="${thStyle}" data-col="username">Manager${renderSortIcon('username')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="team_name">Squadra${renderSortIcon('team_name')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="avg_points">Media Punti${renderSortIcon('avg_points')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="scudetti_won">Scudetti 🏆${renderSortIcon('scudetti_won')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="total_points">Punti Totali${renderSortIcon('total_points')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="seasons_played">Stagioni${renderSortIcon('seasons_played')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="matches_played">Partite${renderSortIcon('matches_played')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="matches_won">V${renderSortIcon('matches_won')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="matches_drawn">N${renderSortIcon('matches_drawn')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="matches_lost">P${renderSortIcon('matches_lost')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="goals_scored">GF${renderSortIcon('goals_scored')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="goals_conceded">GS${renderSortIcon('goals_conceded')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="abandons">Abbandoni${renderSortIcon('abandons')}</th>
                                <th ${thHoverClass} style="${thStyle}" data-col="abandon_rate">Tasso Abb. %${renderSortIcon('abandon_rate')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.data.length === 0 ? `
                                <tr><td colspan="14" style="text-align:center; padding: 2rem; color:var(--text-muted);">Nessun dato disponibile. Gioca una stagione!</td></tr>
                            ` : this.data.map((row, index) => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'}; transition: background 0.2s;">
                                    <td style="padding: 1rem;"><strong>${row.username}</strong></td>
                                    <td style="padding: 1rem; color: #cbd5e1;">${row.team_name}</td>
                                    <td style="padding: 1rem; color: var(--accent); font-weight: bold;">${row.avg_points.toFixed(2)}</td>
                                    <td style="padding: 1rem; color: #fbbf24; font-weight: bold;">${row.scudetti_won}</td>
                                    <td style="padding: 1rem;">${row.total_points}</td>
                                    <td style="padding: 1rem;">${row.seasons_played}</td>
                                    <td style="padding: 1rem;">${row.matches_played}</td>
                                    <td style="padding: 1rem; color: #10b981;">${row.matches_won}</td>
                                    <td style="padding: 1rem; color: #60a5fa;">${row.matches_drawn}</td>
                                    <td style="padding: 1rem; color: #ef4444;">${row.matches_lost}</td>
                                    <td style="padding: 1rem;">${row.goals_scored}</td>
                                    <td style="padding: 1rem;">${row.goals_conceded}</td>
                                    <td style="padding: 1rem; color: #f59e0b;">${row.abandons}</td>
                                    <td style="padding: 1rem; color: ${row.abandon_rate > 20 ? '#ef4444' : '#cbd5e1'};">${row.abandon_rate.toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    attachEvents() {
        document.getElementById('btn-back').onclick = () => {
            this.app.startHome();
        };

        document.getElementById('tab-sp').onclick = async () => {
            if(this.currentMode !== 'sp') {
                this.currentMode = 'sp';
                await this.init();
            }
        };

        document.getElementById('tab-mp').onclick = async () => {
            if(this.currentMode !== 'mp') {
                this.currentMode = 'mp';
                await this.init();
            }
        };

        // Table headers sorting
        const ths = this.container.querySelectorAll('th[data-col]');
        ths.forEach(th => {
            th.onclick = () => {
                const col = th.getAttribute('data-col');
                this.handleSort(col);
            };
        });
    }
}
