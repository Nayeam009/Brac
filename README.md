# TB-FO Assistant

Bangla-first TB field workflow PWA for FO work: patient registry, diagnosis, DOT, contact investigation, TPT, diary, worklist, reports, and provider management.

## Local Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Environment

Copy `.env.example` to `.env` and set:

```bash
VITE_INSFORGE_URL=https://your-project-region.insforge.app
VITE_INSFORGE_ANON_KEY=your-anon-key
VITE_ENABLE_DEMO_MODE=false
```

Development may use `VITE_ENABLE_DEMO_MODE=true`. Production should keep demo mode off.

## InsForge Backend

Apply schema and production access hardening:

```bash
npx @insforge/cli storage create-bucket record-attachments --private
npx @insforge/cli db query "$(cat db/schema.sql)"
npx @insforge/cli db query "$(cat db/production-hardening.sql)"
```

The production hardening setup enables RLS, restricts patient modules to active `fo` profiles, and scopes uploaded record attachments to the field officer's own storage folder.

## Auth Flow

- Sign in uses InsForge Auth.
- Request Access creates an active Field Officer profile after email verification.
- Active `fo` profiles can open patient modules.
- Blocked users stay on the login screen.
- Demo Mode is local-only and disabled in production builds unless explicitly enabled.

## Scripts

- `npm run dev` starts Vite.
- `npm run check` runs TypeScript and tests.
- `npm run build` creates a production build.
- `npm run backend:check` verifies InsForge connectivity.
- `npm run stitch:manifest` refreshes the Stitch screen manifest.
- `npm run insforge:current` shows the linked InsForge project.
- `npm run insforge:metadata` shows backend metadata.

## Production Notes

- Use `vercel.json` for SPA route rewrites and security headers.
- `public/sw.js` caches the app shell for install-like behavior after first load.
- Do not commit `.env` or `.insforge`.
