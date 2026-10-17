# Codecastic GH

Unified web application for **Codecastic GH** ("Innovating Today, Transforming Tomorrow."), including the native **ExamHub** examination portal.

## Structure
- `website/`  Unified frontend & backend application:
  - **Pages**: Home, About us, Services, ExamHub (`Basic 4 to 9`, `BECE`, `WASSCE`, `GTLE`, `GES Promotion Exams`), Contact us, and Staff Inbox (`#/inbox`).
  - **ExamHub Portal** (`website/src/components/ExamHubPortal.tsx`): Native student exam interface and passcode-protected Admin panel.
  - **Backend API** (`website/backend/index.ts`): Contact form, Staff Inbox, ExamHub subjects, question bank, auto-seeding, exam grading, and student results.
- `brand/`    HD logo pack (SVG and PNG), brand colours and usage notes.

## Commands
```bash
npm run install:all
npm run dev
npm run build
```
