import json
import os
import random

# Resolve the wages.json path relative to this script so the simulation
# runs regardless of who's executing it or where they cloned the repo.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(BASE_DIR, 'wages.json')

# Define salary ranges (Monthly) in local currency for simulation
# Format: Country: { 'currency': code, 'base': (min_base, max_base) }
salary_bases = {
    'Kenya': { 'currency': 'KES', 'base': (45000, 120000) },
    'Tanzania': { 'currency': 'TZS', 'base': (800000, 2500000) },
    'Uganda': { 'currency': 'UGX', 'base': (1000000, 3500000) },
    'Rwanda': { 'currency': 'RWF', 'base': (300000, 900000) },
    'Burundi': { 'currency': 'BIF', 'base': (400000, 1200000) },
    'South Sudan': { 'currency': 'SSP', 'base': (150000, 500000) },
    'DRC': { 'currency': 'CDF', 'base': (500000, 1500000) },
    'Somalia': { 'currency': 'SOS', 'base': (300000, 800000) }
}

# Sector multipliers to vary the data
sector_mult = {
    'Digital/AI': 1.5,
    'Renewables': 1.2,
    'Agriculture': 1.0
}

def format_number(num):
    if num >= 1000000:
        return f"{round(num/1000000, 1)}M"
    elif num >= 1000:
        return f"{int(num/1000)}k"
    else:
        return str(int(num))

try:
    with open(file_path, 'r') as f:
        data = json.load(f)

    for entry in data:
        country = entry.get('Country')
        sector = entry.get('Sector')
        
        if country in salary_bases:
            base_min, base_max = salary_bases[country]['base']
            mult = sector_mult.get(sector, 1.0)
            
            # Generate P25 and P75
            p25_raw = (base_min * mult) * random.uniform(0.9, 1.1)
            p75_raw = (base_max * mult) * random.uniform(0.9, 1.1)
            
            entry['P25_Monthly_Wage'] = format_number(min(p25_raw, p75_raw))
            entry['P75_Monthly_Wage'] = format_number(max(p25_raw, p75_raw))

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Success: Updated {len(data)} records in {file_path}")

except FileNotFoundError:
    print(f"Error: Could not find file at {file_path}. Please check the path.")