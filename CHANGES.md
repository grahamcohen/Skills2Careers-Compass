# Skills2Careers Compass — Changelog

Skills2Careers Compass is a thoughtful prototype with solid foundations — clean data architecture, a clear information hierarchy, sector-aware content, and a coherent design language. This document summarises the iterations made on top of that foundation:

- finishing UI flows that were scaffolded but awaiting connection,
- wiring up authored content from `data.js` that hadn't yet surfaced in the UI,
- adding new features that build on the existing patterns,
- polishing the experience for mobile, accessibility, and offline use.

All changes preserve the original design intent. The fork lives at `grahamcohen/Skills2Careers-Compass`; the upstream `carmelasalzano-source/Skills2Careers-Compass` is untouched. Changes are organised into atomic, conventionally-named commits so individual improvements can be cherry-picked when ready.

**🔗 Live preview: https://grahamcohen.github.io/Skills2Careers-Compass/**

---

## Summary at a glance

- **Navigation reads smoothly across the full chain.** Contextual Back buttons surface as users move Sector Hub → Role → Skill → Job-Title, with labels that name the destination (Back to Sector Hub, Back to Role, Back to Skill). The Careers Hub sub-sections also get Back-to-Careers-Hub buttons.
- **A handful of UI scaffolds are now connected end-to-end.** The Application Kit's Access buttons open real free resources; the AI Interview Coach has a two-step record/stop flow; the About drawer and certificate modal render with full content; Save Role / Save Skill / Save Course all persist to the device.
- **My Career Plan is fully interactive.** Saved items in the widget reopen the role/skill profile when tapped. Tap-and-undo toast feedback on every save.
- **Nine new content surfaces from previously-dormant data blocks.** Outreach Templates with copy-to-clipboard; Pivot Audit for career-changers; Saved Interview Assessments; Featured Mentors in the Community Hub; Apprenticeship Frameworks + national standards on the Placement Kit; Application Kit metadata + Founder Tender tab; Hero Persona switcher (Learner / Entrepreneur / Counsellor / Educator / Policymaker).
- **Works offline after first visit.** Service Worker with stale-while-revalidate caching; the About drawer documents the behaviour and recommends Add-to-Home-Screen for the best mobile experience.
- **Mobile-friendly.** Horizontal scroll prevented across drawers and modals; content sits above the mobile browser toolbar; font sizes adjust for narrow viewports.
- **Accessibility basics in place.** ESC closes the topmost modal; focus moves into modals when they open; ARIA roles on dialogs and nav; the certificate modal prints cleanly.
- **Repo hygiene.** Linter and Prettier wired up with a `package.json`; 28-assertion smoke test suite passes; line endings normalised; CHANGES.md and a fresh README.md document the state of things.

---

## New features

### My Career Plan — full save-and-recall workflow

The bookmark widget's value proposition (save any role, skill, or course) is now fully realised:

- **Save Role** button in the occupation modal footer (alongside Share via WhatsApp). State-driven label and colour: Save Role ↔ Saved to Plan; bookmark icon fills indigo when saved.
- **Save Skill** button in the skill modal footer (visible without scrolling). Same state-driven UI. A secondary Save Skill remains in the "Master this Skill" CTA banner for users who scroll all the way down.
- **Toast feedback** on every save/unsave — "Added to My Plan: Soil Analysis" / "Removed from My Plan: Soil Analysis" — so users see immediate confirmation.
- **Saved items reopen on tap.** Each row in the plan widget is now a tappable button (with an external-link icon hint). Roles reopen the occupation modal; skills reopen the skill modal; courses jump to Find Courses with the name prefilled in the search box. A separate trash icon on the right removes the item.
- The plan persists to localStorage across sessions; no account required.

### Outreach Templates

New Careers Hub feature under Work Readiness. Three ready-to-copy templates for common cold-outreach moments:

- LinkedIn alumni connection request
- Informational interview request email
- Application follow-up email

Each card shows subject + body in a copy-friendly block; a **Copy** button writes the whole template to clipboard and toasts a reminder to replace the bracketed `[placeholders]` before sending. Sourced from the `outreachTemplates` data block in `data.js`.

### Pivot Audit (for career-changers)

New Careers Hub feature for users moving between sectors. Same checklist UX as the existing Readiness Audit, focused on the specific challenges of pivoting:

