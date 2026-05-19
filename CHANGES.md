# Skills2Careers Compass — Changelog

A summary of the improvements made to the **Skills2Careers Compass** prototype. All changes live on my fork (`grahamcohen/Skills2Careers-Compass`) and are deployed for testing at:

**🔗 https://grahamcohen.github.io/Skills2Careers-Compass/**

The upstream repository (`carmelasalzano-source/Skills2Careers-Compass`) is untouched. Changes are broken into atomic, conventionally-named commits so individual fixes can be cherry-picked upstream when ready.

---

## Summary at a glance

- **Navigation is reliable.** Back-buttons now work across the modal/drawer chain so users never get stranded. Back to Sector Hub, Back to Role, Back to Skill, Back to Careers Hub all surface contextually.
- **Several broken features now work.** The custom stylesheet no longer 404s; the About drawer opens; the certificate modal renders; the AI Interview Coach has a real record/stop flow; the Application Kit's Access buttons link to real free resources instead of doing nothing.
- **My Career Plan is real.** Save Role / Save Skill / Save Course buttons all work, persist to the device, and the saved items in the plan widget are now tappable to reopen.
- **Nine new content features.** Outreach Templates with copy-to-clipboard; Pivot Audit for career-changers; Saved Interview Assessments; Featured Mentors in the Community Hub; Apprenticeship Frameworks + national standards on the Placement Kit; Application Kit metadata + Founder Tender tab; Hero Persona switcher (Learner / Entrepreneur / Counsellor / Educator / Policymaker).
- **Works offline after first visit.** Service Worker with stale-while-revalidate caching. Add-to-Home-Screen recommended via the About drawer for the best mobile experience.
- **Mobile-friendly.** Horizontal scroll fixed on the Sector Hub; content no longer cuts off behind the browser toolbar; touch targets and font sizes adjusted for narrow screens.
- **Accessibility basics in place.** ESC closes the topmost modal; focus moves into modals when they open; ARIA roles + labels on dialogs and nav; certificate modal prints cleanly.
- **Code health improved.** `style.css` properly named; dead files removed; linter and Prettier wired up; smoke tests (28 assertions, all passing) catch JSON regressions; line endings normalised; orphan functions documented for future cleanup.

---

## New features

### My Career Plan — full save/recall workflow

The bookmark widget previously claimed users could save roles, skills, and courses, but only courses had a working save button. Now:

- **Save Role** button in the occupation modal footer (alongside Share via WhatsApp). State-driven label and colour (Save Role ↔ Saved to Plan), bookmark icon fills indigo when saved.
- **Save Skill** button in the skill modal footer (visible without scrolling). Same state-driven UI. Plus a secondary Save Skill in the "Master this Skill" CTA banner for users who scroll all the way down.
- **Toast feedback** on every save/unsave ("Added to My Plan: Soil Analysis" / "Removed from My Plan: Soil Analysis") so users see immediate confirmation.
- **Tap saved items to reopen them.** Each saved role/skill/course in the plan widget is now a tappable button (with an external-link icon hint). Roles reopen the occupation modal; skills reopen the skill modal; courses jump to Find Courses with the name prefilled in the search box. A separate trash icon on the right removes the item.
- **Plan persists** to localStorage across sessions; no account needed.

### Outreach Templates

New Careers Hub feature under Work Readiness. Three ready-to-copy templates for the most common cold-outreach moments:

- LinkedIn alumni connection request
- Informational interview request email
- Application follow-up email

Each card shows subject + body in a copy-friendly monospaced block. A **Copy** button writes the whole template to clipboard and toasts a reminder to replace the bracketed `[placeholders]` before sending. Sourced from the `outreachTemplates` data block in `data.js` (previously authored but never displayed in the UI).

### Pivot Audit (for career-changers)

New Careers Hub feature for users moving between sectors. Same checklist UX as the existing Readiness Audit but focused on the specific challenges of pivoting:

