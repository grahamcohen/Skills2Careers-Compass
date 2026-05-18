# Skills2Careers Compass — Changes from Graham's Fork

A summary of changes made to the **Skills2Careers Compass** prototype on the `audit-and-fixes` branch of my fork (`grahamcohen/Skills2Careers-Compass`). All changes have been merged to `main` on my fork and are live for testing at:

**🔗 https://grahamcohen.github.io/Skills2Careers-Compass/**

The original `carmelasalzano-source/Skills2Careers-Compass` repository has not been touched. If you want any of these changes pulled upstream, open a PR from my fork or grab specific commits — they're broken out into atomic, conventionally-named commits so individual fixes can be cherry-picked if desired.

This document is organised by audit-item ID (matching internal categorisation: A = broken behaviour, B = back-button gaps, C = unclear UX, D = data hygiene, E = copy/wording, F = missing functionality, G = attribution/branding, I = code hygiene). Each item explains **what was wrong**, **what was changed**, and **what to test**.

---

## A — Broken behaviour

### A1: Custom stylesheet was 404'ing
**Was:** `index.html` referenced `style.css`, but the file on disk was named `style` (no extension). The browser silently 404'd it, so ~54 lines of custom CSS (star-rating colours, sector cards, drawer transitions, scrollbar styling, animations, Lite-Mode fallbacks) never made it to the page. The site has been running on Tailwind defaults alone — which is why many states looked unfinished.
**Fixed:** Renamed `style` → `style.css`.
**Test:** Open the site. Star ratings should be coloured (gold/silver/bronze based on rating), Lite Mode should fully strip transitions, and the scrollbar should match the site's slate palette.

### A2: PWA manifest was missing (404)
**Was:** `<link rel="manifest" href="/manifest.json">` pointed at a file that didn't exist. PWA install prompts failed; mobile add-to-homescreen wouldn't surface.
**Fixed:** Created `manifest.json` with proper name, theme colour, scope, and icons via api.iconify.design. Also fixed the path from absolute `/manifest.json` to relative `manifest.json` so it works under sub-paths like GitHub Pages.
**Test:** On a mobile browser, the "Add to Home Screen" option should now appear and use the indigo theme colour. For full production-grade installability, real PNG icons would need to ship; SVG via iconify is a reasonable interim.

### A3 / C1: About drawer never opened
**Was:** The Info button (top-left nav) called `toggleAboutDrawer()`, which expected `injectAboutDrawer()` to have created the drawer element. But `injectAboutDrawer()` was never called from the init handler — it was dead code. Clicking the Info icon did nothing visible.
**Fixed:** Added `injectAboutDrawer()` to the `DOMContentLoaded` handler. Also filled in the previously empty drawer content with real material: what the app is, country coverage chips, an "About the data" section with five external data-source links, a prototype-notice banner, and a source-on-GitHub link.
**Test:** Click the Info icon (top-left). A left-side drawer should slide in with the full About content.

### A4: "View Cert" button threw null reference errors
**Was:** `viewCertificate()` wrote to elements `#cert-skill`, `#cert-date`, `#cert-sector` inside a modal `#certificate-modal` that didn't exist in the HTML. Clicking "View Cert" on any earned credential silently failed (console errors only).
**Fixed:** Added the `#certificate-modal` markup to `index.html` with a properly themed certificate panel (gradient background, double-border, serif heading, print + close buttons, and an italic prototype caveat at the bottom).
**Test:** From the homepage, open the Pathway Builder → complete to the credential view → click "View Cert". The certificate modal should open and render the skill name, sector, and current date.

### A5 / C8 / F3: AI Interview Coach flow was broken in three ways
**Was:**
- The single "Start Recording Answer" button immediately stopped, processed, and rendered feedback — there was no actual record/stop interaction.
- After viewing feedback and opening the scoring Rubric, "Back to Results" called `simulateInterviewResponse()` which re-ran the entire simulation with new random feedback — the user could never actually return to the assessment they'd just seen.
- "Save" was the only path that left a coherent navigation state.