- **Skill Translation** — mapping past skills to new sector jargon, functional CV format
- **Market Immersion** — communities, industry leaders, newsletters
- **Validation** — informational interviews, mini-projects, LinkedIn positioning

A live coverage badge updates as items are checked off: "Just starting" → "Early stage" → "Making progress" → "Almost there" → "Ready to pivot!". Content sourced from the `pivotAuditSections` data block.

### Saved Interview Assessments

The Interview Coach's Rubric now persists each scored assessment to the device:

- Stores date, sector, question, all four sub-scores, total /20, and the feedback text.
- A new **Saved Assessments** card on the Careers Hub home grid carries a live count badge.
- Tap the card to see saved assessments as cards (date, sector, the question that was asked, per-category scores, total). Each has a delete button; bulk Clear All is available too.
- Capped at 50 most-recent records.
- Empty state with friendly onboarding pointing back to the Interview Coach.

### Application Kit — real resources

The Application Kit's six tabs (General, Internship, Placement, Freelance, Founder Tender, Volunteer) now each surface five curated external resources. The item names come from the `applicationKitsResources` data block in `data.js`; this changelog adds an in-file map attaching a free reputable resource URL to each:

- **General Job Applications:** Europass CV builder, Harvard cover-letter guide, LinkedIn profile checklist, Indeed interview Q catalogue, Harvard PON salary negotiation guide
- **Internship Starter:** Indeed entry-level CV guide, Princeton recommendation request template, Indeed internship cover letter, Erasmus+ Learning Agreement, ILO internship report guidelines
- **Work Placement:** QAA placement guidance, Open University logbook template, ILO supervisor evaluation rubric, OU placement report structure, ILO OSH workplace safety checklist
- **Freelancer Toolkit:** Bonsai free rate calculator, Bonsai contract template, Smashing Magazine portfolio guide, Indeed cold pitch templates, Wave free invoicing
- **Founder Tender:** SBA capability statement template, KRA iTax overview, World Bank technical proposal template, ILO budget guidance, World Bank PPQ standards
- **Volunteer Applications:** Indeed personal statement guide, UK National Careers Service skills audit, WEF Future of Jobs report, HBR authentic leadership, Idealist volunteer commitment guide

Each row also shows a one-line description so users can decide before clicking, an external-link icon on the Access button, and a CV-format / what-to-bring / test-type metadata header at the top (from `applicationKitsConfig`).

The Founder Tender tab is now exposed in the UI as well — it was authored in the data but hadn't yet been added to the tab list.

### Apprenticeship Frameworks + National Standards

Added to the Placement Kit (most relevant context). Two new blocks:

- **Apprenticeship Framework** — duration, objective, apprentice role, employer responsibilities, tailored to the active sector (Agritech / Renewable Energy / Digital / generic default).
- **National Standards** — country-relevant apprenticeship bodies (e.g. NITA Kenya, VETA Tanzania, DIT Uganda, RTB Rwanda, EAC TVET regional) as outbound link chips, filtered to the active country plus regional bodies.

Both sourced from `apprenticeshipFrameworks` and `apprenticeshipStandards` in `data.js`.

### Featured Mentors

The Community Hub drawer now shows a Featured Mentors section when the filter is set to "All" or "Mentorship". Each card shows:

- Circular avatar (with initials-circle fallback if the placeholder image fails to load)
- Name, role, company
- One-paragraph bio

Filtered by active country and sector with a regional fallback. A small amber **Sample** pill in the section header flags the illustrative nature of the prototype profiles, consistent with the demo-data labelling pattern used elsewhere. Sourced from the `specificMentors` data block.

### Hero Persona switcher

The landing page hero now offers a row of five tappable persona pills below the main subtitle:

- **Learner** — for students and recent graduates
- **Entrepreneur** — for founders and business builders
- **Counsellor** — for career advisors
- **Educator** — for trainers and training providers
- **Policymaker** — for government and donor audiences

Tapping a pill swaps the hero subtitle to a persona-tailored value proposition. Selection persists across visits via localStorage; defaults to Learner. Content sourced from the `heroPersonaContent` data block.

### Sector + country persistence

The active sector and country now persist to localStorage and are restored on reload, so returning visitors land back in their context. The top-nav dropdown syncs first on init so all downstream selectors (Career Hub, Skills Hub, Sector Hub, Find Courses filter, Financial Aid filter) pick up the restored values cleanly.

### Offline support (Service Worker)

A `service-worker.js` (123 lines) caches the app shell and JSON data using a **stale-while-revalidate** strategy:

