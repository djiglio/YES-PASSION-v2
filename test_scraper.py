import cloudscraper
from bs4 import BeautifulSoup
import pandas as pd
import time

def get_league_id(scraper, year_id):
    url = f"https://www.fifaindex.com/players/{year_id}_1/"
    try:
        response = scraper.get(url)
        if response.status_code != 200:
            return None
        soup = BeautifulSoup(response.text, 'lxml')
        league_select = soup.find('select', {'name': 'league'})
        if not league_select:
            return None
        for option in league_select.find_all('option'):
            text = option.text.lower()
            if 'serie a' in text or 'calcio a' in text or 'italy' in text:
                # Need to be careful not to pick Serie B.
                if 'serie b' not in text and 'calcio b' not in text:
                    return option.get('value')
    except Exception as e:
        print(f"Error finding league for {year_id}: {e}")
    return None

def scrape_fifa_data():
    scraper = cloudscraper.create_scraper()
    all_players = []
    
    # Generate fifa ids
    years = [f"fifa{str(y).zfill(2)}" for y in range(5, 24)] + ["fc24"]
    # We will limit to just a few years for testing first, or do we do all?
    # Let's do just 'fifa23' to test.
    test_years = ["fifa23"]
    
    for year in test_years:
        print(f"Processing {year}...")
        league_id = get_league_id(scraper, year)
        if not league_id:
            print(f"Could not find Serie A for {year}")
            continue
            
        print(f"Found league ID {league_id} for {year}")
        page = 1
        while True:
            url = f"https://www.fifaindex.com/players/{year}_1/{page}/?league={league_id}"
            response = scraper.get(url)
            if response.status_code != 200:
                break
            
            soup = BeautifulSoup(response.text, 'lxml')
            table = soup.find('table', {'class': 'table players'})
            if not table:
                break
                
            rows = table.find('tbody').find_all('tr')
            if not rows:
                break
                
            players_added = 0
            for row in rows:
                if 'class' in row.attrs and ('table-header' in row['class'] or 'ad' in row['class']):
                    continue
                    
                cols = row.find_all('td')
                if len(cols) < 6:
                    continue
                
                try:
                    # Name is usually in the a tag with class 'link-player'
                    name_tag = cols[3].find('a', class_='link-player')
                    if not name_tag:
                        continue
                    name = name_tag.text.strip()
                    
                    # Club is in the a tag with class 'link-team'
                    team_tag = cols[5].find('a', class_='link-team')
                    club = team_tag.text.strip() if team_tag else "Free Agent"
                    
                    # Overall is in the span with class 'badge'
                    ovr_tag = cols[2].find('span', class_=lambda c: c and c.startswith('badge'))
                    overall = ovr_tag.text.strip() if ovr_tag else None
                    
                    # Role is in the a tag with class 'link-position'
                    pos_tags = cols[3].find_all('a', class_='link-position')
                    roles = [p.text.strip() for p in pos_tags]
                    role = roles[0] if roles else None
                    
                    all_players.append({
                        'Player': name,
                        'Club': club,
                        'Season': year,
                        'Overall': overall,
                        'Role': role
                    })
                    players_added += 1
                except Exception as e:
                    print(f"Error parsing row: {e}")
                    
            if players_added == 0:
                break
                
            print(f"  Scraped page {page}")
            page += 1
            time.sleep(1) # Be nice to the server
            break # ONLY DO PAGE 1 FOR TESTING
            
    df = pd.DataFrame(all_players)
    df.to_csv('fifa_serie_a_test.csv', index=False)
    print("Done. Saved to fifa_serie_a_test.csv")

if __name__ == "__main__":
    scrape_fifa_data()
