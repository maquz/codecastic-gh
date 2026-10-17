import { router, json, error, db } from './sdk';

/* ------------------------------------------------------------------ */
/* Staff Inbox Helpers                                                 */
/* ------------------------------------------------------------------ */

async function getInboxCode(): Promise<string | null> {
    const { items } = await db.list('settings', { limit: 50 });
    const doc: any = items.find((i: any) => i.key === 'inbox');
    return doc ? (doc.passcode as string) : null;
}

async function isStaff(code: unknown): Promise<boolean> {
    const saved = await getInboxCode();
    return !!saved && typeof code === 'string' && code === saved;
}

/* ------------------------------------------------------------------ */
/* ExamHub Helpers & Seed Data                                         */
/* ------------------------------------------------------------------ */

const SCHOOL_LEVELS = [4, 5, 6, 7, 8, 9];
const TRACKS = ['BECE', 'WASSCE', 'GTLE', 'GES-PROMO'];
type Level = number | string;

function normLevel(raw: unknown): Level | null {
    const s = String(raw ?? '').trim();
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        return SCHOOL_LEVELS.includes(n) ? n : null;
    }
    const u = s.toUpperCase();
    return TRACKS.includes(u) ? u : null;
}

const DEFAULT_SUBJECTS = ['Mathematics', 'Computing', 'Science', 'English'];

type SampleQ = { level: number; text: string; options: string[]; correctIndex: number; explanation: string };