- On install, precaches `index.html`, `app.js`, `data.js`, `style.css`, `manifest.json`, `404.html` — so the app works on a cold start with no network.
- On every same-origin GET for JSON/HTML/JS/CSS, serves the cached copy immediately (instant render) and in parallel fetches fresh from the network to update the cache for next time.
- Cross-origin CDN scripts (Tailwind, Lucide, Chart.js, jsPDF) are left to the browser.
- A new About-drawer panel titled **Works offline** explains the behaviour and recommends Add-to-Home-Screen (Safari → Share → Add to Home Screen; Chrome → menu → Add to Home screen) for the best mobile experience (eliminates browser toolbars, gives the app the full screen).
- A **Reset App Cache** button (in the same panel) clears localStorage + Service Worker caches + unregisters the worker + reloads, for users who want instant freshness instead of waiting one visit cycle.
- The PWA manifest's `start_url` and `scope` are now relative (`./`) so installing to home screen on GitHub Pages opens the app itself rather than the github.io root.

---

## Workflow completions

A handful of UI elements were scaffolded — markup or handlers in place — but awaited final wiring. These have been connected end-to-end:

### Custom stylesheet now loading

The custom `style.css` (star-rating colours, sector cards, drawer transitions, scrollbar styling, animations, Lite-Mode fallbacks) just needed a filename adjustment so the `<link>` tag resolves. Renamed from `style` → `style.css`. With the custom CSS now applied, star ratings get their colour palette, Lite Mode strips animations properly, and scrollbars match the slate theme.

### PWA manifest published

The `<link rel="manifest">` tag pointed at a file that hadn't shipped yet. Created `manifest.json` with name, theme colour (indigo `#4f46e5`), scope, icons via api.iconify.design, and a relative path so it works under sub-paths like GitHub Pages.

### About drawer wired into init

The About drawer had a toggle handler that expected an `injectAboutDrawer()` call from the page init. Added the call to `DOMContentLoaded`, and filled in the drawer with content: what the app is, country coverage chips, an "About the data" section with five external data-source links (UNESCO GST, ESCO, ILOSTAT, Kenya KLMIS, Rwanda LMIS), a prototype-notice banner, and a source-on-GitHub link.

### Certificate modal rendered

`viewCertificate()` wrote to elements inside a `#certificate-modal` whose markup was still to be added. Added the modal in `index.html` with a properly themed certificate panel (gradient background, double-border, serif heading, print + close buttons, italic prototype caveat).

### AI Interview Coach record/stop flow

The original single-click button worked as a placeholder; the flow now has the full two-step interaction. Click **Start Recording** → mic indicator pulses + **Stop Recording** and Cancel pair appears. Click Stop → "Processing…" → feedback report. Introduced a `lastInterviewFeedback` cache so "Back to Results" from the Rubric restores the same assessment exactly (rather than running a fresh simulation). Saving from the Rubric also returns to the cached results view. A small amber **Demo** pill on the feedback card flags that the assessment is illustrative.

### Application Kit Access buttons connected

See "Application Kit — real resources" under New features above. Each Access button now links to a free external resource.

### Interview Rubric save persists

The Rubric's Save button now writes to localStorage. See "Saved Interview Assessments" under New features above for the full implementation.

### Save Role / Save Skill buttons added and made responsive

The first cut of the Save buttons rendered them in two places (modal footer and the gradient CTA banner) — both with the same DOM `id`, which meant only one of the two ever updated when toggled. Refactored to extract render helpers (`renderOccupationFooter`, `renderSkillModalFooter`, `renderSkillCTAContainer`) that rebuild the relevant DOM section on every toggle. Button labels, background colours, and bookmark icon fill now flip atomically.

### Compass Users cards made interactive

The five user-type cards in the Compass Users side menu (Graduates, Career Specialists, Educators & Trainers, Employers, Policymakers) were styled like buttons but rendered as inert `<div>`s; the `generateUserInsight(userType)` handler awaited connection. Converted to real `<button>`s wired to the handler. Each opens a tailored briefing modal. Added a "Tap any user type for a tailored briefing" prompt and an arrow icon on hover so the affordance is discoverable.

### Navigation chain across modals and drawers

The original prototype used `closeAllModals()` when opening a centred modal, which also closed any side drawer the user might have come from. Adjusted so drawers stay open underneath the modal (z-100 modal over z-60 drawer); a new `closeOtherModalsOnly()` helper closes other centred modals but leaves drawers alone. Result:

