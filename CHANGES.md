# Skills2Careers Compass — Changelog

Iteration on top of the existing prototype. Fork: `grahamcohen/Skills2Careers-Compass`; upstream is untouched. Atomic, conventionally-named commits so changes can be cherry-picked individually.

**Live: https://grahamcohen.github.io/Skills2Careers-Compass/**

---

## New features

**My Career Plan — full save/recall**
- Save Role button on occupation modal (footer, next to Share via WhatsApp)
- Save Skill button on skill modal (footer + secondary in CTA banner)
- State-driven label/color/icon-fill flips on toggle; toast confirms each save
- Saved items in the plan widget tap to reopen the role/skill modal or jump to Find Courses with the name prefilled
- Persists to localStorage; trash icon to remove individual items

**Outreach Templates** (new Careers Hub feature under Work Readiness)
- 3 ready-to-copy templates: LinkedIn alumni connection, informational interview request, application follow-up
- Copy button writes to clipboard with a reminder toast about replacing `[placeholders]`
- Sourced from `outreachTemplates` in `data.js`

**Pivot Audit** (new Careers Hub feature for career-changers)
- Same checklist UX as Readiness Audit, focused on cross-sector pivots
- 3 sections: Skill Translation, Market Immersion, Validation
- Live coverage badge: Just starting → Early stage → Making progress → Almost there → Ready to pivot!
- Sourced from `pivotAuditSections` in `data.js`

**Saved Interview Assessments**
- Interview Coach's Rubric now persists each scored assessment (date, sector, question, sub-scores, total, feedback)
- New Saved Assessments card on the Careers Hub home with a count badge
- Per-record delete + bulk Clear All
- Capped at 50 most recent

**Application Kit — real resources** (was placeholders)
- All 6 tabs (General, Internship, Placement, Freelance, Founder Tender, Volunteer) now link to curated free external resources: Europass, Harvard, Indeed, MIT, Bonsai, SBA, ILO, World Bank, WEF, etc.
- One-line description per item; external-link icon on the Access button
- CV format / what-to-bring / test-type metadata header from `applicationKitsConfig`
- Founder Tender tab exposed (was in data, not in UI)

**Apprenticeship Frameworks + National Standards** (Placement Kit only)
- Duration, objective, role, employer responsibilities by sector (Agritech / Renewable Energy / Digital / default)
- Country-relevant national bodies as outbound link chips (NITA, VETA, DIT, RTB, EAC TVET)
- Sourced from `apprenticeshipFrameworks` and `apprenticeshipStandards` in `data.js`

**Featured Mentors** (Community Hub drawer)
- Avatar + initials fallback, name, role, company, bio
- Filtered by active country + sector with regional fallback
- Amber "Sample" pill flags illustrative content
- Sourced from `specificMentors` in `data.js`

**Hero Persona switcher** (landing page)
- 5 pills: Learner / Entrepreneur / Counsellor / Educator / Policymaker
- Swaps the hero subtitle to a persona-tailored value prop
- Persists across visits
- Sourced from `heroPersonaContent` in `data.js`

**Sector + country persistence**
- Active sector and country now restored from localStorage on reload
- Top-nav dropdown syncs first so downstream selectors pick up the restored values

**Offline support** (Service Worker)
- `service-worker.js` with stale-while-revalidate caching
- Precaches the shell on install; serves cache instantly on fetch, refreshes in background
- Works after first visit on a good connection
- About drawer → Works offline panel explains the behavior + Add-to-Home-Screen tip
- Reset App Cache button (in same panel) clears localStorage + SW caches + unregisters worker + reloads
- Manifest `start_url` and `scope` made relative (`./`) for GitHub Pages compatibility

---

## Workflow completions

UI elements that were scaffolded but awaited final wiring:

- **`style.css`** — filename adjusted (was `style`); ~50 lines of custom CSS now apply (star ratings, sector cards, drawer transitions, Lite-Mode fallbacks)
- **PWA manifest** — file created (the `<link rel="manifest">` was already in place)
- **About drawer** — `injectAboutDrawer()` call added to init; drawer filled with content, country chips, 5 data sources (UNESCO GST, ESCO, ILOSTAT, KLMIS Kenya, LMIS Rwanda), prototype notice, source link
- **Certificate modal** — markup added; print + close buttons; serif heading; prints cleanly via `@media print`
- **AI Interview Coach** — real two-step record/stop flow; `lastInterviewFeedback` cache so Back-to-Results restores the same assessment; amber Demo pill on feedback card
- **Application Kit Access buttons** — wired to real resources (see New features)
- **Interview Rubric Save** — persists to localStorage (see Saved Interview Assessments)
- **Save Role / Save Skill buttons** — added, then refactored to use render helpers (`renderOccupationFooter`, `renderSkillModalFooter`, `renderSkillCTAContainer`) so the visible button reliably reflects state after toggle
- **Compass Users cards** — converted from inert `<div>`s to real `<button>`s wired to `generateUserInsight`
- **Navigation chain** — `closeOtherModalsOnly()` keeps drawers open behind modals; skill-from-role chip reordered so the nav stack is populated before the modal swap; Back buttons surface contextually (Back to Sector Hub, Back to Role, Back to Skill, Back to Careers Hub)
- **Earned Credentials card** — removed duplicated field render (refactor leftover)
- **`generateUserInsight`** — duplicate definition removed
- **Community Hub drawer title** — typo fix ("Careers Hub" → "Community Hub")
- **Simulation scripts** — `simulate_wages.py` and `simulate_employers.py` use `os.path.join(BASE_DIR, …)` instead of absolute Windows paths
- **`resources_general.json`** — missing comma fixed (surfaced by smoke tests)
- **Dead files removed** — `events.json`, `digital_resources.json`, `resource_search.js`, `.htmlhintrc.disabled`, `.prettierrc.disabled`, `eslint.config.js`
- **`tracer.json.txt`** renamed to `providers_tracer_studies.json`

