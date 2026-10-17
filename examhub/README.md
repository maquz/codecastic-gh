# ExamHub

End-of-term / end-of-year multiple choice exams for Basic 4 to Basic 9.
Students pick a level (Basic 4 to 9) or an exam section (BECE, WASSCE, GTLE, GES Promotion) and a subject;
admins manage subjects, questions and results.

Deep links: add `?level=BECE`, `?level=WASSCE`, `?level=GTLE`, `?level=GES-PROMO` or `?level=4` to 9 to the
address to open the portal on that section (the website's ExamHub pages use this).

## Structure
- `src/`        React + Vite + Tailwind frontend
- `backend/`    API routes (`router`, `db` from `@appdeploy/sdk`)
- `tests/`      End-to-end test descriptions used by AppDeploy QA

## Running
This app was built for AppDeploy. The imports `@appdeploy/client` (frontend)
and `@appdeploy/sdk` (backend) are provided by the AppDeploy platform and are
not on npm, so `npm run dev` will not run the full app outside AppDeploy
without replacing them (e.g. with fetch calls and your own database).

To redeploy on AppDeploy, send these files with `deploy_app`
(app_type `frontend+backend`, feature `database`, template `react-vite`).

## Data (database tables)
- `subjects`  { name }
- `questions` { subjectId, level (4-9 or BECE | WASSCE | GTLE | GES-PROMO), text, options[4], correctIndex, explanation, createdAt }
- `results`   { studentName, level, subjectId, subjectName, score, total, percent, createdAt }
- `settings`  { key: 'admin', passcode }   (simple shared admin PIN, stored as plain text)

## Notes
- Grading happens on the server; correct answers are only returned after submission.
- Mathematics, Computing, Science and English are seeded with sample questions
  for Basic 4 and Basic 7 on first load.
- Starter practice questions for BECE, WASSCE, GTLE and GES Promotion (plus a "Professional Studies"
  subject) are seeded once. They are written for ExamHub and are NOT official past papers.
  Replace or add to them from the Admin tab.
