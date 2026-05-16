# Responsive Route Map

| Route | Source | Purpose | Main UI | Mobile Risk | Test Status | Fix Status |
|---|---|---|---|---|---|---|
| `/login` | `src/pages/LoginPage.tsx` | Sign in, sign up, verification | Auth form, role display, verification code | Form width, verification state | Automated auth tests present | Previously updated for role/verification flow |
| `/` | `src/pages/DashboardPage.tsx` | Dashboard summary | Header, stat grid, quick actions | Grid/card wrapping | Build/check pass | Responsive grid/date subtitle updated |
| `/patients` | `src/pages/PatientRegistryPage.tsx` | Patient registry | Search/filter, patient cards | Filter wrapping, card text | Component surfaces covered | Responsive CSS applied |
| `/patients/new` | `src/pages/PatientFormPage.tsx` | Create patient | Multi-section patient form | Dense form, date inputs | Browser smoke at 390px; tests pass | EP extension UI added, dates standardized |
| `/patients/:patientId` | `src/pages/PatientFormPage.tsx` | Patient detail/edit | Form, lab, DOT, sputum, contact, TPT, attachments, outcome | DOT grid, modals/cards, upload rows | Patient form tests pass | EP hides sputum follow-up; attachments/date display responsive |
| `/today` | `src/pages/WorklistPage.tsx` | Worklist | Filters and task cards | Action rows/card text | Component surfaces covered | Date display updated |
| `/diary` | `src/pages/DiaryPage.tsx` | Diary timeline | Search/type/date filter, timeline | Filter stacking, date input | Date tests pass | Date filter/display standardized |
| `/reports` | `src/pages/ReportsPage.tsx` | Reports/export | Report cards, export actions | Card/action wrapping | Report transform tests pass | Export dates standardized except full backup |
| `/providers` | `src/pages/ProviderPage.tsx` | Provider list/create | Search/list/form | Form and cards | Build/check pass | Responsive CSS applied |
| `/quality` | `src/pages/DataQualityPage.tsx` | Data quality issues | Issue cards/list | Card wrapping | Build/check pass | Responsive CSS applied |
| `/settings` | `src/pages/SettingsPage.tsx` | Settings/backup/import | Backup/import controls | File/action rows | Build/check pass | Responsive CSS applied |
| `*` | `src/pages/NotFoundPage.tsx` | Not found | Message/CTA | Centering and text | Build/check pass | Covered by global layout |

## Shared Layout
- Desktop sidebar and collapsed mode: `src/components/index.tsx`, `src/styles/app.css`.
- Mobile bottom navigation and more panel: `src/components/index.tsx`, `src/styles/app.css`.
- Topbar/page containers: `src/components/index.tsx`, `src/styles/app.css`.
