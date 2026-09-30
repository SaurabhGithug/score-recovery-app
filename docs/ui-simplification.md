# Learning-first UI cleanup — 29 September 2026

The presentation changed; question records, answers, learning history and scoring rules did not.

- Main navigation: Learn, Papers, Syllabus. Secondary destinations, account, language, calculator and legacy goal controls live in Menu. Native disclosure, keyboard focus outlines, outside-click and Escape closing are supported.
- Removed the crowded mobile bottom bar and permanent floating calculator launcher. The calculator remains available on demand from Menu, closes on navigation, and stays unavailable in exam mode.
- Home now presents one learning action rather than large architecture/marketing sections and competing diagnostic/dashboard buttons. Other preparation goals remain expandable.
- Today now prioritises a single Start/Resume action. Focus, fluency and independent-check options are expandable. Evidence counts are compact; source inventory stays available on demand.
- The signed-in `/learn` route now uses a deliberately minimal header (logo + Menu), hides the footer, removes visible source-availability copy, and leaves only the learning tabs, next action and compact evidence line in the Today view.
- Active learning sessions hide global navigation/footer and the introductory hero. Confidence and reflection controls are optional disclosures. Core answers, feedback, provenance, missing-source warnings and save/exit remain available.
- Import page: browser sync first; JSON entry and legacy ownership details expandable. Import errors and sync results remain visible. Explicit sign-in works on the import route.
- Legacy recovery screens: compact light headers; large historic-result cards, source policies and diagnostic explanations grouped under Past results & source details. Testbook test selection remains outside that disclosure. Made Easy filters hide during a drill.
- Sign-in no longer opens automatically over every signed-out page; account-gated routes still require authentication. Login can be opened explicitly and dismissed. Preparation onboarding opens on request rather than automatically interrupting another task.
- Version/install information remains in the footer's expandable details. Development indicator hidden through the supported Next configuration; errors are not suppressed.

Validation: production webpack build, TypeScript, targeted ESLint and isolated learning regressions passed. Browser checks covered the importer at desktop/390px phone width, expanded JSON input, Menu controls, on-demand calculator, and a fixture-only saved learning session with navigation hidden/restored correctly. Temporary viewport override was reset, QA tabs closed, and fixture server stopped. No real learner answers were submitted.

Preview: `output/clean-import-mobile.png`.