- **Skill Translation** — mapping past skills to new sector jargon, functional CV format
- **Market Immersion** — communities, industry leaders, newsletters
- **Validation** — informational interviews, mini-projects, LinkedIn positioning

A live coverage badge updates as items are checked off: "Just starting" → "Early stage" → "Making progress" → "Almost there" → "Ready to pivot!". Content sourced from the `pivotAuditSections` data block.

### Saved Interview Assessments

The Interview Coach's Rubric used to pop an alert ("Assessment saved to candidate profile!") that didn't actually save anything. Now properly persists to localStorage:

- Stores date, sector, question, all four sub-scores, total /20, and the feedback text.
- New **Saved Assessments** card on the Careers Hub home grid with a live count badge.
- Tap the card to see all saved assessments as cards (date, sector, the question that was asked, per-category scores, total). Each has a delete button; bulk Clear All is available too.
- Capped at 50 most-recent records.
- Empty state with onboarding pointing back to the Interview Coach.

### Application Kit — real resources

The Applications Kit screen listed templates (Master CV, Cover Letter Guide, LinkedIn Checklist, etc.) with **Access** buttons that had no `onclick` handler — clicking did literally nothing. Across all six kit types since the prototype was first built.

Every item now links to a free, reputable external resource:

- **General Job Applications:** Europass CV builder, Harvard cover-letter guide, LinkedIn profile checklist, Indeed interview Q catalogue, Harvard PON salary negotiation guide
- **Internship Starter:** Indeed entry-level CV guide, Princeton recommendation request template, Indeed internship cover letter, Erasmus+ Learning Agreement, ILO internship report guidelines
- **Work Placement:** QAA placement guidance, Open University logbook template, ILO supervisor evaluation rubric, OU placement report structure, ILO OSH workplace safety checklist
- **Freelancer Toolkit:** Bonsai free rate calculator, Bonsai contract template, Smashing Magazine portfolio guide, Indeed cold pitch templates, Wave free invoicing
- **Founder Tender:** SBA capability statement template, KRA iTax overview, World Bank technical proposal template, ILO budget guidance, World Bank PPQ standards
- **Volunteer Applications:** Indeed personal statement guide, UK National Careers Service skills audit, WEF Future of Jobs report, HBR authentic leadership, Idealist volunteer commitment guide
- **Founder Tender tab** was authored in the data but never exposed in the UI — now visible as a sixth tab.

Each row also shows a one-line description (so users can decide before clicking), an external-link icon on the Access button, and the relevant CV format / what-to-bring / test-type metadata header at the top (from `applicationKitsConfig`).

### Apprenticeship Frameworks + National Standards

Added to the Placement Kit only (most relevant context). Two new blocks:

- **Apprenticeship Framework** — duration, objective, apprentice role, employer responsibilities, tailored to the active sector (Agritech / Renewable Energy / Digital / generic default).
- **National Standards** — country-relevant apprenticeship bodies (e.g. NITA Kenya, VETA Tanzania, DIT Uganda, RTB Rwanda, EAC TVET regional) as outbound link chips, filtered to the active country plus regional bodies.

Both sourced from previously-unused data blocks (`apprenticeshipFrameworks`, `apprenticeshipStandards`).

### Featured Mentors

The Community Hub drawer now shows a Featured Mentors section when filter is set to "All" or "Mentorship". Each card shows:

- Circular avatar (with initials-circle fallback if the image fails to load)
- Name, role, company
- One-paragraph bio

Filtered by active country and sector with a regional fallback. A small amber **Sample** pill flags the illustrative nature of the prototype profiles, consistent with the demo-data labelling pattern used elsewhere. Sourced from the `specificMentors` data block.

### Hero Persona switcher

The landing page hero now has a row of five tappable persona pills below the main subtitle:

- **Learner** — for students and recent graduates
- **Entrepreneur** — for founders and business builders
- **Counsellor** — for career advisors
- **Educator** — for trainers and training providers
- **Policymaker** — for government and donor audiences

