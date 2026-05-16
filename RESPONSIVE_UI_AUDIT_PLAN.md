# Responsive UI Audit Plan

## Detected Tech Stack
- Framework: Vite + React.
- Routing: React Router routes declared in `src/App.tsx`.
- Styling: plain global CSS in `src/styles/app.css`.
- Package manager: npm with `package-lock.json`.
- Repository status: `D:\Brac` is not a git repository, so branch/status reporting is unavailable.

## Shared Layout Components
- App shell/sidebar/topbar/bottom navigation: `src/components/index.tsx`.
- Shared cards, badges, search, date input, DOT grid, timeline: `src/components/index.tsx`.
- Page modules: `src/pages/*.tsx`.
- Global layout and responsive rules: `src/styles/app.css`.

## Global Layout Risks
- Fixed sidebar plus narrow mobile viewport.
- Dense patient form sections with many inputs.
- DOT grid and worklist cards at 320px.
- Bottom navigation and floating new-patient action on mobile.
- Long Bangla/English mixed labels in buttons, cards, and headings.
- Date inputs and date display consistency across report, diary, dashboard, form, and task surfaces.

## Mobile Risk Areas
- Patient create/edit form.
- Patient detail with attachments, DOT grid, sputum follow-up, contact investigation, and outcome cards.
- Registry filters and patient cards.
- Worklist task cards.
- Report cards/export controls.
- Settings import/export controls.
- Auth login/signup/verification flow.

## Fix Strategy
- Keep backend/API/database dates in ISO format.
- Use `DateInput` and date formatting helpers for user-facing date entry/display.
- Use responsive grid/flex rules with `minmax(0, 1fr)`, wrapping action rows, and full-width mobile controls.
- Keep desktop sidebar, mobile bottom nav, and the existing green medical brand palette.
- Hide sputum follow-up UI/tasks for extra-pulmonary patients and allow an editable treatment end/extension date.

## Verification Strategy
- Automated: `npm run check`, `npm run build`.
- Targeted tests: date parsing/display, date input, patient form, diary/reports, EP treatment schedule.
- Browser smoke: mobile-width patient form interaction for EP treatment extension and no sputum schedule.
- Remaining manual QA: a full visual pass across every route at every requested viewport should still be done before production release.