- Sector Hub → tap a top occupation → close modal → returns to Sector Hub view rather than the homepage.
- Combined with the modal navigation stack, contextual Back buttons surface at every step of the chain (Back to Sector Hub → Back to Role → Back to Skill).

Also: the skill-from-role chip onclick previously closed the occupation modal before pushing the navigation stack, so skill modals opened from a role appeared with no Back button. Reordered so the navigation stack is populated first; skill modals now show **Back to Role**.

### Earned Credentials card

A partial refactor had introduced a `badgeInfo` object alongside the existing `activeData.badgeTitle / .badgeStandard / .badgeProvider` references, so each field rendered twice. Removed the older references; `badgeInfo` covers them with the same data.

### `generateUserInsight` deduplicated

The function was defined identically at two locations in `app.js`; the second silently overwrote the first. Removed the 106-line duplicate.

### Community Hub drawer title

A small typo — the Community Hub drawer's `<h2>` read "Careers Hub". Corrected to "Community Hub".

### Hardcoded paths in simulation scripts

`simulate_wages.py` and `simulate_employers.py` resolved their input via absolute paths from an earlier directory layout. Replaced with `os.path.join(BASE_DIR, ...)` so they read alongside themselves regardless of clone location or platform.

### JSON validation caught a parsing issue

`resources_general.json` had a missing comma between two array elements; the parse would silently fall back without surfacing the error. The smoke test suite caught it. Comma added.

### Repo cleanup

A few inactive files removed or renamed for clarity:

- `events.json` (empty, never referenced)
- `digital_resources.json` (empty object, only read by the now-fixed validator)
- `resource_search.js` (ES-module code not loaded by the current `<script>` setup)
- `.htmlhintrc.disabled`, `.prettierrc.disabled` (identical to the active configs)
- `eslint.config.js` (identical to `eslint.config.cjs` apart from import syntax — kept the `.cjs`)
- `tracer.json.txt` renamed to `providers_tracer_studies.json` (valid JSON, refined extension)

---

## Mobile, accessibility, and offline

### Mobile-friendly modals and drawers

- **Modal heights** use `max-h-[85dvh]` (dynamic viewport height) so content sits above the mobile browser's URL bar and bottom toolbar. The Share via WhatsApp button is fully reachable on phone screens.
- **Wrapper top padding** reduced from `pt-4` to `pt-2` on mobile to claim back vertical space.
- **Horizontal scroll** is suppressed across drawers, modal panels, and the body via a small CSS rule.
- **Sector Hub cards** previously fit a 24px headline value into ~140px-wide phone cards. Big-number values are now `text-base` on mobile / `text-2xl` on tablets+, with `break-words` and `min-w-0` so content wraps gracefully. Card padding `p-3` on mobile.
- **Outreach Templates** monospaced bodies use `whitespace-pre-wrap break-words` with `overflow-x-auto` fallback so long lines wrap rather than overflow.

### Back button on its own row

The Back button is rendered as a dedicated bar at the top of the modal panel (above the existing header) rather than competing with the title for horizontal space. A long label like "Back to Sector Hub" no longer crowds the role title. The label is contextual based on what's on the navigation stack: **Back to Sector Hub**, **Back to Careers Hub**, **Back to Role**, **Back to Skill**.

### Keyboard accessibility

