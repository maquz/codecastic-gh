# Codecastic GH website

Company website for Codecastic GH ("Innovating Today, Transforming Tomorrow.").
Pages: Home, About us, Services, ExamHub (with sections), Governance, Contact us,
plus a passcode-protected staff inbox at `#/inbox`.

Live: https://codecastic-gh-website-w00egw.v2.appdeploy.ai/

## ExamHub tab
`#/exams` is an overview. Each section has its own page that embeds the ExamHub portal already opened on
that section (the portal reads `?level=`):

- `#/exams/basic`          Basic 4 to 9
- `#/exams/bece`           BECE
- `#/exams/wassce`         WASSCE
- `#/exams/gtle`           GTLE
- `#/exams/ges-promotion`  GES Promotion Exams

## Structure
- `src/`            React + Vite + Tailwind frontend (hash-based routing, no router library)
  - `content.ts`    Services, values, objectives, officers (edit copy here)
  - `exams.ts`      The ExamHub sections: names and descriptions
  - `ui.tsx`        Routes, nav list, ExamHub URL, logo, page header
  - `pages/`        One file per page
  - `index.css`     Design tokens (brand colours, fonts) and all page styles
- `backend/`        API routes for the contact form and staff inbox
- `tests/`          End-to-end test descriptions used by AppDeploy QA

## Brand
Logo is an inline SVG in `src/ui.tsx` and a favicon in `index.html`. HD logo files are in `../brand/`.
Brand colours: navy #364C83, green #2A8759, gold #E6BB31, red #E14947. Wordmark font: Saira Semi Condensed.

## Things to update
- Contact details (email, phone, address) are not in the constitution, so none are shown.
  Add them in `src/pages/Contact.tsx` (the aside column) and the footer in `src/App.tsx`.
- `EXAMHUB_URL` in `src/ui.tsx` points at the deployed ExamHub app.

## Running
Built for AppDeploy. `@appdeploy/client` (frontend) and `@appdeploy/sdk` (backend) are
provided by the platform and are not on npm, so the full app will not run elsewhere without
replacing them with `fetch` calls and your own database. The code type-checks with stand-ins for those two packages.

## Data (database tables)
- `messages`  { name, email, phone, topic, message, createdAt }
- `settings`  { key: 'inbox', passcode }   (shared staff PIN, stored as plain text)