Tapping a pill swaps the hero subtitle to a persona-tailored value proposition. Selection persists across visits to localStorage. Defaults to Learner. Sourced from the `heroPersonaContent` data block.

### Sector + country persistence

Previously every page reload reset the active sector and country to defaults (Agritech / East Africa regional). Returning visitors had to re-select every time. Now both are persisted to localStorage with validation against allowed values; the top-nav dropdown syncs first on init so all downstream selectors (Career Hub, Skills Hub, Sector Hub, Find Courses filter, Financial Aid filter) pick up the restored values cleanly.

### Offline support (Service Worker)

A `service-worker.js` (123 lines) caches the app shell and JSON data using a **stale-while-revalidate** strategy:

- On install, precaches `index.html`, `app.js`, `data.js`, `style.css`, `manifest.json`, `404.html` so the app works on a cold start with no network.
- On every same-origin GET for JSON/HTML/JS/CSS, serves the cached copy immediately (instant render) and in parallel fetches fresh from the network to update the cache for next time.
- Cross-origin CDN scripts (Tailwind, Lucide, Chart.js, jsPDF) are left to the browser.
- New About-drawer panel titled **Works offline** explains the behaviour and recommends Add-to-Home-Screen (Safari → Share → Add to Home Screen; Chrome → menu → Add to Home screen) for the best mobile experience (eliminates browser toolbars, gives the app the full screen).
- **Reset App Cache** button (in the same About-drawer panel) clears localStorage + Service Worker caches + unregisters the worker + reloads. Useful when content has been updated upstream and the user wants instant freshness instead of waiting one visit cycle.
- PWA manifest `start_url` and `scope` are now relative (`./`) so installing to home screen on GitHub Pages opens the actual app, not the github.io root.

---

## Bug fixes

### Custom stylesheet was 404'ing
`index.html` referenced `style.css` but the file on disk was named `style` (no extension). The browser silently 404'd it, so ~50 lines of custom CSS (star-rating colours, sector cards, drawer transitions, scrollbar styling, animations, Lite-Mode fallbacks) never made it to the page. The site had been running on Tailwind defaults alone — many states looked unfinished. Renamed the file. Star ratings now have proper colours, Lite Mode actually strips animations, scrollbars match the slate palette.

### PWA manifest 404
`<link rel="manifest" href="/manifest.json">` pointed at a file that didn't exist. Created `manifest.json` with proper name, theme colour (indigo), scope, icons via api.iconify.design, and a relative path so it works under sub-paths like GitHub Pages.

### About drawer never opened
The Info button (top-left) called `toggleAboutDrawer()`, which expected `injectAboutDrawer()` to have created the drawer element. But `injectAboutDrawer()` was never called from init — it was dead code. Clicking the Info icon did nothing visible. Wired up the init call and filled in the previously empty drawer with real content: what the app is, country coverage chips, an "About the data" section with five external data-source links (UNESCO GST, ESCO, ILOSTAT, Kenya KLMIS, Rwanda LMIS), prototype-notice banner, source-on-GitHub link.

### Certificate modal threw null reference errors
"View Cert" wrote to elements `#cert-skill`, `#cert-date`, `#cert-sector` inside a `#certificate-modal` that didn't exist in the HTML. Clicking failed silently. Added the modal markup with a properly themed certificate panel (gradient background, double-border, serif heading, print + close buttons, italic prototype caveat).

### AI Interview Coach was broken in three ways
- The "Start Recording" button immediately stopped, processed, and rendered feedback — no actual record/stop interaction.
- "Back to Results" from the Rubric re-ran the simulation with new random feedback — the user could never return to the assessment they'd just seen.
- "Save" was the only path that left a coherent navigation state.

Fixed with a real two-step record→stop flow, a `lastInterviewFeedback` cache so feedback is rendered consistently from the same source, and corrected Back-to-Results that restores the cached assessment exactly. Also added a small amber **Demo** pill on the feedback card so users know it's mock (no real speech-recognition runs).

### `generateUserInsight` defined twice
The function was defined byte-for-byte identically at two separate locations in `app.js`. The second silently overwrote the first. Removed the 106-line duplicate.