---

## Mobile, accessibility, offline

- Modal heights use `max-h-[85dvh]` (dynamic viewport height) — content no longer hidden behind mobile browser toolbars
- Modal wrapper top padding `pt-2` on mobile (was `pt-4`)
- Body, drawers, modal panels: `overflow-x: hidden`
- Sector Hub cards: `text-base` on mobile, `break-words`, `min-w-0`, smaller padding — no more `$20M (Humanitarian)` overflow
- Outreach Templates `<pre>`: `whitespace-pre-wrap break-words overflow-x-auto`
- Back button in its own row at the top of the modal panel (no longer crowds the title)
- ESC closes the topmost modal/drawer; respects the nav stack
- Focus moves into modals on open (MutationObserver on the 5 main modals)
- `role="dialog" aria-modal="true" aria-labelledby="…"` on occupation/skill/certificate modals; `aria-label="Primary"` on top nav; `role="status"` on prototype banner
- Certificate prints cleanly (`@media print` hides everything else)
- `defer` on `data.js` and `app.js` — faster first paint
- Open Graph + Twitter Card meta tags
- Custom `404.html`

---

## Copy and wording

- "View Less Occupations" → "View Fewer Occupations"
- "diplomain another EAC country" → "diploma in another EAC country"
- Meta description corrected (was "Careers2Skills")
- `mailto:` placeholders consolidated into a single `REPORT_EMAIL` constant at top of `app.js` (one place to update before deploy)

---

## Attribution and demo-data labeling

- Footer: "Built on the UNESCO Global Skills Tracker and the ESCO occupation taxonomy" with link
- "About the data & methodology" link opens the About drawer
- About drawer lists 5 data sources with outbound links
- Top banner: "Demonstrating UI flow. Some wage and outcome figures are illustrative — see About."
- Amber "Demo" pill on occupation modal Avg Wage
- Amber "Sample" pill on Featured Mentors section
- Prototype notice in About drawer calls out wage/mentor/outcome figures as illustrative

---

## Language switcher

- Selecting SW or FR shows a toast ("Coming soon — the interface is currently English only…"), snaps back to English
- `TODO (i18n)` comment in code documents the next steps (extract UI strings → dictionary → `translate(key)` helper)

---

## Lite Mode

- Tooltip, aria-label, and confirmation toast on toggle

---

## Code cleanup

- `.gitignore` added
- `package.json` with dev dependencies + scripts: `lint`, `lint:js`, `lint:html`, `lint:css`, `format`, `validate:data`, `validate:links`, `serve`, `test`
- `tests/smoke.mjs` — 28 assertions covering JSON parse, top-level keys, required fields, package.json scripts
- 13 unused top-level declarations in `data.js` accounted for: 9 wired into the UI, 2 deduplicated against inline copies, 4 flagged as superseded with NOTE comments
- 10 orphan window.* functions documented at the top of `app.js` for future cleanup
- GTM container ID commented out (was upstream's account)
- Linter configs deduplicated
- Line endings normalized to LF with `.gitattributes text=auto`
- README rewritten (113 lines)

---

## Not changed

- Data values (no edits to courses, skills, occupations, scholarships, wages — demo data labeled where prominent)
- `app.js` is still one file (~9,500 lines) — splitting per-concern is a worthwhile follow-up but needs a separate QA pass
- Partner / employer logos (pending usage approval)
- Full i18n (toast was a transparency fix; real translation is a separate workstream)
- Full WCAG audit (basics in place; screen-reader pass + Lighthouse a11y score TBD)
- Lighthouse performance audit (beyond `defer`, preconnect, SW cache)
- PNG icons for PWA (currently iconify SVG)

---

## Review

```bash
git log --oneline main..audit-and-fixes
```

One commit is line-ending normalization only (no content changes) — skip it.

---

## Test URL

**https://grahamcohen.github.io/Skills2Careers-Compass/**

Try:
1. Add to Home Screen on mobile → opens in full screen
2. Sector Hub → top occupation → skill chip → job-title chip (Back buttons surface at each step)
3. Save Role / Save Skill / open My Plan widget → tap a saved item to reopen
4. Careers Hub → Applications Kit → switch tabs → tap any Access button
5. About drawer → Works offline panel
