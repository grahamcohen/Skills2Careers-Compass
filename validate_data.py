import json
import os
import re
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# --- Configuration ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILES = {
    "wages": os.path.join(BASE_DIR, "wages.json"),
    "ventures": os.path.join(BASE_DIR, "ventures.json"),
    "skills": os.path.join(BASE_DIR, "top_skills.json"),
    "occupations": os.path.join(BASE_DIR, "top_occupations.json"),
    "courses": os.path.join(BASE_DIR, "courses.json"),
    "app_data": os.path.join(BASE_DIR, "app_data.json"),
    # Split Resources
    "res_gen": os.path.join(BASE_DIR, "resources_general.json"),
    "res_ev": os.path.join(BASE_DIR, "resources_evidence.json"),
    "res_dig": os.path.join(BASE_DIR, "resources_digital.json"),
    "res_agri": os.path.join(BASE_DIR, "resources_agri.json"),
    "res_energy": os.path.join(BASE_DIR, "resources_energy.json")
}

EXPECTED_SECTORS = {"agri", "energy", "digital", "all", "Agriculture", "Renewables", "Digital/AI"} # Normalized in app.js, but checking raw
EXPECTED_COUNTRIES = {"Burundi", "DRC", "Kenya", "Rwanda", "Somalia", "South Sudan", "Tanzania", "Uganda"}

def load_json(path):
    if not os.path.exists(path):
        print(f"❌ File not found: {path}")
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ JSON Error in {path}: {e}")
        return None

def extract_urls(data, urls):
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, str) and (v.startswith("http://") or v.startswith("https://")):
                urls.add(v)
            else:
                extract_urls(v, urls)
    elif isinstance(data, list):
        for item in data:
            extract_urls(item, urls)

def check_url(url):
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return url, response.getcode(), "OK"
    except urllib.error.HTTPError as e:
        return url, e.code, "HTTP Error"
    except urllib.error.URLError as e:
        return url, 0, f"URL Error: {e.reason}"
    except Exception as e:
        return url, 0, f"Error: {str(e)}"

def validate():
    print("🔍 Starting Data Validation...\n")
    errors = 0
    data_store = {}
    
    # Load Data
    for key, path in FILES.items():
        data = load_json(path)
        if data is not None:
            data_store[key] = data
        else:
            print(f"⚠️ Warning: Could not load {key} from {path}")
            # Don't abort, try to validate what we have

    wages = data_store.get("wages", [])
    occupations = data_store.get("occupations", [])
    skills = data_store.get("skills", [])
    courses = data_store.get("courses", [])
    ventures = data_store.get("ventures", [])

    # --- 1. Validate Wages ---
    if wages:
        print(f"📋 Checking Wages ({len(wages)} records)...")
    else:
        print("⚠️ Skipping Wages check (no data)")

    wage_lookup = set() # (Occ_ID, Country)
    for i, entry in enumerate(wages):
        country = entry.get("Country")
        sector = entry.get("Sector")
        occ_id = entry.get("Occ_ID")

        if country not in EXPECTED_COUNTRIES:
            print(f"  ⚠️ Wages[{i}]: Invalid Country '{country}'")
            errors += 1
        if sector not in EXPECTED_SECTORS:
            print(f"  ⚠️ Wages[{i}]: Invalid Sector '{sector}'")
            errors += 1
        
        if occ_id and country:
            wage_lookup.add((occ_id, country))

    # --- 2. Validate Resources (Split Files) ---
    print(f"📋 Checking Resource Files...")
    # Basic check to ensure they are dicts or lists
    for key in ["res_gen", "res_ev", "res_dig", "res_agri", "res_energy"]:
        if key in data_store:
            if not isinstance(data_store[key], (dict, list)):
                print(f"  ⚠️ {key}: Expected dict or list, got {type(data_store[key])}")
                errors += 1

    # --- 3. Validate Occupations (Referential Integrity) ---
    if occupations:
        print(f"📋 Checking Occupations ({len(occupations)} records)...")
    
    missing_wages = []
    for i, occ in enumerate(occupations):
        country = occ.get("Country")
        master_id = occ.get("Master_Occ_ID")
        
        if country not in EXPECTED_COUNTRIES:
            print(f"  ⚠️ Occupations[{i}]: Invalid Country '{country}'")
            errors += 1
        
        # Check if Wage Data exists for this occupation
        if master_id and country:
            if (master_id, country) not in wage_lookup:
                print(f"  ⚠️ Data Gap: Occupation '{master_id}' in '{country}' has no matching entry in wages.json")
                errors += 1
                missing_wages.append({
                    "Occ_ID": master_id,
                    "Occupation": occ.get("Occupation_Role", "Unknown"),
                    "Sector": occ.get("Sector", "Unknown"),
                    "Country": country,
                    "Avg_Monthly_Wage": "0",
                    "P25_Monthly_Wage": "0",
                    "P50_Monthly_Wage": "0",
                    "P75_Monthly_Wage": "0",
                    "OJA_Count": "N/A"
                })
        
        # Check for O*NET or ESCO codes
        onet = occ.get("onetCode")
        esco = occ.get("escoCode")
        role_name = occ.get('Occupation_Role') or occ.get('occupationRole') or 'Unknown'
        if not onet and not esco:
            print(f"  ⚠️ Occupations[{i}]: Missing O*NET or ESCO code for '{role_name}'")
            errors += 1
        elif onet and not re.match(r'^\d{2}-\d{4}\.\d{2}$', str(onet)):
            print(f"  ⚠️ Occupations[{i}]: Invalid O*NET format '{onet}' for '{role_name}'")
            errors += 1

    # --- 4. Validate Courses ---
    if courses:
        print(f"📋 Checking Courses ({len(courses)} records)...")
        for i, c in enumerate(courses):
            if not c.get("name"):
                print(f"  ⚠️ Course[{i}]: Missing 'name'")
                errors += 1
            if not c.get("url"):
                print(f"  ⚠️ Course[{i}]: Missing 'url'")
                errors += 1

    # --- 5. URL Verification ---
    print("\n🌐 Extracting and Verifying URLs (this may take a moment)...")
    all_urls = set()
    for key, data in data_store.items():
        extract_urls(data, all_urls)
    
    print(f"   Found {len(all_urls)} unique URLs. Checking status...")
    
    url_errors = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_url = {executor.submit(check_url, url): url for url in all_urls}
        for future in as_completed(future_to_url):
            url, code, msg = future.result()
            if code != 200:
                print(f"  ❌ Broken Link: {url} -> {code} ({msg})")
                url_errors += 1
                errors += 1
            # Optional: Print success for verbose mode
            # else:
            #     print(f"  ✅ {url}")

    # --- Summary ---
    print("-" * 30)
    if errors == 0:
        print("✅ SUCCESS: Data is consistent and all links are active.")
    else:
        print(f"❌ FAILED: Found {errors} issues ({url_errors} broken links).")
        
        if missing_wages:
            print("\n💡 To fix missing wage data, append the following JSON to wages.json:")
            print(json.dumps(missing_wages, indent=2))

if __name__ == "__main__":
    validate()