### Earned Credentials badge rendered fields twice
A partial refactor introduced a `badgeInfo` object but left the old `activeData.badgeTitle`, `.badgeStandard`, `.badgeProvider` references intact, so each field rendered twice. Removed the leftover references.

### Community Hub drawer titled "Careers Hub"
Copy-paste bug in `index.html` — the Community Hub drawer's `<h2>` said "Careers Hub". Corrected.

### Sector Hub → occupation → close → returned to homepage
Opening an occupation modal from the Sector Hub drawer was calling `closeAllModals()` which dismissed the drawer. When the user closed the modal they ended up on the homepage. Fixed: drawers now stay open underneath the modal (z-100 modal sits over z-60 drawer); a new `closeOtherModalsOnly()` helper closes other centred modals but leaves drawers alone.

### Click role → click skill → no Back button on the skill modal
The skill chip's onclick was `closeModal('occupation-modal'); openSkillModal(skill)`. The closeModal ran first, hiding the occupation modal, so by the time openSkillModal called `pushModalReturn` there was no foreground modal to push onto the navigation stack. The skill modal opened with an empty stack and no Back button. Removed the redundant closeModal call (`openSkillModal` already handles closing other modals internally). Skill modals opened from a role now show **Back to Role**.

### Application Kit Access buttons did nothing
See **Application Kit — real resources** above. Wired every Access button to a real free external resource.

### Interview Rubric Save was theatrical
The Save button popped an alert claiming the assessment was saved but nothing was persisted. See **Saved Interview Assessments** above for the real implementation.

### Save Role / Save Skill buttons looked dead
The first cut of the Save buttons rendered them in two places (modal footer + secondary CTA banner) both using `id="skill-save-text"`. `document.getElementById` only returns the first match, so the visible footer button never updated when toggled — the save was actually happening but the user couldn't see it. Refactored to extract render helpers (`renderOccupationFooter`, `renderSkillModalFooter`, `renderSkillCTAContainer`) that rebuild the relevant DOM section on every toggle. Button labels, background colours, and bookmark icon fill now flip atomically. Plus a toast confirms every save/unsave.

### Compass Users cards looked clickable but were inert
The five user-type cards in the Compass Users side menu (Graduates, Career Specialists, Educators & Trainers, Employers, Policymakers) were styled like buttons but rendered as inert `<div>`s. The `generateUserInsight(userType)` handler existed but was never invoked. Converted to real `<button>`s wired to the handler; each opens a tailored briefing modal. Added a "Tap any user type for a tailored briefing" prompt and an arrow icon on hover.

### Hardcoded Windows paths in simulation scripts
`simulate_wages.py` and `simulate_employers.py` both hardcoded `c:\Users\Salzano\OneDrive\Documents\Claude\ai4eac-compass\Prototype files\wages.json`. Replaced with `os.path.join(BASE_DIR, ...)` so they run on any machine.

### Real JSON bug caught by smoke tests
`resources_general.json` was missing a comma between two array elements. The file was unparseable; the app's fallback path was silently masking the broken data load. Fixed inline.