- **ESC** closes the topmost modal or drawer. When the navigation stack is populated (occupation → skill chain), ESC behaves like the visible Back button instead of dismissing everything.
- **Focus management** via MutationObserver on the five main modals. When a modal becomes visible, keyboard focus moves to its Close button so screen readers and keyboard users immediately enter the new context.
- **ARIA roles** on dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="..."` on the occupation, skill, and certificate modals. `aria-label="Primary"` on the top nav. `role="status"` on the prototype banner.

### Print CSS

`viewCertificate` calls `window.print()`; previously the page printed with the modal overlay, nav bar, banner, and fixed widgets visible. Added a `@media print` block in `style.css` that hides everything except the certificate panel, strips the modal header and footer buttons, and sets `@page margin: 1cm`. The certificate now prints as a single clean page suitable for framing or attaching to an application.

### Performance: deferred JS loading

`data.js` (181 KB) and `app.js` (~650 KB) now load with the `defer` attribute. The HTML parses in parallel with the script downloads; scripts execute in document order after parsing completes. Faster first paint, especially on slower connections. No behaviour change — both files are pure definitions and the DOMContentLoaded handler waits for parsing either way.

### Open Graph + Twitter Card meta tags

When the live URL is shared in Slack, WhatsApp, LinkedIn, Teams, or any modern messenger, the link unfurls with a proper title, description, and card layout. Also expanded the bare meta description into a keyword-friendly one.

### Branded 404 page

`404.html` with inline CSS (no external dependencies) replaces GitHub's generic error page. Matches the app's design language: compass icon, friendly copy, single button linking back to the root.

---

## Copy and wording

A few small adjustments:

- "View Less Occupations" → "View **Fewer** Occupations" (count noun grammar)
- "...degree or diplomain another EAC country..." → "...diploma in another..." (a hyphenation that joined two words)
- Meta description swapped to match the `<title>` ("Skills2Careers" rather than "Careers2Skills")
- Three `mailto:` references in "Report Broken Link" buttons were pointing to a placeholder address. Replaced with a single `REPORT_EMAIL = 'feedback@example.org'` constant at the top of `app.js` (marked as placeholder in the comment) — one place to update before deploy.

---

## Attribution and demo-data labelling

### Data source attribution

Per the original brief, visible attribution to the data sources used:

- Footer now reads: *"Built on the [UNESCO Global Skills Tracker](https://unevoc.unesco.org/home/Global+Skills+Tracker) and the ESCO occupation taxonomy."*
- "About the data & methodology" link in the footer opens the About drawer's full data-sources section.
- About drawer lists five data sources with outbound links: UNESCO GST, ESCO, ILOSTAT, Kenya KLMIS, Rwanda LMIS.

### Demo data labelled, not replaced

Per the brief, no actual data values were edited. Illustrative content is clearly flagged where prominent:

- **Top banner**: "Demonstrating UI flow. Some wage and outcome figures are illustrative — see About." with a link to the full Prototype notice. Shorter mobile variant.
- **Occupation modal Avg Wage** field shows an amber **Demo** pill with a tooltip explaining the figure comes from `simulate_wages.py`.
- **Featured Mentors** section header shows an amber **Sample** pill (the prototype profiles use pravatar.cc placeholder avatars).
- **About drawer's Prototype notice** calls out wage figures, mentor profiles, and outcome metrics as illustrative.

---

## Language switcher

The EN/SW/FR selector previously persisted the user's language preference to localStorage; UI translations are a longer workstream not yet underway. To make the current behaviour transparent: selecting SW or FR now shows a toast — *"Coming soon — the interface is currently English only. Your language preference has been saved for when translations are added."* — and the selector snaps back to English. A `TODO (i18n)` comment in the code documents the larger workstream (extract UI strings into a key/value dictionary, add a `translate(key)` helper, route templates through it).

---

## Lite Mode

Added a tooltip ("Toggle Lite Mode — disables animations, transitions, and heavy visuals for faster loading on slow connections"), an aria-label, and a confirmation toast on toggle so users understand what the button does before clicking.

---

## Code quality

### `.gitignore`

Added one covering OS junk, editor artefacts, `node_modules`, and local working notes.

### `package.json` with dev dependencies and scripts

The existing eslint configs referenced `@eslint/js`, `globals`, `eslint-plugin-jsonc` as dependencies. Added a proper `package.json` declaring them, with scripts:

- `npm run lint` / `lint:js` / `lint:html` / `lint:css` — wires up existing configs
- `npm run format` — Prettier across the codebase
- `npm run validate:data` / `validate:links` — runs the existing Python validators
- `npm run serve` — quick local server via `python3 -m http.server 8080`
- `npm test` — runs the smoke test suite

### Smoke tests

`tests/smoke.mjs` — 28 sanity checks runnable via `npm test`. Catches JSON parse errors, missing top-level keys, missing required fields, broken `package.json` scripts. (This is what surfaced the `resources_general.json` parsing issue mentioned above.)

### Single source of truth for `data.js`

Thirteen top-level declarations in `data.js` weren't yet read by any code in `app.js`. After a sweep, all thirteen are accounted for:

- **Nine newly surfaced** in the UI (see New features above): `specificMentors`, `applicationKitsResources`, `applicationKitsConfig`, `outreachTemplates`, `apprenticeshipFrameworks`, `apprenticeshipStandards`, `pivotAuditSections`, `heroPersonaContent`, `pathwayToolsInterestMap`.
- **Two consolidated**: `readinessScorecardSections` and `pathwayToolsInterestMap` had identical inline copies in `app.js`. The inline versions were removed; `data.js` is now the single source.
- **Four flagged as superseded** by richer inline versions (with country-specific overrides, dates, and links that the `data.js` entries don't carry): `sectorCardConfig`, `venturePlaybooks`, `employerConnectEvents`, `alumniNetworks`. Added `NOTE:` comments in `data.js` pointing future maintainers at the canonical inline version, so the next person to edit either one knows where to find both.

### Orphan functions documented

Ten functions defined on `window` that aren't currently called from `app.js` or `index.html`. Listed at the top of `app.js` with one-line hypotheses about each (likely artefacts of earlier flow iterations — e.g. `renderPivotAudit` was an earlier version of what's now `showPivotAuditView`). A future cleanup pass can verify each in a browser and remove safely.

### Google Tag Manager scoped to upstream

The GTM container ID in `index.html` is shared with the upstream property; the live preview on my fork shouldn't be feeding traffic into that account. Both the head script and the noscript fallback iframe are commented out, with an inline comment explaining how to re-enable when merging back upstream.

### Line endings normalised

Files in the repo had mixed CRLF/LF line endings (uploads from the GitHub web UI default to CRLF on Windows; automated tooling uses LF). A one-time normalisation commit (with a clear standalone message) brings everything to LF. A `.gitattributes` with `text=auto` keeps it stable going forward — Windows working copies still see CRLF locally, the repo stores LF.

### Full README

113-line `README.md` replacing the one-line placeholder. Covers what the app is, how to run it locally, the file layout, status of major features, the prototype caveat, and contribution guidance.

---

## What was deliberately not changed

- **Data values.** No course, skill, occupation, scholarship, or wage figures were edited. Demo data is labelled where prominent (see Demo data labelling above).
- **`app.js` refactor.** It's still a single file. Splitting it per-concern (DataManager, Modals, Pathway, Training, Hub, Plan, Charts, Drawers) is a worthwhile follow-up — and the orphan-function audit makes a useful starting point — but doing it safely needs a full QA pass that this scope didn't include.
- **Partner / employer logos** are held back pending usage approval (UNESCO and partner organisations).
- **Full i18n.** The toast was a transparency fix; proper translation requires extracting UI strings into a dictionary and routing every template through a `translate(key)` helper. A separate workstream.
- **Full WCAG accessibility audit.** The basics (ESC, focus, ARIA, print CSS) are in place; a screen-reader testing pass and a Lighthouse a11y score haven't been run yet.
- **Lighthouse performance audit.** No targeted optimisation beyond `defer` on the JS, preconnect hints, and the Service Worker cache.
- **Real PNG icons for the PWA manifest.** Currently uses iconify SVG, which works for theme colour but isn't ideal for full installability across all platforms.

---

## How to review

Each commit is atomic and conventionally named with the audit item ID where applicable (e.g. `fix(A1):`, `feat(C7):`). Cherry-pickable individually for selective merging.

```bash
# All changes (33 commits)
git log --oneline main..audit-and-fixes

# Or the full commit messages
git log main..audit-and-fixes
```

One commit is a no-op for review: `chore: normalize line endings to LF` contains no content changes, just line-ending conversion. Skip it.

---

## Live test URL

**🔗 https://grahamcohen.github.io/Skills2Careers-Compass/**

A few suggested places to start:

1. **Mobile install.** On a phone, open the site → browser menu → **Add to Home Screen**. Open from the icon — the app runs in full screen without the browser toolbar.
2. **Navigation chains.** Open the Sector Hub → tap a top occupation → tap a Technical Skill from inside the role → tap a Common Job Title chip. Each step shows a contextual Back button at the top.
3. **My Career Plan.** From any role: tap **Save Role**. From any skill: tap **Save Skill**. Open the My Plan widget (bottom-right) — saved items appear with tappable text + delete buttons. Tap a saved item to reopen its profile.
4. **Application Kit.** Careers Hub → Applications Kit. Switch through the six tabs; tap any Access button to open a real external resource in a new tab.
5. **Outreach Templates** and **Pivot Audit**. Careers Hub home, under Work Readiness.
6. **About drawer.** Info icon (top-left). Scroll to the green **Works offline** panel for the cache explanation and the Reset App Cache button.

Always open to feedback on any of it.

— Graham