const SAMPLES: Record<string, SampleQ[]> = {
    Mathematics: [
        { level: 4, text: 'What is 7 × 8?', options: ['54', '56', '58', '64'], correctIndex: 1, explanation: '7 × 8 = 56.' },
        { level: 4, text: 'Which number is the largest?', options: ['489', '498', '849', '894'], correctIndex: 3, explanation: '894 has the most hundreds and tens.' },
        { level: 7, text: 'Solve: 3x + 5 = 20', options: ['x = 3', 'x = 5', 'x = 15', 'x = 25'], correctIndex: 1, explanation: '3x = 15, so x = 5.' },
        { level: 7, text: 'What is 25% of 80?', options: ['15', '20', '25', '40'], correctIndex: 1, explanation: '25% is one quarter; 80 ÷ 4 = 20.' },
    ],
    Computing: [
        { level: 4, text: 'Which device is used to type letters into a computer?', options: ['Mouse', 'Keyboard', 'Monitor', 'Speaker'], correctIndex: 1, explanation: 'A keyboard is the input device for typing.' },
        { level: 4, text: 'Which of these is an output device?', options: ['Scanner', 'Microphone', 'Printer', 'Keyboard'], correctIndex: 2, explanation: 'A printer produces output on paper.' },
        { level: 7, text: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Control Processing Unit'], correctIndex: 0, explanation: 'CPU means Central Processing Unit.' },
        { level: 7, text: 'Which of these is an example of an operating system?', options: ['Chrome', 'Windows', 'Excel', 'Google'], correctIndex: 1, explanation: 'Windows manages the computer hardware and software.' },
    ],
    Science: [
        { level: 4, text: 'Which organ pumps blood around the body?', options: ['Lungs', 'Stomach', 'Heart', 'Brain'], correctIndex: 2, explanation: 'The heart pumps blood.' },
        { level: 4, text: 'What do plants need to make their food?', options: ['Sunlight', 'Sand', 'Plastic', 'Salt'], correctIndex: 0, explanation: 'Plants use sunlight, water and carbon dioxide.' },
        { level: 7, text: 'What is the chemical symbol for water?', options: ['O2', 'CO2', 'H2O', 'HO'], correctIndex: 2, explanation: 'Water is two hydrogen atoms and one oxygen atom.' },
        { level: 7, text: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Earth', 'Mars'], correctIndex: 1, explanation: 'Mercury is the closest planet to the Sun.' },
    ],
    English: [
        { level: 4, text: "Choose the correct plural of 'child'.", options: ['childs', 'childes', 'children', 'childrens'], correctIndex: 2, explanation: "'Children' is the irregular plural of child." },
        { level: 4, text: 'Which word is a noun?', options: ['Quickly', 'Table', 'Run', 'Beautiful'], correctIndex: 1, explanation: 'A noun names a thing; table is a thing.' },
        { level: 7, text: "Which word is closest in meaning to 'happy'?", options: ['Sad', 'Angry', 'Joyful', 'Tired'], correctIndex: 2, explanation: 'Joyful is a synonym of happy.' },
        { level: 7, text: "Identify the verb: 'The dog runs fast.'", options: ['dog', 'runs', 'fast', 'The'], correctIndex: 1, explanation: 'Runs is the action word.' },
    ],
};

async function ensureSeed() {
    const { items } = await db.list('subjects', { limit: 1 });
    if (items.length > 0) return;
    const ids = await db.add(
        'subjects',
        DEFAULT_SUBJECTS.map((name) => ({ name }))
    );
    const qs: any[] = [];
    DEFAULT_SUBJECTS.forEach((name, i) => {
        (SAMPLES[name] || []).forEach((q) => {
            qs.push({ subjectId: ids[i] as string, ...q, createdAt: Date.now() });
        });
    });
    if (qs.length > 0) await db.add('questions', qs);
}

type TrackQ = { subject: string; level: string; text: string; options: string[]; correctIndex: number; explanation: string };
const q = (subject: string, level: string, text: string, options: string[], correctIndex: number, explanation: string): TrackQ => ({
    subject,
    level,
    text,
    options,
    correctIndex,
    explanation,
});

const TRACK_SAMPLES: TrackQ[] = [
    q('Mathematics', 'BECE', 'Simplify: 2/3 + 1/6', ['5/6', '3/9', '1/2', '2/9'], 0, '2/3 = 4/6, and 4/6 + 1/6 = 5/6.'),
    q('Mathematics', 'BECE', 'Solve for x: 2x − 7 = 11', ['x = 2', 'x = 9', 'x = 18', 'x = 4'], 1, '2x = 18, so x = 9.'),
    q('Mathematics', 'BECE', 'What is the area of a rectangle 8 cm long and 5 cm wide?', ['13 cm²', '26 cm²', '40 cm²', '80 cm²'], 2, 'Area = length × width = 8 × 5 = 40 cm².'),
    q('English', 'BECE', "Choose the word that is opposite in meaning to 'generous'.", ['Kind', 'Selfish', 'Rich', 'Careful'], 1, 'Selfish is the opposite of generous.'),
    q('English', 'BECE', 'Choose the correct sentence.', ["She don't like rice.", "She doesn't like rice.", 'She not like rice.', "She doesn't likes rice."], 1, "After 'doesn't' the verb stays in its base form."),
    q('English', 'BECE', "What is the plural of 'tooth'?", ['tooths', 'teeth', 'teeths', 'toothes'], 1, "'Teeth' is the irregular plural of tooth."),
    q('Science', 'BECE', 'Which part of a plant absorbs water from the soil?', ['Leaf', 'Stem', 'Root', 'Flower'], 2, 'Roots take in water and minerals from the soil.'),
    q('Science', 'BECE', 'What is the process by which liquid water changes to water vapour?', ['Condensation', 'Evaporation', 'Freezing', 'Melting'], 1, 'Evaporation is a liquid changing into a gas.'),
    q('Science', 'BECE', 'Which of these is a good conductor of electricity?', ['Rubber', 'Copper', 'Wood', 'Plastic'], 1, 'Metals such as copper conduct electricity well.'),

    q('Mathematics', 'WASSCE', 'If log₁₀ 1000 = x, find x.', ['1', '2', '3', '10'], 2, '10³ = 1000, so x = 3.'),
    q('Mathematics', 'WASSCE', 'Find the gradient of the line y = 3x + 5.', ['5', '3', '1/3', '8'], 1, 'In y = mx + c the gradient is m, which is 3.'),
    q('English', 'WASSCE', 'Choose the option that best completes the sentence: Neither the teacher nor the students ___ present.', ['was', 'were', 'is', 'has been'], 1, 'The verb agrees with the nearer subject, "students", so "were" is used.'),
    q('English', 'WASSCE', "Which word is closest in meaning to 'diligent'?", ['Lazy', 'Hardworking', 'Careless', 'Proud'], 1, 'A diligent person works carefully and hard.'),
    q('Science', 'WASSCE', 'Which of the following is a scalar quantity?', ['Velocity', 'Force', 'Mass', 'Displacement'], 2, 'Mass has size only; velocity, force and displacement also have direction.'),
    q('Science', 'WASSCE', 'What is the chemical formula of sodium chloride?', ['NaCl', 'Na2Cl', 'NaCl2', 'NCl'], 0, 'One sodium ion combines with one chloride ion: NaCl.'),

    q('Professional Studies', 'GTLE', 'A teacher checks learners’ understanding during a lesson so that she can adjust her teaching. This is called:', ['Summative assessment', 'Formative assessment', 'Standardised testing', 'External examination'], 1, 'Formative assessment happens during learning and guides what the teacher does next.'),
    q('Professional Studies', 'GTLE', 'Which of these is a clear learning objective?', ['Pupils will learn about fractions.', 'The teacher will explain fractions.', 'By the end of the lesson, pupils will add two fractions with the same denominator.', 'Fractions will be taught.'], 2, 'A good objective states what learners will be able to do, and can be checked.'),
    q('Professional Studies', 'GTLE', 'Which action best supports an inclusive classroom?', ['Seat struggling learners at the back', 'Use varied activities so all learners can take part', 'Teach only to the fastest learners', 'Excuse some learners from taking part'], 1, 'Varied activities give every learner a way to take part and learn.'),

    q('Professional Studies', 'GES-PROMO', 'A teacher notices that a pupil often comes to school hungry and tired. What is the most professional first step?', ['Punish the pupil', 'Ignore it', 'Speak with the pupil privately and involve the school’s guidance or welfare support', 'Tell the whole class'], 2, 'Handle the matter privately, kindly and through the proper school channels.'),
    q('Professional Studies', 'GES-PROMO', 'Keeping accurate records of learners’ attendance and progress mainly helps a teacher to:', ['Avoid planning lessons', 'Track progress and support learners who fall behind', 'Reduce the number of lessons', 'Replace assessment'], 1, 'Good records show who needs extra help and whether teaching is working.'),
    q('Professional Studies', 'GES-PROMO', 'A lesson plan should be prepared:', ['After teaching the lesson', 'Before teaching the lesson', 'Only when inspectors visit', 'Only at the end of term'], 1, 'Planning ahead keeps the lesson focused on its objectives.'),
];

async function ensureTrackSeed() {
    const { items: settings } = await db.list('settings', { limit: 50 });
    if (settings.some((s: any) => s.key === 'seed-tracks-v1')) return;
    await db.add('settings', [{ key: 'seed-tracks-v1' }]);

    const { items: subs } = await db.list('subjects', { limit: 100 });
    const idByName: Record<string, string> = {};
    subs.forEach((s: any) => {
        idByName[String(s.name).toLowerCase()] = s.id as string;
    });
    if (!idByName['professional studies']) {
        const [pid] = await db.add('subjects', [{ name: 'Professional Studies' }]);
        if (pid) idByName['professional studies'] = pid as string;
    }

    const rows: any[] = [];
    TRACK_SAMPLES.forEach((t, i) => {
        const subjectId = idByName[t.subject.toLowerCase()];
        if (!subjectId) return;
        rows.push({
            subjectId,
            level: t.level,
            text: t.text,
            options: t.options,
            correctIndex: t.correctIndex,
            explanation: t.explanation,
            createdAt: Date.now() + i,
        });
    });
    if (rows.length > 0) await db.add('questions', rows);
}

async function getAdminCode(): Promise<string | null> {
    const { items } = await db.list('settings', { limit: 50 });
    const doc: any = items.find((i: any) => i.key === 'admin');
    return doc ? (doc.passcode as string) : null;
}

async function isAdmin(code: unknown): Promise<boolean> {
    const saved = await getAdminCode();
    return !!saved && typeof code === 'string' && code === saved;
}

async function allQuestions(): Promise<any[]> {
    const { items } = await db.list('questions', { limit: 500 });
    return [...items].sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
}

/* ------------------------------------------------------------------ */
/* Unified API Router                                                  */
/* ------------------------------------------------------------------ */

export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

    // ---------- Website: Contact Form & Staff Inbox ----------
    'POST /api/contact': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const name = String(b.name || '').trim();
            const email = String(b.email || '').trim();
            const phone = String(b.phone || '').trim();
            const topic = String(b.topic || 'Something else').trim();
            const message = String(b.message || '').trim();

            if (!name) return error('Enter your name', 400);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Enter a valid email address', 400);
            if (!message) return error('Enter a message', 400);
            if (name.length > 100 || email.length > 200 || phone.length > 40 || topic.length > 100) {
                return error('One of the fields is too long', 400);
            }
            if (message.length > 4000) return error('The message is too long (4000 characters maximum)', 400);

            const [id] = await db.add('messages', [{ name, email, phone, topic, message, createdAt: Date.now() }]);
            if (!id) return error('Could not save your message. Please try again.', 500);
            return json({ ok: true }, 201);
        },
    ],

    'GET /api/inbox/status': [
        async () => {
            const saved = await getInboxCode();
            return json({ configured: !!saved });
        },
    ],

    'POST /api/inbox/setup': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const passcode = String(b.passcode || '').trim();
            if (await getInboxCode()) return error('The inbox passcode is already set', 409);
            if (passcode.length < 4) return error('The passcode must be at least 4 characters', 400);
            await db.add('settings', [{ key: 'inbox', passcode }]);
            return json({ ok: true }, 201);
        },
    ],

    'POST /api/inbox/list': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isStaff(b.passcode))) return error('Incorrect passcode', 401);
            const { items } = await db.list('messages', { limit: 500 });
            const messages = [...items].sort((a: any, c: any) => (c.createdAt || 0) - (a.createdAt || 0));
            return json({ messages });
        },
    ],

    'POST /api/inbox/:id/delete': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isStaff(b.passcode))) return error('Incorrect passcode', 401);
            await db.delete('messages', [ctx.params.id]);
            return json({ deleted: true });
        },
    ],

    // ---------- ExamHub: Public (Student) ----------
    'GET /api/subjects': [
        async () => {
            await ensureSeed();
            await ensureTrackSeed();
            const { items } = await db.list('subjects', { limit: 100 });
            const subjects = items
                .map((s: any) => ({ id: s.id as string, name: s.name as string }))
                .sort((a, b) => a.name.localeCompare(b.name));
            return json({ subjects });
        },
    ],

    'GET /api/counts': [
        async () => {
            const qs = await allQuestions();
            const counts: Record<string, number> = {};
            qs.forEach((q: any) => {
                const key = `${q.subjectId}|${q.level}`;
                counts[key] = (counts[key] || 0) + 1;
            });
            return json({ counts });
        },
    ],

    'GET /api/exam/:level/:subjectId': [
        async (ctx) => {
            const level = normLevel(ctx.params.level);
            if (level === null) return error('Invalid level', 400);
            const qs = (await allQuestions()).filter(
                (q: any) => q.subjectId === ctx.params.subjectId && q.level === level
            );
            return json({
                questions: qs.map((q: any) => ({ id: q.id, text: q.text, options: q.options })),
            });
        },
    ],

    'POST /api/exam/submit': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const studentName = String(b.studentName || '').trim();
            const level = normLevel(b.level);
            const subjectId = String(b.subjectId || '');
            const answers = (b.answers || {}) as Record<string, number>;

            if (!studentName) return error('Student name is required', 400);
            if (level === null) return error('Invalid level', 400);
            if (!subjectId) return error('Subject is required', 400);

            const qs = (await allQuestions()).filter((q: any) => q.subjectId === subjectId && q.level === level);
            if (qs.length === 0) return error('There are no questions for this level and subject', 400);

            let score = 0;
            const review = qs.map((q: any) => {
                const chosen = typeof answers[q.id] === 'number' ? answers[q.id] : null;
                const correct = chosen === q.correctIndex;
                if (correct) score += 1;
                return {
                    id: q.id as string,
                    correctIndex: q.correctIndex as number,
                    chosen,
                    correct,
                    explanation: (q.explanation || '') as string,
                };
            });

            const { items: subjects } = await db.list('subjects', { limit: 100 });
            const subj: any = subjects.find((s: any) => s.id === subjectId);
            const total = qs.length;
            const percent = Math.round((score / total) * 100);

            await db.add('results', [
                {
                    studentName,
                    level,
                    subjectId,
                    subjectName: subj ? subj.name : 'Unknown',
                    score,
                    total,
                    percent,
                    createdAt: Date.now(),
                },
            ]);

            return json({ score, total, percent, review });
        },
    ],

    // ---------- ExamHub: Admin ----------
    'GET /api/admin/status': [
        async () => {
            const saved = await getAdminCode();
            return json({ configured: !!saved });
        },
    ],

    'POST /api/admin/setup': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const passcode = String(b.passcode || '').trim();
            if (await getAdminCode()) return error('Admin passcode is already set', 409);
            if (passcode.length < 4) return error('Passcode must be at least 4 characters', 400);
            await db.add('settings', [{ key: 'admin', passcode }]);
            return json({ ok: true }, 201);
        },
    ],

    'POST /api/admin/login': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Incorrect passcode', 401);
            return json({ ok: true });
        },
    ],

    'POST /api/admin/subjects': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const name = String(b.name || '').trim();
            if (!name) return error('Subject name is required', 400);
            const { items } = await db.list('subjects', { limit: 100 });
            if (items.some((s: any) => String(s.name).toLowerCase() === name.toLowerCase())) {
                return error('That subject already exists', 409);
            }
            const [id] = await db.add('subjects', [{ name }]);
            if (!id) return error('Failed to add subject', 500);
            return json({ id, name }, 201);
        },
    ],

    'POST /api/admin/subjects/:id/delete': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const id = ctx.params.id;
            const qs = (await allQuestions()).filter((q: any) => q.subjectId === id);
            if (qs.length > 0) await db.delete('questions', qs.map((q: any) => q.id as string));
            await db.delete('subjects', [id]);
            return json({ deleted: true, questionsRemoved: qs.length });
        },
    ],

    'POST /api/admin/questions/list': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const qs = await allQuestions();
            return json({ questions: qs });
        },
    ],

    'POST /api/admin/questions': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

            const subjectId = String(b.subjectId || '');
            const level = normLevel(b.level);
            const text = String(b.text || '').trim();
            const options: string[] = Array.isArray(b.options) ? b.options.map((o: unknown) => String(o || '').trim()) : [];
            const correctIndex = Number(b.correctIndex);
            const explanation = String(b.explanation || '').trim();

            if (level === null) return error('Choose Basic 4 to Basic 9, or an exam section', 400);
            if (!text) return error('Question text is required', 400);
            if (options.length !== 4 || options.some((o) => !o)) return error('Provide all four answer options', 400);
            if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
                return error('Choose the correct answer', 400);
            }
            const { items: subjects } = await db.list('subjects', { limit: 100 });
            if (!subjects.some((s: any) => s.id === subjectId)) return error('Choose a valid subject', 400);

            const record = { subjectId, level, text, options, correctIndex, explanation, createdAt: Date.now() };
            const [id] = await db.add('questions', [record]);
            if (!id) return error('Failed to add question', 500);
            return json({ id, ...record }, 201);
        },
    ],

    'POST /api/admin/questions/:id/delete': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            await db.delete('questions', [ctx.params.id]);
            return json({ deleted: true });
        },
    ],

    'POST /api/admin/results': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const { items } = await db.list('results', { limit: 500 });
            const results = [...items].sort((a: any, c: any) => (c.createdAt || 0) - (a.createdAt || 0));
            return json({ results });
        },
    ],
});
