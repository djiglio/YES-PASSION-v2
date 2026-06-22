export const GAME_PHASES = {
    INIT: 'INIT',
    DRAFT: 'DRAFT',
    SEASON_INIT: 'SEASON_INIT',
    MATCHDAY: 'MATCHDAY',
    END_SEASON: 'END_SEASON'
};

export class GameState {
    constructor() {
        this.phase = GAME_PHASES.INIT;
        this.userTeam = {
            formation: null,
            squad: [],
            stats: { att: 0, mid: 0, def: 0, gk: 0 },
            points: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            wins: 0,
            draws: 0,
            losses: 0
        };
        this.currentSeason = null;
        this.matchday = 1;
        this.schedule = [];
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this));
    }

    setPhase(newPhase) {
        this.phase = newPhase;
        this.notifyListeners();
    }

    startDraft(formation) {
        this.userTeam.formation = formation;
        this.setPhase(GAME_PHASES.DRAFT);
    }

    completeDraft(draftedPlayers) {
        this.userTeam.squad = draftedPlayers;
        this.calculateUserTeamStats();
        // Transition will be handled by main flow after picking season
    }

    calculateUserTeamStats() {
        // Basic calculation: average of players by role
        // A more complex one would factor the formation properly
        const squad = this.userTeam.squad;
        if (squad.length === 0) return;

        let attSum = 0, attCount = 0;
        let midSum = 0, midCount = 0;
        let defSum = 0, defCount = 0;
        let gkSum = 0, gkCount = 0;

        squad.forEach(player => {
            const role = player.Ruolo; // Assuming Italian roles like ATT, CC, DC, POR
            const ovr = parseInt(player.Overall, 10);
            
            if (role.includes('POR')) { gkSum += ovr; gkCount++; }
            else if (['DC', 'TS', 'TD', 'ASA', 'ADA'].some(r => role.includes(r))) { defSum += ovr; defCount++; }
            else if (['CDC', 'CC', 'COC', 'ES', 'ED'].some(r => role.includes(r))) { midSum += ovr; midCount++; }
            else { attSum += ovr; attCount++; }
        });

        this.userTeam.stats = {
            att: attCount > 0 ? Math.round(attSum / attCount) : 0,
            mid: midCount > 0 ? Math.round(midSum / midCount) : 0,
            def: defCount > 0 ? Math.round(defSum / defCount) : 0,
            gk: gkCount > 0 ? Math.round(gkSum / gkCount) : 0
        };
    }

    startSeason(seasonData) {
        this.currentSeason = seasonData;
        this.matchday = 1;
        this.setPhase(GAME_PHASES.SEASON_INIT);
    }
}