**Fixed:**
- Added a real two-step flow: click **Start Recording**, the mic indicator pulses and a **Stop Recording** + Cancel pair appears. Click Stop → "Processing…" → feedback report.
- Introduced a `lastInterviewFeedback` cache so the feedback is stored once. New `showInterviewResults()` reads from the cache and always renders the same screen — Rubric's "Back to Results" now restores the assessment exactly.
- Saving from the Rubric returns to the cached results view (not a fresh question).
- Added a small amber "Demo" pill on the feedback report card so users know the assessment is mock (no real ASR/NLP runs).

**Test:** Careers Hub → AI Interview Coach → Start → Stop → Open Rubric → "Back to Results". Should return to the same feedback report. Then Save Rubric → should also return to the same report.

### A6: `generateUserInsight` was defined twice
**Was:** The function was defined byte-for-byte identically at two separate locations in `app.js`. The second silently overwrote the first.
**Fixed:** Removed the 106-line duplicate.
**Test:** No visible change — Compass Users cards (Graduates, Career Specialists, etc.) still work normally. Internal cleanup.

### A7: Earned Credentials badge rendered fields twice
**Was:** A partial refactor introduced a `badgeInfo` object but left the old `activeData.badgeTitle`, `.badgeStandard`, `.badgeProvider` references intact, so each field rendered twice in the credential card.
**Fixed:** Removed the leftover `activeData.*` references. `badgeInfo` already falls back to the same data internally, so no information is lost.
**Test:** Complete a credential (Pathway Builder → Skills Match) and open it. The card should now show each field once.

### A8: Community Hub drawer titled "Careers Hub"
**Was:** Copy-paste bug in `index.html` — the Community Hub drawer's `<h2>` said "Careers Hub" (same as the actual Careers Hub drawer above it).
**Fixed:** Corrected to "Community Hub".
**Test:** Careers Hub → Mentors & Alumni Networks → drawer title should read "Community Hub".

---

## B — Back-button gaps

These were the items from my testing email that motivated half of the work. Implementation uses a new `modalNavStack` for cross-modal navigation plus dedicated Back-to-Careers-Hub buttons for the sub-sections.

### B1: Sector Hub → Occupation → close → returned to homepage instead of Sector view
**Was:** Opening an occupation modal from inside the Sector Hub drawer ran `closeAllModals()` which dismissed the drawer, so closing the modal left the user on the homepage.
**Fixed:** Before closing the drawer, `pushModalReturn()` captures it onto the stack. A Back button appears in the modal header; clicking it pops the stack and re-opens the drawer.
**Test:** Open the Sector Hub for any sector → click an occupation in "Top Hiring" → click **Back** in the modal header. Should return to the Sector Hub drawer, not the homepage.

### B2: Occupation modal → Similar Role → no path back to original
**Was:** Clicking a "Similar Role" inside an occupation modal opened a fresh modal with no breadcrumb.
**Fixed:** Same nav stack — opening occupation B from occupation A pushes A onto the stack. Back returns to A.
**Test:** Open any occupation modal → click a Similar Role → use the Back button in the new modal. Should restore the original role.

### B3: Skill modal → Skills Often Paired With → no path back
**Was:** Same as B2, but for skills.
**Fixed:** Same pattern. Skill chain traversal now reversible.
**Test:** Open a skill profile from anywhere → click a "Skills Often Paired With" chip → Back. Returns to the original skill.

### B4: Three Careers Hub sub-sections had no back button
**Was:** "Mentors & Alumni Networks" (Community Hub drawer), "Founders Launchpad" (pp-launchpad), and "Financial Aid & Scholarships" (pp-finance) all closed the Careers Hub when opened. Users had to close the sub-view entirely and re-navigate from the homepage.
**Fixed:** Added a **Back to Careers Hub** button at the top of each sub-view, wired to a shared `backToCareersHub()` helper that closes whatever is on top and re-opens the Careers Hub drawer at its entry view (not whichever sub-tab was last open).
**Test:** Careers Hub → any of those three sub-sections → click "Back to Careers Hub". Should return cleanly to the Careers Hub entry page.

