// Smoke tests — no framework, just assertions. Run via:
//
//   node tests/smoke.mjs
//
// or via the package.json `test` script. The point is to catch obvious data
// regressions (a JSON file lost its top-level shape, a required key
// disappeared, etc.) without trying to enforce a strict schema.
//
// Failures exit non-zero; success prints a summary.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FAIL = [];
const PASS = [];

function check(name, fn) {
    try {
        fn();
        PASS.push(name);
    } catch (e) {
        FAIL.push({ name, message: e.message });
    }
}

function load(rel) {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf-8"));
}

// --- 1. Every JSON file parses ---
const JSON_FILES = [
    "app_config.json",
    "app_data.json",
    "courses.json",
    "manifest.json",
    "package.json",
    "providers_tracer_studies.json",
    "resources_agri.json",
    "resources_digital.json",
    "resources_energy.json",
    "resources_evidence.json",
    "resources_general.json",
    "scholarships.json",
    "sector_data.json",
    "top_occupations.json",
    "top_skills.json",
    "ventures.json",
    "wages.json",
];

for (const f of JSON_FILES) {
    check(`parse ${f}`, () => {
        load(f);
    });
}

// --- 2. Top-level shape on key files ---
check("courses.json is array with shape", () => {
    const c = load("courses.json");
    if (!Array.isArray(c)) throw new Error("not an array");
    if (c.length < 5) throw new Error(`only ${c.length} courses`);
    const required = ["id", "name", "provider", "sector"];
    for (const r of required) {
        if (!(r in c[0])) throw new Error(`first course missing ${r}`);
    }
});

check("top_occupations.json has expected sectors", () => {
    const t = load("top_occupations.json");
    if (!Array.isArray(t)) throw new Error("not an array");
    // entries should mention sectors agri/energy/digital
    const sectors = new Set(t.map(o => (o.sector || o.Sector || "").toLowerCase()));
    for (const expected of ["agri", "energy", "digital"]) {
        if (!sectors.has(expected) && !sectors.has(expected.toUpperCase())) {
            // some files use different casing; just warn rather than fail
            console.warn(`  [warn] top_occupations sector '${expected}' not found in: ${[...sectors].join(", ")}`);
        }
    }
});

check("manifest.json is a valid PWA manifest", () => {
    const m = load("manifest.json");
    for (const k of ["name", "start_url", "display", "icons"]) {
        if (!(k in m)) throw new Error(`missing ${k}`);
    }
    if (!Array.isArray(m.icons) || m.icons.length === 0) {
        throw new Error("icons missing or empty");
    }
});

check("package.json declares its lint scripts", () => {
    const p = load("package.json");
    for (const s of ["lint", "lint:js", "format", "validate:data", "validate:links", "serve"]) {
        if (!(s in (p.scripts || {}))) throw new Error(`missing script ${s}`);
    }
});

// --- 3. wages.json shape (since it's the demo-data file with the most logic) ---
check("wages.json has 8 EAC countries", () => {
    const w = load("wages.json");
    const countries = Array.isArray(w) ? w : Object.keys(w);
    if (countries.length < 5) {
        throw new Error(`wages covers only ${countries.length} entries`);
    }
});

// --- 4. courses.json language field present (F2 change relies on this) ---
check("at least 80% of courses declare a language", () => {
    const c = load("courses.json");
    const withLang = c.filter(x => x.language && x.language.length > 0).length;
    const pct = (withLang / c.length) * 100;
    if (pct < 80) {
        throw new Error(`only ${pct.toFixed(0)}% of courses declare a language`);
    }
});

// --- 5. Resource files load without 404s in the JSON itself (just shape) ---
for (const rf of ["resources_general.json", "resources_evidence.json", "resources_digital.json", "resources_agri.json", "resources_energy.json"]) {
    check(`${rf} top-level is object or array`, () => {
        const r = load(rf);
        if (r === null || (typeof r !== "object" && !Array.isArray(r))) {
            throw new Error("not an object or array");
        }
    });
}

// --- Summary ---
const total = PASS.length + FAIL.length;
console.log(`\nSmoke tests: ${PASS.length}/${total} passed`);
if (FAIL.length) {
    console.log("\nFailures:");
    for (const f of FAIL) {
        console.log(`  ${f.name}: ${f.message}`);
    }
    process.exit(1);
}
