# Responsive Workflow Report

## Workflow: EP Patient Treatment Extension
Pages involved: `/patients/new`, `/patients/:patientId`.
Mobile result: At 390px, EP role selection reveals treatment end / extension date and hides sputum schedule.
Desktop result: Covered by component tests and build/typecheck; desktop visual smoke not separately repeated for this EP change.
Problems found: EP patients were treated like pulmonary patients for sputum schedule and six-month end date.
Fixes made: Shared EP-aware treatment schedule resolver, form extension date field, pulmonary-only sputum UI/tasks.
Verification: Browser smoke and automated tests passed.
Remaining risk: Existing backend records with old sputum follow-up rows remain in storage, but the EP patient UI no longer prompts for sputum follow-up.

## Workflow: Date Entry And Display
Pages involved: patient form, diary, dashboard, reports, cards/lists.
Mobile result: Date fields use `dd/mm/yyyy` text input with validation.
Desktop result: Date display remains readable and ISO is kept internally.
Problems found: Mixed date formats and potential ISO leaks.
Fixes made: `DateInput`, `formatDateDisplay`, report transform helpers.
Verification: Date and report tests passed.
Remaining risk: Any future newly-added date surface must use the shared helpers.

## Workflow: Mobile Navigation
Pages involved: app shell routes.
Mobile result: Bottom navigation plus more panel covers secondary destinations.
Desktop result: Sidebar remains available, including collapsed mode.
Problems found: Sidebar was not suitable as the only navigation model on mobile.
Fixes made: Mobile bottom nav/more panel and responsive shell CSS.
Verification: Build/check pass; not exhaustively manually tested on every route in this final pass.
Remaining risk: Manual touch testing at 320px, 360px, 414px, 768px, and desktop widths should be done before release.

## Workflow: Reports And Backup
Pages involved: `/reports`, `/settings`.
Mobile result: Report controls use responsive card/action styling.
Desktop result: Existing report behavior preserved.
Problems found: Non-backup report JSON could expose raw ISO dates.
Fixes made: Report rows transform date fields to `dd/mm/yyyy`; full backup remains ISO.
Verification: Report tests passed.
Remaining risk: None known for current report transforms.