### Stylesheet, dead files, and config duplicates
Several files were inactive but cluttering the repo:
- `events.json` (0 bytes, never referenced)
- `digital_resources.json` (empty object, only read by the now-fixed validator)
- `resource_search.js` (dead ES-module code, never loaded; HTML doesn't have `type="module"`)
- `.htmlhintrc.disabled`, `.prettierrc.disabled` (byte-identical duplicates of the active configs)
- `eslint.config.js` (duplicate of `eslint.config.cjs` differing only in import syntax)
- `tracer.json.txt` renamed to `providers_tracer_studies.json` (valid JSON with wrong extension)

---

## Mobile, accessibility, and offline

### Mobile-friendly modals and drawers

- **Modal heights** use `max-h-[85dvh]` (dynamic viewport height) instead of `85vh`, so content no longer ends up hidden behind the mobile browser's URL bar or bottom toolbar. The Share via WhatsApp button is fully visible.
- **Wrapper top padding** reduced from `pt-4` to `pt-2` on mobile to claim back vertical space.
- **Horizontal scroll** blocked on every drawer and modal panel via CSS (`[id$="-drawer"]`, `[id$="-modal-panel"]`, `body`).
- **Sector Hub cards** previously overflowed on narrow phones — "$20M (Humanitarian)" wouldn't fit. Big-number values now `text-base` on mobile / `text-2xl` on tablets+, with `break-words` and `min-w-0` so anything wider clips instead of pushing the row. Card padding `p-3` on mobile.
- **Outreach Templates** monospaced bodies use `whitespace-pre-wrap break-words` with `overflow-x-auto` fallback so long lines wrap instead of overflowing.

### Back button on its own row

The Back button is rendered as a dedicated bar at the top of the modal panel (above the existing header), not in the same row as the title. This means a long label like "Back to Sector Hub" no longer squeezes the title into three cramped lines. Label is contextual: **Back to Sector Hub**, **Back to Careers Hub**, **Back to Role**, **Back to Skill** depending on what's on the navigation stack.

### Keyboard accessibility

- **ESC** closes the topmost modal or drawer. When the navigation stack is populated (occupation → skill chain), ESC behaves like the visible Back button instead of dismissing everything.
- **Focus management** via MutationObserver on the five main modals. When a modal becomes visible, keyboard focus moves to its Close X button so screen readers and keyboard users immediately enter the new context.
- **ARIA roles** on dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="..."` on the occupation, skill, and certificate modals. `aria-label="Primary"` on the top nav. `role="status"` on the prototype banner.

### Print CSS

`viewCertificate` calls `window.print()`; previously the print output included the modal overlay, nav bar, banner, and fixed widgets — useless for actually printing the certificate. Added a `@media print` block in `style.css` that hides everything except the certificate panel, strips the modal header X + footer buttons + backdrop, and sets `@page margin: 1cm`. The certificate prints as a single clean page suitable for framing or attaching to an application.

### Service Worker for offline use

See **Offline support** under New Features above.

### Performance: deferred JS loading

`data.js` (181 KB) and `app.js` (~650 KB) now load with the `defer` attribute. The HTML parses in parallel with the script downloads, and the scripts execute in document order after parsing completes. Faster first paint, especially on slower connections. No behaviour change — both files are pure definitions; the DOMContentLoaded handler waits for parsing either way.

### Open Graph + Twitter Card meta tags

When someone shares the live URL in Slack, WhatsApp, LinkedIn, Teams, or any modern messenger, the link now unfurls with a proper title, description, and card layout. Also replaced the bare `<meta name="description" content="Skills2Careers Compass Prototype">` with a real keyword-friendly description.

### Branded 404 page

A `404.html` with inline CSS (no external dependencies) replaces GitHub's generic error page. Matches the app's design language: compass icon, friendly copy, single button linking back to the root.

---

## Copy fixes

- "View Less Occupations" → "View **Fewer** Occupations" (count noun grammar)
- "...degree or diplomain another EAC country..." → "...diploma in another..." (missing space)
- Meta description was inverted ("Careers2Skills" → "Skills2Careers")
- Three hardcoded `mailto:support@ai4eac.org` references in "Report Broken Link" buttons replaced with a single `REPORT_EMAIL = 'feedback@example.org'` constant at the top of `app.js`. Marked as placeholder in the comment; single source of truth for the rebrand.

---

## Attribution and demo-data labelling

### Global Skills Tracker attribution

Per the brief — visible attribution to the data sources used:

- Footer now reads: *"Built on the [UNESCO Global Skills Tracker](https://unevoc.unesco.org/home/Global+Skills+Tracker) and the ESCO occupation taxonomy."*
- "About the data & methodology" link in the footer opens the About drawer's full data-sources section.
- About drawer lists five data sources with outbound links: UNESCO GST, ESCO, ILOSTAT, Kenya KLMIS, Rwanda LMIS.

### Demo data labelled, not replaced

Per the brief — no actual data values were changed. Instead, illustrative content is clearly flagged where prominent:

- **Top banner**: "Demonstrating UI flow. Some wage and outcome figures are illustrative — see About." with a link to the full Prototype notice. Shorter mobile variant.
- **Occupation modal Avg Wage** field has an amber **Demo** pill with a tooltip explaining the figure comes from `simulate_wages.py`.
- **Featured Mentors** section shows an amber **Sample** pill in the section header (the avatars and bios are illustrative; the data file uses pravatar.cc placeholders).
- **About drawer's Prototype notice** calls out wage figures, mentor profiles, and outcome metrics as illustrative.

---

## Language switcher

The EN/SW/FR selector persisted the user's choice to localStorage but never translated any UI strings (none exist in SW or FR yet). Users selecting SW saw zero change and reasonably assumed the picker was broken.

Now selecting SW or FR shows a toast: *"Coming soon — the interface is currently English only. Your language preference has been saved for when translations are added."* The selector snaps back to English. A `TODO (i18n)` comment in the code documents the larger workstream — extract all UI strings into a key/value dictionary, add a `translate(key)` helper, route templates through it.

---

## Lite Mode

Button labelled just "Lite" with no tooltip or description. Added a tooltip ("Toggle Lite Mode — disables animations, transitions, and heavy visuals for faster loading on slow connections"), an aria-label, and a confirmation toast on toggle.

---

## Code quality

### `.gitignore` added
Repo had none. Now covers OS junk, editor artefacts, `node_modules`, local working notes.

### `package.json` with dev dependencies and scripts
The existing eslint configs referenced `@eslint/js`, `globals`, `eslint-plugin-jsonc` but no manifest declared them. Added a proper `package.json` with:

- `npm run lint` / `lint:js` / `lint:html` / `lint:css` — wires up existing configs
- `npm run format` — Prettier across the codebase
- `npm run validate:data` / `validate:links` — runs the existing Python validators
- `npm run serve` — quick local server via `python3 -m http.server 8080`
- `npm test` — runs the new smoke test suite

### Smoke tests
`tests/smoke.mjs` — 28 sanity checks runnable via `npm test`. Catches JSON parse errors, missing top-level keys, missing required fields, broken `package.json` scripts. Caught the missing comma in `resources_general.json` mentioned above.

### Single source of truth for dormant data
13 top-level declarations in `data.js` that no code in `app.js` was actually reading. After a sweep, all 13 are accounted for:

- **9 newly wired** into the UI (see New Features above): `specificMentors`, `applicationKitsResources`, `applicationKitsConfig`, `outreachTemplates`, `apprenticeshipFrameworks`, `apprenticeshipStandards`, `pivotAuditSections`, `heroPersonaContent`, `pathwayToolsInterestMap`.
- **2 deduplicated**: `readinessScorecardSections` and `pathwayToolsInterestMap` had byte-identical inline copies in `app.js`. Inline versions removed; `data.js` is now the single source of truth.
- **4 annotated as superseded** by richer inline versions (with country overrides, dates, links that `data.js` didn't carry): `sectorCardConfig`, `venturePlaybooks`, `employerConnectEvents`, `alumniNetworks`. Added explicit `NOTE:` comments in `data.js` pointing future maintainers at the canonical inline version.

### Orphan functions documented
Ten functions defined on `window` but never called from anywhere in `app.js` or `index.html`. Listed at the top of `app.js` with one-line hypotheses about why each is unreachable (e.g. `renderPivotAudit` was an early version of the new `showPivotAuditView`; `showResourceLibraryModal` was superseded by the drawer pattern). Future cleanup can verify each in a browser and delete safely.

### Google Tag Manager neutralised
GTM container ID `GTM-K99RWVH5` was hardcoded in `index.html` (both the head script and the noscript fallback iframe). Running the fork live (e.g. on GitHub Pages) would have silently fed traffic to the upstream analytics property. Both blocks are commented out with a clear inline comment explaining how to re-enable on merge back upstream. Just uncomment.

### Linter configs deduplicated
Two eslint configs differed only in import syntax (kept `.cjs`, deleted `.js`). Disabled-by-rename `.htmlhintrc.disabled` and `.prettierrc.disabled` were byte-identical to the active versions — deleted.

### Line endings normalised
Several files in the repo had mixed CRLF/LF line endings (uploads happened from both the GitHub web UI which defaults to CRLF on Windows, and automated tooling which uses LF). A one-time normalisation commit (with a clear standalone message explaining the noise) brings everything in line. A `.gitattributes` with `text=auto` keeps it stable going forward — Windows working copies still see CRLF locally, the repo stores LF.

### Full README
113-line `README.md` replacing the one-line placeholder. Covers what the app is, how to run it locally, the file layout, status of major features, the "working prototype" caveat, and contribution guidance.

### Documentation files
- **CHANGES.md** (this file) — for upstream review of every change made
- **README.md** — for new contributors and curious viewers
- The original `AUDIT.md` working document is gitignored — internal tracking, not shipped

---

## What was deliberately not changed

- **No data edits.** No course, skill, occupation, scholarship, or wage values were changed. Demo data was labelled where prominent (see Demo data labelling above) but kept as-is for this pass.
- **No app.js refactor.** It's still ~9,500 lines in a single file. Splitting it per-concern (DataManager, Modals, Pathway, Training, Hub, Plan, Charts, Drawers) is a worthwhile follow-up but carried too much regression risk to do without a full QA pass. Orphan functions are documented for the next cleanup pass.
- **Partner / employer logos held back** pending usage approval (UNESCO and partner organisations).
- **i18n** beyond the toast. Proper translation requires extracting all UI strings into a dictionary and routing every template through a `translate(key)` helper. A separate workstream.
- **Full WCAG accessibility audit.** The basics are in place (ESC, focus, ARIA, print CSS) but a screen-reader testing pass and a Lighthouse a11y score haven't been done.
- **Lighthouse performance audit.** No targeted optimisation beyond `defer` on the JS, preconnect hints, and the Service Worker cache.
- **Real PNG icons for the PWA manifest.** Currently uses iconify SVG which works for theme colour but isn't ideal for full installability.

---

## How to review

Each commit is atomic and conventionally named with the audit item ID where applicable (e.g. `fix(A1):`, `feat(C7):`). Cherry-pickable individually if you want to take only some changes upstream.

```bash
# All changes (33 commits)
git log --oneline main..audit-and-fixes

# Or just see the commit messages
git log main..audit-and-fixes
```

One commit is a no-op for review: `chore: normalize line endings to LF` contains no content changes, just line-ending conversion. Skip it.

---

## Live test URL

**🔗 https://grahamcohen.github.io/Skills2Careers-Compass/**

Best places to start:

1. **Mobile install.** On a phone, open the site → browser menu → **Add to Home Screen**. Open from the icon → the app runs without the browser toolbar, in full screen.
2. **Navigation chains.** Open the Sector Hub → tap a top occupation → tap a Technical Skill from inside the role → tap a Common Job Title chip. Each step shows a contextual Back button at the top: Back to Sector Hub → Back to Role → Back to Skill.
3. **My Career Plan.** From any role: tap **Save Role**. From any skill: tap **Save Skill**. Open the My Plan widget (bottom-right) — saved items appear with tappable text + delete buttons. Tap a saved item to reopen its profile.
4. **Application Kit.** Careers Hub → Applications Kit. Switch through the six tabs (General, Internship, Placement, Freelance, Founder Tender, Volunteer). Tap any Access button — opens a real free external resource in a new tab.
5. **Outreach Templates** and **Pivot Audit.** Careers Hub home → both available under Work Readiness.
6. **About drawer.** Info icon (top-left). Scroll to the green **Works offline** panel for the cache explanation and the Reset App Cache button.

Open to feedback on any of it.

— Graham
