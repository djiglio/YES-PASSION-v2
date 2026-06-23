import json
import csv
import unicodedata
import os

def normalize_name(s):
    if not isinstance(s, str):
        return ""
    # Remove accents, lowercase
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode('utf-8')
    return s.lower().replace('.', '').replace('-', ' ').strip()

def format_value(val):
    if val >= 1000000:
        return f"€{val / 1000000:.1f}M"
    elif val > 0:
        return f"€{val / 1000:.0f}K"
    return "€0"

for season_id in range(15, 23):
    json_path = f"data/seasons/season_{season_id}.json"
    csv_path = f"players_{season_id}.csv"
    
    if not os.path.exists(json_path) or not os.path.exists(csv_path):
        print(f"Skipping season {season_id} - missing JSON or CSV")
        continue
        
    print(f"Processing Season {season_id}...")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        season_data = json.load(f)
        
    # Read CSV
    csv_players = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            val_str = row.get('value_eur', '0')
            if not val_str: val_str = '0'
            csv_players.append({
                'short_name_norm': normalize_name(row.get('short_name', '')),
                'long_name_norm': normalize_name(row.get('long_name', '')),
                'overall': int(row.get('overall', 0) or 0),
                'value_eur': float(val_str),
                'club_name': row.get('club_name', '')
            })
            
    matched_count = 0
    missing_count = 0
    
    for team in season_data['teams']:
        for p in team['players']:
            json_name_norm = normalize_name(p['Nome'])
            json_ovr = p['Overall']
            
            # Find match in CSV: same overall, name matches short or long
            match = None
            for cp in csv_players:
                if cp['overall'] == json_ovr:
                    if json_name_norm in cp['short_name_norm'] or cp['short_name_norm'] in json_name_norm or json_name_norm in cp['long_name_norm']:
                        match = cp
                        break
            
            if not match:
                # Try just by name if overall was slightly different
                for cp in csv_players:
                    if json_name_norm == cp['short_name_norm'] or json_name_norm == cp['long_name_norm']:
                        match = cp
                        break
            
            if match and match['value_eur'] > 0:
                p['ValueNum'] = match['value_eur']
                p['Value'] = format_value(match['value_eur'])
                matched_count += 1
            else:
                missing_count += 1
                
    print(f"Season {season_id}: Matched {matched_count}, Missing {missing_count}")
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(season_data, f, ensure_ascii=False, indent=4)

print("Done injecting official EA Sports market values.")
