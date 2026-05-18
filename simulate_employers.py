import json
import os
import random

# Resolve the wages.json path relative to this script so the simulation
# runs regardless of who's executing it or where they cloned the repo.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(BASE_DIR, 'wages.json')

# Define typical employers by Country and Sector
employer_map = {
    'Kenya': {
        'Digital/AI': "Safaricom, Microsoft ADC, Equity Bank, Cellulant",
        'Renewables': "KPLC, M-KOPA, SunCulture, KenGen",
        'Agriculture': "Twiga Foods, KALRO, KTDA, One Acre Fund"
    },
    'Tanzania': {
        'Digital/AI': "Vodacom, NMB Bank, Maxcom, Tigo",
        'Renewables': "TANESCO, Zola Electric, Songas, REA",
        'Agriculture': "SAGCOT, Metl Group, TPC Ltd, Kilombero Sugar"
    },
    'Uganda': {
        'Digital/AI': "MTN Uganda, Stanbic, SafeBoda, Andela",
        'Renewables': "Umeme, UEGCL, Fenix Intl, SolarNow",
        'Agriculture': "NARO, Pearl Dairy, Mukwano Group, Olam"
    },
    'Rwanda': {
        'Digital/AI': "Irembo, BK Tech, VW (Move), Zipline",
        'Renewables': "REG, Mobisol, Bboxx, Ignite Power",
        'Agriculture': "Inyange Industries, NAEB, Tea Factories"
    },
    'Burundi': {
        'Digital/AI': "Econet Leo, Lumitel, FinBank",
        'Renewables': "Regideso, Gigawatt Global",
        'Agriculture': "OTB (Tea), Intercafe, Brarudi"
    },
    'South Sudan': {
        'Digital/AI': "Zain, MTN, m-Gurush",
        'Renewables': "Ezra Construction, SunGate Solar",
        'Agriculture': "FAO Projects, WFP, Greenbelt Co-ops"
    },
    'DRC': {
        'Digital/AI': "Vodacom, Orange, Rawbank, Liquid Intel",
        'Renewables': "SNEL, Nuru, Virunga Power",
        'Agriculture': "Plantations et Huileries, Feronia"
    },
    'Somalia': {
        'Digital/AI': "Hormuud, Somtel, Dahabshiil",
        'Renewables': "NEC Somalia, BECO",
        'Agriculture': "Somali Fruit Company, Sesame Exporters"
    }
}

try:
    with open(file_path, 'r') as f:
        data = json.load(f)

    for entry in data:
        country = entry.get('Country')
        sector = entry.get('Sector')
        
        if country in employer_map and sector in employer_map[country]:
            entry['Typical_Employers'] = employer_map[country][sector]
        else:
            # Fallback for unmatched cases
            entry['Typical_Employers'] = "SMEs, NGOs, Government Agencies"
            
        # Add Work Setting
        if sector == 'Digital/AI':
            entry['Work_Setting'] = "Hybrid / Remote"
        elif sector == 'Agriculture':
            entry['Work_Setting'] = "On-Site / Field"
        elif sector == 'Renewables':
            entry['Work_Setting'] = "On-Site / Technical"
        else:
            entry['Work_Setting'] = "On-Site"

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Success: Updated {len(data)} records with employer data in {file_path}")

except FileNotFoundError:
    print(f"Error: Could not find file at {file_path}. Please check the path.")