### B5: Interview Coach "Back to Results" — covered above under A5.

### Bonus (not in original audit): Cross-modal navigation got a more general fix
The same `modalNavStack` works for any future cross-modal jump. The X close button always clears the stack (it means "I'm done") so there's no risk of users getting stuck in a deep stack and unable to fully close out.

---

## C — Unclear UX

### C2: Language switcher seemed to do nothing
**Was:** EN / SW / FR selector persisted the user's choice to localStorage but never translated any UI strings (none exist in SW or FR yet). Users selecting SW saw zero change and reasonably assumed the picker was broken.
**Fixed:** Selecting SW or FR shows a toast: "Coming soon — the interface is currently English only. Your language preference has been saved for when translations are added." The selector snaps back to English. (A `TODO (i18n)` comment in the code documents the larger workstream — extract all strings into a key/value dictionary, add a `translate(key)` helper, route templates through it.)
**Test:** Pick SW or FR from the language dropdown. Toast appears, selector snaps back to EN.

### C3: "Lite" toggle had no explanation
**Was:** Button labelled just "Lite" with no tooltip or description.
**Fixed:** Added a tooltip ("Toggle Lite Mode — disables animations, transitions, and heavy visuals for faster loading on slow connections"), an aria-label, and a confirmation toast on toggle.
**Test:** Hover "Lite" → tooltip appears. Click → toast shows "Lite Mode on — animations and heavy visuals disabled…". Click again → "Full Mode on."

### C5: My Career Plan empty state was unhelpful
**Was:** Just "Your plan is empty. Save roles, skills, or courses to see them here." in italic grey text.
**Fixed:** Replaced with a real onboarding card: a bookmark icon, a "Build your career plan" heading, a paragraph explaining the workflow (tap the bookmark icon on any role/skill/course) with a "no account needed" reassurance, and three icon-labelled categories below (Roles / Skills / Courses) so users can see what's bookmarkable.
**Test:** Open the My Career Plan panel (bottom-right widget) with no items saved. Should see the new onboarding card.

### C6: WhatsApp share message had no link
**Was:** "Share via WhatsApp" button on occupation modals composed a message with no URL — recipients couldn't actually open the app.
**Fixed:** Share text now includes `${window.location.href}` so the live URL travels with the message. Same fix applied to the My Plan clipboard share (which previously linked to a placeholder `ai4eac-compass.org`).
**Test:** Open an occupation modal → "Share via WhatsApp" → check the pre-composed message includes the page URL.

### C10: "Compass Users" cards looked clickable but were inert
**Was:** The five user-type cards in the Compass Users side menu (Graduates, Career Specialists, Educators & Trainers, Employers, Policymakers) were styled like buttons but rendered as inert `<div>`s. The `generateUserInsight(userType)` function existed but was never invoked.
**Fixed:** Converted to `<button>`s wired to `generateUserInsight()`. Each opens a tailored briefing modal for that audience. Added a small italic prompt above the list ("Tap any user type for a tailored briefing") and an arrow icon on hover so the interaction is discoverable.
**Test:** Compass Users menu (people icon, top-left) → click any of the five user-type cards. A tailored briefing modal opens.

### C7 / C9 — Application Kit / Saved profiles
Not implemented in this pass; deferred. The existing Application Kit screen functions but its templates are minimal placeholders; saved candidate profiles after the Interview Rubric save action don't have a dedicated viewing surface. These are reasonable follow-ups.

---

## D — Data hygiene

