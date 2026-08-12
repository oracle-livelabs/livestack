# Repository Guidance

## Frontend Architecture

- Follow the existing React 18 + Vite single-page app structure under `frontend/src`.
- Keep page-level routes wired through `frontend/src/App.jsx`; this app uses query-param navigation such as `?page=dashboard`, not React Router.
- Build new screens and refinements from the local patterns already present:
  - Page components in `frontend/src/pages`.
  - Shared JET wrappers in `frontend/src/components/JetControls.jsx`.
  - Oracle explanation surfaces via `RegisterOraclePanel`, `FeatureBadge`, `SqlBlock`, and `DiagramBox`.
  - Data loading through `frontend/src/hooks/useData.js` and endpoint helpers in `frontend/src/utils/api.js`.
- Use the existing charting and map libraries already installed. Prefer Recharts for dashboard charts and React Leaflet/Leaflet for map views.

## Visual Language

- Preserve the Oracle/Redwood-inspired visual system already in `frontend/src/styles/index.css`.
- Use Oracle Sans, existing CSS variables, restrained corner radii, and the established `glass-card`, `stat-card`, `btn-ghost`, `tone-*`, `surface-*`, and `feature-tag` conventions.
- Prefer Oracle JET controls or the local JET wrappers for form controls and primary actions.
- Prefer existing Oracle JET icon classes for application chrome, navigation, and KPI cards. Use `lucide-react` for page-local utility icons only when that matches nearby code.
- Keep colors within the established Redwood palette: Oracle red `#C74634`, sienna `#AA643B`, pine `#4C825C`, ocean `#437C94`, teal `#4F7D7B`, plum `#796087`, rose `#A36472`, and neutral tones already defined in CSS.
- Do not introduce decorative gradients, large rounded cards, new UI kits, or unrelated visual systems.

## Healthcare Demo Copy

- Keep copy professional, provider-focused, operational, and demo-friendly.
- Use healthcare language such as provider network, care services, care sites, patient flow, quality signals, capacity, logistics, care pathways, service requests, risk, and governed data.
- Do not claim real clinical outcomes, patient safety improvements, regulatory compliance, cost savings, or production readiness unless the code and data explicitly prove it.
- Frame capabilities as demo exploration, signal surfacing, coordination support, analysis, forecasting, and decision support.
- Preserve compatibility wording where needed: physical table names may still use inherited schema terms such as `products`, `brands`, `social_posts`, and `orders`; explain them as compatibility names rather than renaming backend contracts casually.

## Backend Boundaries

- Make UI improvements without adding or changing backend dependencies unless the user explicitly asks for backend work.
- Prefer reshaping existing frontend presentation over adding new API calls.
- If a UI change genuinely needs new data, identify the current endpoint contract first and ask or state the backend change clearly before implementing it.
- Do not modify seed data, import workflows, Oracle schema files, or Podman deployment behavior as part of visual-only work.

## Validation

- Before a final response, run the repo's existing validation commands relevant to the change.
- If `lint`, `typecheck`, or `test` scripts are added later, run them before handoff.
- This repo currently does not define `lint`, `typecheck`, or `test` scripts in the root or frontend `package.json`.
- Current validation commands are:
  - `npm run build`
  - `npm run verify:brand-colors`
  - `npm run verify:contrast`
  - `npm run verify:focus-semantics`
- For frontend-only changes, `npm run build` is the minimum required validation. Run the verification scripts when the change touches colors, contrast, focus behavior, semantics, or shared UI patterns.
- If a validation command cannot run or fails because of a pre-existing issue, report that explicitly with the command and failure reason.

## Handoff Summary

- Final responses should list changed files and summarize the user-visible effect.
- Include validation results with exact commands run.
- Mention any skipped validation and why.
- Keep summaries focused on the requested scope and call out unrelated pre-existing issues separately.
