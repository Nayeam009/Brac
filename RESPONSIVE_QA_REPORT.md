# Responsive QA Report

## Route: `/patients/new`
Viewport tested: 390px mobile browser smoke.
Problem found: Extra-pulmonary patients had no editable extension date and sputum schedule could still appear through shared treatment logic.
Severity: P1.
Root cause: Treatment dates and sputum follow-up were generated from treatment start alone.
Files involved: `src/domain/automation.ts`, `src/pages/PatientFormPage.tsx`, `src/App.tsx`.
Fix made: Added shared treatment schedule resolver. EP patients can use a treatment end / extension date, and sputum schedule/tasks are pulmonary-only.
Verification: Browser smoke confirmed EP extension input appears, `Treatment End: 14/10/2026` displays, and `Sputum 2M`/sputum heading are absent.
Status: Fixed.

## Route: `/patients/:patientId`
Viewport tested: component test plus shared CSS/build verification.
Problem found: Patient detail could show sputum follow-up for EP patients and save could overwrite EP extension with the default six-month date.
Severity: P1.
Root cause: Save path spread calculated six-month treatment dates directly onto every patient.
Files involved: `src/App.tsx`, `src/domain/automation.ts`, `src/pages/PatientFormPage.tsx`.
Fix made: Save path now preserves EP extension date via `resolvePatientTreatmentSchedule`; sputum section hidden for EP.
Verification: `PatientFormPage` test covers EP extension date save and no sputum section; `automation` test covers no EP sputum tasks.
Status: Fixed.

## Date Standardization
Viewport tested: automated/component coverage.
Problem found: User-facing dates could appear as ISO or localized long dates.
Severity: P2.
Root cause: Date formatting was scattered across pages/components.
Files involved: `src/lib/dateFormat.ts`, `src/components/index.tsx`, `src/App.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/ReportsPage.tsx`.
Fix made: Centralized `dd/mm/yyyy` formatting/parsing and converted visible reports, dashboard, diary, cards, badges, attachments, DOT, and patient form dates.
Verification: `npm run check` includes date, report, component, diary, and patient form tests.
Status: Fixed for inspected user-facing surfaces; backup JSON and API payloads intentionally remain ISO.

## Global Responsive Foundation
Viewport tested: automated build plus focused browser smoke.
Problem found: Mobile layouts could overflow from fixed shell/sidebar assumptions and dense grids.
Severity: P1/P2.
Root cause: Desktop-first app shell and multi-column forms/cards.
Files involved: `src/styles/app.css`, `src/components/index.tsx`.
Fix made: Responsive app shell, mobile bottom nav/more panel, wrapping headers/toolbars/action rows, fluid grids, safer text wrapping, responsive DOT grid.
Verification: Build/check pass; focused mobile browser smoke passed on patient form.
Status: Improved. Full manual route-by-route visual QA remains recommended.