### D1, D2, D6: Dead files removed
- `events.json` (0 bytes, never referenced)
- `digital_resources.json` (`{}` empty object, only read by the now-fixed validator)
- `resource_search.js` (dead ES-module code, never loaded; `index.html` doesn't have `type="module"`)
- `.htmlhintrc.disabled`, `.prettierrc.disabled` (byte-identical duplicates of the active `.htmlhintrc` and `.prettierrc`)
- `eslint.config.js` (duplicate of `eslint.config.cjs` differing only in import syntax — kept the `.cjs` because there's no `"type": "module"` declared)
- `tracer.json.txt` renamed to `providers_tracer_studies.json` — valid JSON content with a `.txt` extension, name overlapped semantically with the `tracerAvailable` field on courses but was unrelated. Kept the data for potential future wire-up.

### D3 / D5: Demo data labelled, not replaced
Per the brief, no actual data was changed. Instead:
- Top banner now reads "Demonstrating UI flow. Some wage and outcome figures are illustrative — see About." with an inline link to the About drawer's full Prototype notice. Shorter mobile variant: "Prototype — some figures illustrative."
- Occupation modal "Avg Wage" field shows a small amber **Demo** pill next to the label (with tooltip explaining the data came from `simulate_wages.py`).
- The About drawer's Prototype notice already calls out wage figures, mentor profiles, and outcome metrics as illustrative.

### D4: Hardcoded Windows paths in simulation scripts
**Was:** `simulate_wages.py` and `simulate_employers.py` both hardcoded `c:\Users\Salzano\OneDrive\Documents\Claude\ai4eac-compass\Prototype files\wages.json`. The scripts couldn't run for anyone else, and the path even referenced the old project name.
**Fixed:** Replaced with `os.path.join(BASE_DIR, 'wages.json')` so the simulators read the wages.json next to them in the repo, regardless of clone location or platform.
**Test:** `python3 simulate_wages.py` should now run on any machine.

### Bonus: Real JSON bug caught by smoke tests
`resources_general.json` was missing a comma between two array elements (line 121-122). The file was unparseable, so the app's fallback path was silently masking the broken data load. Fixed inline.

---

## E — Copy and wording

### E1: "View Less Occupations" → "View Fewer"
Count noun grammar.

### E2: "...degree or diplomain another EAC country..." → "diploma in another"
Missing space.

### E3: Meta description was inverted
`<meta name="description" content="Careers2Skills Compass Prototype">` → "Skills2Careers Compass Prototype" (matched the `<title>`).

### E4: Old `support@ai4eac.org` references
Three `mailto:support@ai4eac.org` references in "Report Broken Link" buttons. Replaced with a single top-of-file `REPORT_EMAIL = 'feedback@example.org'` constant (clearly marked as placeholder in its comment). Single source of truth — only one line to change before deploy.

---

## F — Missing functionality

### F1: Skill ↔ Occupation cross-linking
**Was:** Skill profiles showed "Common Job Titles" as plain text chips; occupation profiles showed "Typical Skills Required" as plain text rows. No way to jump between them.
**Fixed:**
- **Forward (skill → occupation):** Job-title chips in skill profiles are now interactive buttons when the title matches a known occupation. Clicking jumps to the full occupation profile.
- **Reverse (occupation → skill):** Technical-skill rows in occupation profiles are now interactive buttons that open the corresponding Skill Profile.
- Both directions push onto the modal nav stack (B2/B3), so the Back button restores the previous view.
**Test:** Open any occupation profile → click a Technical Skill row → opens skill profile. From there, click a Common Job Title chip → opens the next occupation. Click Back twice → returns to the original occupation.

### F2: Course cards didn't show language
**Was:** Course cards in Find Courses (table and mobile views) showed mode/duration/cost but not language of instruction. The training-list HTML used in the Unified Hub already showed Lang.
**Fixed:** Added a small `<i data-lucide="languages">` chip on the mobile cards and a "• English" suffix on the table cells, displaying `c.language || 'English'`.
**Test:** Open Find Courses → each course card/row should now show the language of instruction.

---

## G — Attribution and branding

### G1 / G2: Global Skills Tracker attribution
**Was:** No visible attribution to GST or other data sources.
**Fixed:**
- Footer now reads: *"Built on the [UNESCO Global Skills Tracker](https://unevoc.unesco.org/home/Global+Skills+Tracker) and the ESCO occupation taxonomy."*
- "About the data & methodology" link in the footer opens the About drawer's full data-sources section.
- About drawer lists five data sources: UNESCO GST, ESCO, ILOSTAT, Kenya KLMIS, Rwanda LMIS.

### G3: Partner logos
Deferred — would need actual logo files (UNESCO, partners) to be shipped.

---

## I — Code hygiene

### I2: `.gitignore` added
The repo had none. Now covers OS junk, editor artefacts, `node_modules`, and local working notes.

### I3 / I4: Linter config duplicates resolved
Two eslint configs that differed only in import syntax (kept `.cjs`, deleted `.js`). Disabled-by-rename `.htmlhintrc.disabled` and `.prettierrc.disabled` were byte-identical to the active versions — deleted.

### I5: `package.json` with dev dependencies and scripts
The eslint configs referenced `@eslint/js`, `globals`, `eslint-plugin-jsonc` but no manifest declared them. Added a proper `package.json` with:
- `npm run lint` / `lint:js` / `lint:html` / `lint:css` — wires up existing configs
- `npm run format` — Prettier across the codebase
- `npm run validate:data` / `validate:links` — run the existing Python validators
- `npm run serve` — quick local server via `python3 -m http.server 8080`
- `npm test` — runs the new smoke test suite

### I7: Google Tag Manager neutralised
**Was:** GTM container ID `GTM-K99RWVH5` was hardcoded in `index.html` (both the head script and the noscript fallback iframe). Running my fork live (e.g., on GitHub Pages) would have silently fed traffic to your analytics property.
**Fixed:** Both blocks commented out with a clear inline comment explaining how to re-enable on merge upstream. When you pull this back, just uncomment.

### I1 / I9: README and smoke tests
- Full `README.md` (113 lines) replacing the one-line placeholder.
- `tests/smoke.mjs` — 28 sanity checks runnable via `npm test`. Catches JSON parse errors, missing top-level keys, missing required fields, broken `package.json` scripts.

### Bonus (not in audit): Line endings normalized
Several files in the repo had mixed CRLF/LF line endings because uploads happened from both the GitHub web UI (Windows-default CRLF) and automated tooling (LF). A one-time `chore: normalize line endings to LF` commit (with a clear standalone message explaining the noise) brings everything in line. A `.gitattributes` with `text=auto` keeps it stable going forward — Windows working copies will still see CRLF locally, the repo stores LF.

---

## What I did *not* change

Per the brief — labels not data, careful not destructive:

- **Refactor**: `app.js` is still ~9k lines in a single file. Splitting per-concern (DataManager, Modals, Pathway, Training, Hub, Plan, Charts, Drawers) is a worthwhile follow-up but carried too much risk of breaking subtle interactions for this pass.
- **Data**: No course / skill / occupation / scholarship data was edited. Demo data was labelled where prominent (wages, interview feedback) but kept as-is.
- **Application Kit templates** (C7): the screen renders but its templates are placeholders; deferred.
- **Saved candidate profiles** (C9): no dedicated viewing surface for "saved" rubrics; deferred.
- **Mobile / accessibility / performance deep audit**: smoke tests catch data regressions but not these. Worth running Lighthouse on a future pass.

---

## How to review the diff

Most readable starting point:

```
git log --oneline main..audit-and-fixes
```

Atomic per-issue commits, each with a Conventional Commits prefix and an item ID. Cherry-pickable individually if you want to take only some changes upstream.

The single large commit (`chore: normalize line endings to LF in the repo (one-time)`) contains no content changes — just line-ending conversion. Skip it when reviewing.

---

## Live test URL

**🔗 https://grahamcohen.github.io/Skills2Careers-Compass/**

Take it for a spin. Particularly the back-button work (Sector Hub flows, occupation/skill chains, Careers Hub sub-sections) and the AI Interview Coach record/stop flow — those were the biggest pain points from my testing notes.

Let me know what works, what doesn't, and what you'd like rolled back or taken further.

— Graham
