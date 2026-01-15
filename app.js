// --- GLOBAL STATE ---
let activeSectorId = 'agri';
let activeCountry = 'all';
let currentSkillName = null;
let currentSkillData = null;
let impactChartsInitialized = false;
let wageData = []; // Store loaded OJA/Wage data
let ventureData = []; // Store loaded Venture data
let digitalResources = null; // Store loaded Digital/Sector resources
let pathwayState = { goal: null, constraints: {} }; // Store Pathway Builder state
let myPlan = { roles: new Set(), skills: new Set(), courses: new Set() }; // New My Plan State
let favoriteVentures = new Set(); // Store favorite ventures

// --- DATA MANAGER CLASS ---
class DataManager {
    constructor() {
        this.wages = [];
        this.ventures = [];
        this.digitalResources = null;
        this.topOccupations = [];
        this.topSkills = [];
        this.courses = [];
        this.scholarships = [];
        this.sectorMap = (typeof sectorMap !== 'undefined') ? sectorMap : { 'agri': 'Agriculture', 'energy': 'Renewables', 'digital': 'Digital/AI' };
        this.wageMap = new Map(); // For ID-based lookup
    }

    async init() {
        console.log("Initializing DataManager...");
        
        // Show Loading Spinner
        const spinner = document.getElementById('global-loader') || document.createElement('div');
        if(!spinner.id) {
            spinner.id = 'global-loader';
            spinner.className = 'fixed inset-0 bg-white z-[9999] flex items-center justify-center';
            spinner.innerHTML = '<div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>';
            document.body.appendChild(spinner);
        }

        // 1. Critical Load (Fast) - Config & Landing Page Data
        const criticalResults = await Promise.allSettled([
            this.fetchData('app_data.json'),
            this.fetchData('ventures.json'),
            this.fetchData('top_occupations.json'),
            this.fetchData('top_skills.json')
        ]);

        // Load App Data (UI Config)
        const appData = (criticalResults[0].status === 'fulfilled' && criticalResults[0].value) ? criticalResults[0].value : {};
        if (appData) Object.assign(window, appData); // Expose config globally

        this.ventures = (criticalResults[1].status === 'fulfilled' && criticalResults[1].value) ? criticalResults[1].value : this.getFallbackVentures();
        this.topOccupations = (criticalResults[2].status === 'fulfilled' && criticalResults[2].value) ? criticalResults[2].value : [];
        this.topSkills = (criticalResults[3].status === 'fulfilled' && criticalResults[3].value) ? criticalResults[3].value : [];

        this.normalizeData();
        
        // Hide Spinner immediately after critical data to improve perceived load time
        spinner.classList.add('hidden');

        // 2. Background Load (Heavy) - Wages, Courses, Resources
        Promise.allSettled([
            this.fetchData('wages.json'),
            this.fetchData('courses.json'),
            this.fetchData('resources_general.json'),
            this.fetchData('resources_evidence.json'),
            this.fetchData('resources_digital.json'),
            this.fetchData('resources_agri.json'),
            this.fetchData('resources_energy.json'),
            this.fetchData('Scholarships.json')
        ]).then(results => {
            this.wages = (results[0].status === 'fulfilled' && results[0].value) ? results[0].value : [];
            this.courses = (results[1].status === 'fulfilled' && results[1].value) ? results[1].value : [];
            
            const generalRes = (results[2].status === 'fulfilled' && results[2].value) ? results[2].value : {};
            const evidenceRes = (results[3].status === 'fulfilled' && results[3].value) ? results[3].value : [];
            const digitalRes = (results[4].status === 'fulfilled' && results[4].value) ? results[4].value : {};
            const agriRes = (results[5].status === 'fulfilled' && results[5].value) ? results[5].value : {};
            const energyRes = (results[6].status === 'fulfilled' && results[6].value) ? results[6].value : {};
            this.scholarships = (results[7].status === 'fulfilled' && results[7].value) ? results[7].value : this.getFallbackScholarships();

            this.digitalResources = {
            ...generalRes,
            "evidence_providers": evidenceRes,
            "digital": digitalRes,
            "agri": agriRes,
            "energy": energyRes
        };

        this.linkData();
        window.digitalResources = this.digitalResources;
        
            console.log(`Background data loaded: ${this.wages.length} wages, ${this.courses.length} courses.`);
            
            // Refresh views if they are already open
            if (typeof updateHeroStats === 'function') updateHeroStats();
            if (typeof updateTrainingProviders === 'function') updateTrainingProviders();
        });
        
        console.log(`DataManager critical loaded.`);
        
        // Initial renders
        try { if (typeof renderOccupationsView === 'function') renderOccupationsView(); } catch(e) { console.warn("Error rendering occupations:", e); }
        try { if (typeof renderSectorCards === 'function') renderSectorCards(); } catch(e) { console.warn("Error rendering cards:", e); }
        try { if (typeof updateHeroStats === 'function') updateHeroStats(); } catch(e) { console.warn("Error updating stats:", e); }
    }

    async fetchData(url) {
        try {
            // Add 5s timeout to prevent hanging
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            return await response.json();
        } catch (e) {
            console.warn(`Could not load ${url}:`, e);
            return null;
        }
    }

    normalizeData() {
        // Normalize Venture Sectors
        const normalize = (item) => {
            // Support both PascalCase (legacy) and camelCase (new)
            const sector = item.Sector || item.sector;
            if (sector === 'Agriculture' || sector === 'Agritech') { item.Sector ? item.Sector = 'agri' : item.sector = 'agri'; }
            if (sector === 'Renewables' || sector === 'Renewable Energy') { item.Sector ? item.Sector = 'energy' : item.sector = 'energy'; }
            if (sector === 'Digital/AI' || sector === 'Digital') { item.Sector ? item.Sector = 'digital' : item.sector = 'digital'; }
        };

        if (this.ventures.length > 0) {
            this.ventures.forEach(normalize);
        }
        // Normalize Top Occupations Sectors
        if (this.topOccupations.length > 0) {
             this.topOccupations.forEach(normalize);
        }
        // Normalize Top Skills Sectors
        if (this.topSkills.length > 0) {
            this.topSkills.forEach(normalize);
        }
    }

    linkData() {
        // Link Wages by ID for faster lookup
        this.wages.forEach(w => {
            // Support both casing
            const id = w.occId || w.Occ_ID;
            const country = w.country || w.Country;
            if (id) {
                this.wageMap.set(`${id}-${country}`, w);
            }
        });
    }
    getWage(occupation, country, occId = null) {
        let searchCountry = country === 'all' ? 'Kenya' : country;
        // Fix for DRC naming inconsistency
        if (searchCountry === 'DRC' || searchCountry === 'Democratic Republic of Congo') searchCountry = 'DR Congo';
        
        // Try ID lookup first
        if (occId) {
            const byId = this.wageMap.get(`${occId}-${searchCountry}`);
            if (byId) return byId;
        }

        // Fallback to Name lookup
        return this.wages.find(d => 
            (d.country === searchCountry || d.Country === searchCountry) && 
            (d.occupation === occupation || d.Occupation === occupation)
        );
    }

    getVentures(sectorId, country) {
        let searchCountry = country;
        // Normalize DRC for data lookup
        if (searchCountry === 'DRC' || searchCountry === 'Democratic Republic of Congo') searchCountry = 'DR Congo';

        return this.ventures.filter(v => 
            v.Sector === sectorId && 
            (country === 'all' || v.Country === searchCountry || v.Country === 'All')
        );
    }
    
    getOccupations(sectorId) {
        // Filter top occupations from external file
        const occs = this.topOccupations.filter(o => (o.sector === sectorId || o.Sector === sectorId));
        if (occs.length > 0) {
            return occs.sort((a,b) => (a.rank || a.Rank) - (b.rank || b.Rank)).map(o => ({
                name: o.occupationRole || o.Occupation_Role,
                desc: (o.skillsDescription || o.Skills_Description) ? (o.skillsDescription || o.Skills_Description).split('.')[0] + '.' : (o.description || o.Description || 'Key role in sector.'),
                isHot: (o.rank || o.Rank) <= 4,
                id: o.masterOccId || o.Master_Occ_ID, // Keep ID for linking
                why: o.whyInDemand || o.Why_In_Demand, // Capture Why in Demand
                onetCode: o.onetCode, // Pass through O*NET
                escoCode: o.escoCode  // Pass through ESCO
            }));
        }
        return null; // Return null to fallback to baseSectorDetailData
    }

    getSkills(sectorId) {
        // Filter top skills from external file
        const skills = this.topSkills.filter(s => (s.sector === sectorId || s.Sector === sectorId));
        
        if (skills.length > 0) {
            return skills.map(s => ({
                name: s.skill || s.Skill,
                desc: s.description || s.Description,
                narrative: s.narrative || s.Narrative,
                isHot: s.isHot || false
            }));
        }
        
        return null; // Return null to fallback to baseSectorDetailData
    }

    getFallbackVentures() {
        console.warn("Using fallback venture data.");
        // Use global fallback from data.js
        return (typeof fallbackVentures !== 'undefined') ? fallbackVentures : [];
    }

    getFallbackScholarships() {
        return [
            {
                "id": "aid_001",
                "name": "Mastercard Foundation Scholars Program",
                "provider": "Mastercard Foundation",
                "type": "Scholarship",
                "coverage": "Full (Tuition + Stipend)",
                "country": "Regional",
                "target": "Undergraduate / Master's",
                "deadline": "Varies by University",
                "link": "https://mastercardfdn.org/all/scholars/",
                "desc": "Comprehensive support for academically talented young leaders from economically disadvantaged backgrounds."
            },
            {
                "id": "aid_002",
                "name": "HELB Undergraduate Loan",
                "provider": "Government of Kenya",
                "type": "Loan",
                "coverage": "Partial (Tuition + Upkeep)",
                "country": "Kenya",
                "target": "Undergraduate (Public/Private)",
                "deadline": "Annual (August)",
                "link": "https://www.helb.co.ke/",
                "desc": "Low-interest government loans for Kenyan students in recognized universities and TVETs."
            },
            {
                "id": "aid_003",
                "name": "HESLB Loan",
                "provider": "Higher Education Students' Loans Board",
                "type": "Loan",
                "coverage": "Partial (Tuition + Meals)",
                "country": "Tanzania",
                "target": "Undergraduate",
                "deadline": "Annual (July-Sept)",
                "link": "https://www.heslb.go.tz/",
                "desc": "Loans for needy Tanzanian students admitted to accredited higher education institutions."
            },
            {
                "id": "aid_004",
                "name": "HESFB Loan Scheme",
                "provider": "Higher Education Students Financing Board",
                "type": "Loan",
                "coverage": "Tuition Fees",
                "country": "Uganda",
                "target": "Undergraduate / Diploma",
                "deadline": "Annual (July)",
                "link": "https://www.hesfb.go.ug/",
                "desc": "Loans for Ugandan students pursuing STEM programs and persons with disabilities."
            },
            {
                "id": "aid_005",
                "name": "Ashinaga Africa Initiative",
                "provider": "Ashinaga",
                "type": "Scholarship",
                "coverage": "Full (International)",
                "country": "Regional",
                "target": "Undergraduate",
                "deadline": "Annual (January)",
                "link": "https://en.ashinaga.org/apply/aai/",
                "desc": "Academic leadership program for orphaned students to study abroad and return to contribute to Sub-Saharan Africa."
            },
            {
                "id": "aid_006",
                "name": "Equity Wings to Fly / Elimu",
                "provider": "Equity Group Foundation",
                "type": "Scholarship",
                "coverage": "Full (Secondary + Uni Support)",
                "country": "Kenya",
                "target": "Secondary / TVET / Uni",
                "deadline": "Annual (December)",
                "link": "https://equitygroupfoundation.com/wings-to-fly/",
                "desc": "Comprehensive secondary school scholarship and leadership training for academically promising but financially challenged students."
            },
            {
                "id": "aid_007",
                "name": "BRD Student Loan (MinEduc)",
                "provider": "Development Bank of Rwanda",
                "type": "Loan",
                "coverage": "Tuition + Living Allowance",
                "country": "Rwanda",
                "target": "Undergraduate",
                "deadline": "Annual",
                "link": "https://www.brd.rw/brd/education-financing/",
                "desc": "Government-backed student loans for Rwandan students in public and private higher learning institutions."
            },
            {
                "id": "aid_008",
                "name": "IUCEA-Kyung Dong Scholarship",
                "provider": "IUCEA",
                "type": "Scholarship",
                "coverage": "Partial (Tuition)",
                "country": "Regional",
                "target": "Undergraduate",
                "deadline": "Annual (March)",
                "link": "https://www.iucea.org/",
                "desc": "Scholarships for students from EAC partner states to study at Kyung Dong University in South Korea."
            },
            {
                "id": "aid_009",
                "name": "Windle International Scholarship",
                "provider": "Windle International",
                "type": "Scholarship",
                "coverage": "Full",
                "country": "Regional (Refugee Focus)",
                "target": "Undergraduate / Master's",
                "deadline": "Varies",
                "link": "https://windle.org/",
                "desc": "Education opportunities for refugees and conflict-affected communities in East Africa."
            },
            {
                "id": "aid_010",
                "name": "KCB Foundation Tujiajiri",
                "provider": "KCB Foundation",
                "type": "Grant / Training",
                "coverage": "Vocational Training",
                "country": "Kenya",
                "target": "TVET / Youth",
                "deadline": "Rolling",
                "link": "https://kcbgroup.com/foundation/tujiajiri/",
                "desc": "Vocational skills training and mentorship for youth to establish their own businesses."
            },
            {
                "id": "aid_011",
                "name": "DAAD In-Country/In-Region",
                "provider": "DAAD",
                "type": "Scholarship",
                "coverage": "Full (Tuition + Stipend)",
                "country": "Regional",
                "target": "Master's / PhD",
                "deadline": "Varies",
                "link": "https://www.daad.or.ke/en/",
                "desc": "Support for postgraduate studies at selected partner universities within the East African region."
            },
            {
                "id": "aid_012",
                "name": "Madhvani Foundation Scholarship",
                "provider": "Madhvani Foundation",
                "type": "Scholarship",
                "coverage": "Tuition Fees",
                "country": "Uganda",
                "target": "Undergraduate",
                "deadline": "Annual (April)",
                "link": "https://www.madhvanifoundation.com/",
                "desc": "Scholarships for Ugandan university students demonstrating financial need and academic merit."
            },
            {
                "id": "aid_013",
                "name": "Excellentia Program",
                "provider": "Denise Nyakeru Tshisekedi Foundation",
                "type": "Scholarship",
                "coverage": "Full",
                "country": "DR Congo",
                "target": "Undergraduate",
                "deadline": "Annual",
                "link": "https://fondationdnt.org/excellentia/",
                "desc": "Promoting academic excellence by awarding scholarships to top-performing state exam graduates in DRC."
            },
            {
                "id": "aid_014",
                "name": "Iftin Foundation Education Fund",
                "provider": "Iftin Foundation",
                "type": "Grant",
                "coverage": "Partial",
                "country": "Somalia",
                "target": "Youth / TVET",
                "deadline": "Rolling",
                "link": "https://iftinfoundation.org/",
                "desc": "Support for skills development and education for youth in Somalia."
            },
            {
                "id": "aid_015",
                "name": "EAC Scholarship Programme",
                "provider": "EAC / KfW",
                "type": "Scholarship",
                "coverage": "Full",
                "country": "Regional",
                "target": "Master's",
                "deadline": "Bi-annual",
                "link": "https://www.eac.int/",
                "desc": "Scholarships for Master's students in Mathematics, Engineering, Informatics, Science, Technology and Business Science."
            }
        ];
    }
}

const dataManager = new DataManager();

// --- HELPER: OJA Data Lookup ---
function getOJAMetrics(roleTitle, country) {
    if (!dataManager.wages || dataManager.wages.length === 0) return null;

    // 1. Handle 'all' country case (Default to Kenya or aggregate logic)
    let searchCountry = country === 'all' ? 'Kenya' : country;

    if (typeof roleToOccupationMap === 'undefined') return null;
    const targetOccupation = roleToOccupationMap[roleTitle];

    if (!targetOccupation) return null;

    // 3. Find Entry using the precise occupation name
    const entry = dataManager.wages.find(d => 
        (d.country === searchCountry || d.Country === searchCountry) && 
        (d.occupation === targetOccupation || d.Occupation === targetOccupation)
    );

    if (entry) {
        return { count: entry.ojaCount || entry.OJA_Count || "N/A", ref: entry.ojaReference || entry.OJA_Reference || "UNESCO Global Skills Tracker" };
    }
    
    return null;
}


        // --- MOCK DETAILS PROVIDER ---
        function getOccupationDetails(title, sectorName) {
            const country = activeCountry;
            const currency = (typeof countryData !== 'undefined' && countryData[country] && countryData[country].currency) ? countryData[country].currency : 'USD';
            
            // Generate some base info
            let altTitles = "Specialist, Technician";
            let employers = "SMEs, Startups";
            let workMode = "On-Site";
            
            // --- DYNAMIC DATA LOOKUP ---
            const targetOcc = (typeof roleToOccupationMap !== 'undefined') ? roleToOccupationMap[title] : null;
            let searchCountry = activeCountry === 'all' ? 'Kenya' : activeCountry;

            const wageEntry = dataManager.getWage(targetOcc, activeCountry);

            // Salary Logic: Show currency code unless generic
            let salaryRange = "$500 - $1,200"; 
            
            if (wageEntry && (wageEntry.p25MonthlyWage || wageEntry.P25_Monthly_Wage)) {
                const p25 = wageEntry.p25MonthlyWage || wageEntry.P25_Monthly_Wage;
                const p75 = wageEntry.p75MonthlyWage || wageEntry.P75_Monthly_Wage;
                const curr = wageEntry.currency || wageEntry.Currency;
                if (p25 !== "TBD") salaryRange = `${curr} ${p25} - ${p75}`;
            } else if (typeof countryData !== 'undefined' && countryData[activeCountry]) {
                // Fallback to country default if specific wage not found
                if (countryData[activeCountry].salaryFallback) {
                    salaryRange = `${currency} ${countryData[activeCountry].salaryFallback}`;
                } else if (activeCountry !== 'all') {
                    salaryRange = `Competitive (${currency})`;
                }
            }

            const specificDef = standardDefinitions[title];
            const baseDesc = specificDef 
                ? `<div>${specificDef}</div>` 
                : `<div>As a ${title}, you bridge the gap between technical systems and on-ground operations in the ${sectorName} sector. Key responsibilities include data analysis, maintenance, and reporting.</div>`;
            
            // Apply specific employers if available
            // NEW: Check country overrides for sector-level hiring context
            const sectorOverrides = (typeof countryOverrides !== 'undefined' && countryOverrides[activeCountry] && countryOverrides[activeCountry][activeSectorId]) ? countryOverrides[activeCountry][activeSectorId] : null;

            if (wageEntry && (wageEntry.Typical_Employers || wageEntry.typicalEmployers)) {
                employers = wageEntry.Typical_Employers || wageEntry.typicalEmployers;
            } else if (typeof roleEmployers !== 'undefined' && roleEmployers[title]) {
                employers = roleEmployers[title];
                // Append country context if available
                if (sectorOverrides && sectorOverrides.hiring) {
                    employers += `, ${sectorOverrides.hiring}`;
                }
            }
            
            // Apply Work Setting if available
            if (wageEntry && (wageEntry.Work_Setting || wageEntry.workSetting)) {
                workMode = wageEntry.Work_Setting || wageEntry.workSetting;
            }

            // --- Generate Typical Day Breakdown ---
            let dayBreakdown = "";
            // Use global roleDayBreakdown from data.js
            const breakdownData = (typeof roleDayBreakdown !== 'undefined') ? roleDayBreakdown[title] : null;

            if (breakdownData) {
                const theme = breakdownData.theme;
                dayBreakdown = `
                    <div class="mt-4 pt-4 border-t border-slate-100">
                        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">A Typical Day at Different Levels</h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="p-3 bg-${theme}-50 rounded border border-${theme}-100">
                                <strong class="block text-${theme}-800 text-xs mb-1 font-bold">Entry Level (0-2 Yrs)</strong>
                                <p class="text-xs text-slate-600 leading-snug">${breakdownData.entry}</p>
                            </div>
                            <div class="p-3 bg-${theme}-50 rounded border border-${theme}-100">
                                <strong class="block text-${theme}-800 text-xs mb-1 font-bold">Mid-Career (3-5 Yrs)</strong>
                                <p class="text-xs text-slate-600 leading-snug">${breakdownData.mid}</p>
                            </div>
                            <div class="p-3 bg-${theme}-50 rounded border border-${theme}-100">
                                <strong class="block text-${theme}-800 text-xs mb-1 font-bold">Senior (5+ Yrs)</strong>
                                <p class="text-xs text-slate-600 leading-snug">${breakdownData.senior}</p>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Fallback for roles not in the detailed breakdown (e.g., from lower ranks)
                let theme = 'slate';
                if (activeSectorId === 'agri') theme = 'green';
                if (activeSectorId === 'energy') theme = 'yellow';
                if (activeSectorId === 'digital') theme = 'indigo';

                dayBreakdown = `
                    <div class="mt-4 pt-4 border-t border-slate-100">
                        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">A Typical Day at Different Levels</h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="p-3 bg-${theme}-50 rounded border border-${theme}-100">
                                <strong class="block text-${theme}-800 text-xs mb-1 font-bold">Entry Level (0-2 Yrs)</strong>
                                <p class="text-xs text-slate-600 leading-snug">Focuses on executing specific tasks under supervision, data collection, and learning core operational processes.</p>
                            </div>
                            <div class="p-3 bg-${theme}-50 rounded border border-${theme}-100">
                                <strong class="block text-${theme}-800 text-xs mb-1 font-bold">Mid-Career (3-5 Yrs)</strong>
                                <p class="text-xs text-slate-600 leading-snug">Involves independent problem-solving, managing small projects or teams, and contributing to process improvements.</p>
                            </div>
                            <div class="p-3 bg-${theme}-50 rounded border border-${theme}-100">
                                <strong class="block text-${theme}-800 text-xs mb-1 font-bold">Senior (5+ Yrs)</strong>
                                <p class="text-xs text-slate-600 leading-snug">Shifts to strategic planning, system design, mentoring junior staff, and managing key stakeholder relationships.</p>
                            </div>
                        </div>
                    </div>
                `;
            }

            let desc = `
                ${baseDesc}
                ${dayBreakdown}
            `;
            
            // Specific Overrides for flavor
            if (title.includes("Drone")) { altTitles = "UAV Operator, Aerial Surveyor"; }
            if (title.includes("Data")) { altTitles = "Data Analyst, Insights Lead"; workMode = "Remote"; }
            if (title.includes("Solar")) { altTitles = "PV Tech, Solar Engineer"; workMode = "On-Site"; }

            // Training Matches (Proxy)
            const keySkill = title.split(' ')[0];
            const catalogue = getMasterTrainingCatalogue(keySkill, activeSectorId, activeCountry);
            // Default to 'med' (intermediate) for general view
            const matches = catalogue.med;

            // Get specific skills (Object with technical/employability or fallback)
            // Updated fallback to ensure 5 skills if key is missing
            const rawSkills = (typeof roleSkills !== 'undefined' && roleSkills[title]) ? roleSkills[title] : { 
                technical: ["Core Technical Competency", "Industry Software Proficiency", "Data Analysis/Literacy", "Regulatory Compliance", "Equipment Maintenance"], 
                employability: ["Effective Communication", "Problem Solving", "Team Collaboration", "Time Management", "Adaptability"] 
            };

            const toolsList = (typeof roleToolsMap !== 'undefined' && roleToolsMap[title]) ? roleToolsMap[title] : ["Industry Standard Software", "Sector-Specific Hardware", "Reporting Tools", "Communication Platforms"];

            // --- 5. Regulatory Credentials (Contextualized) ---
            let credentials = [];
            const rules = (typeof credentialRules !== 'undefined') ? credentialRules[activeSectorId] : null;
            
            if (rules) {
                // 1. Common Rules
                if (rules.common) credentials.push(...rules.common);
                
                // 2. Conditional Rules (Keywords)
                if (rules.conditional) {
                    rules.conditional.forEach(rule => {
                        if (rule.keywords.some(k => title.includes(k))) credentials.push(rule.text);
                    });
                }

                // 3. Country Specific Rules
                if (rules.countries && rules.countries[activeCountry]) {
                    rules.countries[activeCountry].forEach(rule => {
                        if (rule.keywords.some(k => title.includes(k))) credentials.push(rule.text);
                    });
                } else if (rules.defaultCountry && activeCountry !== 'all') {
                    credentials.push(...rules.defaultCountry);
                }
            }

            // Legacy/Specific Logic for Drone (Complex conditional)
            if (activeSectorId === 'agri' && title.includes('Drone')) {
                    if (activeCountry === 'Kenya') credentials.push("KCAA Remote Pilot License (RPL)");
                    else if (activeCountry === 'Rwanda') credentials.push("RCAA Drone Operator Permit");
                    else credentials.push("Civil Aviation Authority (CAA) Remote Pilot License");
            }
            
            if (credentials.length === 0) credentials.push("Please consult the relevant Industry Governing Body or Ministry for specific requirements.");

            // --- 5. Read More Resources ---
            const resources = (typeof roleResourcesMap !== 'undefined' && roleResourcesMap[title]) ? roleResourcesMap[title] : [];

                return { 
                desc, 
                altTitles, 
                employers, 
                workMode, 
                salaryRange, 
               missingSkills: 3,
                matches,
                tools: toolsList,
                credentials,
                resources,
                sector: sectorName,
                specificSkills: rawSkills // Return object instead of array
            };
        }

        // --- HELPER: GENERATE OUTCOME DATA (Updated for Real Data) ---
        window.generateOutcomeScorecard = (providerName, courseType) => {
            const name = providerName || "";
            const config = (typeof outcomeScorecardConfig !== 'undefined') ? outcomeScorecardConfig : { verified: [], online: [] };
            
            const hasData = config.verified.some(k => name.includes(k));
            const isOnline = config.online.some(k => name.includes(k));
            
            // Accreditation & Stackable Logic
            let accreditation = null;
            if (name.includes("University") || name.includes("TVET") || name.includes("Institute") || name.includes("College")) {
                accreditation = "Accredited";
            }
            
            const isStackable = (courseType && (courseType.includes('Micro') || courseType.includes('Cert') || courseType.includes('Badge') || courseType.includes('Degree')));

            if (hasData) {
                return { available: true, placement: { d90: '62%', m6: '85%', y1: '94%' }, uplift: '+45%', methodology: 'Independent Audit', stars: 5, evidence: { completion: '94%', timeToJob: '3 Mo', sample: 'n=1.2k' }, accreditation: accreditation || "Verified Provider", stackable: isStackable };
            } else if (isOnline) {
                return { available: true, placement: { d90: 'N/A', m6: 'Global Avg', y1: 'N/A' }, uplift: 'Varies', methodology: 'Self-Reported', stars: 3, evidence: { completion: 'Varies', timeToJob: 'N/A', sample: 'Global' }, accreditation: accreditation || "Industry Recog.", stackable: isStackable };
            } else {
                return { available: false, accreditation: accreditation, stackable: isStackable }; 
            }
        };

        // --- MASTER TRAINING CATALOGUE (FILTERED REAL DATA) ---
        const getMasterTrainingCatalogue = (skillName, sector, country) => {
            // Use DataManager courses
            let sourceData = dataManager.courses;
            
            if (!sourceData || sourceData.length === 0) {
                 if (typeof realCourses !== 'undefined') sourceData = realCourses;
                 else return { short: [], med: [], long: [] };
            }

            const bySector = (c) => c.sector === sector || c.sector === 'all';
            const byCountry = (c) => {
                if(c.country === 'all') return true;
                // Normalize DRC for data lookup
                let searchCountry = country === 'DRC' ? 'DR Congo' : country;
                if(country === 'all') return true;
                return c.country === searchCountry;
            };
            
            let courses = sourceData.filter(c => bySector(c) && byCountry(c));
            
            // FIX: Include 'all' level courses (platforms) in specific buckets to ensure visibility
            const short = courses.filter(c => c.level === 'short' || c.level === 'all');
            const med = courses.filter(c => c.level === 'med' || c.level === 'all');
            const long = courses.filter(c => c.level === 'long' || c.level === 'all');

            [short, med, long].flat().forEach(c => {
                 if(!c) return;
                 c.costDisplay = c.cost; 
                 c.school = c.provider;
                 c.durationMonths = c.duration;
                 c.skillsCovered = c.skills || [];
                 c.occupationsMapped = ["Specialist", "Analyst"]; 
                 if (!c.outcomeData) {
                     c.outcomeData = window.generateOutcomeScorecard(c.provider, c.type);
                 }
            });

            return { short, med, long };
        };
        
        // --- RENDER FUNCTIONS ---
        
        function formatTrainingList(trainingList) {
            if(!trainingList || trainingList.length === 0) return '<div class="text-xs text-slate-500 p-4 text-center italic">No specific courses found for this filter.</div>';
            
            return trainingList.map(t => {
                if(!t) return ''; 
                
                const modalityIcon = t.mode === 'Online' ? 'monitor' : t.mode === 'In-Person' ? 'map-pin' : 'shuffle';
                
                let scorecardHtml = '';
                const isSaved = myPlan.courses.has(t.id);
                const saveIconClass = isSaved ? "fill-indigo-600 text-indigo-600" : "text-slate-300 hover:text-indigo-600";

                // Trust Tags
                let tagsHtml = '';
                if (t.outcomeData.accreditation === 'Accredited') {
                    tagsHtml += `<span class="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1" title="Nationally Accredited"><i data-lucide="shield-check" class="w-2.5 h-2.5"></i> Accredited</span>`;
                }
                if (t.outcomeData.stackable) {
                    tagsHtml += `<span class="text-[9px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1" title="Counts towards larger qualification"><i data-lucide="layers" class="w-2.5 h-2.5"></i> Stackable</span>`;
                }
                if (t.gsa_member || t.women_focused || t.unesco_unevoc) {
                    tagsHtml += `<span class="text-[9px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100 flex items-center gap-1" title="Featured Partner Program"><i data-lucide="award" class="w-2.5 h-2.5"></i> Featured</span>`;
                }

                if (t.outcomeData && t.outcomeData.available) {
                    // ... existing scorecard logic ...
                    const stars = Array(5).fill(0).map((_, i) => 
                        `<i data-lucide="star" class="w-3 h-3 ${i < t.outcomeData.stars ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}"></i>`
                    ).join('');

                    scorecardHtml = `
                        <div class="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                            <div class="bg-indigo-50 px-3 py-1.5 border-b border-indigo-100 flex justify-between items-center">
                                <span class="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">Provider Outcome Scorecard</span>
                                <div class="flex gap-0.5" title="Evidence Strength: ${t.outcomeData.stars}/5">${stars}</div>
                            </div>
                            <div class="p-3">
                                <div class="grid grid-cols-3 gap-2 text-center mb-3">
                                    <div>
                                        <div class="text-[9px] text-slate-500 uppercase">Completion</div>
                                        <div class="text-xs font-bold text-slate-800">${t.outcomeData.evidence.completion}</div>
                                    </div>
                                    <div class="border-x border-slate-100">
                                        <div class="text-[9px] text-slate-500 uppercase">Time-to-Job</div>
                                        <div class="text-xs font-bold text-slate-800">${t.outcomeData.evidence.timeToJob}</div>
                                    </div>
                                    <div>
                                        <div class="text-[9px] text-slate-500 uppercase">Sample</div>
                                        <div class="text-xs font-bold text-slate-800">${t.outcomeData.evidence.sample}</div>
                                    </div>
                                </div>
                                <div class="flex justify-between items-center pt-2 border-t border-slate-100">
                                    <div class="text-[10px] text-slate-500">Method: <span class="font-bold text-indigo-700">${t.outcomeData.methodology}</span></div>
                                    <div class="text-[10px] font-bold text-emerald-600">Uplift: ${t.outcomeData.uplift}</div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    scorecardHtml = `
                        <div class="mt-3 bg-slate-50 rounded-lg p-3 border border-slate-200">
                            <div class="flex items-start gap-2">
                                <i data-lucide="alert-circle" class="w-4 h-4 text-slate-400 mt-0.5 shrink-0"></i>
                                <div>
                                    <div class="text-xs font-bold text-slate-700">No public outcomes data available</div>
                                    <div class="text-[10px] text-slate-500 leading-tight mt-1">
                                        This provider does not publicly report verified employment or salary data. Independent tracking is recommended.
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="flex flex-col p-4 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors cursor-pointer group shadow-sm">
                        <div class="flex justify-between items-start mb-2">
                            <div class="pr-2">
                                <a href="${t.url}" target="_blank" class="font-bold text-base text-indigo-700 hover:underline flex items-start gap-1 leading-tight">
                                    ${t.name} <i data-lucide="external-link" class="w-3 h-3 mt-1 shrink-0"></i>
                                </a>
                                <div class="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                                    ${t.school}
                                    ${t.gsa_member ? '<span title="UNESCO Global Skills Academy Partner" class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">UNESCO GSA</span>' : ''}
                                    ${t.unesco_unevoc ? '<span title="UNESCO-UNEVOC Network Member" class="text-[9px] bg-orange-100 text-orange-700 px-1 rounded border border-orange-200">UNEVOC</span>' : ''}
                                    ${t.women_focused ? '<span title="Women-Focused Program" class="text-[9px] bg-pink-100 text-pink-700 px-1 rounded border border-pink-200">Women-Focused</span>' : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <div class="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 whitespace-nowrap">${t.type}</div>
                                <button onclick="event.stopPropagation(); togglePlanItem('courses', '${t.id}', '${t.name.replace(/'/g, "\\'")}')" class="p-1 rounded-full hover:bg-slate-50 transition-colors"><i data-lucide="bookmark" class="w-4 h-4 ${saveIconClass}"></i></button>
                            </div>
                        </div>
                        
                        <div class="flex flex-wrap gap-2 mb-3">
                            ${tagsHtml}
                        </div>

                        <!-- Added Description Section -->
                        <div class="text-xs text-slate-600 mb-3 leading-snug line-clamp-3">
                            ${t.description || 'No description available.'}
                        </div>

                        <div class="grid grid-cols-3 gap-2 border-y border-slate-100 py-3 mb-3">
                            <div class="text-center">
                                <div class="text-sm font-bold text-green-600">${t.durationMonths}</div>
                                <div class="text-[10px] text-slate-500">Duration</div>
                            </div>
                            <div class="text-center border-x border-slate-100">
                                <div class="text-sm font-bold text-indigo-600 truncate px-1">${t.costDisplay}</div>
                                <div class="text-[10px] text-slate-500">Cost</div>
                            </div>
                            <div class="text-center">
                                <i data-lucide="${modalityIcon}" class="w-4 h-4 mx-auto text-slate-500 mb-0.5"></i>
                                <div class="text-[10px] text-slate-500">${t.mode}</div>
                            </div>
                        </div>
                        <div class="space-y-2 mb-2">
                            <div class="flex items-start gap-2">
                                <div class="p-1 bg-purple-50 text-purple-600 rounded-full shrink-0 mt-0.5"><i data-lucide="cpu" class="w-3 h-3"></i></div>
                                <div class="text-xs text-slate-700">
                                    <span class="font-bold">Skills:</span> ${t.skillsCovered.slice(0, 3).join(', ') + (t.skillsCovered.length > 3 ? ` +${t.skillsCovered.length - 3} more` : '')}
                                </div>
                            </div>
                            <div class="flex items-start gap-2">
                                <div class="p-1 bg-amber-50 text-amber-600 rounded-full shrink-0 mt-0.5"><i data-lucide="book-open" class="w-3 h-3"></i></div>
                                <div class="text-xs text-slate-700">
                                    <span class="font-bold">Prereq:</span> ${t.prerequisites || 'None'} <span class="text-slate-400">|</span> <span class="font-bold">Lang:</span> ${t.language || 'English'}
                                </div>
                            </div>
                        </div>
                        ${scorecardHtml}
                        <div class="flex justify-between items-center mt-3">
                            <div class="text-[9px] text-slate-400 italic">Updated: ${t.lastUpdated || '2024'}</div>
                            <a href="${t.url}" target="_blank" class="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1">
                                Visit Site <i data-lucide="arrow-right" class="w-3 h-3"></i>
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function filterSkillTraining(level) {
            if (!currentSkillData) {
                console.error("Skill data not cached. Cannot filter.");
                return;
            }

            const listContainer = document.getElementById('skill-training-list');
            const label = document.getElementById('skill-training-filter-label');
            const buttonContainer = document.getElementById('skill-filter-container');
            
            let filteredCourses = [];
            let levelLabel = "All Levels";

            if (level === 'all') {
                filteredCourses = [...currentSkillData.short, ...currentSkillData.med, ...currentSkillData.long];
            } else {
                filteredCourses = currentSkillData[level];
                levelLabel = level === 'short' ? 'Beginner' : level === 'med' ? 'Intermediate' : 'Advanced';
            }
            
            if(buttonContainer) {
                const buttons = buttonContainer.querySelectorAll('button');
                buttons.forEach(btn => {
                    const isTarget = btn.getAttribute('onclick').includes(`'${level}'`);
                    if(isTarget) {
                        btn.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-200');
                        btn.classList.add('bg-indigo-100', 'text-indigo-700', 'border-indigo-300');
                    } else {
                        btn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200');
                        btn.classList.remove('bg-indigo-100', 'text-indigo-700', 'border-indigo-300');
                    }
                });
            }

            listContainer.innerHTML = formatTrainingList(filteredCourses);
            label.innerText = levelLabel;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Switch Sector inside PATHWAY ---
        window.switchPATHWAYSector = function(sector) {
            // Use global setter to sync UI and state
            setGlobalSector(sector);

            // Re-render PATHWAY content
            renderPATHWAYContent();
        }

        // --- NEW: Skill Gap Analysis Utility ---
        window.getSkillGapAnalysis = function(targetRole, userSkillsList) {
            // Ensure data is available
            if (typeof roleSkills === 'undefined') {
                console.warn("roleSkills data not loaded.");
                return null;
            }
            
            const targetData = roleSkills[targetRole];
            if (!targetData) {
                console.warn(`Role '${targetRole}' not found in database.`);
                return { error: "Role not found", matchScore: 0, technicalGaps: [], employabilityGaps: [] };
            }

            const requiredTech = targetData.technical || [];
            const requiredSoft = targetData.employability || [];
            
            // Normalize user skills for comparison (case-insensitive)
            const userSet = new Set((userSkillsList || []).map(s => s.toLowerCase().trim()));

            // Identify Gaps (Return original casing from required list)
            const techGaps = requiredTech.filter(s => !userSet.has(s.toLowerCase().trim()));
            const softGaps = requiredSoft.filter(s => !userSet.has(s.toLowerCase().trim()));
            
            // Calculate Match Score
            const totalRequired = requiredTech.length + requiredSoft.length;
            const totalGaps = techGaps.length + softGaps.length;
            const matchScore = totalRequired > 0 ? Math.round(((totalRequired - totalGaps) / totalRequired) * 100) : 0;

            return {
                role: targetRole,
                matchScore,
                technicalGaps: techGaps,
                employabilityGaps: softGaps,
                totalRequired
            };
        }

        // --- NEW: Calculate Diagnostic Results (Updated with Skills Analysis) ---
        window.calculateDiagnosticResults = function() {
            // 1. Get Values & Analyze Individual Inputs
            const layerAInputs = document.querySelectorAll('input[name="layerA"]');
            const layerBInputs = document.querySelectorAll('input[name="layerB"]');

            // Helper to get data
            const getSkillData = (inputs, type) => {
                return Array.from(inputs).map(input => ({
                    skill: input.dataset.skill || "Skill",
                    score: parseInt(input.value),
                    type: type
                }));
            };

            const techSkillsData = getSkillData(layerBInputs, 'Technical');
            const softSkillsData = getSkillData(layerAInputs, 'Employability');
            const allSkillsData = [...techSkillsData, ...softSkillsData];

            // Calculate Averages
            const scoreA = softSkillsData.reduce((acc, curr) => acc + curr.score, 0) / (softSkillsData.length || 1);
            const scoreB = techSkillsData.reduce((acc, curr) => acc + curr.score, 0) / (techSkillsData.length || 1);

            
            // 1b. Analyze Evidence (Checkboxes) - NEW
            const evidenceInputs = document.querySelectorAll('input[name="profile_evidence"]:checked');
            // Map 0-5+ items to a 1-5 score roughly
            const scoreEvidence = Math.min(Math.max(evidenceInputs.length, 1), 5);

            // 1c. Analyze Qualifications (NEW)
            const qualChecks = document.querySelectorAll('input[name="qual_check"]');
            const qualChecked = document.querySelectorAll('input[name="qual_check"]:checked');
            const scoreQuals = qualChecks.length > 0 ? (qualChecked.length / qualChecks.length) * 5 : 0;

            // Get Selected Role
            const roleSelect = document.getElementById('pp-role-selector');
            const selectedRole = roleSelect ? roleSelect.value : "Selected Role";

            // 2. Weighted Average (10% Quals, 50% Tech, 30% Soft, 10% Evidence)
            const totalScore = (scoreQuals * 0.1) + (scoreB * 0.5) + (scoreA * 0.3) + (scoreEvidence * 0.1);
            const percent = Math.round((totalScore / 5) * 100);

            // 3. Run Skill Gap Analysis (Using Utility)
            // We consider a skill "possessed" if score >= 4 (Proficient) to maintain high standards
            const userSkillsList = allSkillsData.filter(s => s.score >= 4).map(s => s.skill);
            const analysis = window.getSkillGapAnalysis(selectedRole, userSkillsList);
            const techGaps = analysis.technicalGaps;
            const empGaps = analysis.employabilityGaps;

            // 3. Determine Tier & Segments
            let tier = "Explorer";
            let tierCode = "explorer"; 
            let color = "slate";
            let msg = "You are in the <strong>Explorer</strong> phase. You have early interest but need to build core foundations.";
            let nextStep = "Take introductory courses & join community events";
            
            if (percent > 85) { 
                tier = "Job-ready (Independent)"; 
                tierCode = "independent";
                color = "emerald"; 
                msg = "<strong>Job-ready (Independent)</strong>. You show signs of a strong portfolio and ability to execute work independently."; 
                nextStep = "Apply for senior roles or freelance contracts";
            }
            else if (percent > 65) { 
                tier = "Job-ready (Entry)"; 
                tierCode = "entry";
                color = "indigo"; 
                msg = "<strong>Job-ready (Entry)</strong>. You are capable of performing entry-level tasks with supervision."; 
                nextStep = "Apply for Junior roles & polish your portfolio";
            }
            else if (percent > 40) { 
                tier = "Apprentice-ready"; 
                tierCode = "apprentice";
                color = "amber"; 
                msg = "<strong>Apprentice-ready</strong>. You have the basics and can start structured training or applied projects."; 
                nextStep = "Enroll in a bootcamp, internship, or hackathon";
            }

            // 4. SKILLS ANALYSIS LOGIC
            // Identify Strengths & Gaps for Narrative
            // 4. Narrative Generation
            const strengths = allSkillsData.filter(s => s.score >= 4).map(s => s.skill);
            const gaps = allSkillsData.filter(s => s.score < 4).map(s => s.skill);
            const allGaps = [...techGaps, ...empGaps];

            let synthesisText = '';
            // Use tier/percent to drive the main narrative for consistency
            if (percent > 85) {
                synthesisText = `Excellent work! You demonstrate high proficiency across key areas for this role.`;
                if (gaps.length > 0) synthesisText += ` Consider polishing <strong>${gaps.slice(0, 2).join(', ')}</strong> to reach expert level.`;
                if (allGaps.length > 0) synthesisText += ` Consider polishing <strong>${allGaps.slice(0, 2).join(', ')}</strong> to reach expert level.`;
                else synthesisText += ` Focus on portfolio building and networking.`;
            } else if (percent > 65) {
                synthesisText = `You have a solid foundation.`;
                if (strengths.length > 0) synthesisText += ` You are strong in <strong>${strengths.slice(0, 2).join(', ')}</strong>.`;
                if (gaps.length > 0) synthesisText += ` To become fully job-ready, focus on strengthening <strong>${gaps.slice(0, 3).join(', ')}</strong>.`;
                if (allGaps.length > 0) synthesisText += ` To become fully job-ready, focus on strengthening <strong>${allGaps.slice(0, 3).join(', ')}</strong>.`;
            } else if (percent > 40) {
                synthesisText = `You are making good progress but have some key gaps.`;
                if (gaps.length > 0) synthesisText += ` Prioritize training in <strong>${gaps.slice(0, 3).join(', ')}</strong> to build your profile.`;
                if (allGaps.length > 0) synthesisText += ` Prioritize training in <strong>${allGaps.slice(0, 3).join(', ')}</strong> to build your profile.`;
            } else {
                synthesisText = `You are at the beginning of your journey. Focus on foundational training in <strong>${gaps.slice(0, 3).join(', ')}</strong>.`;
                synthesisText = `You are at the beginning of your journey. Focus on foundational training in <strong>${allGaps.slice(0, 3).join(', ')}</strong>.`;
            }

            // --- NEW: Dynamic Related Roles Logic ---
            const currentRoleSkills = (typeof roleSkills !== 'undefined' && roleSkills[selectedRole]) ? new Set(roleSkills[selectedRole].technical) : new Set();
            let relatedRoles = [];

            if (currentRoleSkills.size > 0) {
                Object.entries(roleSkills).forEach(([rName, rData]) => {
                    if (rName === selectedRole) return;
                    // Simple intersection count
                    const overlap = rData.technical.filter(s => currentRoleSkills.has(s)).length;
                    // Calculate % match based on the target role's total skills
                    const matchScore = Math.round((overlap / rData.technical.length) * 100);
                    
                    if (matchScore > 30) { // Only show relevant matches
                        relatedRoles.push({ name: rName, score: matchScore });
                    }
                });
                relatedRoles.sort((a, b) => b.score - a.score);
            }
            // Fallback if no data
            if (relatedRoles.length === 0) relatedRoles = [{name: "Agri-Data Analyst", score: 65}, {name: "Farm Systems Lead", score: 55}];

            // Hide Inputs
            const inputsContainer = document.getElementById('diagnostic-inputs');
            if(inputsContainer) inputsContainer.classList.add('hidden');

            // 6. Render Results
            const resultsDiv = document.getElementById('diagnostic-results');

            // Dynamic data generation for new UI
            const matchStatus = percent > 65 ? "Strong Match" : percent > 40 ? "Good Match" : "Poor Match";
            const matchColor = percent > 65 ? "emerald" : percent > 40 ? "amber" : "rose";
            const fitText = percent > 65 ? "Great Fit" : percent > 40 ? "Good Fit" : "Poor Fit";
            const fitTextColor = percent > 65 ? "text-emerald-600" : percent > 40 ? "text-amber-600" : "text-rose-600";
            
            let summaryText = percent > 85 ? "you are highly qualified for this role." : percent > 65 ? "you are well-qualified for this role." : percent > 40 ? "you have a foundational match for this role." : "you have several skill gaps for this role.";
            if (scoreQuals < 3) summaryText += " Note: You may be missing key qualifications.";

            // Get role options for the dropdown
            let sectorOccupations = dataManager.getOccupations(activeSectorId);
            if (!sectorOccupations || sectorOccupations.length === 0) {
                sectorOccupations = baseSectorDetailData[activeSectorId] ? baseSectorDetailData[activeSectorId].occupations : [];
            }

            const roleOptions = sectorOccupations.slice(0, 10).map(r => {
                const isSelected = (r.name === selectedRole) ? 'selected' : '';
                return `<option value="${r.name}" ${isSelected}>${r.name}</option>`;
            }).join('');

            resultsDiv.innerHTML = `
            <div class="animate-fade-in bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                <div class="p-4 border-b border-slate-100 bg-slate-50">
                    <div class="flex flex-wrap justify-between items-center mb-3 gap-2">
                        <h3 class="font-bold text-slate-800 text-sm shrink-0">Assessment Results</h3>
                        <div class="flex items-center gap-2 shrink-0">
                            <button onclick="renderPATHWAYContent('${selectedRole}')" class="text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm transition-colors"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> Retake</button>
                            <span class="px-2 py-1 rounded-full bg-${matchColor}-100 text-${matchColor}-700 text-[10px] font-bold uppercase tracking-wider">${matchStatus}</span>
                        </div>
                    </div>
                    <select onchange="renderPATHWAYContent(this.value)" class="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2">
                        ${roleOptions}
                    </select>
                </div>
                <div class="p-6 space-y-6">
                    <!-- 1. Readiness Spectrum -->
                    <div>
                        <div class="flex justify-between items-end mb-2">
                            <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Role Readiness Score</span>
                            <span class="text-2xl font-bold text-indigo-600">${percent}%</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full" style="width: ${percent}%"></div>
                        </div>
                    </div>

                    <!-- 2. Assessment Synthesis (Restored) -->
                    <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                            <i data-lucide="lightbulb" class="w-3 h-3 text-amber-500"></i> Assessment Synthesis
                        </h4>
                        <p class="text-sm text-slate-700 leading-relaxed">${synthesisText}</p>
                    </div>

                    <!-- INLINE PATHWAY RESULT -->
                    <div id="diagnostic-inline-pathway" class="mt-8 pt-8 border-t border-slate-200">
                        <!-- Pathway content will be injected here -->
                    </div>
                </div>
            </div>
            `;
            
            // Scroll to results
            resultsDiv.scrollIntoView({ behavior: 'smooth' });
            
            // Generate Pathway IN-PLACE (Tab 1)
            if(typeof window.generatePersonalizedPathway === 'function') {
                window.generatePersonalizedPathway(tierCode, activeSectorId, softSkillsData.filter(s => s.score < 4).map(s => s.skill), techSkillsData.filter(s => s.score < 4).map(s => s.skill), selectedRole, 'diagnostic-inline-pathway');
                window.generatePersonalizedPathway(tierCode, activeSectorId, empGaps, techGaps, selectedRole, 'diagnostic-inline-pathway');
            }
            
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Generate Personalized Pathway Content ---
        window.generatePersonalizedPathway = function(tierCode, sector, empGaps = [], techGaps = [], roleName = "General Role", targetContainerId = 'pp-practice-content') {
            const container = document.getElementById(targetContainerId);
            if (!container) return;
            
            // 1. Select Courses based on Tier
            // UPDATED: Logic to fetch 4-6 recommendations across Skill/Up-skill/Re-skill
            const catalogue = getMasterTrainingCatalogue('all', sector, activeCountry);
            
            // --- NEW: Sort buckets by Location (National > Global) ---
            const sortByLocation = (list) => {
                if (activeCountry === 'all') return list;
                return list.sort((a, b) => {
                    const aIsLocal = a.country === activeCountry;
                    const bIsLocal = b.country === activeCountry;
                    if (aIsLocal && !bIsLocal) return -1;
                    if (!aIsLocal && bIsLocal) return 1;
                    return 0;
                });
            };
            catalogue.short = sortByLocation(catalogue.short);
            catalogue.med = sortByLocation(catalogue.med);
            catalogue.long = sortByLocation(catalogue.long);

            let prioritizedCourses = [];
            let pathwayFocus = "Skill Building";
            
            if (tierCode === 'independent') {
                // Mastery / Specialization
                pathwayFocus = "Mastery & Specialization";
                prioritizedCourses = [...catalogue.long, ...catalogue.med, ...catalogue.short];
            } else if (tierCode === 'entry') {
                // Advanced Up-skill
                pathwayFocus = "Advanced Skilling";
                prioritizedCourses = [...catalogue.med, ...catalogue.short, ...catalogue.long];
            } else if (tierCode === 'apprentice') {
                // Intermediate
                pathwayFocus = "Intermediate Skilling";
                prioritizedCourses = [...catalogue.med, ...catalogue.short];
            } else {
                // Foundational (Explorer)
                pathwayFocus = "Foundational Skills";
                prioritizedCourses = [...catalogue.short, ...catalogue.med, ...catalogue.long];
            }

            // NEW: Prioritize courses that match identified Technical Gaps
            if (techGaps && techGaps.length > 0) {
                prioritizedCourses.sort((a, b) => {
                    const countMatches = (course) => {
                        if (!course.skillsCovered) return 0;
                        // Use exact match since data is standardized
                        return course.skillsCovered.filter(s => techGaps.some(g => s.toLowerCase().trim() === g.toLowerCase().trim())).length;
                    };
                    
                    const matchesA = countMatches(a);
                    const matchesB = countMatches(b);
                    
                    if (matchesA !== matchesB) return matchesB - matchesA; // Descending matches
                    
                    // Secondary Sort: Location
                    if (activeCountry !== 'all') {
                        const aIsLocal = a.country === activeCountry;
                        const bIsLocal = b.country === activeCountry;
                        if (aIsLocal && !bIsLocal) return -1;
                        if (!aIsLocal && bIsLocal) return 1;
                    }
                    return 0;
                });
            }

            // Select top 6 unique recommendations
            let relevantCourses = prioritizedCourses.slice(0, 6).filter(c => c); // Filter out undefined

            // STORE FOR SORTING
            pathwayState.recommendedCourses = relevantCourses;
            pathwayState.techGaps = techGaps;

            // --- COUNTRY SPECIFIC CONTEXT MAP ---
            // Default to 'all' if country not found, or use activeCountry
            const localTip = (typeof countryPathwayContext !== 'undefined' && (countryPathwayContext[activeCountry] || countryPathwayContext['all'])) || { hub: "local hubs" };

            // Determine Theme based on Sector
            let theme = 'indigo';
            if (sector === 'agri') theme = 'green';
            if (sector === 'energy') theme = 'orange';

            // --- PROOF PROMPTS MAP (With Real Examples/Links) ---

            // Generate Proof Prompts List based on Gaps
            let proofHtml = '';
            if (empGaps.length > 0) {
                proofHtml = empGaps.map(gap => {
                    // Try exact match
                    let item = (typeof proofPromptsMap !== 'undefined') ? proofPromptsMap[gap] : null;
                    let linkHtml = '';

                    if (item && item.link && item.link !== '#') {
                        linkHtml = `
                            <a href="${item.link}" target="_blank" class="mt-auto text-[10px] font-bold text-${theme}-600 hover:text-${theme}-800 hover:underline flex items-center gap-1 self-start">
                                ${item.label} <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                            </a>`;
                    } else {
                        // Fallback if no map entry found or no link
                        const text = item ? item.text : `Demonstrate your ${gap.toLowerCase()} in a real-world scenario.`;
                        item = { text: text };
                        linkHtml = `<span class="mt-auto text-[10px] font-bold text-slate-400 cursor-default flex items-center gap-1 self-start">Resource N/A</span>`;
                    }
                    
                    return `
                        <div class="p-3 bg-${theme}-50 border border-${theme}-100 rounded-lg flex flex-col justify-between h-full">
                            <div>
                                <div class="text-[10px] font-bold text-${theme}-800 uppercase mb-1">Gap: ${gap}</div>
                                <div class="text-xs text-slate-700 font-medium mb-2 leading-snug">
                                    <i data-lucide="pen-tool" class="w-3 h-3 inline mr-1 text-${theme}-500"></i> ${item.text}
                                </div>
                            </div>
                            ${linkHtml}
                        </div>
                    `;
                }).join('');
            } else {
                proofHtml = `
                    <div class="p-3 bg-emerald-50 border border-emerald-100 rounded-lg col-span-2">
                        <div class="text-[10px] font-bold text-emerald-800 uppercase mb-1">Great Foundation</div>
                        <div class="text-xs text-slate-700">You have strong employability skills. Focus on maintaining them through mentorship.</div>
                    </div>
                `;
            }

            // --- ROLE SPECIFIC PRACTICE TASKS ---


            // Select specific tasks or fall back to default
            const practiceTasks = (typeof rolePracticeMap !== 'undefined' && rolePracticeMap[roleName]) ? rolePracticeMap[roleName] : ((typeof defaultPracticeTasks !== 'undefined') ? defaultPracticeTasks : []);
            const practiceHtml = practiceTasks.map(t => {
                const isLinkValid = t.link && t.link !== "#";
                const linkAttr = isLinkValid ? `href="${t.link}" target="_blank"` : '';
                const cursorClass = isLinkValid ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default opacity-80';
                const iconHtml = isLinkValid 
                    ? `<i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500"></i>`
                    : `<span class="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">N/A</span>`;

                return `
                <a ${linkAttr} class="p-3 ${cursorClass} transition-colors group flex items-center justify-between">
                    <div class="flex items-start gap-3">
                        <div class="p-2 bg-indigo-50 text-indigo-600 rounded shrink-0"><i data-lucide="${t.icon}" class="w-4 h-4"></i></div>
                        <div>
                            <div class="text-xs font-bold text-indigo-700 mb-0.5">${t.title}</div>
                            <div class="text-xs text-slate-600">${t.desc}</div>
                        </div>
                    </div>
                    ${iconHtml}
                </a>
            `}).join('');

            // --- SECTOR SPECIFIC RESOURCES (New Request) ---
            let sectorResourcesHtml = '';
            let empSectionNum = 3; // Default Employability to 3

            // 1. Start with static data from data.js (if available)
            let resources = (typeof sectorPathwayResources !== 'undefined' && sectorPathwayResources[sector]) ? [...sectorPathwayResources[sector]] : [];

            // 2. Merge with dynamic data from digital_resources.json (via helper)
            if (typeof getSectorCareerResources === 'function') {
                const dynamicResources = getSectorCareerResources(sector);
                if (dynamicResources) {
                    // Add LMI (Market Intel)
                    if (dynamicResources.lmi) {
                        dynamicResources.lmi.slice(0, 2).forEach(r => {
                            if (!resources.some(ex => ex.title === r.name)) {
                                resources.push({ title: r.name, desc: r.desc, link: r.link, icon: 'line-chart' });
                            }
                        });
                    }
                    // Add Communities
                    if (dynamicResources.communities) {
                        dynamicResources.communities.slice(0, 2).forEach(r => {
                            if (!resources.some(ex => ex.title === r.name)) {
                                resources.push({ title: r.name, desc: r.desc, link: r.link, icon: 'users' });
                            }
                        });
                    }
                }
            }

            // Filter for valid links only
            resources = resources.filter(r => r.link && r.link.startsWith('http'));

            // Limit to 6 items for display
            resources = resources.slice(0, 6);

            if (resources.length > 0) {
                const resourceItems = resources.map(r => {
                    const hasLink = r.link && r.link !== '#';
                    const tag = hasLink ? 'a' : 'div';
                    const href = hasLink ? `href="${r.link}" target="_blank"` : '';
                    const cursor = hasLink ? 'hover:shadow-sm cursor-pointer' : 'cursor-default opacity-75';
                    const icon = hasLink ? `<i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-${theme}-500"></i>` : `<span class="text-[9px] text-slate-400 font-bold">N/A</span>`;

                    return `
                    <${tag} ${href} class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-${theme}-300 ${cursor} transition-all group">
                        <div class="p-2 bg-${theme}-50 text-${theme}-600 rounded-lg shrink-0 group-hover:bg-${theme}-100"><i data-lucide="${r.icon}" class="w-4 h-4"></i></div>
                        <div class="flex-1 min-w-0">
                            <div class="text-xs font-bold text-slate-800 group-hover:text-${theme}-700 truncate">${r.title}</div>
                            <div class="text-[10px] text-slate-500 truncate">${r.desc}</div>
                        </div>
                        ${icon}
                    </${tag}>
                `}).join('');

                sectorResourcesHtml = `
                    <div>
                        <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span class="w-5 h-5 rounded-full bg-${theme}-100 text-${theme}-600 flex items-center justify-center text-xs">4</span> 
                            Essential Ecosystem Resources
                        </h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${resourceItems}
                        </div>
                    </div>
                `;
            }

            const headerTitle = `${pathwayFocus} Pathway`;
            const headerDesc = "A recommended learning and experience path for this role.";

            container.innerHTML = `
                <div class="space-y-6 animate-fade-in pb-4">
                    
                    <!-- Header -->
                    <div class="bg-slate-50 border-b border-slate-200 -mx-6 -mt-6 px-6 py-4 mb-2 flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                ${activeCountry !== 'all' ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">Context: ${activeCountry}</span>` : ''}
                            </div>
                            <h3 class="text-lg font-bold text-slate-900">${headerTitle}</h3>
                            <p class="text-xs text-slate-500">${headerDesc}</p>
                        </div>
                    </div>

                    <!-- Step 1: Training & capacity strengthening opportunities -->
                    <div>
                        <div class="flex justify-between items-end mb-3">
                            <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span> 
                                Bridge Knowledge Gaps
                            </h4>
                            <div class="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                                <button onclick="renderPathwayCourseGrid('match')" class="pathway-sort-btn px-2 py-1 text-[10px] font-bold rounded-md transition-colors bg-white text-slate-600 border border-slate-200 shadow-sm" data-sort="match">Best Match</button>
                                <button onclick="renderPathwayCourseGrid('quickest')" class="pathway-sort-btn px-2 py-1 text-[10px] font-bold rounded-md transition-colors text-slate-500 hover:text-slate-700" data-sort="quickest">Quickest</button>
                            </div>
                        </div>
                        <div id="pathway-course-grid" class="grid grid-cols-1 gap-4">
                            <!-- Dynamic Content -->
                        </div>
                    </div>

                    <!-- Step 2: Apply your technical knowledge -->
                    <div>
                         <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span class="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs">2</span> 
                            Apply your technical knowledge (${roleName})
                        </h4>
                        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div class="divide-y divide-slate-100">
                                <a href="https://github.com/" target="_blank" class="p-3 hover:bg-slate-50 transition-colors group flex items-center justify-between">
                                    <div class="flex items-start gap-3">
                                        <div class="p-2 bg-indigo-50 text-indigo-600 rounded shrink-0"><i data-lucide="briefcase" class="w-4 h-4"></i></div>
                                        <div>
                                            <div class="text-xs font-bold text-indigo-700 mb-0.5">Build a Portfolio</div>
                                            <div class="text-xs text-slate-600">Compile "what I did + evidence" on GitHub, Behance, or LinkedIn.</div>
                                        </div>
                                    </div>
                                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500"></i>
                                </a>
                                <a href="https://zindi.africa/" target="_blank" class="p-3 hover:bg-slate-50 transition-colors group flex items-center justify-between">
                                    <div class="flex items-start gap-3">
                                        <div class=" p-2 bg-indigo-50 text-indigo-600 rounded shrink-0"><i data-lucide="code-2" class="w-4 h-4"></i></div>
                                        <div>
                                            <div class="text-xs font-bold text-indigo-700 mb-0.5">Zindi Challenges</div>
                                            <div class="text-xs text-slate-600">Compete in Africa-focused challenges. Build portfolio → Get hired.</div>
                                        </div>
                                    </div>
                                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500"></i>
                                </a>
                                <a href="https://www.freecodecamp.org/" target="_blank" class="p-3 hover:bg-slate-50 transition-colors group flex items-center justify-between">
                                    <div class="flex items-start gap-3">
                                        <div class=" p-2 bg-indigo-50 text-indigo-600 rounded shrink-0"><i data-lucide="terminal" class="w-4 h-4"></i></div>
                                        <div>
                                            <div class="text-xs font-bold text-indigo-700 mb-0.5">freeCodeCamp Projects</div>
                                            <div class="text-xs text-slate-600">Learn basics → Build projects → Earn certification.</div>
                                        </div>
                                    </div>
                                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500"></i>
                                </a>
                                <a href="https://devpost.com/" target="_blank" class="p-3 hover:bg-slate-50 transition-colors group flex items-center justify-between">
                                    <div class="flex items-start gap-3">
                                        <div class=" p-2 bg-indigo-50 text-indigo-600 rounded shrink-0"><i data-lucide="users" class="w-4 h-4"></i></div>
                                        <div>
                                            <div class="text-xs font-bold text-indigo-700 mb-0.5">Team Challenge / Hackathon</div>
                                            <div class="text-xs text-slate-600">Join a 48h hackathon or group assignment. Check <strong>${localTip.hub}</strong> for local events.</div>
                                        </div>
                                    </div>
                                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500"></i>
                                </a>
                                ${practiceHtml}
                            </div>
                        </div>
                    </div>

                    <!-- Step ${empSectionNum}: Enhance your Employability Skills -->
                    <div>
                        <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-3">
                            <span class="w-5 h-5 rounded-full bg-${theme}-100 text-${theme}-600 flex items-center justify-center text-xs">${empSectionNum}</span> 
                            Employability Skills 
                        </h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            ${proofHtml}
                        </div>
                    </div>

                    ${sectorResourcesHtml}

                </div>
            `;
            
            // Render initial grid
            renderPathwayCourseGrid('match');
            
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Render Pathway Course Grid (Sorting) ---
        window.renderPathwayCourseGrid = function(sortType) {
            const container = document.getElementById('pathway-course-grid');
            if (!container || !pathwayState.recommendedCourses) return;

            let courses = [...pathwayState.recommendedCourses];
            const techGaps = pathwayState.techGaps || [];

            // Update active button state
            document.querySelectorAll('.pathway-sort-btn').forEach(btn => {
                if (btn.dataset.sort === sortType) {
                    btn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
                    btn.classList.add('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');
                } else {
                    btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
                    btn.classList.remove('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');
                }
            });

            if (sortType === 'quickest') {
                courses.sort((a, b) => {
                    const durA = parseDuration(a.duration) || 99;
                    const durB = parseDuration(b.duration) || 99;
                    return durA - durB;
                });
            } 

            if (courses.length === 0) {
                container.innerHTML = `<div class="col-span-1 md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center italic">No specific training recommendations found for this profile tier. Please explore the full Training Hub.</div>`;
                return;
            }

            const html = courses.map(t => {
                const matchedGaps = (techGaps && t.skillsCovered) 
                    ? t.skillsCovered.filter(s => techGaps.some(g => s.toLowerCase().trim() === g.toLowerCase().trim())) 
                    : [];
                
                const unevocTag = t.unesco_unevoc ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-100 text-orange-800 border border-orange-200" title="UNESCO-UNEVOC Network Member">UNEVOC</span>` : '';
                const hasLink = t.url && t.url !== '#';
                const tag = hasLink ? 'a' : 'div';
                const href = hasLink ? `href="${t.url}" target="_blank"` : '';
                const cursor = hasLink ? 'hover:shadow-md cursor-pointer' : 'cursor-default opacity-75';
                const icon = hasLink ? `<i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500 transition-colors ml-auto"></i>` : ``;

                // Tracer Data / Stars
                const outcome = t.outcomeData || { stars: 0 };
                let starsHtml = '';
                if (outcome.stars > 0) {
                    const tooltipText = outcome.methodology ? `Rated ${outcome.stars}/5 based on ${outcome.methodology}` : `Outcome Rating: ${outcome.stars}/5`;
                    starsHtml = `<div class="flex items-center gap-0.5 mt-1.5 cursor-help" title="${tooltipText}">`;
                    for(let i=0; i<5; i++) {
                        starsHtml += `<i data-lucide="star" class="w-2.5 h-2.5 ${i < outcome.stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}"></i>`;
                    }
                    starsHtml += `</div>`;
                }

                const isFeatured = t.gsa_member || t.women_focused;

                let durColor = "text-slate-500";
                if (sortType === 'quickest') {
                    const months = parseDuration(t.duration) || 99;
                    if (months < 3) durColor = "text-emerald-600 font-bold";
                    else if (months < 12) durColor = "text-amber-600 font-bold";
                }

                return `
                <${tag} ${href} class="flex flex-col justify-between p-4 bg-blue-50 border border-blue-100 rounded-lg hover:border-blue-300 ${cursor} transition-all group text-left h-full shadow-sm">
                    <div>
                        <div class="flex justify-between items-start mb-1">
                            <div class="text-xs font-bold text-slate-800 leading-tight group-hover:text-blue-700 transition-colors line-clamp-2 pr-1">${t.name}</div>
                            <div class="flex flex-col items-end gap-1 shrink-0">
                                ${matchedGaps.length > 0 ? `<span class="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded shrink-0">Match</span>` : ''}
                                ${isFeatured ? `<span class="text-[9px] font-bold bg-purple-100 text-purple-700 px-1 py-0.5 rounded shrink-0" title="Featured Program">Featured</span>` : ''}
                            </div>
                        </div>
                        <div class="text-[10px] text-slate-600 mb-1.5 line-clamp-1">${t.provider}</div>
                        ${starsHtml}
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-slate-500 border-t border-blue-100 pt-1.5 mt-auto">
                        <span class="${durColor}">${t.duration}</span>
                        <span class="text-blue-300">•</span>
                        <span>${t.mode}</span>
                        ${unevocTag ? `<span>${unevocTag}</span>` : ''}
                        ${icon}
                    </div>
                </${tag}>
                `;
            }).join('');

            container.innerHTML = html;
            if(window.lucide) lucide.createIcons();
        }

        // --- Render PATHWAY Content (Restored & Attached to Window) ---
        window.renderPATHWAYContent = function(preSelectedRole = null, preSelectedGoal = null) {
            const sector = activeSectorId;
            let themeColor = 'indigo';
            
            // REMOVED: Sync dropdown value logic (moved to inline HTML generation)

            // --- DATA DEFINITIONS ---
            const context = (typeof sectorContextMap !== 'undefined') ? (sectorContextMap[sector] || sectorContextMap['digital']) : {};


            const activeData = (typeof diagnosticData !== 'undefined') ? (diagnosticData[sector] || diagnosticData['digital']) : { theme: 'indigo', roles: [] };
            themeColor = activeData.theme;

            // --- DETERMINE CURRENT ROLE FIRST (Moved up to fix scope issue) ---
            // Use DataManager to ensure we pull from the same source as the dashboard (Top 10)
            let sectorOccupations = dataManager.getOccupations(sector);
            if (!sectorOccupations || sectorOccupations.length === 0) {
                sectorOccupations = baseSectorDetailData[sector] ? baseSectorDetailData[sector].occupations : activeData.roles.map(r => ({name: r}));
            }
            
            // Determine selected role (Default to first if none selected)
            let currentRoleName = preSelectedRole;
            if (!currentRoleName && sectorOccupations.length > 0) {
                currentRoleName = sectorOccupations[0].name;
            }

            // --- ROLE SPECIFIC BADGE MAP ---
            // Use specific badge if available, else fallback to sector default
            const badgeInfo = (currentRoleName && typeof roleBadgeMap !== 'undefined' && roleBadgeMap[currentRoleName]) ? roleBadgeMap[currentRoleName] : { title: activeData.badgeTitle, provider: activeData.badgeProvider, standard: activeData.badgeStandard };

            // --- RENDER TABS ---

            // 1. Diagnostic Tab
            const diagContainer = document.getElementById('pp-diagnostic-content');
            if(diagContainer) {
                // Slice to Top 10 to match Dashboard view strictly, but ensure current role is included
                let displayOccs = sectorOccupations.slice(0, 10);
                
                if (currentRoleName && !displayOccs.some(r => r.name === currentRoleName)) {
                    displayOccs = [{name: currentRoleName}, ...displayOccs];
                }

                const roleOptions = displayOccs.map(r => {
                    const isSelected = (r.name === currentRoleName) ? 'selected' : '';
                    return `<option value="${r.name}" ${isSelected}>${r.name}</option>`;
                }).join('');
                
                // --- NEW: Get Skills for Current Role ---
                const sectorDisplayName = sector === 'agri' ? 'Agritech' : sector === 'energy' ? 'Renewable Energy' : 'Digital Economy';
                const roleDetails = getOccupationDetails(currentRoleName, sectorDisplayName);
                
                const techSkills = roleDetails.specificSkills.technical.slice(0, 5);
                const empSkills = roleDetails.specificSkills.employability.slice(0, 5);

                // Qualifications (Global Data)
                const quals = (typeof roleQualifications !== 'undefined' && roleQualifications[currentRoleName]) 
                    ? roleQualifications[currentRoleName] 
                    : { education: "Relevant Degree/Diploma", certification: "Industry Standard Cert", experience: "1-2 Years" };


                // Generate Inputs
                const layerBInputs = techSkills.map((item) => `
                    <div class="mb-4">
                        <div class="flex justify-between mb-1">
                            <label class="text-xs font-medium text-slate-700">${item}</label>
                            <span class="text-[10px] text-slate-400 font-mono" id="val-b-${item.replace(/[^a-zA-Z0-9]/g,'')}">1/5</span>
                        </div>
                        <input type="range" name="layerB" data-skill="${item}" min="1" max="5" value="1" 
                            class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-${themeColor}-600"
                            oninput="document.getElementById('val-b-${item.replace(/[^a-zA-Z0-9]/g,'')}').innerText = this.value + '/5'">
                        <div class="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>No Experience</span><span>Can Teach Others</span></div>
                    </div>
                `).join('');

                const layerAInputs = empSkills.map((item) => `
                    <div class="mb-4">
                        <div class="flex justify-between mb-1">
                            <label class="text-xs font-medium text-slate-700">${item}</label>
                            <span class="text-[10px] text-slate-400 font-mono" id="val-a-${item.replace(/[^a-zA-Z0-9]/g,'')}">1/5</span>
                        </div>
                        <input name="layerA" data-skill="${item}" type="range" min="1" max="5" value="1" 
                            class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-${themeColor}-600"
                            oninput="document.getElementById('val-a-${item.replace(/[^a-zA-Z0-9]/g,'')}').innerText = this.value + '/5'">
                        <div class="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>Beginner</span><span>Expert</span></div>
                    </div>
                `).join('');

                diagContainer.innerHTML = `
                    <div id="diagnostic-inputs" class="bg-white p-5 rounded-xl border border-slate-200 space-y-6 shadow-sm">
                        
                        <!-- 1. ROLE SELECTOR -->
                        <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div class="mb-4">
                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Role</label>
                                <select id="pp-role-selector" onchange="renderPATHWAYContent(this.value)" class="w-full text-sm font-bold text-slate-700 border-slate-300 rounded-lg shadow-sm focus:border-${themeColor}-500 focus:ring-${themeColor}-500 p-2.5">
                                    ${roleOptions}
                                </select>
                            </div>
                        </div>

                        <!-- 2. THE GATEKEEPER (Qualifications) -->
                        <div>
                            <h3 class="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                                <span class="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">1</span> 
                                Minimum Qualifications Check
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label class="p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-${themeColor}-400 transition-all bg-white group relative">
                                    <input type="checkbox" name="qual_check" value="edu" class="peer sr-only">
                                    <div class="absolute top-3 right-3 w-4 h-4 border-2 border-slate-300 rounded-full peer-checked:bg-${themeColor}-500 peer-checked:border-${themeColor}-500 transition-colors"></div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Education</div>
                                    <div class="text-xs text-slate-700 font-medium pr-4">${quals.education}</div>
                                </label>
                                <label class="p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-${themeColor}-400 transition-all bg-white group relative">
                                    <input type="checkbox" name="qual_check" value="cert" class="peer sr-only">
                                    <div class="absolute top-3 right-3 w-4 h-4 border-2 border-slate-300 rounded-full peer-checked:bg-${themeColor}-500 peer-checked:border-${themeColor}-500 transition-colors"></div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Certification</div>
                                    <div class="text-xs text-slate-700 font-medium pr-4">${quals.certification}</div>
                                </label>
                                <label class="p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-${themeColor}-400 transition-all bg-white group relative">
                                    <input type="checkbox" name="qual_check" value="exp" class="peer sr-only">
                                    <div class="absolute top-3 right-3 w-4 h-4 border-2 border-slate-300 rounded-full peer-checked:bg-${themeColor}-500 peer-checked:border-${themeColor}-500 transition-colors"></div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Experience</div>
                                    <div class="text-xs text-slate-700 font-medium pr-4">${quals.experience}</div>
                                </label>
                            </div>
                        </div>

                        <!-- 3. SKILLS SCAN -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">2</span> 
                                    Technical Skills
                                </h3>
                                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    ${layerBInputs}
                                </div>
                            </div>
                            <div>
                                <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</span> 
                                    Employability Skills
                                </h3>
                                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    ${layerAInputs}
                                </div>
                            </div>
                        </div>

                        <!-- 4. EVIDENCE -->
                        <div>
                            <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">4</span> 
                                Portfolio Evidence
                            </h3>
                            <div class="bg-white border border-slate-200 rounded-xl p-4">
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Degree / Diploma</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Certificates</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Project Portfolio</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Work History</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">References</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Internships</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Volunteering</span></label>
                                    <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="profile_evidence" class="rounded text-${themeColor}-600 focus:ring-${themeColor}-500 border-slate-300"><span class="text-xs text-slate-700">Hackathons</span></label>
                                </div>
                            </div>
                        </div>

                        <button onclick="calculateDiagnosticResults()" class="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 text-sm">
                            Generate Readiness Report <i data-lucide="sparkles" class="w-4 h-4 text-yellow-400"></i>
                        </button>
                    </div>

                    <!-- RESULTS CONTAINER (Empty initially) -->
                    <div id="diagnostic-results"></div>
                `;
            }

            // Practice Tab
            const pracContainer = document.getElementById('pp-practice-content');
            if(pracContainer) {
                initPathwayWizard(preSelectedGoal);
            }

            // Badges Tab
            const badgeContainer = document.getElementById('pp-badges-content');
            if(badgeContainer) {
                badgeContainer.innerHTML = `
                    <div class="space-y-6">
                        <!-- SECTION 1: Earned Badges -->
                        <div>
                            <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <i data-lucide="award" class="w-4 h-4 text-emerald-600"></i> Earned Credentials
                            </h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div class="p-4 bg-gradient-to-br from-${themeColor}-500 to-${themeColor}-700 rounded-xl text-white relative overflow-hidden shadow-md group">
                                    <i data-lucide="award" class="w-16 h-16 absolute -bottom-4 -right-4 text-white/20"></i>
                                    <div class="relative z-10">
                                        <div class="flex justify-between items-start mb-1">
                                            <div class="text-[10px] uppercase font-bold text-${themeColor}-100">Micro-Credential</div>
                                            <div class="text-[9px] bg-white/20 px-1.5 py-0.5 rounded text-white font-medium">${activeData.badgeProvider}</div>
                                            <div class="text-[9px] bg-white/20 px-1.5 py-0.5 rounded text-white font-medium">${badgeInfo.provider}</div>
                                        </div>
                                        <h3 class="font-bold text-lg leading-tight mb-1">${activeData.badgeTitle}</h3>
                                        <div class="text-[10px] text-${themeColor}-100 italic mb-3 opacity-90">${activeData.badgeStandard}</div>
                                        <h3 class="font-bold text-lg leading-tight mb-1">${badgeInfo.title}</h3>
                                        <div class="text-[10px] text-${themeColor}-100 italic mb-3 opacity-90">${badgeInfo.standard}</div>
                                        
                                        <div class="flex items-center gap-2 mt-2">
                                            <div class="inline-flex items-center gap-1 bg-white/20 px-2 py-1 rounded text-[10px]">
                                                <i data-lucide="check-circle" class="w-3 h-3"></i> Verified
                                                <i data-lucide="check-circle" class="w-3 h-3"></i> Recommended
                                            </div>
                                            <button onclick="viewCertificate('${badgeInfo.title}')" class="text-[10px] font-bold bg-white text-${themeColor}-700 px-2 py-1 rounded hover:bg-${themeColor}-50 transition-colors flex items-center gap-1">
                                                View Cert <i data-lucide="file-text" class="w-3 h-3"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="p-4 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 flex-col gap-2">
                                    <i data-lucide="lock" class="w-6 h-6"></i>
                                    <span class="text-xs font-medium">Complete Next Diagnostic</span>
                                </div>
                            </div>
                        </div>
                `;
            }
            
            if(window.lucide) lucide.createIcons();
        }

        // --- PATHWAY BUILDER WIZARD ---
        window.initPathwayWizard = function(preSelectedGoal = null) {
            pathwayState = { goal: preSelectedGoal, constraints: {}, interest: null };
            if (preSelectedGoal) {
                renderPathwayStep3();
            } else {
                renderPathwayStep1();
            }
        }

        function _renderSectorOption(id, name, icon) {
            const isActive = activeSectorId === id;
            const theme = (typeof sectorThemes !== 'undefined') ? sectorThemes[id] : { color: 'indigo' };
            const color = theme.color;
            const activeClass = isActive ? `ring-2 ring-${color}-500 bg-${color}-50 border-${color}-200` : `bg-white border-slate-200 hover:border-${color}-300`;
            const iconColor = isActive ? `text-${color}-600` : 'text-slate-400';
            
            return `
                <button onclick="updatePathwaySector('${id}')" class="flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${activeClass} shadow-sm">
                    <i data-lucide="${icon}" class="w-6 h-6 mb-2 ${iconColor}"></i>
                    <span class="text-xs font-bold text-slate-700">${name}</span>
                </button>
            `;
        }

        window.updatePathwaySector = function(sector) {
            setGlobalSector(sector); 
            renderPathwayStep1();
        }

        window.renderPathwayStep1 = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;
            
            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-6 animate-fade-in">
                    <div class="text-center mb-8">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 mb-4">
                            <span class="font-bold text-lg">1</span>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Let's build your pathway</h2>
                        <p class="text-slate-500 max-w-md mx-auto">Create a step-by-step roadmap tailored to your career goals. Start by selecting your location and target sector.</p>
                    </div>

                    <!-- NEW: Country Selection -->
                    <div class="mb-8">
                        <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 text-center">1. Choose Location</h3>
                        <div class="max-w-md mx-auto">
                            <select onchange="setGlobalCountry(this.value); renderPathwayStep1();" class="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm bg-white">
                                <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>Regional (East Africa)</option>
                                <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                                <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                                <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                                <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                                <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                                <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                                <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DR Congo</option>
                                <option value="Somalia" ${activeCountry === 'Somalia' ? 'selected' : ''}>Somalia</option>
                            </select>
                        </div>
                    </div>

                    <div class="mb-10">
                        <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 text-center">2. Choose Sector</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            ${_renderSectorOption('agri', 'Agritech', 'leaf')}
                            ${_renderSectorOption('energy', 'Renewable Energy', 'sun')}
                            ${_renderSectorOption('digital', 'Digital Economy', 'cpu')}
                        </div>
                    </div>
                    
                    <div class="text-center">
                        <button onclick="renderPathwayQuiz()" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2 mx-auto">
                            Next Step <i data-lucide="arrow-right" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        function _renderGoalCard(title, desc, icon) {
            return `
            <button onclick="selectPathwayGoal('${title}')" class="p-6 bg-white border border-slate-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all text-left group relative overflow-hidden w-full">
                <div class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <i data-lucide="${icon}" class="w-24 h-24"></i>
                </div>
                <div class="relative z-10">
                    <div class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <i data-lucide="${icon}" class="w-5 h-5"></i>
                    </div>
                    <h3 class="font-bold text-lg text-slate-800 mb-1">${title}</h3>
                    <p class="text-xs text-slate-500">${desc}</p>
                </div>
            </button>
            `;
        }

        window.selectPathwayGoal = function(goal) {
            pathwayState.goal = goal;
            renderPathwayStep3(); // Go directly to results
        }

        window.renderPathwayStep2 = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-6 animate-fade-in">
                    <div class="mb-6">
                        <button onclick="renderPathwayStep1()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                    </div>
                    <div class="text-center mb-8">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 mb-4">
                            <span class="font-bold text-lg">${pathwayState.interest ? '3' : '2'}</span>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Set your constraints</h2>
                        <p class="text-slate-500">Help us find the right fit for your schedule and budget.</p>
                    </div>
                    
                    <div class="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        ${(typeof pathwayConstraints !== 'undefined' ? pathwayConstraints : []).map(c => `
                            <div>
                                <label class="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><i data-lucide="${c.icon}" class="w-4 h-4 text-slate-400"></i> ${c.label}</label>
                                <div class="flex flex-wrap gap-3">
                                    ${c.options.map(opt => _renderConstraintOption(c.id, opt)).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="mt-8 text-center">
                        <button onclick="renderPathwayStep3()" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2 mx-auto">
                            Generate My Pathway <i data-lucide="wand-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        function _renderConstraintOption(category, value) {
            const isChecked = pathwayState.constraints[category] === value ? 'checked' : '';
            return `
                <label class="cursor-pointer">
                    <input type="radio" name="${category}" value="${value}" class="peer sr-only" onchange="updateConstraint('${category}', '${value}')" ${isChecked}>
                    <div class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-checked:border-indigo-500 peer-checked:ring-1 peer-checked:ring-indigo-500 transition-all hover:bg-slate-50">
                        ${value}
                    </div>
                </label>
            `;
        }

        window.updateConstraint = function(cat, val) {
            pathwayState.constraints[cat] = val;
        }

        // --- NEW: Pathway Quiz Selection (Fork) ---
        window.renderPathwayQuiz = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-6 animate-fade-in">
                    <div class="mb-6">
                        <button onclick="renderPathwayStep1()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                    </div>
                    <div class="text-center mb-10">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 text-purple-600 mb-4">
                            <span class="font-bold text-lg">2</span>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Discover your fit</h2>
                        <p class="text-slate-500">Choose how you want to explore career options.</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Option 1: Quick Match -->
                        <button onclick="renderQuickMatch()" class="flex flex-col text-left p-6 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all group h-full">
                            <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <i data-lucide="zap" class="w-6 h-6"></i>
                            </div>
                            <h3 class="font-bold text-lg text-slate-800 mb-2">Quick Interest Match</h3>
                            <p class="text-sm text-slate-500 mb-4 flex-1">Select from 3 broad interest areas specific to your chosen sector. Best for quick exploration.</p>
                            <div class="text-xs font-bold text-indigo-600 flex items-center gap-1">
                                Take Quiz (1 min) <i data-lucide="arrow-right" class="w-3 h-3"></i>
                            </div>
                        </button>

                        <!-- Option 2: Deep Dive -->
                        <button onclick="renderDeepDiveAssessment()" class="flex flex-col text-left p-6 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:shadow-md transition-all group h-full relative overflow-hidden">
                            <div class="absolute top-0 right-0 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-bl-lg">RECOMMENDED</div>
                            <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                <i data-lucide="compass" class="w-6 h-6"></i>
                            </div>
                            <h3 class="font-bold text-lg text-slate-800 mb-2">Career Personality Profile</h3>
                            <p class="text-sm text-slate-500 mb-4 flex-1">A deeper assessment based on RIASEC and Work Values to find your ideal role match.</p>
                            <div class="text-xs font-bold text-purple-600 flex items-center gap-1">
                                Start Assessment (3 mins) <i data-lucide="arrow-right" class="w-3 h-3"></i>
                            </div>
                        </button>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- RENAMED: Original Quiz Logic ---
        window.renderQuickMatch = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            const sector = activeSectorId;
            const options = (typeof pathwayQuizOptions !== 'undefined') ? (pathwayQuizOptions[sector] || pathwayQuizOptions['digital']) : [];

            // Get role descriptions
            const activeRoles = (typeof sectorRoles !== 'undefined') ? (sectorRoles[activeSectorId] || sectorRoles['agri']) : { tech: "N/A", biz: "N/A", venture: "N/A" };
            
            // Map interest IDs to role description keys
            const interestToRoleKeyMap = {
                agri: { tech: 'tech', field: 'biz', biz: 'venture' },
                energy: { 'hands-on': 'tech', design: 'biz', mgmt: 'venture' },
                digital: { code: 'tech', data: 'biz', creative: 'venture' }
            };
            const roleKeyMap = interestToRoleKeyMap[sector] || interestToRoleKeyMap['digital'];

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-4 animate-fade-in">
                    <div class="mb-4">
                        <button onclick="renderPathwayQuiz()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                    </div>
                    <div class="text-center mb-6">
                        <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-600 mb-3">
                            <span class="font-bold text-base">2</span>
                        </div>
                        <h2 class="text-xl font-bold text-slate-900 mb-1">What sounds most like you?</h2>
                        <p class="text-sm text-slate-500">Select the area that matches your interests.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        ${options.map(opt => {
                            const roleKey = roleKeyMap[opt.id];
                            const roleText = activeRoles[roleKey] || "Role examples unavailable.";
                            return `
                            <button onclick="selectPathwayInterest('${opt.id}')" class="flex flex-col items-center text-center p-4 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:shadow-md transition-all group h-full">
                                <div>
                                    <div class="w-12 h-12 bg-slate-50 text-slate-600 rounded-full flex items-center justify-center mb-3 group-hover:bg-purple-50 group-hover:text-purple-600 transition-colors">
                                        <i data-lucide="${opt.icon}" class="w-6 h-6"></i>
                                    </div>
                                    <h3 class="font-bold text-base text-slate-800 mb-1">${opt.title}</h3>
                                    <p class="text-xs text-slate-500 leading-relaxed mb-3">${opt.desc}</p>
                                </div>
                                <div class="mt-auto pt-2 border-t border-slate-200 group-hover:border-purple-100 w-full">
                                    <div class="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Example Roles</div>
                                    <p class="text-[10px] text-slate-500 leading-snug">${roleText}</p>
                                </div>
                            </button>
                        `}).join('')}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Deep Dive Assessment Logic ---
        window.renderDeepDiveAssessment = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            // Load questions from app_data.json (via window.assessmentConfig)
            const config = window.assessmentConfig || { riasec: [] };
            const questions = config.riasec || [];

            const questionsHtml = questions.map((q, idx) => `
                <div class="bg-white p-4 rounded-xl border border-slate-200 mb-3">
                    <p class="text-sm font-bold text-slate-800 mb-3">${idx + 1}. ${q.question}</p>
                    <div class="flex gap-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="riasec_${q.code}" value="1" class="text-indigo-600 focus:ring-indigo-500">
                            <span class="text-xs text-slate-600">Disagree</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="riasec_${q.code}" value="2" class="text-indigo-600 focus:ring-indigo-500">
                            <span class="text-xs text-slate-600">Neutral</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="riasec_${q.code}" value="3" class="text-indigo-600 focus:ring-indigo-500">
                            <span class="text-xs text-slate-600">Agree</span>
                        </label>
                    </div>
                </div>
            `).join('');

            container.innerHTML = `
                <div class="max-w-2xl mx-auto py-4 animate-fade-in">
                    <div class="mb-4">
                        <button onclick="renderPathwayQuiz()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                    </div>
                    <div class="text-center mb-6">
                        <h2 class="text-xl font-bold text-slate-900">Career Personality Assessment</h2>
                        <p class="text-sm text-slate-500">Rate how much you agree with the following statements.</p>
                    </div>
                    <form id="riasec-form">
                        ${questionsHtml}
                    </form>
                    <div class="mt-6 text-center">
                        <button onclick="calculateDeepDive()" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2 mx-auto">
                            Analyze Profile <i data-lucide="bar-chart-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.calculateDeepDive = function() {
            // 1. Tally Scores
            const scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
            const form = document.getElementById('riasec-form');
            if(!form) return;

            const formData = new FormData(form);
            for (let [key, value] of formData.entries()) {
                const code = key.split('_')[1];
                if (scores[code] !== undefined) scores[code] += parseInt(value);
            }

            // 2. Find Dominant Trait
            let maxScore = -1;
            let dominantTrait = 'R'; // Default
            
            Object.entries(scores).forEach(([trait, score]) => {
                if (score > maxScore) {
                    maxScore = score;
                    dominantTrait = trait;
                }
            });

            // 3. Map Trait to Pathway Interest (to keep compatibility with Step 3)
            // Mapping Logic:
            // R (Realistic) -> Tech/Hands-on
            // I (Investigative) -> Data/Design
            // A (Artistic) -> Creative/Design
            // S (Social) -> Biz/Mgmt
            // E (Enterprising) -> Biz/Venture
            // C (Conventional) -> Data/Mgmt

            const sector = activeSectorId;
            let mappedInterest = 'tech'; // fallback

            if (sector === 'agri') {
                if (['R'].includes(dominantTrait)) mappedInterest = 'field';
                else if (['I', 'C'].includes(dominantTrait)) mappedInterest = 'tech';
                else mappedInterest = 'biz';
            } else if (sector === 'energy') {
                if (['R'].includes(dominantTrait)) mappedInterest = 'hands-on';
                else if (['I', 'C'].includes(dominantTrait)) mappedInterest = 'design';
                else mappedInterest = 'mgmt';
            } else { // Digital
                if (['R', 'I'].includes(dominantTrait)) mappedInterest = 'code';
                else if (['C'].includes(dominantTrait)) mappedInterest = 'data';
                else mappedInterest = 'creative';
            }

            // 4. Save & Proceed
            pathwayState.interest = mappedInterest;
            pathwayState.profile = { trait: dominantTrait, scores: scores }; // Save for advanced display
            
            // Optional: Show a "Profile Result" modal or interstitial here, but for now we jump to Goal
            renderPathwayGoal();
        }

        window.selectPathwayInterest = function(interest) {
            pathwayState.interest = interest;
            renderPathwayGoal();
        }

        // --- NEW: Step 3 (Goal) ---
        window.renderPathwayGoal = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            // Fallback if pathwayGoals is missing
            const goals = (typeof pathwayGoals !== 'undefined' && Array.isArray(pathwayGoals)) ? pathwayGoals : [
                { "title": "Entry Level Job", "desc": "I want to find my first job or internship.", "icon": "briefcase" },
                { "title": "Apprenticeship", "desc": "I want to learn on the job with a mentor.", "icon": "users" },
                { "title": "Upskill", "desc": "I want to strengthen my current skills.", "icon": "trending-up" },
                { "title": "Venture", "desc": "I want to start my own business.", "icon": "rocket" },
                { "title": "Change Careers", "desc": "I want to pivot to a new sector.", "icon": "refresh-cw" }
            ];

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-6 animate-fade-in">
                    <div class="mb-6">
                        <button onclick="renderQuickMatch()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                    </div>
                    <div class="text-center mb-8">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-4">
                            <span class="font-bold text-lg">3</span>
                        </div>
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">What is your primary goal?</h2>
                        <p class="text-slate-500">This helps us tailor the next steps for you.</p>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${goals.filter(g => g.title !== 'Venture').map(g => _renderGoalCard(g.title, g.desc, g.icon)).join('')}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.renderPathwayStep3 = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            const goal = pathwayState.goal || "Strengthen my current skills";
            const sector = activeSectorId;
            const themeConfig = (typeof sectorThemes !== 'undefined') ? sectorThemes[sector] : { color: 'indigo' };
            const theme = themeConfig.color;
            
            // --- SECTION A: SKILLS FOCUS ---
            const sectorDetails = (typeof baseSectorDetailData !== 'undefined') ? baseSectorDetailData[sector] : { skills: [] };
            const allSkills = sectorDetails ? sectorDetails.skills : [];
            let targetSkills = [];

            // Goal-based Skill Selection
            if (['Strengthen my current skills', 'Upskill'].includes(goal)) {
                targetSkills = allSkills.filter(s => s.isHot).slice(0, 5); // Hot/Advanced skills
            } else {
                targetSkills = allSkills.slice(0, 4); // Foundational
            }

            // Interest-based refinement
            if (pathwayState.interest) {
                 const interestMap = {
                    'tech': ['Python', 'IoT', 'Solar', 'Design', 'Coding', 'Technical', 'Digital', 'Technology'],
                    'code': ['Python', 'Java', 'React', 'API', 'Code', 'Software', 'Web', 'Development'],
                    'design': ['Design', 'UX', 'CAD', 'Drawing', 'Planning', 'Product', 'Creative'],
                    'hands-on': ['Installation', 'Wiring', 'Maintenance', 'Repair', 'Field', 'Technician', 'Practical'],
                    'field': ['Soil', 'Crop', 'Drone', 'Scouting', 'Farm', 'Agriculture', 'Field'],
                    'biz': ['Sales', 'Management', 'Logistics', 'Finance', 'Business', 'Supply Chain', 'Entrepreneurship'],
                    'mgmt': ['Management', 'Audit', 'Policy', 'Planning', 'Project', 'Leadership'],
                    'data': ['Data', 'Analysis', 'Excel', 'Statistics', 'Logic', 'Science', 'Analytics'],
                    'creative': ['Design', 'Marketing', 'Content', 'Strategy', 'UI', 'Creative']
                };
                const keywords = interestMap[pathwayState.interest] || [];
                if (keywords.length > 0) {
                    const interestedSkills = allSkills.filter(s => keywords.some(k => s.name.includes(k) || (s.desc && s.desc.includes(k))));
                    if (interestedSkills.length > 0) targetSkills = interestedSkills.slice(0, 5);
                }
            }

            // --- NEW: Inject Profile Badge if Deep Dive was used ---
            let profileHtml = '';
            if (pathwayState.profile) {
                const traitLabels = { R: "Realistic (Doer)", I: "Investigative (Thinker)", A: "Artistic (Creator)", S: "Social (Helper)", E: "Enterprising (Persuader)", C: "Conventional (Organizer)" };
                const label = traitLabels[pathwayState.profile.trait];
                
                profileHtml = `
                    <div class="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6 flex items-start gap-3">
                        <div class="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0"><i data-lucide="user-check" class="w-5 h-5"></i></div>
                        <div>
                            <h3 class="font-bold text-purple-900 text-sm">Personality Match: ${label}</h3>
                            <p class="text-xs text-purple-700 mt-1">Your assessment indicates you thrive in roles that involve <strong>${pathwayState.interest}</strong>. We've tailored the skills below to match this profile.</p>
                        </div>
                    </div>
                `;
            }

            const skillsHtml = targetSkills.map(s => `
                <button onclick="openSkillModal('${s.name.replace(/'/g, "\\'")}')" class="w-full text-left flex items-start gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 hover:border-${theme}-300 hover:shadow-sm transition-all group">
                    <i data-lucide="check-circle" class="w-4 h-4 text-${theme}-500 mt-0.5 shrink-0 group-hover:text-${theme}-600"></i>
                    <div>
                        <span class="font-bold group-hover:text-${theme}-700 transition-colors">${s.name}</span>
                        ${s.isHot ? '<span title="High Demand" class="text-[10px] ml-1 bg-rose-100 text-rose-700 px-1 rounded">HOT</span>' : ''}
                        <div class="text-[10px] text-slate-500 leading-tight mt-0.5">${s.desc}</div>
                    </div>
                </button>
            `).join('');

            // --- SECTION B: ACTIONABLE NEXT STEP (The "Mission") ---
            let blockBTitle = "";
            let blockBContent = "";
            let blockBAction = "";
            let blockBOnclick = "";

            if (goal === 'Apprenticeship') {
                blockBTitle = "Apprenticeship Starter Kit";
                blockBAction = "";
                blockBOnclick = "";

                // --- NEW: Apprenticeship Framework Data ---
                let framework = {
                    duration: "6 - 12 Months",
                    objective: "Gain practical, on-the-job experience.",
                    role: "Assist senior staff, maintain logbooks, follow safety protocols.",
                    employer: "Provide supervision, tools, and certify completed hours."
                };

                if (sector === 'digital') {
                    framework = {
                        duration: "3 - 6 Months (Project-based)",
                        objective: "Build a portfolio of real-world code/design.",
                        role: "Bug fixing, testing, documentation, junior dev tasks.",
                        employer: "Code reviews, mentorship, access to dev environment."
                    };
                } else if (sector === 'energy') {
                    framework = {
                        duration: "1 - 2 Years (Licensing Track)",
                        objective: "Log required hours for national accreditation (e.g., EPRA).",
                        role: "Installation support, wiring (supervised), strict HSE adherence.",
                        employer: "Licensed supervision, safety gear (PPE), insurance."
                    };
                } else if (sector === 'agri') {
                    framework = {
                        duration: "3 - 6 Months (Seasonal)",
                        objective: "Master crop cycles and farm management systems.",
                        role: "Field scouting, data collection, equipment maintenance.",
                        employer: "Technical guidance, safety training, transport/stipend."
                    };
                }

                // Standards Links
                const standards = [
                    { c: 'Kenya', name: 'NITA Guidelines', url: 'https://www.nita.go.ke/' },
                    { c: 'Tanzania', name: 'VETA Apprenticeship', url: 'https://www.veta.go.tz/' },
                    { c: 'Uganda', name: 'DIT Standards', url: 'https://dituganda.org/' },
                    { c: 'Rwanda', name: 'RTB Workplace Learning', url: 'https://www.rtb.gov.rw/' }
                ];
                
                let localStandards = standards.filter(s => s.c === activeCountry);
                if (localStandards.length === 0) localStandards = standards; // Show all if regional or no match
                
                let appResources = [];
                let mentorResources = [];

                if (sector === 'agri') {
                    appResources = [
                        { title: "NITA Industrial Attachment", desc: "Placement portal for technical trades.", icon: "briefcase", link: "https://www.nita.go.ke/" },
                        { title: "TVET Authority", desc: "Competency Based Education & Training.", icon: "book-open", link: "https://tveta.go.ke/" }
                    ];
                    mentorResources = [
                        { title: "AWAK (Women in Ag)", desc: "Mentorship for women in agribusiness.", link: "https://awak.co.ke/" },
                        { title: "GoGettaz", desc: "Agripreneurship community & support.", link: "https://gogettaz.africa/" }
                    ];
                } else if (sector === 'energy') {
                    appResources = [
                        { title: "EPRA Licensing Guide", desc: "Steps for solar/electrician licensing.", icon: "shield", link: "https://www.epra.go.ke/" },
                        { title: "Women in Renewable Energy", desc: "Mentorship & apprenticeship links.", icon: "users", link: "https://wire-africa.org/" }
                    ];
                    mentorResources = [
                        { title: "GWNET", desc: "Global Women's Network for Energy Transition.", link: "https://www.globalwomennet.org/" },
                        { title: "Shortlist", desc: "Clean energy talent & career guidance.", link: "https://www.shortlist.net/" }
                    ];
                } else {
                    appResources = [
                        { title: "Ajira Digital", desc: "Govt program linking youth to digital work.", icon: "monitor", link: "https://ajiradigital.go.ke/" },
                        { title: "Andela Learning", desc: "Peer learning & potential tracks.", icon: "code", link: "https://andela.com/" }
                    ];
                    mentorResources = [
                        { title: "ADPList", desc: "Global mentorship for designers & devs.", link: "https://adplist.org/" },
                        { title: "She Code Africa", desc: "Mentorship & community for women in tech.", link: "https://shecodeafrica.org/" }
                    ];
                }

                // Add Standards to Resources
                localStandards.forEach(s => {
                    appResources.push({ title: s.name, desc: "National Guidelines", icon: "book", link: s.url });
                });

                // Add National Mentorships
                const nationalMentorships = {
                    'Kenya': [{ title: "KamiLimu", desc: "Structured mentorship for CS students.", link: "https://kamilimu.org/" }],
                    'Rwanda': [{ title: "Girls in ICT Rwanda", desc: "Mentorship and networking.", link: "https://girlsinict.rw/" }],
                    'Uganda': [{ title: "Women in Technology Uganda", desc: "Networking and mentorship.", link: "https://witug.org/" }],
                    'Tanzania': [{ title: "Apps and Girls", desc: "Coding and mentorship for girls.", link: "https://appsandgirls.com/" }]
                };

                if (nationalMentorships[activeCountry]) {
                    nationalMentorships[activeCountry].forEach(m => mentorResources.push(m));
                }

                const appHtml = appResources.map(r => `
                    <a href="${r.link}" target="_blank" class="flex items-center gap-3 p-2 border border-slate-100 rounded-lg hover:bg-slate-50 group transition-colors bg-white">
                        <div class="p-1.5 bg-blue-100 text-blue-600 rounded shrink-0"><i data-lucide="${r.icon}" class="w-3 h-3"></i></div>
                        <div class="flex-1 min-w-0">
                            <div class="text-xs font-bold text-slate-700 group-hover:text-blue-700 truncate">${r.title}</div>
                            <div class="text-[10px] text-slate-500 truncate">${r.desc}</div>
                        </div>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-blue-500"></i>
                    </a>
                `).join('');

                const mentorHtml = mentorResources.map(r => `
                    <a href="${r.link}" target="_blank" class="flex items-center gap-3 p-2 border border-slate-100 rounded-lg hover:bg-slate-50 group transition-colors bg-white">
                        <div class="p-1.5 bg-purple-100 text-purple-600 rounded shrink-0"><i data-lucide="users" class="w-3 h-3"></i></div>
                        <div class="flex-1 min-w-0">
                            <div class="text-xs font-bold text-slate-700 group-hover:text-purple-700 truncate">${r.title}</div>
                            <div class="text-[10px] text-slate-500 truncate">${r.desc}</div>
                        </div>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-purple-500"></i>
                    </a>
                `).join('');

                blockBContent = `
                    <div class="space-y-4">
                        <!-- Framework Info -->
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                            <div class="flex justify-between items-start mb-2">
                                <h4 class="font-bold text-slate-700 uppercase flex items-center gap-2"><i data-lucide="info" class="w-3 h-3"></i> Typical Framework</h4>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-slate-600">
                                <div><span class="font-bold text-slate-800">Duration:</span> ${framework.duration}</div>
                                <div><span class="font-bold text-slate-800">Objective:</span> ${framework.objective}</div>
                                <div><span class="font-bold text-slate-800">Apprentice Role:</span> ${framework.role}</div>
                                <div><span class="font-bold text-slate-800">Employer Role:</span> ${framework.employer}</div>
                            </div>
                        </div>

                        <!-- Soft Skills -->
                        <div class="bg-amber-50 border border-amber-100 rounded-lg p-3">
                            <h4 class="text-xs font-bold text-amber-800 uppercase mb-2 flex items-center gap-2"><i data-lucide="star" class="w-3 h-3"></i> Critical Soft Skills for Retention</h4>
                            <div class="grid grid-cols-2 gap-2 text-[10px] text-amber-900">
                                <div class="flex items-center gap-1.5"><i data-lucide="clock" class="w-3 h-3 text-amber-600"></i> Punctuality & Reliability</div>
                                <div class="flex items-center gap-1.5"><i data-lucide="message-circle" class="w-3 h-3 text-amber-600"></i> Proactive Communication</div>
                                <div class="flex items-center gap-1.5"><i data-lucide="book-open" class="w-3 h-3 text-amber-600"></i> Willingness to Learn</div>
                                <div class="flex items-center gap-1.5"><i data-lucide="shield" class="w-3 h-3 text-amber-600"></i> Professional Attitude</div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="space-y-2">
                                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Preparation</div>
                                <div class="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                    <div class="flex items-center gap-2 mb-1">
                                        <i data-lucide="file-check" class="w-4 h-4 text-blue-600"></i>
                                        <span class="text-xs font-bold text-blue-800">Logbook & Portfolio</span>
                                    </div>
                                    <p class="text-[10px] text-blue-700 leading-snug">Employers want proof of ability. Document every project.</p>
                                </div>
                                <button onclick="closeModal('unified-hub-modal'); document.getElementById('career-hub-drawer').classList.remove('translate-x-full'); showCVResources();" class="w-full flex items-center gap-3 p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 group transition-colors text-left">
                                    <div class="p-1.5 bg-slate-100 text-slate-600 rounded shrink-0"><i data-lucide="file-text" class="w-3 h-3"></i></div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-xs font-bold text-slate-700 group-hover:text-blue-700">Download Templates</div>
                                        <div class="text-[10px] text-slate-500">Logbooks & CVs</div>
                                    </div>
                                </button>
                            </div>
                            <div class="space-y-2">
                                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">National Guidelines</div>
                                ${appHtml}
                            </div>
                            <div class="col-span-1 sm:col-span-2 pt-2 border-t border-slate-100">
                                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Mentorship Programs</div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    ${mentorHtml}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (['Entry Level Job', 'Internship'].includes(goal)) {
                blockBTitle = "Job Seeker Toolkit";
                blockBAction = "Launch Job Readiness Scorecard";
                blockBOnclick = "renderReadinessScorecard()";

                blockBContent = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <button onclick="closeModal('unified-hub-modal'); document.getElementById('career-hub-drawer').classList.remove('translate-x-full'); showCVResources();" class="flex flex-row items-center text-left p-3 border border-slate-200 rounded-lg hover:border-purple-300 bg-white group transition-all h-full w-full gap-3">
                                <div class="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0"><i data-lucide="file-text" class="w-5 h-5"></i></div>
                                <div>
                                    <div class="font-bold text-xs text-slate-800 group-hover:text-purple-700">CV Templates</div>
                                    <div class="text-[10px] text-slate-500">ATS-friendly formats</div>
                                </div>
                            </button>
                            <button onclick="closeModal('unified-hub-modal'); document.getElementById('career-hub-drawer').classList.remove('translate-x-full'); showInterviewPrep();" class="flex flex-row items-center text-left p-3 border border-slate-200 rounded-lg hover:border-emerald-300 bg-white group transition-all h-full w-full gap-3">
                                <div class="p-2 bg-emerald-100 text-emerald-600 rounded-lg shrink-0"><i data-lucide="mic" class="w-5 h-5"></i></div>
                                <div>
                                    <div class="font-bold text-xs text-slate-800 group-hover:text-emerald-700">Interview Coach</div>
                                    <div class="text-[10px] text-slate-500">AI-powered practice</div>
                                </div>
                            </button>
                            <button onclick="renderOutreachTemplates()" class="flex flex-row items-center text-left p-3 border border-slate-200 rounded-lg hover:border-blue-300 bg-white group transition-all h-full w-full gap-3">
                                <div class="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0"><i data-lucide="mail" class="w-5 h-5"></i></div>
                                <div>
                                    <div class="font-bold text-xs text-slate-800 group-hover:text-blue-700">Email Scripts</div>
                                    <div class="text-[10px] text-slate-500">Networking templates</div>
                                </div>
                            </button>
                        </div>
                    </div>
                `;
            } else if (goal === 'Change Careers') {
                blockBTitle = "Career Pivot Strategy";
                blockBAction = "Start Pivot Audit";
                blockBOnclick = "renderPivotAudit()";

                blockBContent = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="p-3 bg-pink-50 border border-pink-100 rounded-lg">
                                <div class="flex items-center gap-2 mb-2">
                                    <i data-lucide="shuffle" class="w-4 h-4 text-pink-600"></i>
                                    <span class="text-xs font-bold text-pink-800">Transferable Skills</span>
                                </div>
                                <p class="text-[10px] text-pink-700 leading-relaxed mb-2">Identify skills from your past role that apply here (e.g., Project Mgmt, Communication).</p>
                                <div class="flex flex-wrap gap-1">
                                    <span class="px-1.5 py-0.5 bg-white rounded text-[9px] text-pink-600 border border-pink-200">Leadership</span>
                                    <span class="px-1.5 py-0.5 bg-white rounded text-[9px] text-pink-600 border border-pink-200">Analytics</span>
                                </div>
                            </div>
                            <div class="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                <div class="flex items-center gap-2 mb-2">
                                    <i data-lucide="users" class="w-4 h-4 text-blue-600"></i>
                                    <span class="text-xs font-bold text-blue-800">Immersion</span>
                                </div>
                                <p class="text-[10px] text-blue-700 leading-relaxed mb-2">The fastest way to pivot is to speak the language. Join sector-specific events.</p>
                                <button onclick="closeModal('unified-hub-modal'); document.getElementById('community-hub-drawer').classList.remove('translate-x-full'); showCommunityView();" class="text-[9px] font-bold bg-white text-blue-600 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 w-full">Find Events</button>
                            </div>
                        </div>
                        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <h4 class="text-[10px] font-bold text-slate-500 uppercase mb-2">Recommended Pivot Projects</h4>
                            <div class="grid grid-cols-2 gap-2">
                                <div class="text-[10px] text-slate-600 flex items-center gap-1.5"><i data-lucide="github" class="w-3 h-3 text-slate-400"></i> Open Source Contrib.</div>
                                <div class="text-[10px] text-slate-600 flex items-center gap-1.5"><i data-lucide="pen-tool" class="w-3 h-3 text-slate-400"></i> Case Study Blog</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Upskill / Strengthen
                blockBTitle = "Career Advancement";
                blockBAction = "View Certifications";
                blockBOnclick = "openUnifiedHub('pp-courses')";
                
                // NEW: Contextualize tools based on Interest
                let advancedTools = [];
                const interest = pathwayState.interest;
                
                const toolsInterestMap = {
                    'digital': {
                        'code': ['Docker', 'GraphQL', 'Next.js'],
                        'data': ['TensorFlow', 'Tableau', 'dbt'],
                        'creative': ['Figma (Adv)', 'Webflow', 'Adobe XD']
                    },
                    'energy': {
                        'hands-on': ['Thermal Imaging', 'High Voltage Testers', 'SCADA'],
                        'design': ['PVsyst', 'AutoCAD Electrical', 'Homer Pro'],
                        'mgmt': ['MS Project', 'ERP Systems', 'Auditing Tools']
                    },
                    'agri': {
                        'tech': ['ArcGIS Pro', 'Python for Ag', 'Drone Deploy'],
                        'field': ['Soil Spectrometers', 'GPS Units', 'Farm ERP'],
                        'biz': ['QuickBooks', 'Supply Chain Soft.', 'Market Analytics']
                    }
                };

                if (interest && toolsInterestMap[sector] && toolsInterestMap[sector][interest]) {
                    advancedTools = toolsInterestMap[sector][interest];
                } else {
                    // Fallback to sector defaults
                    if (sector === 'digital') advancedTools = ['Kubernetes', 'TensorFlow', 'Figma (Adv)'];
                    else if (sector === 'energy') advancedTools = ['PVsyst', 'AutoCAD Elec', 'Homer Pro'];
                    else if (sector === 'agri') advancedTools = ['ArcGIS Pro', 'Python', 'Farm ERP'];
                }

                blockBContent = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                                <div class="flex items-center gap-2 mb-1">
                                    <i data-lucide="trending-up" class="w-4 h-4 text-indigo-600"></i>
                                    <span class="text-xs font-bold text-indigo-800">Salary Potential</span>
                                </div>
                                <div class="text-lg font-bold text-indigo-900">+40% <span class="text-[10px] font-normal text-indigo-700">with specialization</span></div>
                                <div class="w-full bg-indigo-200 h-1.5 rounded-full mt-2"><div class="bg-indigo-600 h-1.5 rounded-full" style="width: 70%"></div></div>
                            </div>
                            <div class="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                <div class="flex items-center gap-2 mb-1">
                                    <i data-lucide="award" class="w-4 h-4 text-amber-600"></i>
                                    <span class="text-xs font-bold text-amber-800">Top Certifications</span>
                                </div>
                                <ul class="text-[10px] text-amber-900 space-y-1 list-disc list-inside">
                                    <li>Professional Cloud Architect</li>
                                    <li>PMP / Agile Practitioner</li>
                                    <li>Advanced Data Analytics</li>
                                </ul>
                            </div>
                        </div>
                        <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div class="text-xs text-slate-600 mb-2 font-bold">Master Industry-Standard Tools</div>
                            <div class="flex flex-wrap gap-2">
                                ${advancedTools.map(t => `<span class="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 shadow-sm">${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }

            // --- SECTION C: TRAINING (Bridge Knowledge Gaps) ---
            const catalogue = getMasterTrainingCatalogue('all', sector, activeCountry);
            let courses = [];
            
            if (['Internship', 'Entry Level Job', 'Change Careers', 'Apprenticeship'].includes(goal)) {
                courses = [...catalogue.short, ...catalogue.med];
            } else if (['Strengthen my current skills', 'Upskill'].includes(goal)) {
                courses = [...catalogue.med, ...catalogue.long];
            } else {
                courses = [...catalogue.short, ...catalogue.med, ...catalogue.long];
            }
            
            courses = courses.filter(c => c.url && c.url.startsWith('http'));
            if (pathwayState.constraints.budget === 'Free') courses = courses.filter(c => c.cost && c.cost.toLowerCase().includes('free'));
            if (pathwayState.constraints.mode === 'Online') courses = courses.filter(c => c.mode === 'Online');
            
            // NEW: Prioritize courses based on Interest (User's "What sounds most like you" selection)
            if (pathwayState.interest) {
                 const interestMap = {
                    'tech': ['Python', 'IoT', 'Solar', 'Design', 'Coding', 'Technical', 'Digital', 'Technology'],
                    'code': ['Python', 'Java', 'React', 'API', 'Code', 'Software', 'Web', 'Development'],
                    'design': ['Design', 'UX', 'CAD', 'Drawing', 'Planning', 'Product', 'Creative'],
                    'hands-on': ['Installation', 'Wiring', 'Maintenance', 'Repair', 'Field', 'Technician', 'Practical'],
                    'field': ['Soil', 'Crop', 'Drone', 'Scouting', 'Farm', 'Agriculture', 'Field'],
                    'biz': ['Sales', 'Management', 'Logistics', 'Finance', 'Business', 'Supply Chain', 'Entrepreneurship'],
                    'mgmt': ['Management', 'Audit', 'Policy', 'Planning', 'Project', 'Leadership'],
                    'data': ['Data', 'Analysis', 'Excel', 'Statistics', 'Logic', 'Science', 'Analytics'],
                    'creative': ['Design', 'Marketing', 'Content', 'Strategy', 'UI', 'Creative']
                };
                const keywords = interestMap[pathwayState.interest] || [];
                
                if (keywords.length > 0) {
                    courses.sort((a, b) => {
                        const getMatchScore = (c) => {
                            const text = (c.name + " " + (c.description || "") + " " + (c.skills || []).join(" ")).toLowerCase();
                            return keywords.filter(k => text.includes(k.toLowerCase())).length;
                        };
                        return getMatchScore(b) - getMatchScore(a);
                    });
                }
            }

            const finalCourses = courses.slice(0, 4); // Limit to 4 for cleaner UI
            const trainingHtml = finalCourses.map(c => `
                <a href="${c.url}" target="_blank" class="flex flex-col p-4 bg-white border border-slate-200 rounded-lg hover:border-${theme}-300 transition-colors group h-full shadow-sm">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">${c.level === 'short' ? 'Short' : 'Cert'}</span>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-${theme}-500"></i>
                    </div>
                    <div class="font-bold text-xs text-slate-800 group-hover:text-${theme}-700 line-clamp-2 mb-1">${c.name}</div>
                    <div class="text-[10px] text-slate-500 mt-auto">${c.provider}</div>
                </a>
            `).join('');

            // --- SECTION D: ACTIVE JOB BOARDS ---
            const careerResources = getSectorCareerResources(sector);
            let blockDTitle = "Active Job Boards";
            let blockDAction = "View All";
            let blockDOnclick = "toggleCareerHub()";
            let blockDContentHtml = "";
            let blockDColor = "amber";

            if (true) { // Always show Job Boards for non-venture goals
                const jobBoards = (careerResources.jobs || []).filter(j => j.link && j.link.startsWith('http')).slice(0, 3);
                blockDContentHtml = jobBoards.map(j => `
                    <a href="${j.link}" target="_blank" class="flex items-center gap-3 p-2 border border-slate-100 rounded-lg bg-white hover:border-amber-300 group transition-colors">
                        <div class="w-8 h-8 rounded bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold">${j.company ? j.company.substring(0,2) : 'JB'}</div>
                        <div class="min-w-0 flex-1">
                            <div class="font-bold text-xs text-slate-800 truncate group-hover:text-amber-700">${j.title}</div>
                            <div class="text-[10px] text-slate-500 truncate">${j.company || 'Job Listing'}</div>
                        </div>
                    </a>
                `).join('');
            }

            // --- SECTION E: ECOSYSTEM RESOURCES ---
            let ecoResources = (typeof sectorPathwayResources !== 'undefined' && sectorPathwayResources[sector]) ? [...sectorPathwayResources[sector]] : [];
            // Merge dynamic
            if (typeof getSectorCareerResources === 'function') {
                const dynamicResources = getSectorCareerResources(sector);
                if (dynamicResources && dynamicResources.communities) {
                    dynamicResources.communities.slice(0, 2).forEach(r => {
                        if (!ecoResources.some(ex => ex.title === r.name)) {
                            ecoResources.push({ title: r.name, desc: r.desc, link: r.link, icon: 'users' });
                        }
                    });
                }
            }
            ecoResources = ecoResources.filter(r => r.link && r.link.startsWith('http')).slice(0, 4);
            
            const ecoHtml = ecoResources.map(r => `
                <a href="${r.link}" target="_blank" class="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg hover:border-${theme}-300 transition-all group">
                    <div class="p-1.5 bg-slate-50 text-slate-600 rounded shrink-0 group-hover:bg-${theme}-50 group-hover:text-${theme}-600"><i data-lucide="${r.icon}" class="w-4 h-4"></i></div>
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-slate-800 group-hover:text-${theme}-700 truncate">${r.title}</div>
                        <div class="text-[10px] text-slate-500 truncate">${r.desc}</div>
                    </div>
                </a>
            `).join('');

            // --- RENDER FINAL HTML ---
            container.innerHTML = `
                <div class="animate-fade-in space-y-6 pb-8">
                    <!-- Header -->
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div>
                            <h2 class="text-lg font-bold text-slate-900">Your Personalized Roadmap</h2>
                            <p class="text-xs text-slate-500">
                                Goal: <strong class="text-${theme}-600">${goal}</strong> • 
                                Sector: <strong>${sector === 'agri' ? 'Agritech' : sector === 'energy' ? 'Renewable Energy' : 'Digital'}</strong>
                                ${pathwayState.interest ? ` • Focus: <strong>${pathwayState.interest.charAt(0).toUpperCase() + pathwayState.interest.slice(1)}</strong>` : ''}
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.print()" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1">
                                <i data-lucide="download" class="w-3 h-3"></i> Save
                            </button>
                            <button onclick="initPathwayWizard()" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm">
                                Restart
                            </button>
                        </div>
                    </div>

                    ${profileHtml}

                    <!-- A. Skills Focus -->
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <h3 class="font-bold text-slate-800 flex items-center gap-2 mb-4"><span class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">A</span> Skills Focus</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${skillsHtml}
                        </div>
                    </div>

                    <!-- B. Practice / Toolkit -->
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-slate-800 flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">B</span> ${blockBTitle}</h3>
                            ${blockBAction ? `<button onclick="${blockBOnclick}" class="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 border border-purple-100">${blockBAction}</button>` : ''}
                        </div>
                        ${blockBContent}
                    </div>

                    <!-- C. Training -->
                    ${goal !== 'Apprenticeship' ? `
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
                            <h3 class="font-bold text-slate-800 flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">C</span> Bridge Knowledge Gaps</h3>
                            <div class="flex gap-2">
                                <select onchange="updatePathwayConstraint('mode', this.value)" class="text-[10px] border-slate-200 rounded bg-slate-50 text-slate-600 focus:ring-0 py-1 pl-2 pr-6 cursor-pointer hover:bg-slate-100">
                                    <option value="Any" ${!pathwayState.constraints.mode || pathwayState.constraints.mode === 'Any' ? 'selected' : ''}>Any Mode</option>
                                    <option value="Online" ${pathwayState.constraints.mode === 'Online' ? 'selected' : ''}>Online</option>
                                </select>
                                <select onchange="updatePathwayConstraint('budget', this.value)" class="text-[10px] border-slate-200 rounded bg-slate-50 text-slate-600 focus:ring-0 py-1 pl-2 pr-6 cursor-pointer hover:bg-slate-100">
                                    <option value="Any" ${!pathwayState.constraints.budget || pathwayState.constraints.budget === 'Any' ? 'selected' : ''}>Any Cost</option>
                                    <option value="Free" ${pathwayState.constraints.budget === 'Free' ? 'selected' : ''}>Free</option>
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 gap-4">
                            ${trainingHtml}
                        </div>
                        ${finalCourses.length === 0 ? '<div class="text-xs text-slate-500 italic mt-2">No specific courses found matching constraints.</div>' : ''}
                    </div>
                    ` : ''}

                    <!-- D. Opportunities -->
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-${blockDColor}-500"></div>
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
                            <h3 class="font-bold text-slate-800 flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-${blockDColor}-100 text-${blockDColor}-600 flex items-center justify-center text-xs font-bold">D</span> ${blockDTitle}</h3>
                            <button onclick="${blockDOnclick}" class="text-[10px] font-bold text-${blockDColor}-600 bg-${blockDColor}-50 px-2 py-1 rounded hover:bg-${blockDColor}-100 border border-${blockDColor}-100 self-start sm:self-auto">${blockDAction}</button>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            ${blockDContentHtml || '<div class="text-xs text-slate-500 italic">No items found.</div>'}
                        </div>
                    </div>

                    <!-- E. Ecosystem -->
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-1 h-full bg-slate-400"></div>
                        <h3 class="font-bold text-slate-800 flex items-center gap-2 mb-4"><span class="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">E</span> Essential Ecosystem Resources</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${ecoHtml}
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Career Readiness Scorecard ---
        window.renderReadinessScorecard = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            const sections = [
                {
                    title: "Digital Assets", icon: "file-text", color: "blue",
                    items: ["CV is ATS-friendly (no graphics/columns)", "LinkedIn profile has a professional photo", "LinkedIn 'About' section tells a story", "Portfolio link is working and accessible"]
                },
                {
                    title: "Search Strategy", icon: "target", color: "purple",
                    items: ["Identified top 10 target companies", "Set up job alerts on 3+ platforms", "Connected with 5+ alumni/peers in sector", "Researched salary benchmarks for role"]
                },
                {
                    title: "Interview Prep", icon: "mic", color: "emerald",
                    items: ["Prepared 3 STAR stories for behavioral Qs", "Researched 'Why this company?' answer", "Practiced technical/case study questions", "Prepared questions to ask the interviewer"]
                }
            ];

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-4 animate-fade-in">
                    <div class="mb-6 flex justify-between items-center">
                        <button onclick="renderPathwayStep3()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Roadmap</button>
                        <div class="text-xs font-bold text-slate-400 uppercase tracking-wide">Readiness Audit</div>
                    </div>
                    
                    <div class="text-center mb-8">
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Are you ready to apply?</h2>
                        <p class="text-slate-500">Check off items to calculate your readiness score.</p>
                    </div>

                    <div class="space-y-6" id="scorecard-form">
                        ${sections.map((s, idx) => `
                            <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <div class="p-1.5 bg-${s.color}-50 text-${s.color}-600 rounded-lg"><i data-lucide="${s.icon}" class="w-4 h-4"></i></div>
                                    ${s.title}
                                </h3>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    ${s.items.map(item => `
                                        <label class="flex items-start gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                                            <input type="checkbox" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 scorecard-check">
                                            <span class="text-xs text-slate-700 font-medium leading-snug">${item}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="mt-8 p-6 bg-slate-900 rounded-xl text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-lg">
                        <div>
                            <h3 class="font-bold text-lg mb-1">Your Readiness Score</h3>
                            <p class="text-xs text-slate-400">Aim for 80%+ before major applications.</p>
                        </div>
                        <div class="flex items-center gap-4 w-full sm:w-auto">
                            <div class="flex-1 sm:w-48 bg-slate-700 rounded-full h-4 overflow-hidden">
                                <div id="readiness-bar" class="bg-emerald-500 h-full rounded-full transition-all duration-1000" style="width: 0%"></div>
                            </div>
                            <span id="readiness-text" class="font-bold text-2xl font-mono">0%</span>
                        </div>
                    </div>
                </div>
            `;
            
            // Add listeners
            setTimeout(() => {
                const checks = document.querySelectorAll('.scorecard-check');
                const updateScore = () => {
                    const total = checks.length;
                    const checked = document.querySelectorAll('.scorecard-check:checked').length;
                    const pct = Math.round((checked / total) * 100);
                    document.getElementById('readiness-bar').style.width = `${pct}%`;
                    document.getElementById('readiness-text').innerText = `${pct}%`;
                };
                checks.forEach(c => c.addEventListener('change', updateScore));
            }, 100);

            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Pivot Audit (Change Careers) ---
        window.renderPivotAudit = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            const sections = [
                {
                    title: "Skill Translation", icon: "languages", color: "pink",
                    items: ["Mapped past skills to new sector jargon", "Identified transferable soft skills (e.g. Mgmt)", "Created a 'functional' CV format"]
                },
                {
                    title: "Market Immersion", icon: "users", color: "blue",
                    items: ["Joined 2+ sector-specific communities", "Followed 10 industry leaders on LinkedIn", "Subscribed to 3 industry newsletters"]
                },
                {
                    title: "Validation", icon: "check-circle", color: "emerald",
                    items: ["Conducted 3 informational interviews", "Completed 1 relevant mini-project", "Updated LinkedIn headline to 'Aspiring [Role]'"]
                }
            ];

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-4 animate-fade-in">
                    <div class="mb-6 flex justify-between items-center">
                        <button onclick="renderPathwayStep3()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Roadmap</button>
                        <div class="text-xs font-bold text-slate-400 uppercase tracking-wide">Pivot Audit</div>
                    </div>
                    
                    <div class="text-center mb-8">
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Career Switch Checklist</h2>
                        <p class="text-slate-500">Track your transition from "Outsider" to "Insider".</p>
                    </div>

                    <div class="space-y-6">
                        ${sections.map((s) => `
                            <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <div class="p-1.5 bg-${s.color}-50 text-${s.color}-600 rounded-lg"><i data-lucide="${s.icon}" class="w-4 h-4"></i></div>
                                    ${s.title}
                                </h3>
                                <div class="space-y-3">
                                    ${s.items.map(item => `
                                        <label class="flex items-start gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer transition-colors">
                                            <input type="checkbox" class="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300">
                                            <span class="text-xs text-slate-700 font-medium leading-snug">${item}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Outreach Templates Resource ---
        window.renderOutreachTemplates = function() {
            const container = document.getElementById('pp-practice-content');
            if(!container) return;

            const templates = [
                {
                    title: "LinkedIn Connection (Alumni)",
                    subject: "N/A",
                    body: "Hi [Name], I noticed we both studied at [University]. I'm currently exploring careers in [Sector] and would love to connect to learn from your journey. Thanks, [Your Name]"
                },
                {
                    title: "Informational Interview Request",
                    subject: "Quick question about [Role] at [Company]",
                    body: "Dear [Name],\n\nI'm a [Current Role/Student] admiring [Company]'s work in [Specific Project]. I'd love to ask 3 quick questions about your experience as a [Role] to help guide my next steps.\n\nWould you be open to a 15-min chat next week?\n\nBest,\n[Your Name]"
                },
                {
                    title: "Application Follow-up",
                    subject: "Following up on [Role] application - [Your Name]",
                    body: "Dear Hiring Manager,\n\nI applied for the [Role] position last week (ID: 12345). I'm very interested in [Company]'s mission to [Mission] and wanted to reiterate my enthusiasm.\n\nPlease let me know if you need any further information.\n\nBest regards,\n[Your Name]"
                }
            ];

            container.innerHTML = `
                <div class="max-w-3xl mx-auto py-4 animate-fade-in">
                    <div class="mb-6">
                        <button onclick="renderPathwayStep3()" class="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Roadmap</button>
                    </div>
                    <div class="text-center mb-8">
                        <h2 class="text-2xl font-bold text-slate-900 mb-2">Cold Outreach Scripts</h2>
                        <p class="text-slate-500">Don't know what to say? Copy, adapt, and send.</p>
                    </div>
                    <div class="grid grid-cols-1 gap-4">
                        ${templates.map(t => `
                            <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm group hover:border-indigo-300 transition-colors">
                                <div class="flex justify-between items-start mb-3">
                                    <h3 class="font-bold text-slate-800 text-sm">${t.title}</h3>
                                    <button onclick="navigator.clipboard.writeText(this.getAttribute('data-copy')); alert('Copied to clipboard!');" data-copy="${t.body}" class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 flex items-center gap-1"><i data-lucide="copy" class="w-3 h-3"></i> Copy</button>
                                </div>
                                ${t.subject !== 'N/A' ? `<div class="text-xs text-slate-500 mb-2"><span class="font-bold">Subject:</span> ${t.subject}</div>` : ''}
                                <div class="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed border border-slate-100">${t.body}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.updatePathwayConstraint = function(key, value) {
            pathwayState.constraints[key] = value;
            renderPathwayStep3(); // Re-render to apply filters
        }

        function openOccupationModal(title) {
            const modal = document.getElementById('occupation-modal');
            const panel = document.getElementById('occupation-modal-panel');
            
            // Reset scroll position and ensure mobile layout
            const scrollContainer = panel.querySelector('.overflow-y-auto');
            if (scrollContainer) scrollContainer.scrollTop = 0;

            const sectorName = activeSectorId === 'agri' ? 'Agritech' : activeSectorId === 'energy' ? 'Renewable Energies' : 'Digital Economies / AI';
            
            const details = getOccupationDetails(title, sectorName);
            
            // Lookup dynamic "Why in Demand" info
            const dynamicOccs = dataManager.getOccupations(activeSectorId);
            const occData = dynamicOccs ? dynamicOccs.find(o => o.name === title) : null;
            const demandInfo = occData && occData.why ? occData.why : "High demand due to sector growth and skills gap.";
            
            // NEW: Fetch Wage/OJA for Modal
            const targetName = (typeof roleToOccupationMap !== 'undefined' && roleToOccupationMap[title]) ? roleToOccupationMap[title] : title;
            const wageEntry = dataManager.getWage(targetName, activeCountry, occData ? occData.id : null);
            
            document.body.classList.add('overflow-hidden');
            
            document.getElementById('modal-title').innerText = title;
            
            // NEW: Fetch and display O*NET / ESCO Codes
            // Priority: Check dynamic occData first, then fallback to baseSectorDetailData
            const baseOccs = baseSectorDetailData[activeSectorId] ? baseSectorDetailData[activeSectorId].occupations : [];
            const baseOcc = baseOccs.find(o => o.name === title);
            
            const onet = (occData && occData.onetCode) ? occData.onetCode : (baseOcc ? baseOcc.onetCode : null);
            const esco = (occData && occData.escoCode) ? occData.escoCode : (baseOcc ? baseOcc.escoCode : null);

            const codesHtml = (onet || esco) 
                ? `<span class="block mt-1 text-[10px] text-slate-400 font-mono opacity-80">
                    ${onet ? `O*NET: ${onet}` : ''} 
                    ${onet && esco ? ' | ' : ''} 
                    ${esco ? `ESCO: ${esco}` : ''}
                   </span>` 
                : '';

            document.getElementById('modal-alt-titles').innerHTML = `AKA: ${details.altTitles} ${codesHtml}`;
            document.getElementById('modal-sector-badge').innerText = sectorName;

            // Update Footer with Save Button
            const isSaved = myPlan.roles.has(title);
            const saveBtnText = isSaved ? "Saved to Plan" : "Save Role";
            const saveBtnIcon = isSaved ? "fill-current" : "";
            
            // Inject Demand Info
            const demandContainer = document.getElementById('modal-demand-section');
            if (demandContainer) {
                demandContainer.innerHTML = `
                    <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <h4 class="text-xs font-bold text-indigo-800 uppercase mb-2 flex items-center gap-2"><i data-lucide="trending-up" class="w-4 h-4"></i> Why in Demand</h4>
                        <p class="text-sm text-indigo-900/90 leading-relaxed">${demandInfo}</p>
                    </div>
                `;
            }

            // Inject HTML description
            document.getElementById('occ-desc').innerHTML = details.desc;
            
            // 2. Typical Skills Required (Ranked & Categorized)
            const techHtml = details.specificSkills.technical.map((s, i) => `
                <div class="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded text-xs text-slate-700 hover:border-indigo-200 transition-colors w-full">
                    <div class="w-5 h-5 flex items-center justify-center bg-white rounded-full shadow-sm text-[10px] font-bold text-slate-400 border border-slate-100">${i+1}</div>
                    <span class="font-bold text-slate-800">${s}</span>
                </div>
            `).join('');

            const empHtml = details.specificSkills.employability.map((s, i) => `
                <div class="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded text-xs text-slate-700 hover:border-emerald-200 transition-colors w-full">
                    <div class="w-5 h-5 flex items-center justify-center bg-white rounded-full shadow-sm text-[10px] font-bold text-emerald-600 border border-slate-100">${i+1}</div>
                    <span class="font-bold text-slate-800">${s}</span>
                </div>
            `).join('');

            document.getElementById('occ-skills-list').innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    <div>
                        <div class="text-[10px] font-bold text-indigo-700 uppercase tracking-wide mb-2 border-b border-indigo-100 pb-1">Technical Skills (Ranked by Importance)</div>
                        <div class="space-y-2">
                            ${techHtml}
                        </div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">Employability & Soft Skills</div>
                        <div class="space-y-2">
                            ${empHtml}
                        </div>
                    </div>
                </div>
            `;

            // 3. New Section: Am I a good fit?
            document.getElementById('occ-fit-section').innerHTML = `
                <div class="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all" onclick="closeModal('occupation-modal'); openUnifiedHub('pp-diagnostic', '${title.replace(/'/g, "\\'")}');">
                    <div class="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-colors"></div>
                    
                    <div class="relative z-10 flex items-center justify-between">
                        <div>
                            <h3 class="font-bold text-lg mb-1 flex items-center gap-2">
                                Am I a good fit for this role?
                            </h3>
                            <p class="text-xs text-slate-300 max-w-sm leading-relaxed mb-3">
                                Unsure if you have the right skills set? Take our quick <strong>SkillsMatch</strong> assessment to identify your strengths and gaps and follow up with a curated training plan.
                            </p>
                            <button class="bg-white text-indigo-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors flex items-center gap-2 shadow-sm" onclick="event.stopPropagation(); closeModal('occupation-modal'); openUnifiedHub('pp-diagnostic', '${title.replace(/'/g, "\\'")}');">
                                Start SkillsMatch <i data-lucide="arrow-right" class="w-3 h-3"></i>
                            </button>
                        </div>
                        <div class="hidden sm:block opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all">
                            <i data-lucide="target" class="w-16 h-16 text-white/20"></i>
                        </div>
                    </div>
                </div>
            `;

            // --- 3. Qualifications & Requirements (New Section 3) ---
            const qualData = (typeof roleQualifications !== 'undefined' && roleQualifications[title]) 
                ? roleQualifications[title] 
                : { 
                    education: "Relevant Diploma or Bachelor's Degree", 
                    certification: "Sector-specific professional certification", 
                    experience: "1-3 years relevant work experience" 
                };
            
            // Contextualize Certs if needed (override generic if country specific logic exists)
            if (activeSectorId === 'energy' && activeCountry === 'Kenya' && title.includes('Solar')) {
                qualData.certification = "EPRA Solar PV License (T1/T2)";
            }

            const qualHtml = `
                <div class="mt-6 pt-6 border-t border-slate-100" id="modal-qualifications-section">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">3</span> Qualifications & Requirements
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="flex items-center gap-2 mb-1"><i data-lucide="graduation-cap" class="w-4 h-4 text-indigo-500"></i><span class="text-[10px] font-bold text-slate-500 uppercase">Education</span></div>
                            <div class="text-xs text-slate-700 font-medium">${qualData.education}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="flex items-center gap-2 mb-1"><i data-lucide="award" class="w-4 h-4 text-emerald-500"></i><span class="text-[10px] font-bold text-slate-500 uppercase">Certifications</span></div>
                            <div class="text-xs text-slate-700 font-medium">${qualData.certification}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="flex items-center gap-2 mb-1"><i data-lucide="briefcase" class="w-4 h-4 text-amber-500"></i><span class="text-[10px] font-bold text-slate-500 uppercase">Experience</span></div>
                            <div class="text-xs text-slate-700 font-medium">${qualData.experience}</div>
                        </div>
                    </div>
                </div>
            `;

            // 4. Demand Signals (Updated Label)
            const baseData = baseSectorDetailData[activeSectorId];
            const overrides = (countryOverrides[activeCountry] && countryOverrides[activeCountry][activeSectorId]) || {};
            const data = { ...baseData, ...overrides };
            const sectorGrowth = data.jobTrend || baseData.growth.jobTrend;

            // --- NEW: Calculate Similar Roles (Moved Up) ---
            const currentTechSkills = new Set(details.specificSkills.technical);
            const relatedRoles = [];

            // Use DataManager to get candidate roles (Dynamic)
            const sectorOccs = dataManager.getOccupations(activeSectorId);
            
            if (sectorOccs && sectorOccs.length > 0) {
                sectorOccs.forEach(occ => {
                    if (occ.name === title) return;
                    
                    // Get skills for candidate role
                    const candidateDetails = getOccupationDetails(occ.name, sectorName);
                    const candidateSkills = candidateDetails.specificSkills.technical;
                    
                    const overlap = candidateSkills.filter(s => currentTechSkills.has(s)).length;
                    if (overlap > 0) {
                        relatedRoles.push({ name: occ.name, score: overlap });
                    }
                });
            } else if (typeof roleSkills !== 'undefined') {
                Object.entries(roleSkills).forEach(([rName, rData]) => {
                    if (rName === title) return;
                    const overlap = rData.technical.filter(s => currentTechSkills.has(s)).length;
                    if (overlap > 0) {
                        relatedRoles.push({ name: rName, score: overlap });
                    }
                });
            }
            relatedRoles.sort((a, b) => b.score - a.score);
            const topRelated = relatedRoles.slice(0, 3);
            const hasRelated = topRelated.length > 0;

            // 4. Similar Roles (Lateral Pathways) - Now includes Section 3 injection
            document.getElementById('modal-related-section').innerHTML = hasRelated ? `
                ${qualHtml}
                
                <div class="mt-6 pt-6 border-t border-slate-100">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">4</span> Similar Roles (Lateral Pathways)
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        ${topRelated.map(r => `
                            <button onclick="openOccupationModal('${r.name}')" class="text-left p-3 bg-slate-50 hover:bg-white border border-slate-200 hover:border-indigo-300 rounded-lg transition-all group shadow-sm">
                                <div class="text-[10px] text-slate-400 font-bold uppercase mb-1">${r.score} Shared Skills</div>
                                <div class="text-xs font-bold text-slate-700 group-hover:text-indigo-700 truncate">${r.name}</div>
                            </button>
                        `).join('')}
                    </div>
                </div>` : qualHtml; // If no related roles, still show qualifications
            
            // --- NEW: Role Snapshot Section ---
            const snapshotContainer = document.getElementById('modal-snapshot-section');
            if (snapshotContainer) {
                // Logic for Personality/Fit
                // Check for specific snapshot first
                const specificSnapshot = (typeof roleSpecificSnapshots !== 'undefined') ? roleSpecificSnapshots[title] : null;
                
                let bestFor = "Adaptable problem-solvers";
                let envs = "Office & Site visits";

                if (specificSnapshot) {
                    bestFor = specificSnapshot.bestFor;
                    envs = specificSnapshot.envs;
                } else {
                    // Fallback to sector generic
                    const snapshotData = (typeof roleSnapshotConfig !== 'undefined' && roleSnapshotConfig[activeSectorId]) 
                        ? roleSnapshotConfig[activeSectorId] 
                        : (typeof roleSnapshotConfig !== 'undefined' ? roleSnapshotConfig.default : { bestFor: "Adaptable problem-solvers", envs: "Office & Site visits" });
                    
                    bestFor = snapshotData.bestFor;
                    envs = snapshotData.envs;
                    
                    // Simple heuristics
                    if (title.includes('Manager') || title.includes('Lead')) bestFor += " with leadership traits.";
                    else if (title.includes('Analyst')) bestFor += " who love data.";
                    else if (title.includes('Technician')) bestFor += " who enjoy hands-on work.";
                }

                // Prepare Wage/Demand items
                let wageHtml = `<span class="text-slate-400 italic">Data unavailable</span>`;
                let demandHtml = `<span class="text-slate-400 italic">Data unavailable</span>`;

                if (wageEntry) {
                    const avgWage = wageEntry.avgMonthlyWage || wageEntry.Avg_Monthly_Wage;
                    const curr = wageEntry.currency || wageEntry.Currency;
                    if (avgWage && avgWage !== 'TBD') {
                        wageHtml = `${curr} ${avgWage} <span class="text-[9px] text-slate-400 font-normal ml-1">/mo</span>`;
                    }
                    const oja = wageEntry.ojaCount || wageEntry.OJA_Count;
                    if (oja && oja !== 'N/A') {
                        demandHtml = `${oja} <span class="text-[9px] text-slate-400 font-normal ml-1">Ads/Year</span>`;
                    }
                }

                snapshotContainer.innerHTML = `
                    <div>
                        <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <i data-lucide="info" class="w-4 h-4"></i> At a Glance
                        </h3>
                        <div class="bg-slate-50 rounded-xl border border-slate-200 p-4">
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-4">
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Avg Wage</div>
                                    <div class="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                                        <i data-lucide="banknote" class="w-3.5 h-3.5"></i> ${wageHtml}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Demand (OJA)</div>
                                    <div class="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                                        <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i> ${demandHtml}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Work Setting/s</div>
                                    <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-500"></i> ${details.workMode}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Best For</div>
                                    <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <i data-lucide="user" class="w-3.5 h-3.5 text-slate-500"></i> ${bestFor}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Typical Employers</div>
                                    <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <i data-lucide="briefcase" class="w-3.5 h-3.5 text-slate-500"></i> ${details.employers}
                                    </div>
                                </div>
                                <div>
                                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Common Environments</div>
                                    <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <i data-lucide="globe" class="w-3.5 h-3.5 text-slate-500"></i> ${envs}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 4. Extra Info (Tools, Creds, Resources)
            const toolsHtml = details.tools.map(t => `<span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold border border-slate-200">${t}</span>`).join('');
            const credsHtml = details.credentials.map(c => `<li class="text-xs text-slate-700 mb-1 flex items-start gap-2"><i data-lucide="check-circle" class="w-3 h-3 mt-0.5 text-emerald-500 shrink-0"></i> ${c}</li>`).join('');
            const resHtml = details.resources.length > 0 
                ? details.resources.map(r => `<a href="${r.url}" target="_blank" class="block text-xs text-indigo-600 hover:underline mb-1 flex items-center gap-1"><i data-lucide="external-link" class="w-3 h-3"></i> ${r.title}</a>`).join('')
                : '<div class="text-xs text-slate-400 italic">N/A</div>';

            document.getElementById('modal-extra-section').innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100">
                    <div>
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">${hasRelated ? 5 : 4}</span> Tools & Tech
                        </h3>
                        <div class="flex flex-wrap gap-2 mb-8">
                            ${toolsHtml}
                        </div>
                    </div>
                    <div>
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">${hasRelated ? 6 : 5}</span> Read More
                        </h3>
                        <div class="space-y-1">
                            ${resHtml}
                        </div>
                    </div>
                </div>
            `;

            // NEW: Share Button in Footer
            const shareText = encodeURIComponent(`Check out this ${title} role on AI4EAC Skills Compass!`);
            const shareUrl = `https://wa.me/?text=${shareText}`;
            
            const footer = document.getElementById('occ-modal-footer');
            if(footer) {
                footer.innerHTML = `
                    <a href="${shareUrl}" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors shadow-sm">
                        <i data-lucide="share-2" class="w-4 h-4"></i> Share via WhatsApp
                    </a>
                `;
            }

            modal.classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
            setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); panel.classList.add('scale-100', 'opacity-100'); }, 10);
        }
        
        function toggleLowBandwidth() {
            const isLite = document.body.classList.toggle('low-bandwidth');
            const btn = document.getElementById('lb-toggle');
            btn.innerText = isLite ? 'Full Mode' : 'Lite Mode';
            
            if (isLite) {
                alert("Lite reduces images/charts for cheaper data use");
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            const panel = modal.querySelector('div[id$="panel"]');
            
            if(panel) {
                panel.classList.remove('scale-100', 'opacity-100');
                panel.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => { 
                modal.classList.add('hidden'); 
                // Only remove overflow-hidden if no other modals are open
                if(document.querySelectorAll('.fixed.inset-0.z-\\[100\\]:not(.hidden)').length === 0) document.body.classList.remove('overflow-hidden');
            }, 200);
        }

        window.setGlobalCountry = function(country) {
            activeCountry = country;
            
            // Update Top Nav Dropdown (if changed via Hub)
            const navSelector = document.getElementById('country-selector');
            if (navSelector && navSelector.value !== country) {
                navSelector.value = country;
            }

            // Update Hub Dropdown (if changed via Nav)
            const hubSelector = document.getElementById('hub-country');
            if (hubSelector && hubSelector.value !== country) {
                hubSelector.value = country;
            }

            // Update Career Hub Dropdown
            const careerSelector = document.getElementById('career-country-select');
            if (careerSelector && careerSelector.value !== country) {
                careerSelector.value = country;
            }

            // Update Skills Hub Dropdown
            const skillsHubSelector = document.getElementById('skills-hub-country');
            if (skillsHubSelector && skillsHubSelector.value !== country) {
                skillsHubSelector.value = country;
            }

            // Update Sector Hub Country Dropdown
            const sectorHubCountry = document.getElementById('sector-hub-country');
            if (sectorHubCountry && sectorHubCountry.value !== country) {
                sectorHubCountry.value = country;
            }

            // Update Find Courses Filter (Sync)
            const courseFilter = document.getElementById('filter-country');
            if (courseFilter && courseFilter.value !== country) {
                courseFilter.value = country;
                if (!document.getElementById('pp-courses').classList.contains('hidden')) {
                    renderProviderTable();
                }
            }

            updateTrainingProviders();
            renderOccupationsView();
            
            // Update Dashboard Cards Context
            if (document.getElementById('skills-hub-home') && !document.getElementById('skills-hub-home').classList.contains('hidden')) {
                 renderSkillsHubCards();
            }
        }

        window.setGlobalSector = function(sector) {
            activeSectorId = sector;
            
            // Update Tabs
            ['agri', 'energy', 'digital'].forEach(s => {
                const tab = document.getElementById(`tab-sector-${s}`);
                if (tab) {
                    if (s === sector) {
                        // Active styles
                        let color = 'indigo';
                        if (s === 'agri') color = 'green';
                        if (s === 'energy') color = 'orange';
                        
                        tab.className = `py-3 border-b-2 border-${color}-600 text-${color}-600 text-sm font-bold whitespace-nowrap transition-colors`;
                    } else {
                        // Inactive styles
                        tab.className = `py-3 border-b-2 border-transparent text-sm font-bold text-slate-500 hover:text-slate-700 whitespace-nowrap transition-colors`;
                    }
                }
            });
            
            // Update Sector Hub Sector Dropdown
            const sectorHubSelect = document.getElementById('sector-hub-sector-select');
            if (sectorHubSelect && sectorHubSelect.value !== sector) {
                sectorHubSelect.value = sector;
            }

            // Update Skills Hub Dropdown
            const skillsHubSectorSelector = document.getElementById('skills-hub-sector');
            if (skillsHubSectorSelector && skillsHubSectorSelector.value !== sector) {
                skillsHubSectorSelector.value = sector;
            }

            // Update Find Courses Filter (Sync)
            const courseSectorFilter = document.getElementById('filter-sector');
            if (courseSectorFilter && courseSectorFilter.value !== sector) {
                courseSectorFilter.value = sector;
                if (!document.getElementById('pp-courses').classList.contains('hidden')) {
                    renderProviderTable();
                }
            }
            
            renderOccupationsView();
            
            // Update Dashboard Cards Context
            if (document.getElementById('skills-hub-home') && !document.getElementById('skills-hub-home').classList.contains('hidden')) {
                 renderSkillsHubCards();
            }
        }

        window.openUnifiedHub = function(startTab = 'pp-diagnostic', roleName = null, pathwayGoal = null) {
            // Close any open drawers to prevent overlap
            const careerDrawer = document.getElementById('career-hub-drawer');
            if (careerDrawer && !careerDrawer.classList.contains('translate-x-full')) {
                careerDrawer.classList.add('translate-x-full');
            }
            const trainingDrawer = document.getElementById('training-hub-drawer');
            if (trainingDrawer && !trainingDrawer.classList.contains('translate-x-full')) {
                trainingDrawer.classList.add('translate-x-full');
            }
            
            // Community drawer
            const communityDrawer = document.getElementById('community-hub-drawer');
            if (communityDrawer && !communityDrawer.classList.contains('translate-x-full')) {
                communityDrawer.classList.add('translate-x-full');
            }

            const drawer = document.getElementById('unified-hub-modal');
            
            // Conditional Rendering: Only render pathway content if requested (role/goal)
            const specificRequest = !!(roleName || pathwayGoal);

            if(specificRequest && typeof window.renderPATHWAYContent === 'function') {
                window.renderPATHWAYContent(roleName, pathwayGoal);
            }

            drawer.classList.remove('translate-x-full');
            
            if (startTab === 'pp-diagnostic' && !roleName) {
                // Default open: Show Dashboard
                renderSkillsHubDashboard();
            } else {
                // Specific deep link (e.g. from "Am I a good fit?")
                // If specific request was made, preserve state. Otherwise reset.
                openSkillsView(startTab, specificRequest);
            }
        }

        window.closeUnifiedHub = function() {
            const drawer = document.getElementById('unified-hub-modal');
            if(drawer) drawer.classList.add('translate-x-full');
        }

        window.renderSkillsHubDashboard = function() {
            const container = document.getElementById('skills-hub-home');
            if(!container) return;
            
            // Hide other views
            document.querySelectorAll('.pp-view-content').forEach(el => el.classList.add('hidden'));
            container.classList.remove('hidden');

            container.innerHTML = `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">Location</label>
                        <select id="skills-hub-country" onchange="setGlobalCountry(this.value)" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                            <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>Regional</option>
                            <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                            <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                            <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                            <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                            <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                            <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                            <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DR Congo</option>
                            <option value="Somalia" ${activeCountry === 'Somalia' ? 'selected' : ''}>Somalia</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">Sector</label>
                        <select id="skills-hub-sector" onchange="setGlobalSector(this.value)" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                            <option value="agri" ${activeSectorId === 'agri' ? 'selected' : ''}>Agritech</option>
                            <option value="energy" ${activeSectorId === 'energy' ? 'selected' : ''}>Renewable Energy</option>
                            <option value="digital" ${activeSectorId === 'digital' ? 'selected' : ''}>Digital Economy</option>
                        </select>
                    </div>
                </div>

                <div id="skills-hub-cards" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Cards injected via renderSkillsHubCards -->
                </div>
            `;
            
            renderSkillsHubCards();
        }

        window.renderSkillsHubCards = function() {
            const container = document.getElementById('skills-hub-cards');
            if(!container) return;

            const sectorName = activeSectorId === 'agri' ? 'Agritech' : activeSectorId === 'energy' ? 'Renewable Energy' : 'Digital Economy';

            container.innerHTML = `
                    <button onclick="openSkillsView('pp-diagnostic')" class="p-6 bg-emerald-50 border border-emerald-100 rounded-xl hover:border-emerald-300 hover:bg-white hover:shadow-md text-left transition-all group">
                        <div class="p-3 bg-emerald-100 text-emerald-600 rounded-lg w-fit mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><i data-lucide="clipboard-check" class="w-6 h-6"></i></div>
                        <h3 class="font-bold text-slate-800 text-lg mb-1">SkillsMatch</h3>
                        <p class="text-sm text-slate-600">Assess your current <strong>${sectorName}</strong> skills, identify gaps, and get a readiness score.</p>
                    </button>

                    <button onclick="openSkillsView('pp-practice')" class="p-6 bg-indigo-50 border border-indigo-100 rounded-xl hover:border-indigo-300 hover:bg-white hover:shadow-md text-left transition-all group">
                        <div class="p-3 bg-indigo-100 text-indigo-600 rounded-lg w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><i data-lucide="map" class="w-6 h-6"></i></div>
                        <h3 class="font-bold text-slate-800 text-lg mb-1">Pathway Builder</h3>
                        <p class="text-sm text-slate-600">Create a personalized step-by-step learning roadmap for <strong>${sectorName}</strong> roles.</p>
                    </button>

                    <button onclick="openSkillsView('pp-launchpad')" class="p-6 bg-orange-50 border border-orange-100 rounded-xl hover:border-orange-300 hover:bg-white hover:shadow-md text-left transition-all group">
                        <div class="p-3 bg-orange-100 text-orange-600 rounded-lg w-fit mb-4 group-hover:bg-orange-600 group-hover:text-white transition-colors"><i data-lucide="rocket" class="w-6 h-6"></i></div>
                        <h3 class="font-bold text-slate-800 text-lg mb-1">Founder's Launchpad</h3>
                        <p class="text-sm text-slate-600">Access incubators, funding sources, and playbooks to start your <strong>${sectorName}</strong> venture.</p>
                    </button>

                    <button onclick="openSkillsView('pp-finance')" class="p-6 bg-purple-50 border border-purple-100 rounded-xl hover:border-purple-300 hover:bg-white hover:shadow-md text-left transition-all group">
                        <div class="p-3 bg-purple-100 text-purple-600 rounded-lg w-fit mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors"><i data-lucide="banknote" class="w-6 h-6"></i></div>
                        <h3 class="font-bold text-slate-800 text-lg mb-1">Financial Aid</h3>
                        <p class="text-sm text-slate-600">Find scholarships, loans, and grants for your <strong>${sectorName}</strong> education.</p>
                    </button>

                    <button onclick="openSkillsView('pp-courses')" class="p-6 bg-blue-50 border border-blue-100 rounded-xl hover:border-blue-300 hover:bg-white hover:shadow-md text-left transition-all group">
                        <div class="p-3 bg-blue-100 text-blue-600 rounded-lg w-fit mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors"><i data-lucide="search" class="w-6 h-6"></i></div>
                        <h3 class="font-bold text-slate-800 text-lg mb-1">Find Courses</h3>
                        <p class="text-sm text-slate-600">Search verified <strong>${sectorName}</strong> training providers and certifications.</p>
                    </button>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.openSkillsView = function(viewId, preserveState = false) {
            // Hide dashboard
            const dashboard = document.getElementById('skills-hub-home');
            if(dashboard) dashboard.classList.add('hidden');
            
            // Hide all views
            document.querySelectorAll('.pp-view-content').forEach(el => el.classList.add('hidden'));
            
            // Show target view
            const target = document.getElementById(viewId);
            if(target) {
                target.classList.remove('hidden');
                
                // Inject Back Button if not present
                let nav = target.querySelector('.pp-back-nav');
                if(!nav) {
                    nav = document.createElement('div');
                    nav.className = 'pp-back-nav mb-4';
                    target.insertBefore(nav, target.firstChild);
                }
                nav.innerHTML = `<button onclick="renderSkillsHubDashboard()" class="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 font-medium"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>`;
                
                // Trigger specific render logic if needed
                if(viewId === 'pp-diagnostic') {
                    if (!preserveState) renderPATHWAYContent();
                } else if (viewId === 'pp-practice') {
                     if (!preserveState) initPathwayWizard();
                } else if (viewId === 'pp-courses') {
                    renderProviderTable();
                } else if (viewId === 'pp-launchpad') {
                    renderLaunchpadTab();
                } else if (viewId === 'pp-finance') {
                    renderUnifiedFinancialAid();
                }
                
                // Scroll to top
                const container = document.getElementById('pp-scroll-container');
                if(container) container.scrollTop = 0;

                if(window.lucide) lucide.createIcons();
            }
        }

        window.openVentureLaunchpad = function(ventureTitle) {
            // Close Venture Modal
            closeModal('venture-modal');
            
            // Open Unified Hub -> Founder's Launchpad Tab
            openUnifiedHub('pp-launchpad', null, null);
            // Ensure specific venture is rendered after opening
            setTimeout(() => {
                if(typeof renderVentureLaunchpad === 'function') renderVentureLaunchpad(ventureTitle);
            }, 100);
        }

        // --- NEW: Submit Practice Task Logic (Updated to accept badge name) ---
        window.submitPracticeTask = function(badgeName) {
            const container = document.getElementById('pp-practice-content');
            const awardedBadge = badgeName || "Verified Competency Badge";
            
            // Show loading state
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <div>
                        <h3 class="font-bold text-slate-800">AI Analysis in Progress...</h3>
                        <p class="text-xs text-slate-500">Checking against sector benchmarks</p>
                    </div>
                </div>
            `;
            
            // Mock delay then result
            setTimeout(() => {
                const themeConfig = (typeof sectorThemes !== 'undefined') ? sectorThemes[activeSectorId] : { color: 'indigo', feedback: "Great work." };
                const themeColor = themeConfig.color;
                const feedbackText = themeConfig.feedback;

                container.innerHTML = `
                    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden animate-fade-in">
                        <div class="bg-gradient-to-r from-${themeColor}-500 to-${themeColor}-600 p-6 text-white text-center">
                            <div class="text-3xl font-bold mb-1">92%</div>
                            <div class="text-xs font-medium opacity-90 uppercase tracking-wide">Technical Accuracy</div>
                        </div>
                        <div class="p-6 space-y-4">
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i> AI Feedback</h4>
                                <p class="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded border border-slate-100">${feedbackText}</p>
                            </div>
                            <div class="grid grid-cols-2 gap-3 text-xs">
                                <div class="bg-slate-50 p-2 rounded text-center"><span class="block font-bold text-slate-800">Completeness</span><span class="text-emerald-600">High</span></div>
                                <div class="bg-slate-50 p-2 rounded text-center"><span class="block font-bold text-slate-800">Relevance</span><span class="text-emerald-600">Spot On</span></div>
                            </div>
                        <button class="w-full py-2 bg-slate-900 text-white font-bold rounded-lg text-sm hover:bg-slate-800 transition-colors shadow-sm">
                                View '${awardedBadge}'
                            </button>
                        </div>
                    </div>
                `;
                if(window.lucide) lucide.createIcons();
            }, 1500);
        }

        // --- NEW: View Certificate Logic ---
        window.viewCertificate = function(badgeName) {
            const modal = document.getElementById('certificate-modal');
            const panel = document.getElementById('certificate-modal-panel');
            
            // Set dynamic content
            document.getElementById('cert-skill').innerText = badgeName || "Data Science Associate";
            document.getElementById('cert-date').innerText = new Date().toLocaleDateString();
            document.getElementById('cert-sector').innerText = activeSectorId === 'agri' ? 'Agritech' : activeSectorId === 'energy' ? 'Renewable Energy' : 'Digital Economy';

            document.body.classList.add('overflow-hidden');
            modal.classList.remove('hidden');
            setTimeout(() => { 
                panel.classList.remove('scale-95', 'opacity-0'); 
                panel.classList.add('scale-100', 'opacity-100'); 
            }, 10);
        }

        // --- NEW: Interview Prep Logic ---
        window.showInterviewPrep = function() {
            const container = document.getElementById('career-hub-content');
            const sector = activeSectorId;
            
            const question = (typeof interviewQuestions !== 'undefined' && interviewQuestions[sector]) ? interviewQuestions[sector] : "Tell me about yourself and your experience.";

            container.innerHTML = `
                <div class="animate-fade-in flex flex-col h-full">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 shrink-0"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                    
                    <div class="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                        <div class="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-2 animate-pulse">
                            <i data-lucide="mic" class="w-8 h-8"></i>
                        </div>
                        
                        <div class="space-y-2">
                            <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wide">AI Interview Coach</span>
                            <h3 class="text-xl font-bold text-slate-900 leading-snug">"${question}"</h3>
                            <p class="text-xs text-slate-500">Speak clearly. The AI is listening for keywords and tone.</p>
                        </div>

                        <!-- Mock Recording Interface -->
                        <div class="w-full max-w-xs space-y-3" id="interview-controls">
                            <button onclick="simulateInterviewResponse()" class="w-full py-3 bg-rose-600 text-white font-bold rounded-xl shadow-lg hover:bg-rose-700 transition-all flex items-center justify-center gap-2">
                                <span class="w-2 h-2 bg-white rounded-full animate-ping"></span> Start Recording Answer
                            </button>
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.simulateInterviewResponse = function() {
            const controls = document.getElementById('interview-controls');
            controls.innerHTML = `<div class="text-sm font-medium text-slate-600 animate-pulse">Processing your answer...</div>`;
            
            // Randomized Feedback for Demo Realism
            const feedbacks = [
                { score: "8/10", strength: "Good structure (STAR method).", improve: "Quantify your impact (e.g., 'improved by 20%')." },
                { score: "7/10", strength: "Clear articulation and tone.", improve: "Try to relate your answer back to the company's mission." },
                { score: "9/10", strength: "Excellent technical depth.", improve: "Keep the answer slightly more concise." }
            ];
            const fb = feedbacks[Math.floor(Math.random() * feedbacks.length)];
            
            setTimeout(() => {
                const container = document.getElementById('career-hub-content');
                container.innerHTML = `
                    <div class="animate-fade-in space-y-4">
                        <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
                        
                        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                            <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="bar-chart" class="w-5 h-5 text-indigo-500"></i> Feedback Report</h3>
                            
                            <div class="space-y-4">
                                <div>
                                    <div class="flex justify-between text-xs font-bold text-slate-600 mb-1"><span>Confidence Score</span><span>${fb.score}</span></div>
                                    <div class="w-full bg-slate-100 rounded-full h-2"><div class="bg-emerald-500 h-2 rounded-full" style="width: ${parseInt(fb.score)*10}%"></div></div>
                                </div>
                                
                                <div class="bg-indigo-50 p-3 rounded-lg">
                                    <div class="text-xs font-bold text-indigo-800 mb-1">Key Strengths</div>
                                    <p class="text-xs text-indigo-700">${fb.strength}</p>
                                </div>

                                <div class="bg-orange-50 p-3 rounded-lg">
                                    <div class="text-xs font-bold text-orange-800 mb-1">To Improve</div>
                                    <p class="text-xs text-orange-700">${fb.improve}</p>
                                </div>
                            </div>
                            
                            <div class="flex gap-2 mt-4">
                                <button onclick="showInterviewPrep()" class="flex-1 py-2 border border-slate-200 text-slate-700 font-bold rounded-lg text-xs hover:bg-slate-50">Try Another</button>
                                <button onclick="renderInterviewRubric()" class="flex-1 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold rounded-lg text-xs hover:bg-indigo-100 flex items-center justify-center gap-1"><i data-lucide="clipboard-list" class="w-3 h-3"></i> Open Rubric</button>
                            </div>
                        </div>
                    </div>
                `;
                if(window.lucide) lucide.createIcons();
            }, 2000);
        }

        // --- NEW: Interview Rubric Logic ---
        window.renderInterviewRubric = function() {
            const container = document.getElementById('career-hub-content');
            
            container.innerHTML = `
                <div class="animate-fade-in space-y-4">
                    <button onclick="simulateInterviewResponse()" class="mb-2 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Results</button>
                    
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg">Interview Scoring Rubric</h3>
                                <p class="text-xs text-slate-500">Rate the candidate's response based on key competencies.</p>
                            </div>
                            <div class="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><i data-lucide="clipboard-check" class="w-5 h-5"></i></div>
                        </div>

                        <form id="rubric-form" class="space-y-5">
                            <!-- Professionalism -->
                            <div>
                                <div class="flex justify-between mb-1">
                                    <label class="text-xs font-bold text-slate-700 uppercase">Professionalism & Poise</label>
                                    <span class="text-xs font-bold text-indigo-600" id="score-prof">3/5</span>
                                </div>
                                <input type="range" min="1" max="5" value="3" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" oninput="document.getElementById('score-prof').innerText = this.value + '/5'; updateRubricTotal();">
                                <div class="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>Unprepared</span>
                                    <span>Polished</span>
                                </div>
                            </div>

                            <!-- Communication -->
                            <div>
                                <div class="flex justify-between mb-1">
                                    <label class="text-xs font-bold text-slate-700 uppercase">Communication Clarity</label>
                                    <span class="text-xs font-bold text-indigo-600" id="score-comm">3/5</span>
                                </div>
                                <input type="range" min="1" max="5" value="3" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" oninput="document.getElementById('score-comm').innerText = this.value + '/5'; updateRubricTotal();">
                                <div class="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>Vague/Rambling</span>
                                    <span>Clear/Concise</span>
                                </div>
                            </div>

                            <!-- STAR Method -->
                            <div>
                                <div class="flex justify-between mb-1">
                                    <label class="text-xs font-bold text-slate-700 uppercase">STAR Method Usage</label>
                                    <span class="text-xs font-bold text-indigo-600" id="score-star">3/5</span>
                                </div>
                                <input type="range" min="1" max="5" value="3" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" oninput="document.getElementById('score-star').innerText = this.value + '/5'; updateRubricTotal();">
                                <div class="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>No Structure</span>
                                    <span>Situation-Task-Action-Result</span>
                                </div>
                            </div>

                            <!-- Technical Depth -->
                            <div>
                                <div class="flex justify-between mb-1">
                                    <label class="text-xs font-bold text-slate-700 uppercase">Technical Depth</label>
                                    <span class="text-xs font-bold text-indigo-600" id="score-tech">3/5</span>
                                </div>
                                <input type="range" min="1" max="5" value="3" class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" oninput="document.getElementById('score-tech').innerText = this.value + '/5'; updateRubricTotal();">
                                <div class="flex justify-between text-[10px] text-slate-400 mt-1">
                                    <span>Superficial</span>
                                    <span>Expert</span>
                                </div>
                            </div>
                        </form>

                        <div class="mt-6 pt-4 border-t border-slate-100">
                            <div class="flex justify-between items-center mb-4">
                                <span class="text-sm font-bold text-slate-600">Total Score</span>
                                <span class="text-2xl font-bold text-indigo-600" id="total-score">12/20</span>
                            </div>
                            <button onclick="saveRubricScore()" class="w-full py-3 bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                                <i data-lucide="save" class="w-4 h-4"></i> Save Assessment
                            </button>
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.updateRubricTotal = function() {
            const inputs = document.querySelectorAll('#rubric-form input[type="range"]');
            let total = 0;
            inputs.forEach(i => total += parseInt(i.value));
            document.getElementById('total-score').innerText = total + "/20";
        }

        window.saveRubricScore = function() {
            alert("Assessment saved to candidate profile!");
            showInterviewPrep();
        }
        
        window.openEvidenceModal = function() {
            const modal = document.getElementById('evidence-modal');
            const panel = document.getElementById('evidence-modal-panel');
            
            document.body.classList.add('overflow-hidden');
            const contentContainer = panel.querySelector('.flex-1'); 
            
            contentContainer.innerHTML = `
                <div class="space-y-6">
                    <div>
                        <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3">Labour Market & Employment</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <a href="https://ilostat.ilo.org" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">1) ILOSTAT <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Global reference for comparable labour indicators.</div>
                            </a>
                            <a href="https://www.eac.int" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">2) EAC Secretariat <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Regional labour policy & Manpower Survey.</div>
                            </a>
                            <a href="https://labourmarket.go.ke" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">3a) Kenya KLMIS <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">National vacancy signals & skills guidance.</div>
                            </a>
                             <a href="https://lmis.gov.rw" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">3b) Rwanda LMIS <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Public dashboards & Labour Force Surveys.</div>
                            </a>
                             <a href="https://jobs.kazi.go.tz" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">3c) Tanzania LMIS <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">National employment portal.</div>
                            </a>
                             <a href="https://mglsd.go.ug" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">3d) Uganda MoGLSD <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Ministry of Gender, Labour & Social Development.</div>
                            </a>
                            <a href="https://unevoc.unesco.org/home/Global+Skills+Tracker" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">4) UNESCO Global Skills Tracker <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Labour market insights on skills demand.</div>
                            </a>
                            <a href="https://economicgraph.linkedin.com/workforce-data?selectedFilter=view-all%2Fby-year" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">5) LinkedIn Economic Graph <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Interactive workforce trends & skills insights.</div>
                            </a>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3">Investment & Market Outlooks</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <a href="https://unctadstat.unctad.org" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">6) UNCTADstat <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">FDI flows/stocks & cross-country comparability.</div>
                            </a>
                            <a href="https://data.worldbank.org" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">7) World Bank Data <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Harmonized macro indicators.</div>
                            </a>
                            <a href="https://www.afdb.org/en/documents/east-africa-economic-outlook-2023" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">8) AfDB Outlooks <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Regional economic & sector narratives.</div>
                            </a>
                             <a href="https://www.avca-africa.org" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">9) AVCA <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Venture capital & private equity data.</div>
                            </a>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3">Continental Frameworks</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <a href="https://edu-au.org/cesa" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">CESA 16-25 / 26-35 <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Continental Education Strategy for Africa.</div>
                            </a>
                            <a href="https://acqf.africa/" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">ACQF <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">African Continental Qualifications Framework.</div>
                            </a>
                            <a href="https://au.int/en/education/tvet" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">Continental TVET Strategy <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                                <div class="text-xs text-slate-500 mt-1">Strategy to revitalize TVET in Africa (2025-34).</div>
                            </a>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-2 mb-3">Sector Specific Sources</h3>
                        <div class="space-y-3">
                            <!-- Agri -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <a href="https://www.fao.org/faostat" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-green-50 hover:border-green-200 transition-colors bg-white group">
                                    <div class="p-2 bg-green-100 text-green-700 rounded shrink-0"><i data-lucide="leaf" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-green-800">10) FAOSTAT (Agritech)</div>
                                        <div class="text-xs text-slate-500">Employment indicators.</div>
                                    </div>
                                </a>
                                <a href="https://agfundernews.com/" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-green-50 hover:border-green-200 transition-colors bg-white group">
                                    <div class="p-2 bg-green-100 text-green-700 rounded shrink-0"><i data-lucide="leaf" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-green-800">11) AgFunder News</div>
                                        <div class="text-xs text-slate-500">AgriFoodTech investment.</div>
                                    </div>
                                </a>
                            </div>

                            <!-- Energy -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <a href="https://www.irena.org/Data" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-yellow-50 hover:border-yellow-200 transition-colors bg-white group">
                                    <div class="p-2 bg-yellow-100 text-yellow-700 rounded shrink-0"><i data-lucide="sun" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-yellow-800">12) IRENA</div>
                                        <div class="text-xs text-slate-500">Renewable jobs & capacity.</div>
                                    </div>
                                </a>
                                 <a href="https://www.iea.org/reports/africa-energy-outlook-2022" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-yellow-50 hover:border-yellow-200 transition-colors bg-white group">
                                    <div class="p-2 bg-yellow-100 text-yellow-700 rounded shrink-0"><i data-lucide="zap" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-yellow-800">13) IEA Outlook</div>
                                        <div class="text-xs text-slate-500">Investment needs.</div>
                                    </div>
                                </a>
                                <a href="https://www.seforall.org" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-yellow-50 hover:border-yellow-200 transition-colors bg-white group">
                                    <div class="p-2 bg-yellow-100 text-yellow-700 rounded shrink-0"><i data-lucide="flame" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-yellow-800">14) SEforALL</div>
                                        <div class="text-xs text-slate-500">Tracking SDG7.</div>
                                    </div>
                                </a>
                                <a href="https://www.gogla.org/resources" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-yellow-50 hover:border-yellow-200 transition-colors bg-white group">
                                    <div class="p-2 bg-yellow-100 text-yellow-700 rounded shrink-0"><i data-lucide="battery-charging" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-yellow-800">15) GOGLA</div>
                                        <div class="text-xs text-slate-500">Off-grid solar market data.</div>
                                    </div>
                                </a>
                            </div>

                            <!-- Digital -->
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <a href="https://datahub.itu.int" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors bg-white group">
                                    <div class="p-2 bg-blue-100 text-blue-700 rounded shrink-0"><i data-lucide="cpu" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-blue-800">16) ITU DataHub</div>
                                        <div class="text-xs text-slate-500">Core ICT indicators.</div>
                                    </div>
                                </a>
                                <a href="https://www.gsma.com/mobileeconomy/sub-saharan-africa/" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors bg-white group">
                                    <div class="p-2 bg-blue-100 text-blue-700 rounded shrink-0"><i data-lucide="smartphone" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-blue-800">17) GSMA Mobile</div>
                                        <div class="text-xs text-slate-500">Mobile economy context.</div>
                                    </div>
                                </a>
                                <a href="https://partechpartners.com/africa-reports/" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors bg-white group">
                                    <div class="p-2 bg-blue-100 text-blue-700 rounded shrink-0"><i data-lucide="trending-up" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-blue-800">18) Partech Africa</div>
                                        <div class="text-xs text-slate-500">Tech investment reports.</div>
                                    </div>
                                </a>
                                <a href="https://disrupt-africa.com/" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors bg-white group">
                                    <div class="p-2 bg-blue-100 text-blue-700 rounded shrink-0"><i data-lucide="newspaper" class="w-4 h-4"></i></div>
                                    <div>
                                        <div class="font-bold text-sm text-slate-800 group-hover:text-blue-800">19) Disrupt Africa</div>
                                        <div class="text-xs text-slate-500">Startup news & stats.</div>
                                    </div>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div class="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        <div class="font-bold text-sm text-indigo-900 mb-1">17) Business Environment Constraints</div>
                        <p class="text-xs text-indigo-700 mb-2">For evidence on skills gaps, finance access, and infrastructure bottlenecks.</p>
                        <a href="https://www.enterprisesurveys.org" target="_blank" class="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                            View World Bank Enterprise Surveys <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                    </div>
                </div>
            `;
            
            modal.classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
            setTimeout(() => { 
                if(panel) {
                    panel.classList.remove('scale-95', 'opacity-0'); 
                    panel.classList.add('scale-100', 'opacity-100'); 
                }
            }, 10);
        }

window.toggleTrainingHub = function() {
    // Close Unified Hub if open
    const unifiedDrawer = document.getElementById('unified-hub-modal');
    if (unifiedDrawer && !unifiedDrawer.classList.contains('translate-x-full')) {
        unifiedDrawer.classList.add('translate-x-full');
    }

    // 1. Close the other drawer if it is open
    const careerDrawer = document.getElementById('career-hub-drawer');
    if (!careerDrawer.classList.contains('translate-x-full')) {
        careerDrawer.classList.add('translate-x-full');
    }

    // 2. Toggle this drawer (Remove class to show, Add class to hide)
    const drawer = document.getElementById('training-hub-drawer');
    drawer.classList.toggle('translate-x-full');

    if (!drawer.classList.contains('translate-x-full')) {
        resetTrainingHub();
    }
    if(window.lucide) lucide.createIcons();
}

window.resetTrainingHub = function() {
    const container = document.getElementById('training-hub-content');
    if(!container) return;

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Filters -->
            <div class="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[10px] font-bold text-emerald-900 mb-1">Location</label>
                    <select onchange="setGlobalCountry(this.value); resetTrainingHub();" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
                        <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>Regional</option>
                        <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                        <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                        <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                        <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                        <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                        <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                        <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DR Congo</option>
                        <option value="Somalia" ${activeCountry === 'Somalia' ? 'selected' : ''}>Somalia</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-emerald-900 mb-1">Sector</label>
                    <select onchange="setGlobalSector(this.value); resetTrainingHub();" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
                        <option value="agri" ${activeSectorId === 'agri' ? 'selected' : ''}>Agritech</option>
                        <option value="energy" ${activeSectorId === 'energy' ? 'selected' : ''}>Renewable Energy</option>
                        <option value="digital" ${activeSectorId === 'digital' ? 'selected' : ''}>Digital Economy</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <button onclick="showTrainingHubView('find')" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                    <div class="p-2 bg-emerald-100 text-emerald-600 rounded-lg w-fit mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><i data-lucide="search" class="w-5 h-5"></i></div>
                    <h4 class="font-bold text-slate-800 text-sm">Find Courses</h4>
                    <p class="text-xs text-slate-500 mt-1">Search Database</p>
                </button>

                <button onclick="showTrainingHubView('featured')" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                    <div class="p-2 bg-blue-100 text-blue-600 rounded-lg w-fit mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors"><i data-lucide="star" class="w-5 h-5"></i></div>
                    <h4 class="font-bold text-slate-800 text-sm">Featured Providers</h4>
                    <p class="text-xs text-slate-500 mt-1">Top Rated</p>
                </button>

                <button onclick="showTrainingHubView('impact')" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-orange-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                    <div class="p-2 bg-orange-100 text-orange-600 rounded-lg w-fit mb-3 group-hover:bg-orange-600 group-hover:text-white transition-colors"><i data-lucide="bar-chart-2" class="w-5 h-5"></i></div>
                    <h4 class="font-bold text-slate-800 text-sm">Impact Evidence</h4>
                    <p class="text-xs text-slate-500 mt-1">Outcomes Data</p>
                </button>

                <button onclick="showTrainingHubView('finance')" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-purple-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                    <div class="p-2 bg-purple-100 text-purple-600 rounded-lg w-fit mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors"><i data-lucide="banknote" class="w-5 h-5"></i></div>
                    <h4 class="font-bold text-slate-800 text-sm">Financial Aid</h4>
                    <p class="text-xs text-slate-500 mt-1">Scholarships</p>
                </button>
            </div>
        </div>
    `;
    if(window.lucide) lucide.createIcons();
}

        // --- NEW: Reset Training Hub Filters ---
        window.resetTrainingHubFilters = function() {
            const inputs = ['drawer-hub-country', 'drawer-hub-language', 'drawer-hub-sector', 'drawer-hub-mode-quick', 'drawer-hub-course-type', 'drawer-hub-budget'];
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = 'all';
            });
            renderTrainingHubCourses();
        }

window.showTrainingHubView = function(view) {
    const container = document.getElementById('training-hub-content');
    let content = '';
    
    if (view === 'find') {
        content = `
            <!-- Featured Course Banner -->
            <div class="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-xl p-4 text-white shadow-md relative overflow-hidden flex items-center justify-between group cursor-pointer mb-4" onclick="window.open('https://www.alxafrica.com/ai-career-essentials/', '_blank')">
                <div class="relative z-10">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="bg-yellow-400 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">New & Featured</span>
                    </div>
                    <h3 class="font-bold text-lg leading-tight mb-1">ALX AI Career Essentials</h3>
                    <p class="text-xs text-slate-300 max-w-sm">Master AI tools to boost your productivity. 6 weeks, fully sponsored.</p>
                </div>
                <div class="relative z-10 bg-white/10 p-2 rounded-full group-hover:bg-white/20 transition-colors">
                    <i data-lucide="arrow-right" class="w-5 h-5 text-white"></i>
                </div>
                <div class="absolute right-0 top-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3"><i data-lucide="filter" class="w-4 h-4 text-indigo-500"></i> Filter Training</h3>
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2"><i data-lucide="filter" class="w-4 h-4 text-indigo-500"></i> Filter Training</h3>
                            <button onclick="resetTrainingHubFilters()" class="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> Reset Filters</button>
                        </div>
                <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label for="drawer-hub-country" class="block text-xs font-medium text-slate-600 mb-1">Country</label>
                            <select id="drawer-hub-country" onchange="setGlobalCountry(this.value); renderTrainingHubCourses();" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>East Africa (All)</option>
                                <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                                <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                                <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                                <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                                <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                                <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                                <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DRC</option>
                            </select>
                        </div>
                        <div>
                            <label for="drawer-hub-language" class="block text-xs font-medium text-slate-600 mb-1">Language</label>
                            <select id="drawer-hub-language" onchange="renderTrainingHubCourses()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="all">Language (All)</option>
                                <option value="Kiswahili">Kiswahili</option>
                                <option value="English">English</option>
                                <option value="French">French</option>
                            </select>
                        </div>
                        <div>
                            <label for="drawer-hub-sector" class="block text-xs font-medium text-slate-600 mb-1">Sector</label>
                            <select id="drawer-hub-sector" onchange="renderTrainingHubCourses()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="agri" ${activeSectorId === 'agri' ? 'selected' : ''}>Agritech</option>
                                <option value="energy" ${activeSectorId === 'energy' ? 'selected' : ''}>Renewable Energies</option>
                                <option value="digital" ${activeSectorId === 'digital' ? 'selected' : ''}>Digital Economies / AI</option>
                            </select>
                        </div>
                        <div>
                            <label for="drawer-hub-mode-quick" class="block text-xs font-medium text-slate-600 mb-1">Learning Mode</label>
                            <select id="drawer-hub-mode-quick" onchange="renderTrainingHubCourses()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="all">Any Mode</option>
                                <option value="online">Online</option>
                                <option value="in-person">In-Person</option>
                                <option value="hybrid">Hybrid</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="pt-2">
                    <button onclick="toggleMoreFilters()" id="more-filters-btn" class="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                        <i data-lucide="plus-circle" class="w-3 h-3"></i> More Filters
                    </button>
                </div>
                <div id="advanced-filters" class="hidden pt-4 mt-4 border-t border-slate-200 space-y-3">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label for="drawer-hub-course-type" class="block text-xs font-medium text-slate-600 mb-1">Course Type</label>
                            <select id="drawer-hub-course-type" onchange="renderTrainingHubCourses()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="all">Any Type</option>
                                <option value="certificate">Certificates</option>
                                <option value="micro-credential">Micro-credentials</option>
                                <option value="tvet">TVET courses</option>
                                <option value="university">University courses</option>
                                <option value="bootcamp">Bootcamps</option>
                            </select>
                        </div>
                        <div>
                            <label for="drawer-hub-budget" class="block text-xs font-medium text-slate-600 mb-1">Budget Band</label>
                            <select id="drawer-hub-budget" onchange="renderTrainingHubCourses()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500">
                                <option value="all">Any Cost</option>
                                <option value="low">Low Cost / Free</option>
                                <option value="medium">Medium Cost</option>
                                <option value="high">High Cost</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div id="training-hub-results" class="space-y-4"></div>
        `;
    } else if (view === 'featured') {
        content = `
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div class="p-4 border-b border-slate-200 bg-slate-50">
                    <h3 class="font-bold text-slate-800 text-sm mb-2">Top Rated Providers</h3>
                    <p class="text-xs text-slate-500">Providers with independently verified outcome data.</p>
                </div>
                <div id="training-hub-results" class="space-y-4 p-4"></div>
            </div>
        `;
    } else if (view === 'impact') {
        content = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div class="text-slate-500 text-[10px] uppercase font-bold mb-1">Graduates Tracked</div>
                    <div class="text-xl font-bold text-slate-800">23,700+</div>
                    <div class="text-[10px] text-slate-400">Verified Outcomes</div>
                </div>
                <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div class="text-slate-500 text-[10px] uppercase font-bold mb-1">Max Salary Uplift</div>
                    <div class="text-xl font-bold text-green-600">+140%</div>
                    <div class="text-[10px] text-slate-400">Digital Sector</div>
                </div>
            </div>
            <div class="space-y-4">
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="font-bold text-xs text-slate-700 mb-2">Salary Progression (Digital Sector)</h3>
                    <div class="heavy-chart h-48 w-full relative">
                        <canvas id="drawer-salaryChart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h3 class="font-bold text-xs text-slate-700 mb-2">Time to Full-Time Employment</h3>
                    <div class="heavy-chart h-48 w-full relative flex justify-center">
                        <canvas id="drawer-timeChart"></canvas>
                    </div>
                </div>
            </div>
        `;
    } else if (view === 'finance') {
        content = `
            <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex items-start gap-3">
                <div class="p-2 bg-indigo-100 text-indigo-600 rounded-lg shrink-0"><i data-lucide="banknote" class="w-5 h-5"></i></div>
                <div>
                    <h3 class="font-bold text-indigo-900 text-sm">Scholarships & Loans</h3>
                    <p class="text-xs text-indigo-700 mt-1">Find financial support for your education across East Africa.</p>
                </div>
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
                <select id="finance-filter-country" onchange="renderFinancialAid()" class="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-2 focus:ring-indigo-500">
                    <option value="all">All Countries</option>
                    <option value="Kenya">Kenya</option>
                    <option value="Tanzania">Tanzania</option>
                    <option value="Uganda">Uganda</option>
                    <option value="Rwanda">Rwanda</option>
                    <option value="Regional">Regional</option>
                </select>
                <select id="finance-filter-type" onchange="renderFinancialAid()" class="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-2 focus:ring-indigo-500">
                    <option value="all">All Types</option>
                    <option value="Scholarship">Scholarship</option>
                    <option value="Loan">Loan</option>
                    <option value="Grant">Grant</option>
                </select>
            </div>
            <div id="financial-aid-list" class="space-y-3"></div>
        `;
    }

    container.innerHTML = `
        <div class="animate-fade-in space-y-4">
            <button onclick="resetTrainingHub()" class="mb-2 flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
            ${content}
        </div>
    `;
    
    if (view === 'find') renderTrainingHubCourses();
    if (view === 'featured') {
        // Reuse renderTrainingHubCourses but force high quality filter if possible, or just render all for now as per previous logic
        renderTrainingHubCourses(); 
    }
    if (view === 'impact') initImpactCharts();
    if (view === 'finance') renderFinancialAid();
    
    if(window.lucide) lucide.createIcons();
}
window.toggleCareerHub = function() {
    // Close Unified Hub if open
    const unifiedDrawer = document.getElementById('unified-hub-modal');
    if (unifiedDrawer && !unifiedDrawer.classList.contains('translate-x-full')) {
        unifiedDrawer.classList.add('translate-x-full');
    }

    // 1. Close the other drawer if it is open
    const trainingDrawer = document.getElementById('training-hub-drawer');
    if (!trainingDrawer.classList.contains('translate-x-full')) {
        trainingDrawer.classList.add('translate-x-full');
    }
    
    // Close community drawer if open
    const communityDrawer = document.getElementById('community-hub-drawer');
    if (communityDrawer && !communityDrawer.classList.contains('translate-x-full')) {
        communityDrawer.classList.add('translate-x-full');
    }

    // 2. Toggle this drawer
    const drawer = document.getElementById('career-hub-drawer');
    drawer.classList.toggle('translate-x-full');

    // 3. Run existing logic
    resetCareerHub(); 
}
        window.openSkillModal = function(skillName) {
            const modal = document.getElementById('skill-modal');
            const panel = document.getElementById('skill-modal-panel');
            const sectorName = activeSectorId === 'agri' ? 'Agritech' : activeSectorId === 'energy' ? 'Renewable Energies' : 'Digital Economies / AI';
            
            const data = getMasterTrainingCatalogue(skillName, activeSectorId, activeCountry);
            currentSkillData = data;
            currentSkillName = skillName;

            // --- NEW: Narrative Lookup ---
            let narrativeText = "";
            const dynamicSkills = dataManager.getSkills(activeSectorId);
            const dynamicSkill = dynamicSkills ? dynamicSkills.find(s => s.name === skillName) : null;

            if (dynamicSkill && dynamicSkill.narrative) {
                narrativeText = dynamicSkill.narrative;
            } else {
                const sectorDetails = baseSectorDetailData[activeSectorId];
                const skillObj = sectorDetails.skills.find(s => s.name === skillName);
                narrativeText = skillObj ? skillObj.narrative : `The ability to apply ${skillName} effectively within the context of ${sectorName}. Mastery of this skill allows for improved operational efficiency and is highly sought after by employers in the region.`;
            }

            document.body.classList.add('overflow-hidden');
            document.getElementById('skill-modal-title').innerText = skillName;
            document.getElementById('skill-def').innerText = narrativeText;

            const levels = (typeof skillLevelDescriptions !== 'undefined' && skillLevelDescriptions[activeSectorId] && skillLevelDescriptions[activeSectorId][skillName])
                ? skillLevelDescriptions[activeSectorId][skillName]
                : {
                    beg: "Basic tasks under supervision, such as tool identification or simple report generation.",
                    int: "Can solve routine problems independently, manage small projects, and optimize basic workflow processes.",
                    adv: "Expert in the domain. Capable of designing complex systems, leading teams, and mentoring intermediate staff."
                };

            document.getElementById('skill-lvl-beg').innerText = levels.beg;
            document.getElementById('skill-lvl-int').innerText = levels.int;
            document.getElementById('skill-lvl-adv').innerText = levels.adv;
            
            const roles = (typeof specificJobTitles !== 'undefined' && specificJobTitles[activeSectorId] && specificJobTitles[activeSectorId][skillName]) 
                ? specificJobTitles[activeSectorId][skillName] 
                : ["Specialist", "Analyst", "Technician", "Consultant"];

            // Split roles into primary and similar for display
            const primaryRoles = roles.slice(0, 2);
            const similarRoles = roles.slice(2);

            // --- NEW: Calculate Skill Synergies (Often Paired With) ---
            const synergies = {};
            if (typeof roleSkills !== 'undefined') {
                Object.values(roleSkills).forEach(role => {
                    if (role.technical.includes(skillName)) {
                        role.technical.forEach(s => {
                            if (s !== skillName) synergies[s] = (synergies[s] || 0) + 1;
                        });
                    }
                });
            }
            // Sort by frequency
            const sortedSynergies = Object.entries(synergies).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]);

            // Render Synergies Section
            if (sortedSynergies.length > 0) {
                document.getElementById('skill-synergies-section').classList.remove('hidden');
                document.getElementById('skill-synergies-list').innerHTML = sortedSynergies.map(s => `<button onclick="openSkillModal('${s}')" class="px-2 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm">${s}</button>`).join('');
            } else {
                document.getElementById('skill-synergies-section').classList.add('hidden');
            }

            document.getElementById('skill-roles-primary').innerHTML = primaryRoles.map(r => `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 text-xs font-medium">${r}</span>`).join('');
            document.getElementById('skill-roles-similar').innerHTML = similarRoles.map(r => `<span class="px-2 py-1 bg-slate-50 text-slate-600 rounded border border-slate-200 text-xs">${r}</span>`).join('');
            
            let defaultHotspotText = `High demand in major economic hubs like <strong>Nairobi, Kigali, and Dar es Salaam</strong>, particularly within the growing ${activeSectorId === 'agri' ? 'Agribusiness' : activeSectorId === 'energy' ? 'Renewable Energy' : 'ICT'} sector.`;
            
            if (activeCountry !== 'all') {
                 defaultHotspotText = `High demand in <strong>${activeCountry}</strong> and key regional hubs, particularly within the growing ${activeSectorId === 'agri' ? 'Agribusiness' : activeSectorId === 'energy' ? 'Renewable Energy' : 'ICT'} sector.`;
            }

            const hotspotText = (typeof skillHotspots !== 'undefined' && skillHotspots[activeSectorId] && skillHotspots[activeSectorId][skillName]) 
                ? skillHotspots[activeSectorId][skillName]
                : defaultHotspotText;

            // Replace Challenge Content
            document.getElementById('skill-challenge-container').innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="p-2 bg-emerald-50 text-emerald-600 rounded-lg shadow-sm shrink-0 border border-emerald-100">
                        <i data-lucide="map-pin" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-900 text-sm mb-1 uppercase tracking-wide">National and Regional Hotspots</h3>
                        <p class="text-sm text-slate-600 leading-relaxed">
                            ${hotspotText}
                        </p>
                    </div>
                </div>
            `;
            // Remove assessment result hidden block as it was part of challenge
            document.getElementById('assessment-result').classList.add('hidden');

            // --- NEW: Inject Dynamic CTAs ---
            const ctaContainer = document.getElementById('skill-cta-container');
            if(ctaContainer) {
                ctaContainer.innerHTML = `
                    <button onclick="openCoursesForSkill('${skillName.replace(/'/g, "\\'")}')" class="bg-white text-indigo-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors flex items-center gap-2 shadow-sm">
                    Find Courses <i data-lucide="search" class="w-3 h-3"></i>
                    </button>
                `;
            }

            modal.classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
            setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); panel.classList.add('scale-100', 'opacity-100'); }, 10);
        }

        window.openCoursesForSkill = function(skillName) {
            closeModal('skill-modal');
            
            // Reset filters to ensure search finds results globally
            const selects = document.querySelectorAll('#course-filters-grid select');
            selects.forEach(s => s.value = 'all');

            const searchInput = document.getElementById('filter-search');
            if(searchInput) {
                searchInput.value = skillName;
            }
            openUnifiedHub('pp-courses', null, null);
            // Force render to ensure filter is applied (handled by openSkillsView now)
            setTimeout(() => { renderProviderTable(); }, 150);
        }

        window.openResourceModal = function(category) {
            const modal = document.getElementById('resource-modal');
            const panel = document.getElementById('resource-modal-panel');
            document.getElementById('resource-modal-title').innerText = category;
            document.body.classList.add('overflow-hidden');
            
            let content = '';
            const sectorName = activeSectorId === 'agri' ? 'Agritech' : activeSectorId === 'energy' ? 'Renewable Energies' : 'Digital Economies';
            
            const selectedResources = (typeof signalResources !== 'undefined' && signalResources[activeSectorId]) ? signalResources[activeSectorId][category] : null;

            if (selectedResources) {
                 content = `
                    <div class="space-y-3">
                        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 mb-2">
                            Showing verifiable ${category.toLowerCase()} sources for the <strong>${sectorName}</strong> sector.
                        </div>
                        ${selectedResources.map(r => `
                            <a href="${r.link}" target="_blank" class="block p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors group">
                                <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex justify-between items-center">
                                    ${r.title} <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500"></i>
                                </div>
                                <div class="text-xs text-slate-500 mt-1">${r.desc}</div>
                            </a>
                        `).join('')}
                    </div>`;
            } else if (category.includes('Training')) {
                content = `
                    <div class="space-y-3">
                        <div class="p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer">
                            <div class="font-bold text-sm text-slate-800">Advanced ${sectorName} Management</div>
                            <div class="text-xs text-slate-500">Provider: Coursera Business • Free</div>
                        </div>
                        <div class="p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer">
                            <div class="font-bold text-sm text-slate-800">Entrepreneurship 101</div>
                            <div class="text-xs text-slate-500">Provider: ALX Ventures • 4 Weeks</div>
                        </div>
                    </div>`;
            } else if (category.includes('Incubator')) {
                 content = `
                    <div class="space-y-3">
                        <div class="p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer">
                            <div class="font-bold text-sm text-slate-800">Nairobi Innovation Hub</div>
                            <div class="text-xs text-slate-500">Focus: Early Stage Tech • Nairobi</div>
                        </div>
                        <div class="p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 cursor-pointer">
                            <div class="font-bold text-sm text-slate-800">Norrsken House Kigali</div>
                            <div class="text-xs text-slate-500">Focus: Impact Startups • Kigali</div>
                        </div>
                    </div>`;
            } else {
                 content = `
                    <div class="p-4 bg-slate-50 rounded text-sm text-slate-600">
                        Detailed resources for <strong>${category}</strong> in the ${sectorName} sector are being curated. Check back soon for updated listings.
                    </div>`;
            }
            
            document.getElementById('resource-modal-content').innerHTML = content;
            
            modal.classList.remove('hidden');
            setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); panel.classList.add('scale-100', 'opacity-100'); }, 10);
            if(window.lucide) lucide.createIcons();
        }

        window.updateTrainingProviders = function() {
            if (typeof countryData === 'undefined') return;
            const data = countryData[activeCountry] || countryData['all'];
            const providers = data.providers || [];
            const container = document.getElementById('training-providers-list');
            const label = document.getElementById('training-country-label');
            
            if(label) label.innerText = activeCountry === 'all' ? 'Region' : activeCountry;
            
            if(container) {
                if (providers.length === 0) {
                    container.innerHTML = `<div class="text-xs text-slate-500 italic p-2">No specific providers listed for ${activeCountry}.</div>`;
                } else {
                    container.innerHTML = providers.map((p, i) => `
                        <div class="p-3 border border-slate-200 rounded-lg flex items-center gap-3 bg-white hover:shadow-sm cursor-pointer">
                            <div class="w-10 h-10 bg-slate-100 text-slate-600 rounded flex items-center justify-center font-bold">${p.substring(0,2).toUpperCase()}</div>
                            <div class="flex-1">
                                <div class="text-sm font-bold text-slate-800">${p}</div>
                                <div class="text-xs text-slate-500">Top Rated in ${activeCountry === 'all' ? 'Region' : activeCountry}</div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }

        // --- NEW: Show Sector Tooltip ---
        window.showSectorTooltip = function(sector) {
            alert((typeof sectorTooltips !== 'undefined' && sectorTooltips[sector]) ? sectorTooltips[sector] : "Sector Metrics Overview");
        }

        // --- NEW: Toggle Grid Helper ---
        window.toggleGrid = function(id, btn, label) {
            const el = document.getElementById(id);
            if (el) {
                const isExpanded = el.classList.contains('max-h-[2000px]');
                if (isExpanded) {
                    el.classList.remove('max-h-[2000px]', 'opacity-100', 'mt-3');
                    el.classList.add('max-h-0', 'opacity-0');
                    btn.innerHTML = `View All ${label} <i data-lucide="chevron-down" class="w-3 h-3"></i>`;
                } else {
                    el.classList.remove('max-h-0', 'opacity-0');
                    el.classList.add('max-h-[2000px]', 'opacity-100', 'mt-3');
                    btn.innerHTML = `View Less ${label} <i data-lucide="chevron-up" class="w-3 h-3"></i>`;
                }
                if(window.lucide) lucide.createIcons();
            }
        }

        window.renderOccupationsView = function() {
            // Safety Check: Ensure base data exists for the active sector
            const baseData = (typeof baseSectorDetailData !== 'undefined' && baseSectorDetailData[activeSectorId]) 
                ? baseSectorDetailData[activeSectorId] 
                : (typeof baseSectorDetailData !== 'undefined' ? baseSectorDetailData['agri'] : null);

            if (!baseData) return; // Stop if data is completely missing

            const overrides = (typeof countryOverrides !== 'undefined' && countryOverrides[activeCountry] && countryOverrides[activeCountry][activeSectorId]) || {};
            
            const data = {
                growth: {
                    jobTrend: overrides.jobTrend || baseData.growth.jobTrend,
                    investment: overrides.investment || baseData.growth.investment,
                    skillsDemand: overrides.skillsDemand || baseData.growth.skillsDemand,
                    demandContext: overrides.demandContext || baseData.growth.demandContext
                },
                outlook: {
                    hiring: overrides.hiring || baseData.outlook.hiring,
                    hotspots: overrides.hotspots || baseData.outlook.hotspots,
                    entrepreneurship: baseData.outlook.entrepreneurship,
                    entrepreneurshipLevel: baseData.outlook.entrepreneurshipLevel,
                    mobility: baseData.outlook.mobility,
                    mobilityLevel: baseData.outlook.mobilityLevel,
                    source: overrides.source || baseData.outlook.source
                },
                // Use DataManager occupations if available, else fallback to baseData
                occupations: dataManager.getOccupations(activeSectorId) || baseData.occupations,
                // Use DataManager skills if available, else fallback to baseData
                skills: dataManager.getSkills(activeSectorId) || baseData.skills
            };

            const container = document.getElementById('sector-hub-results');
            if (!container) return;

            let demandColorClass = "text-slate-900";
            let demandBgClass = "bg-slate-50 text-slate-600";
            
            // --- UPDATED: Dynamic Card Styling Variables ---
            const themeConfig = (typeof sectorThemes !== 'undefined') ? sectorThemes[activeSectorId] : { color: 'indigo' };
            const themeColor = themeConfig.color;

            let cardTitleColor = `text-${themeColor}-800`;
            let cardDescColor = `text-${themeColor}-700`;
            let cardBgColor = "bg-white";
            let cardBorderColor = "border-slate-200";
            let cardHoverBg = `hover:bg-${themeColor}-50`;
            let cardHoverBorder = `hover:border-${themeColor}-200`;

            if (data.growth.skillsDemand === 'Growing' || data.growth.skillsDemand === 'High' || data.growth.skillsDemand === 'Critical') {
                demandColorClass = "text-emerald-600";
                demandBgClass = "bg-emerald-50 text-emerald-600";
            } else if (data.growth.skillsDemand === 'Stable') {
                demandColorClass = "text-amber-600";
                demandBgClass = "bg-amber-50 text-amber-600";
            } else if (data.growth.skillsDemand === 'Emerging') {
                demandColorClass = "text-indigo-600";
                demandBgClass = "bg-indigo-50 text-indigo-600";
            }

            // --- Filter Venture Data ---
            const sectorMap = { 'agri': 'Agriculture', 'energy': 'Renewables', 'digital': 'Digital/AI' };
            const targetSector = sectorMap[activeSectorId];
            const ventures = dataManager.getVentures(activeSectorId, activeCountry)
                .sort((a, b) => a.Rank - b.Rank)
                .slice(0, 10);

            // --- Split Data for View All ---
            const topOccs = data.occupations.slice(0, 4);
            const moreOccs = data.occupations.slice(4, 12);

            const topSkills = data.skills.slice(0, 4);
            const moreSkills = data.skills.slice(4, 10);

            const topVentures = ventures.slice(0, 4);
            const moreVentures = ventures.slice(4, 10);

            const ventureHtml = ventures.length > 0 ? `
                <div class="bg-white rounded-xl p-4 sm:p-6 border border-slate-200 shadow-sm">
                    <div class="mb-4">
                        <h3 class="text-base font-bold text-slate-800 flex items-center gap-2"><i data-lucide="rocket" class="w-4 h-4 text-slate-500"></i> Top 10 Entrepreneurship Opportunities</h3>
                        <p class="text-xs text-slate-500 mt-1">High-growth opportunities tailored to your region.</p>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        ${topVentures.map(v => `
                            <button onclick="openVentureModal('${v.Venture_Title.replace(/'/g, "\\'")}')" title="${v.Venture_Title}" class="px-3 py-2 bg-white border border-${themeColor}-200 rounded-lg text-left hover:bg-${themeColor}-100 hover:border-${themeColor}-300 transition-all group">
                                <div class="font-bold text-xs text-${themeColor}-800 mb-0.5 flex items-center gap-1 min-w-0">
                                    <span class="truncate">${v.Venture_Title}</span>
                                    <span title="High Demand" class="ml-0.5 shrink-0">🔥</span>
                                </div>
                                <div class="text-[10px] text-${themeColor}-700/80 leading-tight truncate">${v.Venture_Description}</div>
                            </button>
                        `).join('')}
                        <div id="more-ventures" class="col-span-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-hidden transition-all duration-500 ease-in-out max-h-0 opacity-0">
                            ${moreVentures.map(v => `
                                <button onclick="openVentureModal('${v.Venture_Title.replace(/'/g, "\\'")}')" title="${v.Venture_Title}" class="px-3 py-2 bg-white border border-${themeColor}-200 rounded-lg text-left hover:bg-${themeColor}-100 hover:border-${themeColor}-300 transition-all group">
                                    <div class="font-bold text-xs text-${themeColor}-800 mb-0.5 flex items-center gap-1 min-w-0">
                                        <span class="truncate">${v.Venture_Title}</span>
                                    </div>
                                    <div class="text-[10px] text-${themeColor}-700/80 leading-tight truncate">${v.Venture_Description}</div>
                                </button>
                            `).join('')}
                        </div>
                        ${moreVentures.length > 0 ? `
                        <button onclick="toggleGrid('more-ventures', this, 'Ventures')" class="col-span-full text-left text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-2 flex items-center gap-1">
                            View All Ventures <i data-lucide="chevron-down" class="w-3 h-3"></i>
                        </button>` : ''}
                    </div>
                </div>
            ` : '';

            const html = `
                <div class="space-y-6 animate-fade-in">
                    <!-- Sector Intelligence: 1 Row (4 Columns) -->
                    <div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        
                        <!-- Card 1: Sector Proxy -->
                        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-full">
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <div class="p-1.5 bg-${themeColor}-50 text-${themeColor}-600 rounded-lg"><i data-lucide="briefcase" class="w-4 h-4"></i></div>
                                    <h4 class="font-bold text-slate-600 text-xs uppercase tracking-wide">Sector Proxy</h4>
                                </div>
                                <span class="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">Src: ${data.outlook.source}</span>
                            </div>
                            <div class="text-2xl font-bold text-slate-900">${data.growth.jobTrend}</div>
                            <div class="text-xs text-slate-500 mt-1">Macro-economic Growth Trend</div>
                        </div>

                        <!-- Card 2: Investments -->
                        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-full">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="p-1.5 bg-${themeColor}-50 text-${themeColor}-600 rounded-lg"><i data-lucide="trending-up" class="w-4 h-4"></i></div>
                                <h4 class="font-bold text-slate-600 text-xs uppercase tracking-wide">Investments</h4>
                            </div>
                            <div class="text-2xl font-bold text-slate-900">${data.growth.investment}</div>
                            <div class="text-xs text-slate-500 mt-1">FDI & Local Capital Inflow</div>
                        </div>

                        <!-- Card 3: Skills Demand (Meter) -->
                        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-full">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="p-1.5 ${demandBgClass} rounded-lg"><i data-lucide="bar-chart-2" class="w-4 h-4"></i></div>
                                <h4 class="font-bold text-slate-600 text-xs uppercase tracking-wide">Skills Demand</h4>
                            </div>
                            <div class="flex items-end gap-2 mb-2">
                                <div class="text-2xl font-bold ${demandColorClass}">${data.growth.skillsDemand}</div>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2 mb-1">
                                <div class="h-2 rounded-full ${demandColorClass.replace('text', 'bg')}" style="width: ${data.growth.skillsDemand === 'Critical' ? '95%' : data.growth.skillsDemand === 'High' ? '80%' : '60%'}"></div>
                            </div>
                            <div class="text-xs text-slate-500 mt-1">${data.growth.demandContext}</div>
                        </div>

                        <!-- Card 4: Key Hotspots -->
                        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-full">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="p-1.5 bg-${themeColor}-50 text-${themeColor}-600 rounded-lg"><i data-lucide="map-pin" class="w-4 h-4"></i></div>
                                <h4 class="font-bold text-slate-600 text-xs uppercase tracking-wide">Key Hotspots</h4>
                            </div>
                            <div class="text-lg font-bold text-slate-900 leading-tight">${data.outlook.hotspots}</div>
                            <div class="text-xs text-slate-500 mt-1">Regional Economic Hubs</div>
                        </div>

                    </div>

                    <div class="bg-white rounded-xl p-4 sm:p-6 border border-slate-200 shadow-sm">
                        <div class="mb-4">
                            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2"><i data-lucide="users" class="w-4 h-4 text-slate-500"></i> Top Occupations in this Sector</h3>
                            <p class="text-xs text-slate-500 mt-1">Click to view salary data, daily tasks, and required qualifications.</p>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            ${topOccs.map(role => `
                                <button onclick="openOccupationModal('${role.name}')" title="${role.name}" class="px-3 py-2 ${cardBgColor} border ${cardBorderColor} rounded-lg text-left ${cardHoverBg} ${cardHoverBorder} transition-all group">
                                    <div class="w-full">
                                        <div class="font-bold text-xs ${cardTitleColor} mb-0.5 flex items-center gap-1 min-w-0">
                                            <span class="truncate">${role.name}</span> ${role.isHot ? '<span title="Critical Demand" class="shrink-0 ml-0.5 cursor-help">🔥</span>' : ''}
                                        </div>
                                        <div class="text-[10px] ${cardDescColor} leading-tight line-clamp-2">${role.desc}</div>
                                    </div>
                                </button>
                            `).join('')}
                            <div id="more-occs" class="col-span-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-hidden transition-all duration-500 ease-in-out max-h-0 opacity-0">
                                ${moreOccs.map(role => `
                                    <button onclick="openOccupationModal('${role.name}')" title="${role.name}" class="px-3 py-2 ${cardBgColor} border ${cardBorderColor} rounded-lg text-left ${cardHoverBg} ${cardHoverBorder} transition-all group">
                                        <div class="w-full">
                                            <div class="font-bold text-xs ${cardTitleColor} mb-0.5 flex items-center gap-1 min-w-0">
                                                <span class="truncate">${role.name}</span> ${role.isHot ? '<span title="Critical Demand" class="shrink-0 ml-0.5 cursor-help">🔥</span>' : ''}
                                            </div>
                                            <div class="text-[10px] ${cardDescColor} leading-tight line-clamp-2">${role.desc}</div>
                                        </div>
                                    </button>
                                `).join('')}
                            </div>
                            ${moreOccs.length > 0 ? `
                            <button onclick="toggleGrid('more-occs', this, 'Occupations')" class="col-span-full text-left text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-2 flex items-center gap-1">
                                View All Occupations <i data-lucide="chevron-down" class="w-3 h-3"></i>
                            </button>` : ''}
                        </div>
                    </div>

                    <div class="bg-white rounded-xl p-4 sm:p-6 border border-slate-200 shadow-sm">
                        <div class="mb-4">
                            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2"><i data-lucide="cpu" class="w-4 h-4 text-slate-500"></i> Top Skills sought by Employers</h3>
                            <p class="text-xs text-slate-500 mt-1">Click to see proficiency levels, training providers, and related jobs.</p>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            ${topSkills.map(skill => `
                                <button onclick="openSkillModal('${skill.name.replace(/'/g, "\\'")}')" class="px-3 py-2 ${cardBgColor} border ${cardBorderColor} rounded-lg text-left ${cardHoverBg} ${cardHoverBorder} transition-all group">
                                    <div class="font-bold text-xs ${cardTitleColor} mb-0.5 flex items-center gap-1 truncate">
                                        ${skill.name} ${skill.isHot ? '<span title="Critical Demand" class="ml-1 cursor-help">🔥</span>' : ''}
                                    </div>
                                    <div class="text-[10px] ${cardDescColor} leading-tight truncate">${skill.desc || 'Key competency'}</div>
                                </button>
                            `).join('')}
                            <div id="more-skills" class="col-span-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-hidden transition-all duration-500 ease-in-out max-h-0 opacity-0">
                                ${moreSkills.map(skill => `
                                    <button onclick="openSkillModal('${skill.name.replace(/'/g, "\\'")}')" class="px-3 py-2 ${cardBgColor} border ${cardBorderColor} rounded-lg text-left ${cardHoverBg} ${cardHoverBorder} transition-all group">
                                        <div class="font-bold text-xs ${cardTitleColor} mb-0.5 flex items-center gap-1 truncate">
                                            ${skill.name} ${skill.isHot ? '<span title="Critical Demand" class="ml-1 cursor-help">🔥</span>' : ''}
                                        </div>
                                        <div class="text-[10px] ${cardDescColor} leading-tight truncate">${skill.desc || 'Key competency'}</div>
                                    </button>
                                `).join('')}
                            </div>
                            ${moreSkills.length > 0 ? `
                            <button onclick="toggleGrid('more-skills', this, 'Skills')" class="col-span-full text-left text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-2 flex items-center gap-1">
                                View All Skills <i data-lucide="chevron-down" class="w-3 h-3"></i>
                            </button>` : ''}
                        </div>
                    </div>

                    <!-- Venture Pathways Section -->
                    ${ventureHtml}
                </div>
            `;
            
            container.innerHTML = html;
            if(window.lucide) lucide.createIcons();
        }

        window.openVentureLaunchpad = function(ventureTitle) {
            // Close Venture Modal
            closeModal('venture-modal');
            
            // Open Unified Hub -> Founder's Launchpad Tab
            openUnifiedHub('pp-launchpad', null, null);
            // Ensure specific venture is rendered after opening
            setTimeout(() => {
                if(typeof renderVentureLaunchpad === 'function') renderVentureLaunchpad(ventureTitle);
            }, 100);
        }

        // --- NEW: Venture Modal Logic ---
        window.openVentureModal = function(title) {
            const modal = document.getElementById('venture-modal');
            const panel = document.getElementById('venture-modal-panel');
            
            // Find data
            const venture = dataManager.ventures.find(v => v.Venture_Title === title);
            if (!venture) return;

            document.body.classList.add('overflow-hidden');
            // Reset Favorite Button State
            const favBtn = document.getElementById('btn-venture-fav');
            if(favBtn) {
                const isFav = favoriteVentures.has(title);
                if (isFav) {
                    favBtn.className = "flex items-center gap-2 text-rose-600 transition-colors text-xs font-bold";
                    favBtn.innerHTML = `<i data-lucide="heart" class="w-4 h-4 fill-current"></i> <span>Saved</span>`;
                } else {
                    favBtn.className = "flex items-center gap-2 text-slate-500 hover:text-rose-600 transition-colors text-xs font-bold";
                    favBtn.innerHTML = `<i data-lucide="heart" class="w-4 h-4"></i> <span>Save to Favorites</span>`;
                }
            }

            const modalTitle = document.getElementById('venture-modal-title');
            modalTitle.innerHTML = `${venture.Venture_Title} ${venture.Rank <= 3 ? '<span title="High Demand" class="ml-2">🔥</span>' : ''}`;

            // Determine Theme based on Sector
            const themeConfig = (typeof sectorThemes !== 'undefined') ? sectorThemes[activeSectorId] : { color: 'indigo' };
            const theme = themeConfig.color;
            
            // Context Data (Local definition to ensure availability)
            const vContext = {
                agri: { location: "Rural / Peri-urban", customer: "Smallholder Farmers", drivers: ["Food Security", "Climate Resilience"], tools: "Smartphone, Sensors" },
                energy: { location: "Off-grid / Peri-urban", customer: "Households & SMEs", drivers: ["Energy Access", "Cost Savings"], tools: "Multimeter, GPS" },
                digital: { location: "Urban / Remote", customer: "B2B & B2C", drivers: ["Efficiency", "Market Access"], tools: "Laptop, Cloud" }
            };
            const ctx = vContext[activeSectorId] || vContext['digital'];
            
            // Entry Level Logic based on Capital
            let capitalLevel = venture.Startup_Capital_Est || "Medium";
            let techLevel = "Moderate";
            if (capitalLevel.includes('High')) techLevel = "High";

            // Update Badge
            const badge = document.getElementById('venture-modal-badge');
            badge.className = `text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-${theme}-100 text-${theme}-700`;
            badge.innerText = activeSectorId === 'agri' ? 'Agritech Venture' : activeSectorId === 'energy' ? 'Energy Venture' : 'Digital Venture';

            const skills = Array.isArray(venture.Key_Competencies) ? venture.Key_Competencies : (venture.Key_Competencies ? venture.Key_Competencies.split(',').map(s => s.trim()) : []);
            
            // Regulatory & Licensing Map
            const regulations = (typeof ventureRegulations !== 'undefined') ? (ventureRegulations[venture.Venture_Title] || "Standard Business Permit (Local Authority)") : "Standard Business Permit";

            // Challenges Map
            const challenges = (typeof ventureChallenges !== 'undefined') ? (ventureChallenges[venture.Venture_Title] || "Market competition; Customer acquisition costs.") : "Market competition.";

            // 1. At a Glance (Snapshot)
            const snapshotHtml = `
                <div>
                    <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <i data-lucide="info" class="w-4 h-4"></i> Venture Snapshot
                    </h3>
                    <div class="bg-slate-50 rounded-xl border border-slate-200 p-4">
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-4">
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Startup Capital</div>
                                <div class="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                                    <i data-lucide="banknote" class="w-3.5 h-3.5"></i> ${capitalLevel}
                                </div>
                            </div>
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Market Reach</div>
                                <div class="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                                    <i data-lucide="globe" class="w-3.5 h-3.5"></i> ${ctx.location}
                                </div>
                            </div>
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Target Customer</div>
                                <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <i data-lucide="users" class="w-3.5 h-3.5 text-slate-500"></i> ${ctx.customer}
                                </div>
                            </div>
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Tech Level</div>
                                <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <i data-lucide="cpu" class="w-3.5 h-3.5 text-slate-500"></i> ${techLevel}
                                </div>
                            </div>
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Key Driver</div>
                                <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <i data-lucide="trending-up" class="w-3.5 h-3.5 text-slate-500"></i> ${ctx.drivers[0] || 'Innovation'}
                                </div>
                            </div>
                            <div>
                                <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Tools Required</div>
                                <div class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <i data-lucide="wrench" class="w-3.5 h-3.5 text-slate-500"></i> ${ctx.tools}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // 2. Description
            const descHtml = `
                <section>
                    <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">1</span> Opportunity Description
                    </h3>
                    <div class="text-slate-800 text-base leading-relaxed font-medium">
                        ${venture.Venture_Description}
                    </div>
                </section>
            `;

            // 3. Competencies (Skills)
            const skillsListHtml = skills.map((s, i) => `
                <div class="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded text-xs text-slate-700 hover:border-${theme}-200 transition-colors w-full">
                    <div class="w-5 h-5 flex items-center justify-center bg-white rounded-full shadow-sm text-[10px] font-bold text-${theme}-600 border border-slate-100">${i+1}</div>
                    <span class="font-bold text-slate-800">${s}</span>
                </div>
            `).join('');

            const competenciesHtml = `
                <section>
                    <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">2</span> Key Competencies
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${skillsListHtml}
                    </div>
                </section>
            `;

            // 4. Requirements & Regulations
            const reqsHtml = `
                <div class="mt-6 pt-6 border-t border-slate-100">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">3</span> Requirements & Regulations
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="flex items-center gap-2 mb-1"><i data-lucide="file-text" class="w-4 h-4 text-indigo-500"></i><span class="text-[10px] font-bold text-slate-500 uppercase">Licensing</span></div>
                            <div class="text-xs text-slate-700 font-medium">${regulations}</div>
                        </div>
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="flex items-center gap-2 mb-1"><i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500"></i><span class="text-[10px] font-bold text-slate-500 uppercase">Key Challenge</span></div>
                            <div class="text-xs text-slate-700 font-medium">${challenges}</div>
                        </div>
                    </div>
                </div>
            `;

            // 5. CTA
            const ctaHtml = `
                <div class="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-xl p-5 text-white shadow-lg relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all mt-6" onclick="openVentureLaunchpad('${venture.Venture_Title.replace(/'/g, "\\'")}');">
                    <div class="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-colors"></div>
                    <div class="relative z-10 flex items-center justify-between">
                        <div>
                            <h3 class="font-bold text-lg mb-1 flex items-center gap-2">Pursue this Venture</h3>
                            <p class="text-xs text-slate-300 max-w-sm leading-relaxed mb-3">Build a personalized roadmap with funding sources, incubators, and registration guides.</p>
                            <button class="bg-white text-indigo-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors flex items-center gap-2 shadow-sm">
                                Go to Founder's Launchpad <i data-lucide="arrow-right" class="w-3 h-3"></i>
                            </button>
                        </div>
                        <div class="hidden sm:block opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all">
                            <i data-lucide="rocket" class="w-16 h-16 text-white/20"></i>
                        </div>
                    </div>
                </div>
            `;

            const content = `
                <div class="space-y-6">
                    ${snapshotHtml}
                    ${descHtml}
                    ${competenciesHtml}
                    ${reqsHtml}
                    ${ctaHtml}
                </div>
            `;

            document.getElementById('venture-modal-content').innerHTML = content;

            modal.classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
            setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); panel.classList.add('scale-100', 'opacity-100'); }, 10);
        }

        window.showNextSteps = function() {
            document.getElementById('assessment-result').classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
        }

        // --- UPDATED: Careers Hub Data & Functions ---

        const getSectorCareerResources = (sector) => {
            // Helper for ISO codes
            const iso = countryISOMap[activeCountry] || 'KEN';

            if (!dataManager.digitalResources) {
                console.warn("digital_resources.json not loaded. Using fallback data.");
                // This is a minimal fallback. The original hardcoded data was huge.
                return { mentors: [], lmi: [], communities: [], jobs: [], entrepreneurship: { incubators: [], funding: [], tools: [] } };
            }

            let sourceData = null;
            
            // Use standardized short keys directly
            if (dataManager.digitalResources[sector]) {
                sourceData = dataManager.digitalResources[sector];
            }

            // Deep clone to avoid mutating the cache
            let sectorData = sourceData ? JSON.parse(JSON.stringify(sourceData)) : {};

            // Safety: Ensure arrays exist to prevent crashes during injection or rendering
            sectorData.lmi = sectorData.lmi || [];
            sectorData.communities = sectorData.communities || [];
            sectorData.jobs = sectorData.jobs || [];
            sectorData.entrepreneurship = sectorData.entrepreneurship || { incubators: [], funding: [], tools: [] };
            if (!sectorData.entrepreneurship.incubators) sectorData.entrepreneurship.incubators = [];
            if (!sectorData.entrepreneurship.funding) sectorData.entrepreneurship.funding = [];
            if (!sectorData.entrepreneurship.tools) sectorData.entrepreneurship.tools = [];

            // Inject Country Specific Resources
            let resourceKey = activeCountry;
            if (resourceKey === 'DRC' || resourceKey === 'Democratic Republic of Congo') resourceKey = 'DR Congo';

            if (sourceData && sourceData.country_resources && sourceData.country_resources[resourceKey]) {
                const cr = sourceData.country_resources[resourceKey];
                if (cr.policy) {
                    sectorData.lmi.unshift(...cr.policy.map(p => ({ name: p.title, desc: p.desc, link: p.link, type: 'National Policy' })));
                }
                if (cr.hubs) {
                    sectorData.entrepreneurship.incubators.unshift(...cr.hubs.map(h => ({ name: h.title, desc: h.desc, link: h.link })));
                }
                if (cr.jobs) {
                    sectorData.jobs.unshift(...cr.jobs.map(j => ({ title: j.title, company: j.desc, type: "National", link: j.link })));
                }
                if (cr.data) {
                    sectorData.lmi.unshift(...cr.data.map(d => ({ name: d.title, desc: d.desc, link: d.link, type: 'National Data' })));
                }
                if (cr.education) {
                    sectorData.lmi.unshift(...cr.education.map(e => ({ name: e.title, desc: e.desc, link: e.link, type: 'Accreditation' })));
                }
                if (cr.communities) {
                    sectorData.communities.unshift(...cr.communities.map(c => ({ name: c.title, desc: c.desc, link: c.link, type: 'Local Community' })));
                }
            }
            
            // --- CONTEXTUAL ENRICHMENT ---
            // Inject relevant Regional Multipliers
            if (dataManager.digitalResources.regional_multipliers) {
                const regionalPolicy = dataManager.digitalResources.regional_multipliers.filter(r => r.type === 'Policy/Regulation');
                const regionalEcosystem = dataManager.digitalResources.regional_multipliers.filter(r => r.type === 'Ecosystem');
                
                sectorData.lmi.push(...regionalPolicy.map(p => ({ name: p.title, desc: p.desc, link: p.link, type: 'Regional Policy', gsa_member: p.gsa_member })));
                sectorData.communities.push(...regionalEcosystem.map(e => ({ name: e.title, desc: e.desc, type: "Regional Hub", link: e.link, gsa_member: e.gsa_member })));
            }

            // Inject relevant Global Resources
            if (dataManager.digitalResources.global_resources) {
                const globalFunding = dataManager.digitalResources.global_resources.filter(r => r.type === 'Funding');
                const globalJobs = dataManager.digitalResources.global_resources.filter(r => r.type === 'Jobs');
                const globalData = dataManager.digitalResources.global_resources.filter(r => r.type === 'Data/Research');
                const globalMentors = dataManager.digitalResources.global_resources.filter(r => r.type === 'Ecosystem' && (r.title.includes('Mentor') || r.title.includes('ADPList')));

                sectorData.entrepreneurship.funding.push(...globalFunding.map(f => ({ name: f.title, desc: f.desc, link: f.link, gsa_member: f.gsa_member })));
                sectorData.jobs.push(...globalJobs.map(j => ({ title: j.title, company: j.desc, type: "Global", link: j.link, gsa_member: j.gsa_member })));
                sectorData.lmi.push(...globalData.map(d => ({ name: d.title, desc: d.desc, link: d.link, type: 'Global Data', gsa_member: d.gsa_member })));
                sectorData.communities.push(...globalMentors.map(m => ({ name: m.title, desc: m.desc, type: "Mentorship", link: m.link, gsa_member: m.gsa_member })));
            }

            // --- NEW: Inject National Mentorships ---
            const nationalMentorships = {
                'Kenya': [{ title: "KamiLimu", desc: "Structured mentorship for CS students.", link: "https://kamilimu.org/", type: "Mentorship" }],
                'Rwanda': [{ title: "Girls in ICT Rwanda", desc: "Mentorship and networking.", link: "https://girlsinict.rw/", type: "Mentorship" }],
                'Uganda': [{ title: "Women in Technology Uganda", desc: "Networking and mentorship.", link: "https://witug.org/", type: "Mentorship" }],
                'Tanzania': [{ title: "Apps and Girls", desc: "Coding and mentorship for girls.", link: "https://appsandgirls.com/", type: "Mentorship" }]
            };

            if (nationalMentorships[activeCountry]) {
                nationalMentorships[activeCountry].forEach(m => {
                    if (!sectorData.communities.some(c => c.name === m.title)) {
                        sectorData.communities.push({ name: m.title, desc: m.desc, link: m.link, type: "Mentorship" });
                    }
                });
            }

            // --- NEW: Merge Static Data from data.js (Safety Net) ---
            // This ensures the Careers Hub is populated even if digital_resources.json is sparse/missing
            if (typeof sectorPathwayResources !== 'undefined' && sectorPathwayResources[sector]) {
                sectorPathwayResources[sector].forEach(res => {
                    const lowerTitle = res.title.toLowerCase();
                    const lowerDesc = res.desc.toLowerCase();
                    
                    // Heuristic categorization
                    if (lowerTitle.includes('job') || lowerDesc.includes('vacancies') || lowerTitle.includes('career')) {
                        if (!sectorData.jobs.some(j => j.title === res.title)) {
                            sectorData.jobs.push({ title: res.title, company: "Sector Resource", link: res.link, type: "Platform" });
                        }
                    } else if (lowerTitle.includes('fund') || lowerTitle.includes('invest') || lowerTitle.includes('grant') || lowerTitle.includes('capital')) {
                        if (!sectorData.entrepreneurship.funding.some(f => f.name === res.title)) {
                            sectorData.entrepreneurship.funding.push({ name: res.title, desc: res.desc, link: res.link });
                        }
                    } else if (!lowerTitle.includes('academy') && !lowerTitle.includes('learning') && !lowerDesc.includes('training')) {
                        // Default to Community/Ecosystem (excluding pure training which belongs in Training Hub)
                        if (!sectorData.communities.some(c => c.name === res.title)) {
                            // Check if it's LMI
                            if(lowerDesc.includes('data') || lowerDesc.includes('report') || lowerDesc.includes('insight')) {
                                sectorData.lmi.push({ name: res.title, desc: res.desc, link: res.link, type: "Sector Data" });
                            } else {
                                sectorData.communities.push({ name: res.title, desc: res.desc, link: res.link, type: "Ecosystem" });
                            }
                        }
                    }
                });
            }

            return sectorData;
        };

        window.showMentorshipView = function() { 
            const sectorData = getSectorCareerResources(activeSectorId);
            const container = document.getElementById('career-hub-content');
            
            // Get Skills for Dropdown
            const skills = dataManager.getSkills(activeSectorId) || [];
            const skillOptions = skills.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

            // Filter for mentorship platforms and relevant communities
            const mentorPlatforms = (sectorData.communities || []).filter(c => 
                c.type === 'Mentorship' || 
                c.name.toLowerCase().includes('mentor') ||
                (c.desc && c.desc.toLowerCase().includes('mentor'))
            );

            const mentorsHtml = mentorPlatforms.map(c => `
                <a href="${c.link}" target="_blank" class="block p-3 border border-slate-200 rounded-lg bg-white hover:border-blue-300 hover:shadow-sm transition-all group">
                    <div class="flex justify-between items-start mb-1">
                        <div class="font-bold text-sm text-slate-800 group-hover:text-blue-700 flex items-center gap-1">
                            ${c.name}
                            ${c.gsa_member ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">UNESCO</span>' : ''}
                        </div>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-blue-500"></i>
                    </div>
                    <div class="text-xs text-slate-500 mb-2 line-clamp-2">${c.desc}</div>
                    <span class="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100">${c.type || 'Platform'}</span>
                </a>
            `).join('');

            container.innerHTML = `
                <div class="animate-fade-in">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    
                    <!-- Mentor Match Feature -->
                    <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white shadow-md mb-6">
                        <div class="flex items-start gap-3 mb-4">
                            <div class="p-2 bg-white/20 rounded-lg"><i data-lucide="sparkles" class="w-5 h-5 text-yellow-300"></i></div>
                            <div>
                                <h3 class="font-bold text-lg">Find Your Perfect Mentor</h3>
                                <p class="text-xs text-blue-100">Get matched with verified networks based on your skills.</p>
                            </div>
                        </div>
                        
                        <div class="bg-white/10 p-3 rounded-lg border border-white/20">
                            <label class="block text-[10px] font-bold text-blue-100 uppercase mb-1">I want to improve in:</label>
                            <div class="flex gap-2">
                                <select id="mentor-skill-select" class="w-full text-xs text-slate-800 rounded-lg border-0 focus:ring-2 focus:ring-blue-300 py-2">
                                    <option value="" disabled selected>Select a skill...</option>
                                    ${skillOptions}
                                </select>
                                <button onclick="runMentorMatch()" class="bg-white text-blue-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors shadow-sm">Match</button>
                            </div>
                        </div>
                        
                        <div id="mentor-match-result" class="hidden mt-4 pt-4 border-t border-white/20 animate-fade-in">
                            <!-- Result injected here -->
                        </div>
                    </div>

                    <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="list" class="w-5 h-5 text-blue-500"></i> All Mentorship Platforms</h3>
                    <div class="space-y-3">
                        ${mentorsHtml.length > 0 ? mentorsHtml : '<p class="text-sm text-slate-500 italic">No specific mentorship platforms found. Check general communities.</p>'}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.runMentorMatch = function() {
            const skill = document.getElementById('mentor-skill-select').value;
            const resultDiv = document.getElementById('mentor-match-result');
            
            if (!skill) return;

            let recommended = { name: "ADPList", link: "https://adplist.org/", desc: "Global mentorship community." };
            
            if (activeSectorId === 'agri') {
                recommended = { name: "AWAK (Women in Ag)", link: "https://awak.co.ke/", desc: "Mentorship for women in agribusiness." };
                if (activeCountry === 'Uganda') recommended = { name: "Women in Technology Uganda", link: "https://witug.org/", desc: "Tech & Agri-tech mentorship." };
            } else if (activeSectorId === 'energy') {
                recommended = { name: "GWNET", link: "https://www.globalwomennet.org/", desc: "Global Women's Network for Energy Transition." };
                if (activeCountry === 'Kenya') recommended = { name: "Women in Renewable Energy (WIRE)", link: "https://wire-africa.org/", desc: "Mentorship & apprenticeship links." };
            } else {
                if (skill.toLowerCase().includes('design')) recommended = { name: "ADPList", link: "https://adplist.org/", desc: "Find Design mentors." };
                else if (skill.toLowerCase().includes('code') || skill.toLowerCase().includes('dev')) recommended = { name: "Andela Learning Community", link: "https://andela.com/learning-community/", desc: "Developer mentorship." };
                else recommended = { name: "MicroMentor", link: "https://www.micromentor.org/", desc: "Free business mentorship." };
            }

            resultDiv.innerHTML = `
                <div class="text-xs font-bold text-blue-100 mb-2">Top Recommendation for ${skill}:</div>
                <a href="${recommended.link}" target="_blank" class="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-blue-50 transition-colors group">
                    <div class="p-2 bg-blue-100 text-blue-600 rounded-full"><i data-lucide="check-circle" class="w-4 h-4"></i></div>
                    <div class="flex-1">
                        <div class="font-bold text-sm text-slate-800 group-hover:text-blue-700 flex items-center gap-1">
                            ${recommended.name} <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i>
                        </div>
                        <div class="text-xs text-slate-500">${recommended.desc}</div>
                    </div>
                </a>
            `;
            resultDiv.classList.remove('hidden');
            if(window.lucide) lucide.createIcons();
        }

        window.showWorkforceDataView = function() {
            const sectorData = getSectorCareerResources(activeSectorId);
            
            // FIX: If in Regional view, explicitly pull in all National LMIS links so they aren't hidden
            if (activeCountry === 'all' && dataManager.digitalResources && dataManager.digitalResources.country_resources) {
                const cr = dataManager.digitalResources.country_resources;
                Object.keys(cr).forEach(country => {
                    if (cr[country].data) {
                        cr[country].data.forEach(d => {
                            // Add to LMI list if not already there
                            if (!sectorData.lmi.some(l => l.name === d.title)) {
                                sectorData.lmi.push({ name: d.title, desc: `${country}: ${d.desc}`, link: d.link, type: 'National Data' });
                            }
                        });
                    }
                });
            }

            const container = document.getElementById('career-hub-content');
            
            // Group resources by type for better display
            const groupedLMI = (sectorData.lmi || []).reduce((acc, item) => {
                const type = item.type || 'General';
                if (!acc[type]) acc[type] = [];
                acc[type].push(item);
                return acc;
            }, {});

            const lmiHtml = Object.entries(groupedLMI).map(([type, items]) => `
                <div>
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">${type.replace(/_/g, ' ')}</h4>
                    <div class="space-y-2">
                        ${items.map(l => `
                            <a href="${l.link}" target="_blank" class="block p-3 border border-indigo-100 bg-indigo-50/30 rounded-lg hover:bg-indigo-50 group">
                                <div class="font-bold text-sm text-indigo-900 group-hover:text-indigo-700 flex justify-between items-center">
                                    <span class="flex items-center gap-1">
                                        ${l.name}
                                        ${l.gsa_member ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">UNESCO</span>' : ''}
                                    </span>
                                    <i data-lucide="external-link" class="w-3 h-3 text-indigo-400"></i>
                                </div>
                                <div class="text-xs text-indigo-700/80 mt-0.5">${l.desc}</div>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            // Static Evidence Content (Merged from openEvidenceModal)
            const evidenceHtml = `
                <div class="mt-6 pt-6 border-t border-slate-200">
                    <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Verified Data Sources</h3>
                    <div class="grid grid-cols-1 gap-3">
                        <a href="https://ilostat.ilo.org" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">ILOSTAT <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Global reference for comparable labour indicators.</div>
                        </a>
                        <a href="https://www.eac.int" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">EAC Secretariat <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Regional labour policy & Manpower Survey.</div>
                        </a>
                        <a href="https://unevoc.unesco.org/home/Global+Skills+Tracker" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">UNESCO Global Skills Tracker <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Labour market insights on skills demand.</div>
                        </a>
                        <a href="https://economicgraph.linkedin.com/workforce-data?selectedFilter=view-all%2Fby-year" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">LinkedIn Economic Graph <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Interactive workforce trends & skills insights.</div>
                        </a>
                        <a href="https://data.worldbank.org" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">World Bank Data <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Harmonized macro indicators.</div>
                        </a>
                        <a href="https://esco.ec.europa.eu/en" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">ESCO (EU Skills/Occupations) <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Standard terminology for skills and jobs.</div>
                        </a>
                        <a href="https://www.onetonline.org/" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">O*NET OnLine <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Occupational information and skills framework.</div>
                        </a>
                        <a href="https://acqf.africa/" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">ACQF (Qualifications) <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">African Continental Qualifications Framework.</div>
                        </a>
                        <a href="https://edu-au.org/cesa" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">CESA Strategy <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Continental Education Strategy for Africa.</div>
                        </a>
                        <a href="https://au.int/en/education/tvet" target="_blank" class="block p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 transition-colors group bg-white">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">AU TVET Strategy <i data-lucide="external-link" class="w-3 h-3 text-slate-400"></i></div>
                            <div class="text-xs text-slate-500 mt-1">Continental Strategy for TVET (2025-34).</div>
                        </a>
                    </div>
                </div>
            `;

            container.innerHTML = `
                <div class="animate-fade-in">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="database" class="w-5 h-5 text-indigo-500"></i> Workforce Data</h3>
                    <div class="space-y-4">
                        ${lmiHtml || '<p class="text-sm text-slate-500 italic">No market intelligence resources found for this sector.</p>'}
                        ${evidenceHtml}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.showCVResources = function() {
            const container = document.getElementById('career-hub-content');
            
            // Pull relevant tools from global resources
            const portfolioTools = (dataManager.digitalResources && dataManager.digitalResources.global_resources ? dataManager.digitalResources.global_resources : []).filter(r => 
                r.type === 'Community' && (r.title.includes('Kaggle'))
            );

            const staticTools = (typeof staticCVTools !== 'undefined') ? staticCVTools : [];
            const allTools = [...staticTools, ...portfolioTools.map(t => ({...t, icon: 'github'}))];

            const toolsHtml = allTools.map(t => `
                <a href="${t.link}" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-purple-300 bg-white group transition-all">
                    <div class="p-2 bg-purple-100 text-purple-600 rounded"><i data-lucide="${t.icon}" class="w-4 h-4"></i></div>
                    <div>
                        <div class="font-bold text-sm text-slate-800 group-hover:text-purple-700">${t.title}</div>
                        <div class="text-xs text-slate-500">${t.desc}</div>
                    </div>
                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-purple-500 ml-auto"></i>
                </a>
            `).join('');

            container.innerHTML = `
                <div class="animate-fade-in">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="file-text" class="w-5 h-5 text-purple-500"></i> CV & Portfolio Tools</h3>
                    
                    <!-- NEW: Internal Generator CTA -->
                    <div class="mb-6 p-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl text-white shadow-md">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-sm">Instant CV Builder</h4>
                            <i data-lucide="zap" class="w-4 h-4 text-yellow-300"></i>
                        </div>
                        <p class="text-xs text-indigo-100 mb-3 leading-relaxed">Create a standardized, ATS-friendly PDF resume directly in your browser. No sign-up required.</p>
                        <button onclick="renderCVGenerator()" class="w-full py-2 bg-white text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-50 transition-colors shadow-sm">
                            Build My CV Now
                        </button>
                    </div>

                    <div class="space-y-3">
                        ${toolsHtml}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: CV Generator Logic ---
        window.renderCVGenerator = function() {
            const container = document.getElementById('career-hub-content');
            container.innerHTML = `
                <div class="animate-fade-in space-y-4">
                    <button onclick="showCVResources()" class="mb-2 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Tools</button>
                    
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg">Quick CV Builder</h3>
                                <p class="text-xs text-slate-500">Generate a clean, ATS-friendly PDF resume in seconds.</p>
                            </div>
                            <div class="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><i data-lucide="file-text" class="w-5 h-5"></i></div>
                        </div>

                        <form id="cv-form" class="space-y-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                                    <input type="text" id="cv-name" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="Jane Doe">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-700 mb-1">Target Role</label>
                                    <input type="text" id="cv-role" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="Data Analyst">
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-slate-700 mb-1">Email</label>
                                    <input type="email" id="cv-email" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="jane@example.com">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                                    <input type="text" id="cv-phone" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="+254 700 000000">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Professional Summary</label>
                                <textarea id="cv-summary" rows="3" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="Motivated professional with 2 years of experience in..."></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Key Skills (Comma separated)</label>
                                <input type="text" id="cv-skills" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="Python, Data Analysis, Project Management">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Experience / Projects</label>
                                <textarea id="cv-experience" rows="4" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="• Role at Company (Dates): Achieved X by doing Y..."></textarea>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Education</label>
                                <textarea id="cv-education" rows="2" class="w-full text-sm border-slate-300 rounded-lg p-2" placeholder="BSc Computer Science, University of Nairobi (2024)"></textarea>
                            </div>
                        </form>

                        <div class="mt-6 pt-4 border-t border-slate-100 flex gap-3">
                            <button onclick="generatePDF()" class="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                                <i data-lucide="download" class="w-4 h-4"></i> Download PDF
                            </button>
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.generatePDF = function() {
            if (!window.jspdf) {
                alert("PDF Generator library not loaded. Please check your internet connection.");
                return;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            const name = document.getElementById('cv-name').value || "Your Name";
            const role = document.getElementById('cv-role').value || "Professional Role";
            const email = document.getElementById('cv-email').value || "email@example.com";
            const phone = document.getElementById('cv-phone').value || "Phone";
            const summary = document.getElementById('cv-summary').value || "";
            const skills = document.getElementById('cv-skills').value || "";
            const experience = document.getElementById('cv-experience').value || "";
            const education = document.getElementById('cv-education').value || "";

            // Styling
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.text(name, 20, 20);
            
            doc.setFontSize(14);
            doc.setTextColor(100);
            doc.text(role, 20, 28);
            
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.setFont("helvetica", "normal");
            doc.text(`${email} | ${phone}`, 20, 35);
            
            doc.setLineWidth(0.5);
            doc.line(20, 38, 190, 38);
            
            let yPos = 45;
            
            const addSection = (title, content) => {
                if(content) {
                    if (yPos > 270) { doc.addPage(); yPos = 20; }
                    doc.setFont("helvetica", "bold");
                    doc.text(title, 20, yPos);
                    yPos += 5;
                    doc.setFont("helvetica", "normal");
                    const splitContent = doc.splitTextToSize(content, 170);
                    doc.text(splitContent, 20, yPos);
                    yPos += (splitContent.length * 5) + 5;
                }
            };

            addSection("SUMMARY", summary);
            addSection("SKILLS", skills);
            addSection("EXPERIENCE", experience);
            addSection("EDUCATION", education);
            
            doc.save(`${name.replace(/ /g, "_")}_CV.pdf`);
        }

        window.showCommunityView = function(activeFilter = 'all') {
            const sectorData = getSectorCareerResources(activeSectorId);
            const container = document.getElementById('career-hub-content');
            
            // Determine Theme based on Sector
            const themeConfig = (typeof sectorThemes !== 'undefined') ? sectorThemes[activeSectorId] : { color: 'indigo' };
            const theme = themeConfig.color;
            
            // Exclude mentorship platforms shown in the other tab
            let communities = (sectorData.communities || []).filter(c => 
                c.type !== 'Mentorship' && !c.name.toLowerCase().includes('mentor')
            );

            // Add Mock Events based on sector (since JSON might not have them yet)
            if (activeSectorId === 'digital') communities.push({ name: "Africa Tech Summit", desc: "Nairobi • Feb 2025", type: "Event", link: "https://www.africatechsummit.com/" });
            if (activeSectorId === 'agri') communities.push({ name: "Sankalp Africa Summit", desc: "Nairobi • Feb 2025", type: "Event", link: "https://sankalpforum.com/" });
            if (activeSectorId === 'energy') communities.push({ name: "Solar Africa Expo", desc: "KICC • June 2025", type: "Event", link: "https://www.solarafricaexpo.com/" });

            // Filter Logic
            let filteredItems = communities;
            if (activeFilter === 'networks') {
                filteredItems = communities.filter(c => c.type !== 'Event');
            } else if (activeFilter === 'events') {
                filteredItems = communities.filter(c => c.type === 'Event');
            }

            const itemsHtml = filteredItems.map(c => {
                const isEvent = c.type === 'Event';
                const icon = isEvent ? 'calendar' : 'users';
                const btnBg = isEvent ? 'bg-orange-50 text-orange-700' : `bg-${theme}-50 text-${theme}-600`;
                const btnText = isEvent ? 'Register' : 'Join';

                return `
                <div class="p-3 border border-slate-200 rounded-lg bg-white flex flex-col gap-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="font-bold text-sm text-slate-800 flex items-center gap-2">
                                <i data-lucide="${icon}" class="w-3.5 h-3.5 text-slate-400"></i> ${c.name}
                            </div>
                            <div class="text-xs text-slate-500 mt-0.5">${c.desc}</div>
                        </div>
                        ${c.link && c.link !== 'N/A' ? `
                        <a href="${c.link}" target="_blank" class="text-[10px] font-bold ${btnBg} hover:underline flex items-center gap-1 px-2 py-1 rounded shrink-0">
                            ${btnText} <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>` : `<span class="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded cursor-not-allowed">Invite Only</span>`}
                    </div>
                </div>
            `}).join('');

            // --- NEW: Featured WhatsApp/Telegram Groups ---
            const featuredGroup = activeSectorId === 'agri' ? { name: 'Agri-Biz Youth EA', members: '3.4k' } 
                                : activeSectorId === 'energy' ? { name: 'Solar Techs East Africa', members: '1.8k' } 
                                : { name: 'Nairobi Devs & AI', members: '5.2k' };

            // Only show featured group in All or Networks
            const showFeatured = activeFilter === 'all' || activeFilter === 'networks';
            const featuredHtml = showFeatured ? `
                <div class="p-3 border border-emerald-200 bg-emerald-50/50 rounded-lg mb-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="font-bold text-sm text-emerald-900 flex items-center gap-1"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i> ${featuredGroup.name}</div>
                            <div class="text-xs text-emerald-700 mt-0.5">Active WhatsApp Group • ${featuredGroup.members} Members</div>
                        </div>
                        <button class="text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-50 shadow-sm">Join Chat</button>
                    </div>
                </div>
            ` : '';

            // Filter Buttons Helper
            const getBtnClass = (filter) => activeFilter === filter 
                ? "bg-slate-800 text-white shadow-sm" 
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";

            container.innerHTML = `
                <div class="animate-fade-in flex flex-col h-full">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 shrink-0"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    <!-- Filters -->
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-1">Location</label>
                            <select onchange="setGlobalCountry(this.value); showCommunityView('${activeFilter}');" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-${theme}-500 cursor-pointer">
                                <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>Regional</option>
                                <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                                <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                                <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                                <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                                <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                                <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                                <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DR Congo</option>
                                <option value="Somalia" ${activeCountry === 'Somalia' ? 'selected' : ''}>Somalia</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-1">Sector</label>
                            <select onchange="setGlobalSector(this.value); showCommunityView('${activeFilter}');" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-${theme}-500 cursor-pointer">
                                <option value="agri" ${activeSectorId === 'agri' ? 'selected' : ''}>Agritech</option>
                                <option value="energy" ${activeSectorId === 'energy' ? 'selected' : ''}>Renewable Energy</option>
                                <option value="digital" ${activeSectorId === 'digital' ? 'selected' : ''}>Digital Economy</option>
                            </select>
                        </div>
                    </div>

                    <div class="shrink-0">
                        <div class="flex gap-2 mb-4 overflow-x-auto pb-1">
                            <button onclick="showCommunityView('all')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('all')}">All</button>
                            <button onclick="showCommunityView('networks')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('networks')}">Networks</button>
                            <button onclick="showCommunityView('events')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('events')}">Events</button>
                        </div>
                    </div>

                    <div class="space-y-3 overflow-y-auto pr-1 pb-4">
                        ${featuredHtml}
                        ${itemsHtml.length > 0 ? itemsHtml : '<div class="text-xs text-slate-500 italic text-center py-4">No items found for this category.</div>'}
                        
                        ${(activeFilter === 'all' || activeFilter === 'networks') ? `
                        <div class="p-3 border border-slate-200 rounded-lg bg-white">
                            <div class="font-bold text-sm text-slate-800">Women in Tech Africa</div>
                            <div class="text-xs text-slate-500 mb-2">Regional Chapter • Virtual/Hybrid</div>
                            <a href="https://www.womenintechafrica.com/" target="_blank" class="text-[10px] font-bold text-${theme}-600 hover:underline flex items-center gap-1">Join Community <i data-lucide="external-link" class="w-3 h-3"></i></a>
                        </div>` : ''}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.showEmployerConnectView = function() {
            const container = document.getElementById('career-hub-content');
            const sector = activeSectorId;
            const country = activeCountry;
            
            // Get Hiring Partners from Data (using existing overrides)
            const baseData = (typeof baseSectorDetailData !== 'undefined') ? baseSectorDetailData[sector] : {};
            const overrides = (typeof countryOverrides !== 'undefined' && countryOverrides[country] && countryOverrides[country][sector]) ? countryOverrides[country][sector] : {};
            
            const hiringString = overrides.hiring || (baseData.outlook ? baseData.outlook.hiring : "Leading Sector Firms");
            const partners = hiringString.split(',').map(s => s.trim());

            // Mock Events Data
            const events = [
                { title: `Annual ${sector === 'agri' ? 'Agri' : sector === 'energy' ? 'Energy' : 'Tech'} Career Fair`, date: "Oct 15, 2025", type: "Virtual" },
                { title: "East Africa Graduate Recruitment Drive", date: "Nov 02, 2025", type: "Hybrid" },
                { title: "Industry Networking Night", date: "Monthly", type: "In-Person" }
            ];

            // Mock Alumni Groups
            const alumni = [
                { name: `${sector.charAt(0).toUpperCase() + sector.slice(1)} Professionals EA`, platform: "LinkedIn" },
                { name: "University Alumni Network", platform: "Portal" }
            ];

            const partnersHtml = partners.map(p => `
                <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:border-pink-300 transition-colors group">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs group-hover:bg-pink-50 group-hover:text-pink-600 transition-colors">${p.substring(0,2).toUpperCase()}</div>
                        <div>
                            <div class="text-xs font-bold text-slate-800">${p}</div>
                            <div class="text-[10px] text-slate-500">Hiring Partner</div>
                        </div>
                    </div>
                    <button class="text-[10px] font-bold text-pink-600 bg-pink-50 px-2 py-1 rounded hover:bg-pink-100 border border-pink-100">Connect</button>
                </div>
            `).join('');

            const eventsHtml = events.map(e => {
                const parts = e.date.split(' ');
                const day = parts.length > 1 ? parts[1].replace(',','') : '';
                return `
                <div class="flex items-center gap-3 p-3 border border-slate-100 rounded-lg bg-slate-50">
                    <div class="p-2 bg-white rounded shadow-sm text-center min-w-[50px]">
                        <div class="text-[9px] text-slate-400 uppercase font-bold">${parts[0]}</div>
                        <div class="text-sm font-bold text-slate-800">${day}</div>
                    </div>
                    <div>
                        <div class="text-xs font-bold text-slate-800">${e.title}</div>
                        <div class="text-[10px] text-slate-500">${e.type} • ${country === 'all' ? 'Regional' : country}</div>
                    </div>
                </div>
            `}).join('');

            container.innerHTML = `
                <div class="animate-fade-in space-y-6">
                    <button onclick="resetCareerHub()" class="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    
                    <div>
                        <h3 class="font-bold text-lg text-slate-900 mb-1 flex items-center gap-2"><i data-lucide="handshake" class="w-5 h-5 text-pink-600"></i> Employer Connect</h3>
                        <p class="text-xs text-slate-500">Direct links to industry partners, fairs, and alumni.</p>
                    </div>

                    <!-- 1. WIL / Hiring Partners -->
                    <div>
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">Work-Integrated Learning Partners</h4>
                        <div class="space-y-2">
                            ${partnersHtml}
                        </div>
                        <div class="mt-2 text-[10px] text-slate-400 italic text-center">Curated partners offering internships & apprenticeships.</div>
                    </div>

                    <!-- 2. Industry Fairs -->
                    <div>
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">Upcoming Career Fairs</h4>
                        <div class="space-y-2">
                            ${eventsHtml}
                        </div>
                    </div>

                    <!-- 3. Alumni -->
                    <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                        <h4 class="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2">Alumni Networks</h4>
                        <p class="text-xs text-indigo-700 mb-3">Connect with graduates working in the field.</p>
                        <div class="flex gap-2">
                            ${alumni.map(a => `<button class="px-3 py-1.5 bg-white text-indigo-600 rounded text-[10px] font-bold shadow-sm border border-indigo-100 hover:bg-indigo-50 transition-colors">${a.name}</button>`).join('')}
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.showJobBoardView = function(filter = 'all') {
            const sectorData = getSectorCareerResources(activeSectorId);
            const container = document.getElementById('career-hub-content');
            
            // 1. Merge real jobs with mock opportunities for the prototype to demonstrate aggregation
            let allOps = [...(sectorData.jobs || [])];
            
            // Inject mocks for demonstration if they don't exist in data
            if (!allOps.some(j => j.type === 'Internship')) allOps.push({ title: "Graduate Trainee", company: "Leading Sector Firm", type: "Internship", link: "#" });
            if (!allOps.some(j => j.type === 'Freelance')) allOps.push({ title: "Technical Consultant", company: "Project Alpha", type: "Freelance", link: "#" });
            if (!allOps.some(j => j.type === 'Tender')) allOps.push({ title: "RFP: Service Delivery", company: "Government Agency", type: "Tender", link: "#" });
            if (!allOps.some(j => j.type === 'Volunteer')) allOps.push({ title: "Community Mentor", company: "Local Hub", type: "Volunteer", link: "#" });

            // 2. Filter Logic
            let filteredOps = allOps;
            if (filter !== 'all') {
                // Loose matching for prototype
                filteredOps = allOps.filter(j => (j.type && j.type.toLowerCase().includes(filter)) || (filter === 'entry' && !j.type)); 
            }

            const opsHtml = filteredOps.map(j => `
                <a href="${j.link || '#'}" target="_blank" class="block p-3 border border-slate-200 rounded-lg bg-white hover:border-cyan-300 transition-colors group">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex gap-1">
                            <span class="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded inline-block uppercase tracking-wide">${j.type || 'Full-Time'}</span>
                            ${j.gsa_member ? '<span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded inline-block uppercase tracking-wide">UNESCO</span>' : ''}
                        </div>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-cyan-500"></i>
                    </div>
                    <div class="font-bold text-sm text-slate-800 group-hover:text-cyan-700">${j.title}</div>
                    <div class="text-xs text-slate-500 mb-1">${j.company} • ${activeCountry === 'all' ? 'Regional' : activeCountry}</div>
                </a>
            `).join('');

            // 3. Kit Configuration per Type
            const kits = {
                'all': { title: "General Job Application Kit", icon: "briefcase", cv: "Standard Professional CV", check: "LinkedIn Updated, References Ready", test: "General Aptitude" },
                'internship': { title: "Internship Starter Kit", icon: "graduation-cap", cv: "Academic/Project-based CV", check: "Transcript, Cover Letter", test: "Basic Logic / Personality" },
                'freelance': { title: "Freelancer Toolkit", icon: "laptop", cv: "Portfolio/Case Studies", check: "Rate Card, Contract Template", test: "Skill Assessment (e.g. Coding)" },
                'tender': { title: "Founder Tender Kit", icon: "file-text", cv: "Company Profile / Capability Statement", check: "Tax Compliance, Registration Certs", test: "Technical Proposal Evaluation" },
                'volunteer': { title: "Volunteer Kit", icon: "heart", cv: "Skills-based Resume", check: "Availability Schedule, Motivation Statement", test: "Values Alignment" }
            };
            const activeKit = kits[filter] || kits['all'];
            const getBtnClass = (f) => filter === f ? "bg-cyan-600 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";

            container.innerHTML = `
                <div class="animate-fade-in">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    
                    <div class="mb-4">
                        <h3 class="font-bold text-slate-800 mb-1 flex items-center gap-2"><i data-lucide="briefcase" class="w-5 h-5 text-cyan-600"></i> Opportunity Aggregator</h3>
                        <p class="text-xs text-slate-500">Curated listings across the ecosystem.</p>
                    </div>

                    <div class="flex gap-2 mb-4 overflow-x-auto pb-1 shrink-0">
                        <button onclick="showJobBoardView('all')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('all')}">All</button>
                        <button onclick="showJobBoardView('internship')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('internship')}">Internships</button>
                        <button onclick="showJobBoardView('freelance')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('freelance')}">Freelance</button>
                        <button onclick="showJobBoardView('tender')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('tender')}">Tenders</button>
                        <button onclick="showJobBoardView('volunteer')" class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${getBtnClass('volunteer')}">Volunteer</button>
                    </div>

                    <!-- Application Kit Card -->
                    <div class="mb-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 text-white shadow-md shrink-0">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-sm flex items-center gap-2"><i data-lucide="${activeKit.icon}" class="w-4 h-4 text-cyan-400"></i> ${activeKit.title}</h4>
                            <span class="text-[9px] bg-white/10 px-2 py-0.5 rounded uppercase tracking-wider">Ready-to-Use</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-300 mb-3">
                            <div>• ${activeKit.cv}</div>
                            <div>• ${activeKit.check}</div>
                            <div class="col-span-2">• Screening: ${activeKit.test}</div>
                        </div>
                        <button onclick="renderApplicationKit('${filter}')" class="w-full py-2 bg-white text-slate-900 font-bold rounded-lg text-xs hover:bg-cyan-50 transition-colors flex items-center justify-center gap-2">
                            <i data-lucide="download" class="w-3 h-3"></i> View Application Kit
                        </button>
                    </div>

                    <div class="space-y-3 overflow-y-auto pr-1 pb-4">
                        ${opsHtml.length > 0 ? opsHtml : '<p class="text-sm text-slate-500 italic text-center py-4">No specific opportunities found for this category yet.</p>'}
                        <div class="p-3 bg-slate-50 rounded text-xs text-center text-slate-500">
                            Showing opportunities in <strong>${activeSectorId}</strong>. Includes national, regional, and global listings.
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Render Application Kit ---
        window.renderApplicationKit = function(type) {
            const container = document.getElementById('career-hub-content');
            
            const kits = {
                'all': { title: "General Job Application Kit", items: ["Master CV Template", "Cover Letter Guide", "LinkedIn Checklist", "Common Interview Qs"] },
                'internship': { title: "Internship Starter Kit", items: ["No-Experience Resume Template", "University Transcript Guide", "Internship Cover Letter", "Behavioral Interview Prep"] },
                'freelance': { title: "Freelancer Toolkit", items: ["Service Rate Card Template", "Client Contract Draft", "Portfolio Website Checklist", "Proposal Email Script"] },
                'tender': { title: "Founder Tender Kit", items: ["Capability Statement Template", "Tax Compliance Checklist", "Technical Proposal Structure", "Financial Proposal Sheet"] },
                'volunteer': { title: "Volunteer Application Kit", items: ["Motivation Statement Template", "Availability Schedule", "Soft Skills Checklist", "Values Alignment Prep"] }
            };
            const kit = kits[type] || kits['all'];

            container.innerHTML = `
                <div class="animate-fade-in space-y-5">
                    <button onclick="showJobBoardView('${type}')" class="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Opportunities</button>
                    
                    <div class="text-center">
                        <div class="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <i data-lucide="briefcase" class="w-6 h-6"></i>
                        </div>
                        <h3 class="font-bold text-lg text-slate-900">${kit.title}</h3>
                        <p class="text-xs text-slate-500">Everything you need to apply successfully.</p>
                    </div>

                    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div class="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">Included Resources</div>
                        <div class="divide-y divide-slate-100">
                            ${kit.items.map(item => `
                                <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div class="flex items-center gap-3">
                                        <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
                                        <span class="text-sm text-slate-700">${item}</span>
                                    </div>
                                    <button class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100">Access</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                        <h4 class="font-bold text-sm text-indigo-900 mb-2">Next Steps</h4>
                        <ol class="list-decimal list-inside text-xs text-indigo-800 space-y-1">
                            <li>Download the templates above.</li>
                            <li>Customize them for the specific role.</li>
                            <li>Use the <strong>Interview Prep</strong> tool in the main hub.</li>
                        </ol>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Hero Persona Logic ---
        window.updateHeroPersona = function(type) {
            const content = {
                learner: {
                    text: "In 5 minutes, you’ll have a shortlist of occupations you’re suited for + an idea of skills in demand + information on training options in your country.",
                    },
                entrepreneur: {
                    text: "Identify high-potential venture niches, access eco-system resources, and build your capability roadmap.",
                },
                counsellor: {
                    text: "Access labor market intelligence to guide students towards high-growth career paths.",
                },
                provider: {
                    text: "Align your curriculum with real-time market demand and skills gaps.",
                },
                policy: {
                    text: "View workforce data and trends to inform education and employment policy.",
                }
            };

            const data = content[type] || content.learner;
            
            const descEl = document.getElementById('persona-dynamic-text');
            
            if(descEl) {
                descEl.style.opacity = '0';
                setTimeout(() => { descEl.innerHTML = data.text; descEl.style.opacity = '1'; }, 150);
            }

            const styles = {
                learner: { active: "border-indigo-200 bg-indigo-50 text-indigo-700 font-medium shadow-sm", inactive: "border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-300" },
                entrepreneur: { active: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 font-medium shadow-sm", inactive: "border-slate-200 bg-white text-slate-500 hover:text-fuchsia-600 hover:border-fuchsia-300" },
                counsellor: { active: "border-amber-200 bg-amber-50 text-amber-700 font-medium shadow-sm", inactive: "border-slate-200 bg-white text-slate-500 hover:text-amber-600 hover:border-amber-300" },
                provider: { active: "border-emerald-200 bg-emerald-50 text-emerald-700 font-medium shadow-sm", inactive: "border-slate-200 bg-white text-slate-500 hover:text-emerald-600 hover:border-emerald-300" },
                policy: { active: "border-cyan-200 bg-cyan-50 text-cyan-700 font-medium shadow-sm", inactive: "border-slate-200 bg-white text-slate-500 hover:text-cyan-600 hover:border-cyan-300" }
            };

            ['learner', 'entrepreneur', 'counsellor', 'provider', 'policy'].forEach(k => {
                const btn = document.getElementById(`btn-p-${k}`);
                if(btn) {
                    if(k === type) {
                        btn.className = `shrink-0 snap-center whitespace-nowrap px-4 py-1.5 rounded-full text-xs transition-colors ${styles[k].active}`;
                    } else {
                        btn.className = `shrink-0 snap-center whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${styles[k].inactive}`;
                    }
                }
            });
        }

        // --- NEW: Update Hero Stats ---
        window.updateHeroStats = function() {
            let statsContainer = document.getElementById('hero-stats');
            // Auto-inject if missing but hero-desc exists (fallback for existing HTML)
            if (!statsContainer) {
                const descEl = document.getElementById('hero-desc');
                if (descEl && descEl.parentNode) {
                    statsContainer = document.createElement('div');
                    statsContainer.id = 'hero-stats';
                    // Insert after the description
                    descEl.parentNode.insertBefore(statsContainer, descEl.nextSibling);
                } else {
                    return;
                }
            }

            const courseCount = dataManager.courses.length;
            const providerCount = new Set(dataManager.courses.map(c => c.provider)).size;
            const occCount = dataManager.topOccupations.length;
            const skillCount = dataManager.topSkills.length;
            
            let datasetCount = 0;
            if (dataManager.digitalResources) {
                if (Array.isArray(dataManager.digitalResources.evidence_providers)) datasetCount += dataManager.digitalResources.evidence_providers.length;
                ['agri', 'energy', 'digital'].forEach(sector => {
                    if (dataManager.digitalResources[sector] && Array.isArray(dataManager.digitalResources[sector].lmi)) datasetCount += dataManager.digitalResources[sector].lmi.length;
                });
            }

            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

            statsContainer.innerHTML = `
                <div class="mt-4 pt-2 border-t border-slate-200/60 animate-fade-in">
                    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-slate-500 font-medium px-2">
                        <span class="font-bold text-slate-400 uppercase tracking-wide mr-1">Database:</span>
                        <div class="flex items-center gap-1" title="Training Courses"><i data-lucide="book-open" class="w-3 h-3 text-indigo-400"></i> <span>${courseCount} Courses</span></div>
                        <span class="text-slate-300">•</span>
                        <div class="flex items-center gap-1" title="Training Providers"><i data-lucide="building-2" class="w-3 h-3 text-indigo-400"></i> <span>${providerCount} Providers</span></div>
                        <span class="text-slate-300">•</span>
                        <div class="flex items-center gap-1" title="Mapped Occupations"><i data-lucide="briefcase" class="w-3 h-3 text-indigo-400"></i> <span>${occCount} Roles</span></div>
                        <span class="text-slate-300">•</span>
                        <div class="flex items-center gap-1" title="Tracked Skills"><i data-lucide="cpu" class="w-3 h-3 text-indigo-400"></i> <span>${skillCount} Skills</span></div>
                        <span class="ml-2 text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">Updated ${dateStr}</span>
                    </div>
                </div>
            `;
            
            if(window.lucide) lucide.createIcons();
        }

        window.showEntrepreneurshipView = function() {
            const sectorData = getSectorCareerResources(activeSectorId);
            const data = sectorData.entrepreneurship || {};
            const tc = data.theme || 'indigo'; // Default theme color
            const title = data.title || (activeSectorId === 'agri' ? 'Agritech' : activeSectorId === 'energy' ? 'Renewable Energy' : 'Digital Economy');

            const incubatorHtml = (data.incubators || []).map(i => `
                <a href="${i.link}" target="_blank" class="p-3 bg-white border border-slate-200 rounded-lg hover:border-${tc}-400 transition-colors group block shadow-sm">
                    <div class="font-bold text-xs text-slate-800 flex justify-between items-center group-hover:text-${tc}-700">
                        ${i.name} <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-${tc}-500"></i>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1 leading-tight">${i.desc}</div>
                </a>
            `).join('');

            const fundingHtml = (data.funding || []).map(f => `
                <a href="${f.link}" target="_blank" class="p-3 bg-white border border-slate-200 rounded-lg hover:border-${tc}-400 transition-colors group block shadow-sm">
                    <div class="font-bold text-xs text-slate-800 flex justify-between items-center group-hover:text-${tc}-700">
                        <span class="flex items-center gap-1">
                            ${f.name}
                            ${f.gsa_member ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">UNESCO</span>' : ''}
                        </span>
                        <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-${tc}-500"></i>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1 leading-tight">${f.desc}</div>
                </a>
            `).join('');

            const toolsHtml = (data.tools || []).map(t => `
                <a href="${t.link}" target="_blank" class="flex items-center gap-3 p-2 bg-${tc}-50/50 rounded-lg border border-${tc}-100 hover:bg-${tc}-100 hover:border-${tc}-300 transition-all group">
                    <div class="p-1.5 bg-white text-${tc}-600 rounded shadow-sm group-hover:scale-110 transition-transform"><i data-lucide="${t.icon}" class="w-4 h-4"></i></div>
                    <div class="flex-1">
                        <div class="text-xs font-bold text-slate-800 flex justify-between items-center">
                            ${t.name} <i data-lucide="external-link" class="w-3 h-3 text-${tc}-400 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                        </div>
                        <div class="text-[10px] text-slate-500">${t.desc}</div>
                    </div>
                </a>
            `).join('');

            const container = document.getElementById('career-hub-content');
            container.innerHTML = `
                <div class="animate-fade-in space-y-5">
                    <!-- Header -->
                    <div>
                        <button onclick="resetCareerHub()" class="mb-3 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-${tc}-100 text-${tc}-700 border border-${tc}-200">${title} Sector</span>
                        </div>
                        <h3 class="font-bold text-lg text-slate-900 flex items-center gap-2">
                            <i data-lucide="rocket" class="w-5 h-5 text-orange-600"></i> Founder Launchpad
                        </h3>
                        <p class="text-xs text-slate-500">Curated resources to start and scale your ${title} venture.</p>
                    </div>

                    <!-- Incubators -->
                    <div>
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><i data-lucide="warehouse" class="w-3 h-3"></i> Incubators & Hubs</h4>
                        <div class="space-y-2">
                            ${incubatorHtml}
                        </div>
                    </div>

                    <!-- Funding -->
                    <div>
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><i data-lucide="banknote" class="w-3 h-3"></i> Grants & Funding</h4>
                        <div class="space-y-2">
                            ${fundingHtml}
                        </div>
                    </div>

                    <!-- Toolkit -->
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">🧰 The Founder's Toolkit</h4>
                        <div class="space-y-2">
                            ${toolsHtml}
                            <a href="https://accounts.ecitizen.go.ke" target="_blank" class="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100 mt-2 hover:bg-slate-100 hover:border-slate-300 transition-all group">
                                <div class="p-1.5 bg-white text-slate-600 rounded shadow-sm"><i data-lucide="file-text" class="w-4 h-4"></i></div>
                                <div class="flex-1">
                                    <div class="text-xs font-bold text-slate-800 flex justify-between items-center">
                                        Business Registration <i data-lucide="external-link" class="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                                    </div>
                                    <div class="text-[10px] text-slate-500">e-Citizen (KE) / RDB (RW) / BRELA (TZ).</div>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: AI Tools View ---
        window.showAIToolsView = function() {
            const container = document.getElementById('career-hub-content');
            
            const aiTools = [
                { title: "ChatGPT / Claude", desc: "Drafting cover letters & interview practice.", link: "https://chat.openai.com/", icon: "message-square" },
                { title: "Resume Worded", desc: "AI scoring for your CV content.", link: "https://resumeworded.com/", icon: "file-text" },
                { title: "CareerVillage Coach", desc: "Personalized AI Career Coach.", link: "https://www.careervillage.org/", icon: "user-check" },
                { title: "Interview Warmup", desc: "Google's AI interview practice tool.", link: "https://grow.google/certificates/interview-warmup/", icon: "mic" },
                { title: "TealHQ", desc: "AI Resume Builder & Job Tracker.", link: "https://www.tealhq.com/", icon: "briefcase" },
                { title: "Yoodli", desc: "AI Interview Speech Coach.", link: "https://yoodli.ai/", icon: "video" }
            ];

            const toolsHtml = aiTools.map(t => `
                <a href="${t.link}" target="_blank" class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-indigo-300 bg-white group transition-all">
                    <div class="p-2 bg-indigo-50 text-indigo-600 rounded"><i data-lucide="${t.icon}" class="w-4 h-4"></i></div>
                    <div>
                        <div class="font-bold text-sm text-slate-800 group-hover:text-indigo-700">${t.title}</div>
                        <div class="text-xs text-slate-500">${t.desc}</div>
                    </div>
                    <i data-lucide="external-link" class="w-3 h-3 text-slate-300 group-hover:text-indigo-500 ml-auto"></i>
                </a>
            `).join('');

            container.innerHTML = `
                <div class="animate-fade-in">
                    <button onclick="resetCareerHub()" class="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>
                    <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="cpu" class="w-5 h-5 text-indigo-500"></i> AI Career Tools</h3>
                    
                    <!-- Internal Tool Feature -->
                    <button onclick="showInterviewPrep()" class="w-full p-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-white shadow-md mb-6 text-left group relative overflow-hidden">
                        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <i data-lucide="mic" class="w-24 h-24 text-white"></i>
                        </div>
                        <div class="relative z-10">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="p-1.5 bg-white/20 rounded-lg"><i data-lucide="mic" class="w-5 h-5 text-white"></i></div>
                                <span class="text-xs font-bold uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded">Featured Tool</span>
                            </div>
                            <h4 class="font-bold text-lg mb-1">AI Interview Coach</h4>
                            <p class="text-xs text-emerald-50 mb-3 max-w-xs">Practice answering common questions and get instant AI feedback on your delivery.</p>
                            <div class="inline-flex items-center gap-2 text-xs font-bold bg-white text-emerald-600 px-3 py-1.5 rounded-lg group-hover:bg-emerald-50 transition-colors">
                                Start Practice <i data-lucide="arrow-right" class="w-3 h-3"></i>
                            </div>
                        </div>
                    </button>

                    <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mb-6">
                        <h4 class="font-bold text-sm text-indigo-900 mb-2">Leverage AI for your Job Search</h4>
                        <p class="text-xs text-indigo-800 leading-relaxed">Use these tools to optimize your resume, practice for interviews, and get personalized career advice. Always review AI outputs for accuracy.</p>
                    </div>

                    <div class="space-y-3">
                        ${toolsHtml}
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.resetCareerHub = function() {
            document.getElementById('career-hub-content').innerHTML = `
                <div class="space-y-4">
                    <!-- Filters -->
                    <div class="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 grid grid-cols-2 gap-3">
                        <div>
                            <label for="career-country-select" class="block text-[10px] font-bold text-indigo-900 mb-1">Location</label>
                            <select id="career-country-select" onchange="setGlobalCountry(this.value)" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                                <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>Regional</option>
                                <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                                <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                                <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                                <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                                <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                                <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                                <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DR Congo</option>
                                <option value="Somalia" ${activeCountry === 'Somalia' ? 'selected' : ''}>Somalia</option>
                            </select>
                        </div>
                        <div>
                            <label for="career-sector-select" class="block text-[10px] font-bold text-indigo-900 mb-1">Sector</label>
                            <select id="career-sector-select" onchange="setGlobalSector(this.value)" class="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                                <option value="agri" ${activeSectorId === 'agri' ? 'selected' : ''}>Agritech</option>
                                <option value="energy" ${activeSectorId === 'energy' ? 'selected' : ''}>Renewable Energy</option>
                                <option value="digital" ${activeSectorId === 'digital' ? 'selected' : ''}>Digital Economy</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <!-- 1. Market Intel -->
                        <button onclick="showWorkforceDataView()" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                            <div class="p-2 bg-indigo-100 text-indigo-600 rounded-lg w-fit mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><i data-lucide="line-chart" class="w-5 h-5"></i></div>
                            <h4 class="font-bold text-slate-800 text-sm">Market Intel</h4>
                            <p class="text-xs text-slate-500 mt-1">Trends & Data</p>
                        </button>
                        
                        <!-- 2. CV & Tools -->
                        <button onclick="showCVResources()" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-purple-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                            <div class="p-2 bg-purple-100 text-purple-600 rounded-lg w-fit mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors"><i data-lucide="file-text" class="w-5 h-5"></i></div>
                            <h4 class="font-bold text-slate-800 text-sm">CV & Tools</h4>
                            <p class="text-xs text-slate-500 mt-1">Builder & Templates</p>
                        </button>
                        
                        <!-- 3. Mentorship -->
                        <button onclick="showMentorshipView()" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                            <div class="p-2 bg-blue-100 text-blue-600 rounded-lg w-fit mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors"><i data-lucide="user-check" class="w-5 h-5"></i></div>
                            <h4 class="font-bold text-slate-800 text-sm">Mentorship</h4>
                            <p class="text-xs text-slate-500 mt-1">Communities & Networks</p>
                        </button>

                        <!-- 4. Job Board -->
                        <button onclick="showJobBoardView()" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-cyan-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                            <div class="p-2 bg-cyan-100 text-cyan-600 rounded-lg w-fit mb-3 group-hover:bg-cyan-600 group-hover:text-white transition-colors"><i data-lucide="briefcase" class="w-5 h-5"></i></div>
                            <h4 class="font-bold text-slate-800 text-sm">Opportunities</h4>
                            <p class="text-xs text-slate-500 mt-1">Jobs, Gigs & Tenders</p>
                        </button>
                        
                        <!-- 5. Employer Connect -->
                        <button onclick="showEmployerConnectView()" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-pink-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                            <div class="p-2 bg-pink-100 text-pink-600 rounded-lg w-fit mb-3 group-hover:bg-pink-600 group-hover:text-white transition-colors"><i data-lucide="handshake" class="w-5 h-5"></i></div>
                            <h4 class="font-bold text-slate-800 text-sm">Employer Connect</h4>
                            <p class="text-xs text-slate-500 mt-1">Fairs & Alumni</p>
                        </button>

                        <!-- 6. AI Tools -->
                        <button onclick="showAIToolsView()" class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-white hover:shadow-sm text-left transition-all group">
                            <div class="p-2 bg-indigo-100 text-indigo-600 rounded-lg w-fit mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><i data-lucide="cpu" class="w-5 h-5"></i></div>
                            <h4 class="font-bold text-slate-800 text-sm">AI Tools</h4>
                            <p class="text-xs text-slate-500 mt-1">Resume & Interview AI</p>
                        </button>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.togglePathwayResults = function() {
            const results = document.getElementById('pathway-results');
            const form = document.getElementById('pathway-form');
            if(results.classList.contains('hidden')) {
                results.classList.remove('hidden');
                form.classList.add('opacity-50', 'pointer-events-none');
            } else {
                results.classList.add('hidden');
                form.classList.remove('opacity-50', 'pointer-events-none');
            }
        }

        // --- NEW: Toggle More Filters in Training Hub ---
        window.toggleMoreFilters = function() {
            const advancedFilters = document.getElementById('advanced-filters');
            const btn = document.getElementById('more-filters-btn');
            const isHidden = advancedFilters.classList.contains('hidden');

            if (isHidden) {
                advancedFilters.classList.remove('hidden');
                btn.innerHTML = `<i data-lucide="minus-circle" class="w-3 h-3"></i> Less Filters`;
            } else {
                advancedFilters.classList.add('hidden');
                btn.innerHTML = `<i data-lucide="plus-circle" class="w-3 h-3"></i> More Filters`;
            }
            if(window.lucide) lucide.createIcons();
        }

        window.clearCourseFilters = function() {
            const inputs = ['filter-search', 'filter-country', 'filter-sector', 'filter-topic', 'filter-duration', 'filter-mode', 'filter-cost', 'filter-type', 'filter-lang', 'filter-feature'];
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = id === 'filter-search' ? '' : 'all';
            });
            renderProviderTable();
        }

        // Helper to parse duration string to months
        function parseDuration(dur) {
            if (!dur) return null;
            dur = dur.toLowerCase();
            const match = dur.match(/[\d\.]+/);
            if (!match) return null;
            
            const num = parseFloat(match[0]);
            if (dur.includes('year')) return num * 12;
            if (dur.includes('month')) return num;
            if (dur.includes('week')) return num / 4.33;
            if (dur.includes('day')) return num / 30;
            if (dur.includes('hour')) return num / 730;
            return null;
        }

        window.renderProviderTable = function() {
            const countryFilter = document.getElementById('filter-country') ? document.getElementById('filter-country').value : 'all';
            const secFilter = document.getElementById('filter-sector') ? document.getElementById('filter-sector').value : 'all';
            const topicFilter = document.getElementById('filter-topic') ? document.getElementById('filter-topic').value : 'all';
            const durationFilter = document.getElementById('filter-duration') ? document.getElementById('filter-duration').value : 'all';
            const modeFilter = document.getElementById('filter-mode') ? document.getElementById('filter-mode').value : 'all';
            const costFilter = document.getElementById('filter-cost') ? document.getElementById('filter-cost').value : 'all';
            const typeFilter = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'all';
            const langFilter = document.getElementById('filter-lang') ? document.getElementById('filter-lang').value : 'all';
            const featureFilter = document.getElementById('filter-feature') ? document.getElementById('filter-feature').value : 'all';
            const searchFilter = document.getElementById('filter-search') ? document.getElementById('filter-search').value.toLowerCase() : '';
            const tbody = document.getElementById('db-body');
            const mobileContainer = document.getElementById('db-mobile-cards');
            
            if (!tbody) return;
            tbody.innerHTML = '';
            if (mobileContainer) mobileContainer.innerHTML = '';

            // Use DataManager courses or fallback to realCourses from data.js
            let courses = dataManager.courses && dataManager.courses.length > 0 ? dataManager.courses : (typeof realCourses !== 'undefined' ? realCourses : []);

            const filtered = courses.filter(c => {
                const matchCountry = countryFilter === 'all' || c.country === 'all' || c.country === countryFilter;
                const matchSector = secFilter === 'all' || c.sector === secFilter;
                
                let matchTopic = true;
                if (topicFilter !== 'all') {
                    const text = (c.name + ' ' + (c.skills || []).join(' ')).toLowerCase();
                    if (topicFilter === 'ai') matchTopic = text.includes('ai') || text.includes('data') || text.includes('intelligence') || text.includes('machine');
                    else if (topicFilter === 'dev') matchTopic = text.includes('software') || text.includes('web') || text.includes('app') || text.includes('code') || text.includes('cloud');
                    else if (topicFilter === 'green') matchTopic = text.includes('solar') || text.includes('energy') || text.includes('wind') || text.includes('climate');
                    else if (topicFilter === 'agri') matchTopic = text.includes('agri') || text.includes('farm') || text.includes('crop') || text.includes('food');
                    else if (topicFilter === 'biz') matchTopic = text.includes('business') || text.includes('management') || text.includes('finance') || text.includes('marketing');
                }

                const matchMode = modeFilter === 'all' || (c.mode && c.mode.toLowerCase() === modeFilter.toLowerCase()) || (modeFilter.toLowerCase() === 'hybrid' && (c.mode === 'Blended' || c.mode === 'Hybrid'));
                
                let matchDuration = true;
                if (durationFilter !== 'all') {
                    const months = parseDuration(c.duration);
                    if (months === null) matchDuration = false; // Exclude variable/self-paced from specific time buckets
                    else if (durationFilter === 'short') matchDuration = months < 1;
                    else if (durationFilter === '1-3m') matchDuration = months >= 1 && months <= 3;
                    else if (durationFilter === '3-6m') matchDuration = months > 3 && months <= 6;
                    else if (durationFilter === '6-12m') matchDuration = months > 6 && months <= 12;
                    else if (durationFilter === '1-2y') matchDuration = months > 12 && months <= 24;
                    else if (durationFilter === '2y+') matchDuration = months > 24;
                }
                
                // Granular Filters
                const matchCost = costFilter === 'all' || (costFilter === 'free' ? (c.cost && c.cost.toLowerCase().includes('free')) : (c.cost && !c.cost.toLowerCase().includes('free')));
                const matchLang = langFilter === 'all' || (c.language && c.language.includes(langFilter));
                
                let matchType = true;
                if (typeFilter !== 'all') {
                    const t = (c.type || '').toLowerCase();
                    if (typeFilter === 'cert') matchType = t.includes('certificate') || t.includes('credential') || t.includes('specialization') || t.includes('license') || t.includes('certification');
                    else if (typeFilter === 'micro') matchType = t.includes('micro');
                    else if (typeFilter === 'degree') matchType = t.includes('degree') || t.includes('diploma') || t.includes('master') || t.includes('bachelor');
                    else if (typeFilter === 'bootcamp') matchType = t.includes('bootcamp') || t.includes('initiative') || t.includes('short') || t.includes('path');
                    else if (typeFilter === 'tvet') matchType = t.includes('tvet') || t.includes('polytechnic');
                    else if (typeFilter === 'platform') matchType = t.includes('platform') || t.includes('community') || t.includes('provider') || t.includes('academy');
                }

                let matchFeature = true;
                if (featureFilter === 'unesco') matchFeature = c.gsa_member || c.unesco_unevoc;
                else if (featureFilter === 'women') matchFeature = c.women_focused;

                const matchSearch = searchFilter === '' || (c.name && c.name.toLowerCase().includes(searchFilter)) || (c.provider && c.provider.toLowerCase().includes(searchFilter));

                return matchCountry && matchSector && matchTopic && matchDuration && matchMode && matchCost && matchLang && matchType && matchFeature && matchSearch;
            });

            if (filtered.length === 0) {
                const noResultsHtml = `
                    <div class="flex flex-col items-center justify-center py-8 text-center w-full">
                        <div class="bg-slate-50 p-3 rounded-full mb-3"><i data-lucide="search-x" class="w-6 h-6 text-slate-400"></i></div>
                        <p class="text-sm text-slate-600 font-medium mb-2">No courses found matching your filters.</p>
                        <button onclick="clearCourseFilters()" class="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            <i data-lucide="rotate-ccw" class="w-3 h-3"></i> Clear Filters
                        </button>
                    </div>
                `;
                tbody.innerHTML = `<tr><td colspan="6" class="p-0">${noResultsHtml}</td></tr>`;
                if (mobileContainer) mobileContainer.innerHTML = noResultsHtml;
            }

            // Sort: Specific Country > Global ('all')
            filtered.sort((a, b) => {
                const aIsGlobal = a.country === 'all';
                const bIsGlobal = b.country === 'all';
                
                if (!aIsGlobal && bIsGlobal) return -1;
                if (aIsGlobal && !bIsGlobal) return 1;
                
                // If both are specific or both are global, sort by name
                if (!aIsGlobal && !bIsGlobal) return a.country.localeCompare(b.country);
                return a.name.localeCompare(b.name);
            });

            filtered.forEach(c => {
                // Outcome Data Logic
                const outcome = c.outcomeData || window.generateOutcomeScorecard(c.provider, c.type);
                const rating = outcome.stars || 1;
                
                let stars = '';
                for(let i=0; i<5; i++) { stars += i < rating ? '★' : '☆'; }
                
                let badgeClass = 'star-1';
                let qualityText = 'No Data';
                if(rating === 5) { badgeClass = 'star-5'; qualityText = 'Indep. Audit'; }
                else if(rating >= 3) { badgeClass = 'star-3'; qualityText = 'Self-Reported'; }
                
                // Metric Display
                let metricDisplay = outcome.uplift || outcome.placement?.d90 || "No Data";
                if (metricDisplay === "No Data" && outcome.placement?.m6) metricDisplay = outcome.placement.m6;

                // Sector Display
                const sectorDisplay = c.sector === 'agri' ? 'Agriculture' : c.sector === 'energy' ? 'Renewable Energy' : c.sector === 'digital' ? 'Digital Economy' : 'Multi-Sector';

                // Trust Tags for Table
                let trustIcons = '';
                if (outcome.accreditation === 'Accredited') {
                    trustIcons += `<i data-lucide="shield-check" class="w-3 h-3 text-emerald-500" title="Accredited"></i>`;
                }
                if (outcome.stackable) {
                    trustIcons += `<i data-lucide="layers" class="w-3 h-3 text-blue-500" title="Stackable"></i>`;
                }

                // Mobile Card HTML
                if (mobileContainer) {
                    const mobileCard = `
                        <div class="p-4 space-y-3">
                            <div class="flex justify-between items-start gap-3">
                                <div class="flex-1">
                                    <div class="font-bold text-sm text-slate-800 leading-tight mb-1">${c.name}</div>
                                    <div class="text-xs text-slate-500 flex items-center gap-1">
                                        ${c.provider}
                                        ${trustIcons}
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    ${c.gsa_member ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold whitespace-nowrap">UNESCO GSA</span>' : ''}
                                    ${c.unesco_unevoc ? '<span class="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200 font-bold whitespace-nowrap">UNEVOC</span>' : ''}
                                    ${c.women_focused ? '<span class="text-[9px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded border border-pink-200 font-bold whitespace-nowrap">Women-Focused</span>' : ''}
                                </div>
                            </div>
                            
                            <div class="flex flex-wrap gap-2">
                                <span class="px-2 py-1 bg-slate-50 text-slate-600 rounded text-[10px] border border-slate-100 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${c.mode}</span>
                                <span class="px-2 py-1 bg-slate-50 text-slate-600 rounded text-[10px] border border-slate-100 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> ${c.duration}</span>
                                <span class="px-2 py-1 bg-slate-50 text-slate-600 rounded text-[10px] border border-slate-100 flex items-center gap-1"><i data-lucide="banknote" class="w-3 h-3"></i> ${c.cost}</span>
                            </div>

                            <div class="flex items-center justify-between pt-2 border-t border-slate-50">
                                <div class="flex flex-col gap-1">
                                    <span class="${badgeClass} px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 w-fit">
                                        <span>${stars}</span> ${outcome.methodology || qualityText}
                                    </span>
                                    <div class="font-mono font-bold text-xs ${metricDisplay === 'No Data' ? 'text-slate-300' : 'text-blue-600'}">
                                        ${metricDisplay}
                                    </div>
                                </div>
                                ${c.url ? `
                                <a href="${c.url}" target="_blank" class="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors">
                                    View <i data-lucide="external-link" class="w-3 h-3"></i>
                                </a>` : `<span class="text-[10px] text-slate-300 cursor-not-allowed">N/A</span>`}
                            </div>
                        </div>
                    `;
                    mobileContainer.innerHTML += mobileCard;
                }

                const row = `
                    <tr class="hover:bg-slate-50 transition group border-b border-slate-50 last:border-0">
                        <td class="px-3 py-3">
                            <div class="font-bold text-slate-800 text-xs flex items-center gap-1 flex-wrap">
                                ${c.name}
                                ${c.gsa_member ? '<span title="UNESCO Global Skills Academy Partner" class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">UNESCO GSA</span>' : ''}
                                ${c.unesco_unevoc ? '<span title="UNESCO-UNEVOC Network Member" class="text-[9px] bg-orange-100 text-orange-700 px-1 rounded border border-orange-200">UNEVOC</span>' : ''}
                                ${c.women_focused ? '<span title="Women-Focused Program" class="text-[9px] bg-pink-100 text-pink-700 px-1 rounded border border-pink-200">Women-Focused</span>' : ''}
                            </div>
                            <div class="flex items-center gap-1 mt-0.5">${trustIcons} <span class="text-[10px] text-slate-500 truncate max-w-[120px]">${c.provider}</span></div>
                        </td>
                        <td class="px-3 py-3">
                            <div class="text-[10px] text-slate-600 font-medium">${sectorDisplay}</div>
                            <div class="text-[9px] text-slate-400">${c.mode} • ${c.duration}</div>
                        </td>
                        <td class="px-3 py-3">
                            <span class="${badgeClass} px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                                <span>${stars}</span> ${outcome.methodology || qualityText}
                            </span>
                        </td>
                        <td class="px-3 py-3">
                            <div class="font-mono font-bold text-xs ${metricDisplay === 'No Data' ? 'text-slate-300' : 'text-blue-600'}">
                                ${metricDisplay}
                            </div>
                        </td>
                        <td class="px-3 py-3">
                            <div class="text-[10px] text-slate-500 font-medium">${c.lastUpdated || 'N/A'}</div>
                        </td>
                        <td class="px-3 py-3 text-right">
                            ${c.url ? `
                            <a href="${c.url}" target="_blank" class="text-slate-400 hover:text-blue-600 transition">
                                <i data-lucide="external-link" class="w-3 h-3"></i>
                            </a>` : `<span class="text-[10px] text-slate-300 cursor-not-allowed">N/A</span>`}
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
            const counter = document.getElementById('provider-counter');
            if(counter) counter.innerText = `Showing ${filtered.length} courses`;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Render Financial Aid ---
        window.renderFinancialAid = function() {
            const container = document.getElementById('financial-aid-list');
            if (!container) return;

            const countryFilter = document.getElementById('finance-filter-country') ? document.getElementById('finance-filter-country').value : 'all';
            const typeFilter = document.getElementById('finance-filter-type') ? document.getElementById('finance-filter-type').value : 'all';

            let items = dataManager.scholarships || [];

            // Filter
            items = items.filter(item => {
                const matchCountry = countryFilter === 'all' || item.country === 'Regional' || item.country === countryFilter;
                const matchType = typeFilter === 'all' || item.type.includes(typeFilter);
                return matchCountry && matchType;
            });

            if (items.length === 0) {
                container.innerHTML = `<div class="text-xs text-slate-500 italic text-center py-4">No financial aid opportunities found for these filters.</div>`;
                return;
            }

            container.innerHTML = items.map(item => `
                <div class="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition-all shadow-sm group">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <div class="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-0.5">${item.provider}</div>
                            <h4 class="font-bold text-sm text-slate-900 group-hover:text-indigo-700">${item.name}</h4>
                        </div>
                        <span class="px-2 py-1 rounded text-[10px] font-bold shrink-0 ${item.type === 'Loan' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}">${item.type}</span>
                    </div>
                    <p class="text-xs text-slate-600 mb-3 leading-relaxed">${item.desc}</p>
                    <div class="flex flex-wrap items-center justify-between gap-y-2 pt-3 border-t border-slate-50">
                        <div class="text-[10px] text-slate-500 font-medium flex flex-wrap gap-3">
                            <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${item.country}</span>
                            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> ${item.deadline}</span>
                        </div>
                        <a href="${item.link}" target="_blank" class="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">Apply <i data-lucide="external-link" class="w-3 h-3"></i></a>
                    </div>
                </div>
            `).join('');
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Render Unified Financial Aid (Skills Hub) ---
        window.renderUnifiedFinancialAid = function() {
            const container = document.getElementById('pp-finance');
            if(!container) return;

            // Render Layout if empty
            if(container.innerHTML.trim() === '') {
                container.innerHTML = `
                    <div class="bg-purple-50 rounded-xl p-4 border border-purple-100 flex items-start gap-3">
                        <div class="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0"><i data-lucide="banknote" class="w-5 h-5"></i></div>
                        <div>
                            <h3 class="font-bold text-purple-900 text-sm">Scholarships & Loans</h3>
                            <p class="text-xs text-purple-700 mt-1">Find financial support for your education across East Africa. Filter by country or aid type.</p>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div class="flex flex-col sm:flex-row gap-3 mb-4">
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-slate-500 mb-1">Country</label>
                                <select id="pp-finance-filter-country" onchange="updateUnifiedAidList()" class="w-full text-xs border border-slate-300 rounded-lg px-2 py-2 focus:ring-purple-500">
                                    <option value="all">All Countries</option>
                                    <option value="Kenya">Kenya</option>
                                    <option value="Tanzania">Tanzania</option>
                                    <option value="Uganda">Uganda</option>
                                    <option value="Rwanda">Rwanda</option>
                                    <option value="Regional">Regional</option>
                                </select>
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-slate-500 mb-1">Type</label>
                                <select id="pp-finance-filter-type" onchange="updateUnifiedAidList()" class="w-full text-xs border border-slate-300 rounded-lg px-2 py-2 focus:ring-purple-500">
                                    <option value="all">All Types</option>
                                    <option value="Scholarship">Scholarship</option>
                                    <option value="Loan">Loan</option>
                                    <option value="Grant">Grant</option>
                                </select>
                            </div>
                        </div>
                        <div id="pp-finance-list" class="space-y-3"></div>
                    </div>
                `;
            }
            
            updateUnifiedAidList();
            if(window.lucide) lucide.createIcons();
        }

        window.updateUnifiedAidList = function() {
            const container = document.getElementById('pp-finance-list');
            if (!container) return;

            const countryFilter = document.getElementById('pp-finance-filter-country').value;
            const typeFilter = document.getElementById('pp-finance-filter-type').value;

            let items = dataManager.scholarships || [];

            // Filter
            items = items.filter(item => {
                const matchCountry = countryFilter === 'all' || item.country === 'Regional' || item.country === countryFilter;
                const matchType = typeFilter === 'all' || item.type.includes(typeFilter);
                return matchCountry && matchType;
            });

            if (items.length === 0) {
                container.innerHTML = `<div class="text-xs text-slate-500 italic text-center py-4">No financial aid opportunities found for these filters.</div>`;
                return;
            }

            container.innerHTML = items.map(item => `
                <div class="p-4 bg-white border border-slate-100 rounded-lg hover:border-purple-300 transition-all shadow-sm group">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <div class="text-xs font-bold text-purple-600 uppercase tracking-wide mb-0.5">${item.provider}</div>
                            <h4 class="font-bold text-sm text-slate-900 group-hover:text-purple-700">${item.name}</h4>
                        </div>
                        <span class="px-2 py-1 rounded text-[10px] font-bold shrink-0 ${item.type === 'Loan' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}">${item.type}</span>
                    </div>
                    <p class="text-xs text-slate-600 mb-3 leading-relaxed">${item.desc}</p>
                    <div class="flex flex-wrap items-center justify-between gap-y-2 pt-3 border-t border-slate-50">
                        <div class="text-[10px] text-slate-500 font-medium flex flex-wrap gap-3">
                            <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${item.country}</span>
                            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> ${item.deadline}</span>
                        </div>
                        <a href="${item.link}" target="_blank" class="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1">Apply <i data-lucide="external-link" class="w-3 h-3"></i></a>
                    </div>
                </div>
            `).join('');
            
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Render Training Hub Drawer Courses ---
        window.renderTrainingHubCourses = function() {
            const countryFilter = document.getElementById('drawer-hub-country') ? document.getElementById('drawer-hub-country').value : 'all';
            const langFilter = document.getElementById('drawer-hub-language') ? document.getElementById('drawer-hub-language').value : 'all';
            const secFilter = document.getElementById('drawer-hub-sector') ? document.getElementById('drawer-hub-sector').value : 'all';
            const modeFilter = document.getElementById('drawer-hub-mode-quick') ? document.getElementById('drawer-hub-mode-quick').value : 'all';
            
            // Advanced filters
            const typeFilter = document.getElementById('drawer-hub-course-type') ? document.getElementById('drawer-hub-course-type').value : 'all';
            const budgetFilter = document.getElementById('drawer-hub-budget') ? document.getElementById('drawer-hub-budget').value : 'all';

            const container = document.getElementById('training-hub-results');
            if (!container) return;
            container.innerHTML = '';

            let courses = dataManager.courses && dataManager.courses.length > 0 ? dataManager.courses : (typeof realCourses !== 'undefined' ? realCourses : []);

            const filtered = courses.filter(c => {
                const matchCountry = countryFilter === 'all' || c.country === 'all' || c.country === countryFilter;
                const matchSector = secFilter === 'all' || c.sector === secFilter;
                const matchLang = langFilter === 'all' || (c.language && c.language.includes(langFilter));
                const matchMode = modeFilter === 'all' || (c.mode && c.mode.toLowerCase() === modeFilter.toLowerCase()) || (modeFilter.toLowerCase() === 'hybrid' && (c.mode === 'Blended' || c.mode === 'Hybrid'));
                
                let matchType = true;
                if (typeFilter !== 'all') {
                    const t = (c.type || '').toLowerCase();
                    if (typeFilter === 'certificate') matchType = t.includes('certificate');
                    else if (typeFilter === 'micro-credential') matchType = t.includes('micro');
                    else if (typeFilter === 'tvet') matchType = t.includes('tvet') || t.includes('diploma');
                    else if (typeFilter === 'university') matchType = t.includes('degree') || t.includes('bachelor') || t.includes('master');
                    else if (typeFilter === 'bootcamp') matchType = t.includes('bootcamp');
                }

                let matchBudget = true;
                if (budgetFilter !== 'all') {
                    const cost = (c.cost || '').toLowerCase();
                    if (budgetFilter === 'low') matchBudget = cost.includes('free') || cost.includes('subsidized');
                    else if (budgetFilter === 'medium') matchBudget = !cost.includes('free') && !cost.includes('high');
                    else if (budgetFilter === 'high') matchBudget = cost.includes('high');
                }

                return matchCountry && matchSector && matchLang && matchMode && matchType && matchBudget;
            });

            container.innerHTML = formatTrainingList(filtered);
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Render Launchpad Tab (Unified Hub) ---
        window.renderLaunchpadTab = function() {
            const container = document.getElementById('pp-launchpad');
            if(!container) return;
            
            const sector = activeSectorId;
            const sectorData = getSectorCareerResources(sector);
            const data = sectorData.entrepreneurship || {};
            const themeConfig = (typeof sectorThemes !== 'undefined') ? sectorThemes[sector] : { color: 'indigo' };
            const tc = themeConfig.color;
            const title = sector === 'agri' ? 'Agritech' : sector === 'energy' ? 'Renewable Energy' : 'Digital Economy';

            // --- 1. Venture Playbook Data ---
            const playbooks = {
                agri: {
                    reg: "KEPHIS (Seeds), PCPB (Chemicals), County Business Permit",
                    economics: "Yield/Acre vs Input Cost",
                    pricing: "Commission on Produce (5-10%) or Input Margin",
                    gtm: "Farmer Co-ops, Aggregators, USSD/SMS Blasts"
                },
                energy: {
                    reg: "EPRA Solar License (T1/T2), ERC Class C1",
                    economics: "Hardware Payback Period (PAYG)",
                    pricing: "Deposit (15%) + Daily Rate (KES 50)",
                    gtm: "Door-to-door Agents, SACCO Partnerships"
                },
                digital: {
                    reg: "Data Protection (ODPC), Copyright/IP",
                    economics: "CAC < LTV (3:1 Ratio)",
                    pricing: "Freemium, Tiered Subscription (SaaS)",
                    gtm: "SEO/Content, LinkedIn B2B, App Stores"
                }
            };
            const pb = playbooks[sector] || playbooks.digital;

            // --- 2. Pitch Calendar & Directory Logic ---
            // Merge Incubators and Funding for a unified list
            let opportunities = [
                ...(data.incubators || []).map(i => ({ ...i, type: 'Incubator', deadline: 'Rolling' })),
                ...(data.funding || []).map(f => ({ ...f, type: 'Grant/Fund', deadline: 'Oct 30, 2025' }))
            ];

            // Add some mock competitions if list is short
            if (opportunities.length < 4) {
                opportunities.push({ name: "Annual Sector Prize", desc: "Seed funding for early stage.", link: "#", type: "Competition", deadline: "Nov 15, 2025" });
            }

            const oppsHtml = opportunities.map(op => {
                const reminderText = encodeURIComponent(`Reminder: Apply for ${op.name} (${op.type}) by ${op.deadline}. Link: ${op.link}`);
                const waLink = `https://wa.me/?text=${reminderText}`;
                
                return `
                <div class="p-3 bg-white border border-slate-200 rounded-lg hover:border-${tc}-400 transition-all group shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <div class="font-bold text-sm text-slate-800 group-hover:text-${tc}-700 mb-0.5">
                                ${op.name} 
                                ${op.gsa_member ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold ml-1">UNESCO</span>' : ''}
                            </div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap sm:hidden">${op.type}</span>
                        </div>
                        <div class="text-xs text-slate-500 leading-tight mb-1">${op.desc}</div>
                        <div class="flex items-center gap-3 text-[10px] font-medium text-slate-400">
                            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> Deadline: ${op.deadline}</span>
                            <span class="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">${op.type}</span>
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <a href="${waLink}" target="_blank" class="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-100 transition-colors" title="Set WhatsApp Reminder">
                            <i data-lucide="bell" class="w-4 h-4"></i>
                        </a>
                        <a href="${op.link}" target="_blank" class="px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-xs hover:bg-slate-50 hover:text-${tc}-600 transition-colors flex items-center gap-1">
                            Visit <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                    </div>
                </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="animate-fade-in space-y-8">
                    <button onclick="renderSkillsHubDashboard()" class="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 font-medium"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Hub</button>


                    <!-- Header -->
                    <div class="bg-${tc}-50 rounded-xl p-6 border border-${tc}-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white text-${tc}-700 border border-${tc}-200 shadow-sm">${title} Sector</span>
                            </div>
                            <h3 class="font-bold text-xl text-slate-900 flex items-center gap-2">
                                <i data-lucide="rocket" class="w-6 h-6 text-orange-600"></i> Founder's Launchpad
                            </h3>
                            <p class="text-sm text-${tc}-800 mt-1 max-w-xl">From idea to investment: Your sector-specific venture building toolkit.</p>
                        </div>
                    </div>

                    <!-- Tools Section (Moved Up) -->
                    <div>
                        <h4 class="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Essential Founder Tools</h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <a href="https://www.canva.com/" target="_blank" class="p-3 border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group bg-white">
                                <div class="font-bold text-xs text-slate-700 group-hover:text-indigo-700 mb-1">Canva</div>
                                <div class="text-[10px] text-slate-500">Pitch Decks & Design</div>
                            </a>
                            <a href="https://www.ycombinator.com/library" target="_blank" class="p-3 border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-sm transition-all group bg-white">
                                <div class="font-bold text-xs text-slate-700 group-hover:text-orange-700 mb-1">YC Library</div>
                                <div class="text-[10px] text-slate-500">Startup Advice</div>
                            </a>
                            <a href="https://stripe.com/atlas" target="_blank" class="p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group bg-white">
                                <div class="font-bold text-xs text-slate-700 group-hover:text-blue-700 mb-1">Stripe Atlas</div>
                                <div class="text-[10px] text-slate-500">Incorporation</div>
                            </a>
                            <a href="https://www.notion.so/" target="_blank" class="p-3 border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition-all group bg-white">
                                <div class="font-bold text-xs text-slate-700 group-hover:text-slate-900 mb-1">Notion</div>
                                <div class="text-[10px] text-slate-500">Workspace & Wiki</div>
                            </a>
                        </div>
                    </div>

                    <!-- 1. Venture Playbook (First 30 Days) -->
                    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-2"><i data-lucide="clipboard-list" class="w-4 h-4 text-${tc}-600"></i> "First 30 Days" Playbook</h4>
                            <span class="text-[10px] text-slate-500 font-medium">Sector-Specific Checklist</span>
                        </div>
                        <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="p-3 bg-${tc}-50/30 rounded-lg border border-${tc}-100">
                                <div class="text-[10px] font-bold text-${tc}-700 uppercase mb-1">Regulatory Basics</div>
                                <div class="text-xs text-slate-700 font-medium">${pb.reg}</div>
                            </div>
                            <div class="p-3 bg-${tc}-50/30 rounded-lg border border-${tc}-100">
                                <div class="text-[10px] font-bold text-${tc}-700 uppercase mb-1">Unit Economics Template</div>
                                <div class="text-xs text-slate-700 font-medium">${pb.economics}</div>
                            </div>
                            <div class="p-3 bg-${tc}-50/30 rounded-lg border border-${tc}-100">
                                <div class="text-[10px] font-bold text-${tc}-700 uppercase mb-1">Pricing Strategy</div>
                                <div class="text-xs text-slate-700 font-medium">${pb.pricing}</div>
                            </div>
                            <div class="p-3 bg-${tc}-50/30 rounded-lg border border-${tc}-100">
                                <div class="text-[10px] font-bold text-${tc}-700 uppercase mb-1">Go-to-Market Channels</div>
                                <div class="text-xs text-slate-700 font-medium">${pb.gtm}</div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Pitch Calendar & Directory -->
                    <div>
                        <div class="flex justify-between items-end mb-4">
                            <div>
                                <h4 class="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                    <i data-lucide="calendar" class="w-4 h-4 text-slate-400"></i> Pitch Calendar & Directory
                                </h4>
                                <p class="text-xs text-slate-500 mt-1">Incubators, funders, and competitions with deadlines.</p>
                            </div>
                            <div class="relative hidden sm:block">
                                <i data-lucide="search" class="absolute left-2.5 top-1.5 w-3.5 h-3.5 text-slate-400"></i>
                                <input type="text" placeholder="Search opportunities..." class="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-${tc}-500 focus:border-${tc}-500 w-48">
                            </div>
                        </div>
                        <div class="space-y-3">
                            ${oppsHtml}
                        </div>
                    </div>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Impact Charts Initialization ---
        window.initImpactCharts = function() {
            if (impactChartsInitialized) return;
            if (typeof Chart === 'undefined') return;
            
            // 1. Salary Chart
            const ctxSalary = document.getElementById('salaryChart');
            if (ctxSalary) {
                new Chart(ctxSalary.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ['Pre-Training', 'Post-Grad (1st Job)', '1 Year Later'],
                        datasets: [{
                            label: 'Avg Monthly Salary (KES)',
                            data: [15000, 36000, 75000],
                            backgroundColor: ['#cbd5e1', '#22c55e', '#3b82f6'],
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { 
                            y: { beginAtZero: true, grid: { display: false }, ticks: { font: { size: 9 } } }, 
                            x: { grid: { display: false }, ticks: { font: { size: 9 } } } 
                        }
                    }
                });
            }

            // 2. Time to Employment Chart
            const ctxTime = document.getElementById('timeChart');
            if (ctxTime) {
                new Chart(ctxTime.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: ['< 3 Months', '3-12 Months', '> 1 Year'],
                        datasets: [{
                            data: [66, 17, 17], // Generation Kenya Data
                            backgroundColor: ['#22c55e', '#eab308', '#ef4444'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: { 
                            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 6, font: { size: 9 } } }
                        }
                    }
                });
            }
            
            impactChartsInitialized = true;
        }

        window.addEventListener('DOMContentLoaded', () => {
            if (typeof countryData === 'undefined' || typeof baseSectorDetailData === 'undefined') {
                console.warn("Data dependencies (data.js) missing or not loaded.");
            }

            // Set static subline for Personas
            const heroDesc = document.getElementById('hero-desc');
            if(heroDesc) {
                heroDesc.innerText = "Your tool for navigating the East African labor market.";
            }

            injectSectorDrawer(); // Inject the new Sector Drawer
            renderMainLanding(); // Render the 3-Pillar Dashboard
            if(window.lucide) lucide.createIcons();
            setGlobalSector('agri');
            updateTrainingProviders(); 
            dataManager.init(); // Initialize DataManager
            loadMyPlan(); // Load saved plan from LocalStorage
            resetCareerHub(); 
            
            const hubSelector = document.getElementById('hub-country');
            if (hubSelector) {
                hubSelector.value = activeCountry;
            }

            // Language Persistence
            const langSelector = document.getElementById('language-selector');
            if (langSelector) {
                const savedLang = localStorage.getItem('ai4eac_lang');
                if (savedLang) langSelector.value = savedLang;
                
                langSelector.addEventListener('change', (e) => {
                    localStorage.setItem('ai4eac_lang', e.target.value);
                });
            }

            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                console.log('PWA Service Worker Registration skipped for single-file prototype.');
              });
            }
        });

        // --- NEW: Generate Pathway Logic (Moved from index.html) ---
        window.generatePathway = function() {
            const role = document.getElementById('pathway-role').value;
            document.getElementById('pathway-role-display').innerText = role;
            const results = document.getElementById('pathway-results');
            results.classList.remove('hidden');
            if (typeof lucide !== 'undefined') lucide.createIcons();
            results.scrollIntoView({ behavior: 'smooth' });
        }

        // --- NEW: My Plan Widget Logic ---
        window.toggleMyPlan = function() {
            const panel = document.getElementById('my-plan-panel');
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                renderMyPlan();
            } else {
                panel.classList.add('hidden');
            }
        }

        window.togglePlanItem = function(type, id, name) {
            const set = myPlan[type];
            if (set.has(id)) {
                set.delete(id);
            } else {
                set.add(id);
                // Store name map if needed, for now assuming ID is sufficient or name passed
                if(!myPlan.names) myPlan.names = {};
                myPlan.names[id] = name;
            }
            
            saveMyPlan(); // Save to storage on change
            updatePlanBadge();
            renderMyPlan();
            
            // Update UI buttons if visible
            if (type === 'roles') {
                const btnText = document.getElementById('occ-save-text');
                if (btnText) btnText.innerText = set.has(id) ? "Saved to Plan" : "Save Role";
                // Re-render icons in modal if needed
                if(window.lucide) lucide.createIcons();
            }
            if (type === 'skills') {
                const btnText = document.getElementById('skill-save-text');
                if (btnText) btnText.innerText = set.has(id) ? "Saved" : "Save Skill";
                if(window.lucide) lucide.createIcons();
            }
            if (type === 'courses') {
                // Re-render list to update icons
                const btn = document.querySelector(`button[onclick*="${id}"] i`);
                if(btn) {
                    if(set.has(id)) btn.classList.add('fill-indigo-600', 'text-indigo-600');
                    else btn.classList.remove('fill-indigo-600', 'text-indigo-600');
                }
            }
        }

        window.updatePlanBadge = function() {
            const count = myPlan.roles.size + myPlan.skills.size + myPlan.courses.size;
            const badge = document.getElementById('plan-badge');
            if (count > 0) {
                badge.innerText = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        window.renderMyPlan = function() {
            const container = document.getElementById('my-plan-content');
            if (!container) return;

            const renderSection = (title, type, icon, set) => {
                if (set.size === 0) return '';
                const items = Array.from(set).map(id => {
                    const name = (myPlan.names && myPlan.names[id]) ? myPlan.names[id] : id;
                    return `
                        <div class="flex justify-between items-center bg-white p-2 rounded border border-slate-200 text-xs shadow-sm">
                            <span class="truncate font-medium text-slate-700">${name}</span>
                            <button onclick="togglePlanItem('${type}', '${id}')" class="text-slate-400 hover:text-rose-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                        </div>
                    `;
                }).join('');
                return `
                    <div class="mb-3">
                        <h4 class="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><i data-lucide="${icon}" class="w-3 h-3"></i> ${title}</h4>
                        <div class="space-y-1">${items}</div>
                    </div>
                `;
            };

            const html = 
                renderSection('Saved Roles', 'roles', 'briefcase', myPlan.roles) +
                renderSection('Target Skills', 'skills', 'cpu', myPlan.skills) +
                renderSection('Bookmarked Courses', 'courses', 'graduation-cap', myPlan.courses);

            const shareBtn = (myPlan.roles.size + myPlan.skills.size + myPlan.courses.size > 0) 
                ? `<div class="mt-4 pt-3 border-t border-slate-200">
                     <button onclick="copyPlanToClipboard()" class="w-full py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-200 transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="share-2" class="w-3 h-3"></i> Share My Plan
                     </button>
                   </div>` 
                : '';

            container.innerHTML = (html || '<div class="text-center text-xs text-slate-400 py-4 italic">Your plan is empty.<br>Save roles, skills, or courses to see them here.</div>') + shareBtn;
            if(window.lucide) lucide.createIcons();
        }

        // --- NEW: Persistence & Sharing Logic ---
        function saveMyPlan() {
            const serialized = {
                roles: Array.from(myPlan.roles),
                skills: Array.from(myPlan.skills),
                courses: Array.from(myPlan.courses),
                names: myPlan.names || {}
            };
            localStorage.setItem('ai4eac_myPlan', JSON.stringify(serialized));
        }

        function loadMyPlan() {
            const saved = localStorage.getItem('ai4eac_myPlan');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    myPlan.roles = new Set(parsed.roles);
                    myPlan.skills = new Set(parsed.skills);
                    myPlan.courses = new Set(parsed.courses);
                    myPlan.names = parsed.names || {};
                    updatePlanBadge();
                } catch(e) {
                    console.error("Failed to load plan", e);
                }
            }
        }

        window.copyPlanToClipboard = function() {
            let text = "My AI4EAC Career Plan:\n\n";
            if (myPlan.roles.size > 0) {
                text += "🎯 Target Roles:\n";
                myPlan.roles.forEach(id => text += `- ${myPlan.names[id] || id}\n`);
                text += "\n";
            }
            if (myPlan.skills.size > 0) {
                text += "💪 Target Skills:\n";
                myPlan.skills.forEach(id => text += `- ${myPlan.names[id] || id}\n`);
                text += "\n";
            }
            if (myPlan.courses.size > 0) {
                text += "📚 Saved Courses:\n";
                myPlan.courses.forEach(id => text += `- ${myPlan.names[id] || id}\n`);
            }
            text += "\nBuild your own at: https://ai4eac-compass.org";
            
            navigator.clipboard.writeText(text).then(() => {
                alert("Plan copied to clipboard!");
            }).catch(err => {
                console.error('Failed to copy: ', err);
                alert("Failed to copy plan. Please try again.");
            });
        }

        // --- NEW: 3-Pillar Dashboard Logic ---

        window.renderMainLanding = function() {
            const container = document.getElementById('dashboard-content');
            if (!container) return;

            container.innerHTML = `
                <div class="text-center mb-8 animate-fade-in">
                    <h2 class="text-2xl md:text-3xl font-bold text-teal-600 flex items-center justify-center gap-2 whitespace-nowrap">
                        <i data-lucide="compass" class="w-6 h-6 md:w-8 md:h-8"></i> Start Navigating
                    </h2>
                    <p class="text-sm text-slate-600 mt-2 max-w-2xl mx-auto">
                        In 5 minutes, you’ll have a shortlist of occupations you’re suited for + an idea of skills in demand + information on training options in your country.
                    </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                    <!-- Block 1: High Growth Sectors -->
                    <button onclick="toggleSectorHub()" class="flex flex-col text-left h-full bg-indigo-50 border border-indigo-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-lg transition-all group relative overflow-hidden">
                        <div class="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-15 transition-opacity">
                            <i data-lucide="map" class="w-32 h-32 text-indigo-900/20"></i>
                        </div>
                        <div class="flex items-center gap-4 mb-5 relative z-10">
                            <div class="w-12 h-12 bg-white text-indigo-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                                <i data-lucide="bar-chart-2" class="w-6 h-6"></i>
                            </div>
                            <h3 class="text-sm md:text-xl font-bold text-slate-900 whitespace-nowrap">High Growth Sectors</h3>
                        </div>
                        <p class="text-sm text-slate-600 mb-6 flex-1 leading-relaxed relative z-10">Explore fast growing sectors and access real-time market intelligence. Identify occupations and skills in demand, as well as entrepreneurship opportunities.</p>
                        <div class="mt-auto flex items-center gap-2 text-sm font-bold text-indigo-600 group-hover:gap-3 transition-all relative z-10">
                            Start Navigating <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        </div>
                    </button>

                    <!-- Block 2: Skills & Training Hub -->
                    <button onclick="openUnifiedHub()" class="flex flex-col text-left h-full bg-emerald-50 border border-emerald-200 rounded-2xl p-6 hover:border-emerald-400 hover:shadow-lg transition-all group relative overflow-hidden">
                        <div class="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-15 transition-opacity">
                            <i data-lucide="book-open" class="w-32 h-32 text-emerald-900/20"></i>
                        </div>
                        <div class="flex items-center gap-4 mb-5 relative z-10">
                            <div class="w-12 h-12 bg-white text-emerald-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                                <i data-lucide="graduation-cap" class="w-6 h-6"></i>
                            </div>
                            <h3 class="text-sm md:text-xl font-bold text-slate-900 whitespace-nowrap">Skills & Training Hub</h3>
                        </div>
                        <p class="text-sm text-slate-600 mb-6 flex-1 leading-relaxed relative z-10">Use tools to assess your fit for different occupations and careers, build a personalized training and learning pathway, or support your entrepreneurship journey.</p>
                        <div class="mt-auto flex items-center gap-2 text-sm font-bold text-emerald-600 group-hover:gap-3 transition-all relative z-10">
                            Find Training <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        </div>
                    </button>

                    <!-- Block 3: Career & Community Tools -->
                    <button onclick="toggleCareerHub()" class="flex flex-col text-left h-full bg-orange-50 border border-orange-200 rounded-2xl p-6 hover:border-orange-400 hover:shadow-lg transition-all group relative overflow-hidden">
                        <div class="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-15 transition-opacity">
                            <i data-lucide="users" class="w-32 h-32 text-orange-900/20"></i>
                        </div>
                        <div class="flex items-center gap-4 mb-5 relative z-10">
                            <div class="w-12 h-12 bg-white text-orange-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                                <i data-lucide="handshake" class="w-6 h-6"></i>
                            </div>
                            <h3 class="text-sm md:text-xl font-bold text-slate-900 whitespace-nowrap">Career & Community Tools</h3>
                        </div>
                        <p class="text-sm text-slate-600 mb-6 flex-1 leading-relaxed relative z-10">Connect with careers guidance and counselling resources, mentors, employers and the wider support community.</p>
                        <div class="mt-auto flex items-center gap-2 text-sm font-bold text-orange-600 group-hover:gap-3 transition-all relative z-10">
                            Access Tools <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        </div>
                    </button>
                </div>
            `;
            if(window.lucide) lucide.createIcons();
        }

        window.injectSectorDrawer = function() {
            if (document.getElementById('sector-hub-drawer')) return;

            const drawer = document.createElement('div');
            drawer.id = 'sector-hub-drawer';
            drawer.className = 'fixed inset-y-0 right-0 w-full md:w-[800px] bg-white shadow-2xl transform translate-x-full transition-transform duration-300 z-[60] overflow-y-auto flex flex-col';
            
            drawer.innerHTML = `
                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10">
                    <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <i data-lucide="bar-chart-2" class="w-5 h-5 text-indigo-600"></i> Market Intelligence
                    </h2>
                    <button onclick="toggleSectorHub()" class="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <i data-lucide="x" class="w-5 h-5 text-slate-500"></i>
                    </button>
                </div>
                <div class="p-6 space-y-6 flex-1 overflow-y-auto bg-slate-50/50">
                    <!-- Navigation & Explanation -->
                    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div>
                            <h3 class="text-base font-bold text-slate-800 mb-1">Navigate High Growth Sectors</h3>
                            <p class="text-xs text-slate-500 leading-relaxed">
                                Select a sector and region to access real-time labor market data and investment trends. Open tabs for details on occupations and skills in demand, as well as emerging entrepreneurship opportunities.
                             </p>
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Sector</label>
                                <select onchange="setGlobalSector(this.value)" id="sector-hub-sector-select" class="w-full text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="agri" ${activeSectorId === 'agri' ? 'selected' : ''}>Agritech</option>
                                    <option value="energy" ${activeSectorId === 'energy' ? 'selected' : ''}>Renewable Energy</option>
                                    <option value="digital" ${activeSectorId === 'digital' ? 'selected' : ''}>Digital Economy</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Region</label>
                                <select onchange="setGlobalCountry(this.value)" id="sector-hub-country" class="w-full text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="all" ${activeCountry === 'all' ? 'selected' : ''}>Regional (East Africa)</option>
                                    <option value="Kenya" ${activeCountry === 'Kenya' ? 'selected' : ''}>Kenya</option>
                                    <option value="Uganda" ${activeCountry === 'Uganda' ? 'selected' : ''}>Uganda</option>
                                    <option value="Tanzania" ${activeCountry === 'Tanzania' ? 'selected' : ''}>Tanzania</option>
                                    <option value="Rwanda" ${activeCountry === 'Rwanda' ? 'selected' : ''}>Rwanda</option>
                                    <option value="Burundi" ${activeCountry === 'Burundi' ? 'selected' : ''}>Burundi</option>
                                    <option value="South Sudan" ${activeCountry === 'South Sudan' ? 'selected' : ''}>South Sudan</option>
                                    <option value="DRC" ${activeCountry === 'DRC' ? 'selected' : ''}>DR Congo</option>
                                    <option value="Somalia" ${activeCountry === 'Somalia' ? 'selected' : ''}>Somalia</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Results -->
                    <div id="sector-hub-results">
                        <!-- Dashboard Content Injected Here -->
                    </div>
                </div>
            `;
            document.body.appendChild(drawer);
        }

        window.toggleSectorHub = function() {
            const drawer = document.getElementById('sector-hub-drawer');
            if (drawer) {
                drawer.classList.toggle('translate-x-full');
                if (!drawer.classList.contains('translate-x-full')) {
                    // Ensure content is rendered when opening
                    renderOccupationsView();
                }
            }
            if(window.lucide) lucide.createIcons();
        }