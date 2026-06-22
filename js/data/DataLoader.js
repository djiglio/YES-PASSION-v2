export class DataLoader {
    static async loadSeason(seasonId) {
        try {
            const response = await fetch(`data/seasons/season_${seasonId}.json`);
            if (!response.ok) throw new Error(`Network response was not ok for season ${seasonId}`);
            return await response.json();
        } catch (error) {
            console.error("Error loading season data:", error);
            return null;
        }
    }
}
