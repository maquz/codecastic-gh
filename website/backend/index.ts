import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { router, json, error, db } from './sdk';
import { sendContactNotification, sendDirectReply } from './mailer';

/* ------------------------------------------------------------------ */
/* Password & Auth Helpers                                             */
/* ------------------------------------------------------------------ */

function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
    const [salt, key] = (stored || '').split(':');
    if (!salt || !key) return false;
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(key, 'hex');
    if (derivedBuf.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, keyBuf);
}

function isSuperAdminEmail(email: unknown): boolean {
    return typeof email === 'string' && email.trim().toLowerCase() === 'anibrikamark@gmail.com';
}

function publicUser(u: any) {
    const em = String(u.email || '').trim().toLowerCase();
    const isSuper = isSuperAdminEmail(em) || u.adminRole === 'superadmin' || u.role === 'superadmin';
    const adminRole = isSuper ? 'superadmin' : (u.adminRole || (['admin', 'editor'].includes(u.role) ? u.role : null));
    const role = isSuper ? 'superadmin' : (adminRole === 'admin' ? 'admin' : (adminRole === 'editor' ? 'editor' : (u.role || (u.accountType === 'ges-promo' ? 'ges-promo' : 'student'))));

    return {
        id: u.id as string,
        name: u.name as string,
        email: u.email as string,
        role,
        adminRole: adminRole || null,
        isSuperAdmin: isSuper,
        accountType: (u.accountType || 'student') as 'student' | 'ges-promo',
        schoolName: (u.schoolName || '') as string,
        schoolCode: (u.schoolCode || '') as string,
        studentCode: (u.studentCode || '') as string,
        classSection: (u.classSection || '') as string,
        schoolId: (u.schoolId || '') as string,
        gradeLevel: ((u.gradeLevel === 'ADMIN' || u.gradeLevel === 'admin') ? 8 : (u.gradeLevel ?? 4)) as Level,
        region: (u.region || '') as string,
        promotionRank: (u.promotionRank || '') as string,
    };
}

async function getUserByToken(token: unknown): Promise<any | null> {
    if (!token || typeof token !== 'string') return null;
    const { items: sessions } = await db.list('sessions', { limit: 1000 });
    const sess: any = sessions.find((s: any) => s.token === token);
    if (!sess) return null;
    const { items: users } = await db.list('users', { limit: 1000 });
    return users.find((u: any) => u.id === sess.userId) || null;
}

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
const SHS_LEVELS = ['SHS 1', 'SHS 2', 'SHS 3'];
const TRACKS = ['BECE', 'WASSCE', 'GTLE', 'GES-PROMO'];
type Level = number | string;

function normLevel(raw: unknown): Level | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        return SCHOOL_LEVELS.includes(n) ? n : null;
    }
    const basicMatch = s.match(/^(?:basic|grade|class|b)\s*(\d+)$/i);
    if (basicMatch) {
        const n = Number(basicMatch[1]);
        return SCHOOL_LEVELS.includes(n) ? n : null;
    }
    const shsMatch = s.match(/^(?:shs|form)\s*([1-3])$/i);
    if (shsMatch) {
        return `SHS ${shsMatch[1]}`;
    }
    const u = s.toUpperCase();
    if (u === 'ADMIN') {
        return 8;
    }
    if (u === 'SHS' || u === 'SHS 1 - 3' || u === 'SHS 1-3') {
        return 'SHS 1';
    }
    if (u === 'GES PROMOTION' || u === 'GES PROMOTION EXAMS' || u === 'GES-PROMOTION') {
        return 'GES-PROMO';
    }
    if (SHS_LEVELS.includes(u)) return u;
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

    q('Professional Studies', 'GTLE', 'A teacher notices that a pupil often comes to school hungry and tired. What is the most professional first step?', ['Punish the pupil', 'Ignore it', 'Speak with the pupil privately and involve the school’s guidance or welfare support', 'Tell the whole class'], 2, 'Handle the matter privately, kindly and through the proper school channels.'),
    q('Professional Studies', 'GTLE', 'Keeping accurate records of learners’ attendance and progress mainly helps a teacher to:', ['Avoid planning lessons', 'Track progress and support learners who fall behind', 'Reduce the number of lessons', 'Replace assessment'], 1, 'Good records show who needs extra help and whether teaching is working.'),
    q('Professional Studies', 'GTLE', 'A lesson plan should be prepared:', ['After teaching the lesson', 'Before teaching the lesson', 'Only when inspectors visit', 'Only at the end of term'], 1, 'Planning ahead keeps the lesson focused on its objectives.'),
];

const PROMOTION_RANK_ITEMS = [
    { id: 'rank-ad-ii', name: 'Assistant Director II (AD II)' },
    { id: 'rank-ad-i', name: 'Assistant Director I (AD I)' },
    { id: 'rank-dd', name: 'Deputy Director (DD)' },
    { id: 'rank-dir-ii', name: 'Director II (Dir II)' },
    { id: 'rank-dir-i', name: 'Director I (Dir I)' },
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
        const subjectId = t.level === 'GES-PROMO' ? 'rank-ad-ii' : idByName[t.subject.toLowerCase()];
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

async function ensureGesPromoRankSeed() {
    const validRankIds = new Set(PROMOTION_RANK_ITEMS.map((r) => r.id));
    const existingQs = await allQuestions();
    for (const eq of existingQs) {
        if (eq.level === 'GES-PROMO' && !validRankIds.has(eq.subjectId)) {
            await db.update('questions', eq.id, { subjectId: 'rank-ad-ii' });
        }
    }

    // Ensure Director I (Dir I) questions exist
    const hasDirI = existingQs.some((q: any) => q.level === 'GES-PROMO' && q.subjectId === 'rank-dir-i');
    if (!hasDirI) {
        const dirISamples = [
            {
                subjectId: 'rank-dir-i',
                level: 'GES-PROMO',
                text: 'At the Director I level in the Ghana Education Service, strategic educational policy formulation and systemic quality assurance primarily focus on:',
                options: [
                    'Managing individual classroom duty rosters for basic schools',
                    'Strategic leadership, national education reforms implementation, and systemic multi-agency collaboration',
                    'Issuing daily terminal report cards to junior high students',
                    'Exclusively conducting inventory audits of classroom chalkboards',
                ],
                correctIndex: 1,
                explanation: 'A Director I provides top-tier strategic leadership, coordinates national pre-tertiary education reform implementation, and oversees systemic educational performance.',
                year: '2023',
                category: 'Educational Policies & Governance',
                createdAt: Date.now() + 15,
            },
            {
                subjectId: 'rank-dir-i',
                level: 'GES-PROMO',
                text: 'Under the Education Regulatory Bodies Act, 2020 (Act 1023), the regulatory oversight of school inspection and teacher licensing is distributed respectively between:',
                options: [
                    'NaSIA and NTC',
                    'WAEC and NaCCA',
                    'NTC and GES Council',
                    'NaCCA and TVET Commission',
                ],
                correctIndex: 0,
                explanation: 'Under Act 1023, the National Schools Inspectorate Authority (NaSIA) conducts school inspections and evaluations, while the National Teaching Council (NTC) licenses professional teachers.',
                year: '2022',
                category: 'Educational Policies & Governance',
                createdAt: Date.now() + 16,
            },
        ];
        await db.add('questions', dirISamples);
    }

    const { items: settings } = await db.list('settings', { limit: 50 });
    if (settings.some((s: any) => s.key === 'seed-ges-ranks-v1')) return;
    await db.add('settings', [{ key: 'seed-ges-ranks-v1' }]);

    const rankSamples = [
        {
            subjectId: 'rank-ad-i',
            level: 'GES-PROMO',
            text: 'In school supervision, clinical supervision primarily focuses on:',
            options: [
                'Fault-finding during classroom visits',
                'Collaborative improvement of classroom instruction between supervisor and teacher',
                'Transferring teachers to other districts',
                'Writing annual financial audit reports',
            ],
            correctIndex: 1,
            explanation: 'Clinical supervision is a developmental, collaborative process aimed at improving teaching practice.',
            createdAt: Date.now() + 10,
        },
        {
            subjectId: 'rank-dd',
            level: 'GES-PROMO',
            text: 'Which body in Ghana is responsible for formulating and implementing pre-tertiary education policies under the Ministry of Education?',
            options: [
                'National Teaching Council (NTC)',
                'Ghana Education Service (GES)',
                'West African Examinations Council (WAEC)',
                'National Council for Tertiary Education',
            ],
            correctIndex: 1,
            explanation: 'The Ghana Education Service (GES) implements approved national pre-tertiary educational policies and programmes.',
            createdAt: Date.now() + 11,
        },
        {
            subjectId: 'rank-dir-ii',
            level: 'GES-PROMO',
            text: 'Strategic educational planning at the directorate level begins with:',
            options: [
                'Disbursing capitation grants without a budget',
                'Conducting a comprehensive situational analysis and needs assessment',
                'Closing down low-performing schools immediately',
                'Suspending all in-service training programmes',
            ],
            correctIndex: 1,
            explanation: 'A situational analysis and needs assessment establish baseline data and priorities before setting strategic goals.',
            createdAt: Date.now() + 12,
        },
    ];

    await db.add('questions', rankSamples);
    await ensureShsSeed();
}

async function ensureShsSeed() {
    const { items: settings } = await db.list('settings', { limit: 50 });
    if (settings.some((s: any) => s.key === 'seed-shs-v1')) return;
    await db.add('settings', [{ key: 'seed-shs-v1' }]);

    const { items: subs } = await db.list('subjects', { limit: 100 });
    const idByName: Record<string, string> = {};
    subs.forEach((s: any) => {
        idByName[String(s.name).toLowerCase()] = s.id as string;
    });

    const shsSamples: TrackQ[] = [
        q('Mathematics', 'SHS 1', 'Express 0.0045 in standard form.', ['4.5 × 10⁻³', '4.5 × 10⁻²', '45 × 10⁻⁴', '4.5 × 10³'], 0, 'Moving the decimal point 3 places to the right gives 4.5 × 10⁻³.'),
        q('English', 'SHS 1', 'Identify the part of speech of the underlined word: "She spoke very *fluently* at the debate."', ['Adjective', 'Adverb', 'Preposition', 'Conjunction'], 1, '"Fluently" modifies the verb "spoke", so it is an adverb.'),
        q('Science', 'SHS 1', 'Which subatomic particle carries a negative electric charge?', ['Proton', 'Neutron', 'Electron', 'Nucleus'], 2, 'Electrons are negatively charged particles orbiting the nucleus.'),
        q('Computing', 'SHS 1', 'Convert the binary number 1010₂ to base 10.', ['8', '10', '12', '14'], 1, '1×8 + 0×4 + 1×2 + 0×1 = 10.'),

        q('Mathematics', 'SHS 2', 'Find the 5th term of the geometric progression 2, 6, 18, ...', ['54', '108', '162', '486'], 2, 'Here a = 2 and r = 3; T₅ = a·r⁴ = 2 × 81 = 162.'),
        q('English', 'SHS 2', 'Choose the option that is nearest in meaning to "ephemeral".', ['Permanent', 'Short-lived', 'Ancient', 'Careful'], 1, '"Ephemeral" means lasting for a very short time.'),
        q('Science', 'SHS 2', 'What is the SI unit of electric current?', ['Volt', 'Ohm', 'Ampere', 'Watt'], 2, 'Electric current is measured in Amperes (A).'),
        q('Computing', 'SHS 2', 'In relational databases, a field that uniquely identifies each record in a table is called a:', ['Foreign key', 'Primary key', 'Index row', 'Secondary query'], 1, 'A primary key uniquely identifies each row in a database table.'),

        q('Mathematics', 'SHS 3', 'Differentiate y = 3x² − 4x + 7 with respect to x.', ['6x − 4', '3x − 4', '6x + 7', 'x³ − 2x²'], 0, 'dy/dx = 2(3x) − 4 = 6x − 4.'),
        q('English', 'SHS 3', 'In literature, a comparison between two unlike things using "like" or "as" is a:', ['Metaphor', 'Simile', 'Personification', 'Hyperbole'], 1, 'A simile uses "like" or "as" to make a direct comparison.'),
        q('Science', 'SHS 3', 'Which organic compound belongs to the alkane homologous series?', ['C₂H₄', 'C₂H₂', 'CH₄', 'C₂H₅OH'], 2, 'Methane (CH₄) follows the alkane general formula CₙH₂ₙ₊₂.'),
        q('Computing', 'SHS 3', 'Which protocol is responsible for securely transferring web pages over an encrypted connection?', ['FTP', 'HTTP', 'HTTPS', 'SMTP'], 2, 'HTTPS (Hypertext Transfer Protocol Secure) encrypts communication between browser and server.'),
    ];

    const rows: any[] = [];
    shsSamples.forEach((t, i) => {
        const subjectId = idByName[t.subject.toLowerCase()];
        if (!subjectId) return;
        rows.push({
            subjectId,
            level: t.level,
            text: t.text,
            options: t.options,
            correctIndex: t.correctIndex,
            explanation: t.explanation,
            createdAt: Date.now() + 20 + i,
        });
    });
    if (rows.length > 0) await db.add('questions', rows);
}

async function getAdminCode(): Promise<string | null> {
    const { items } = await db.list('settings', { limit: 50 });
    const doc: any = items.find((i: any) => i.key === 'admin');
    return doc ? (doc.passcode as string) : null;
}

async function isSuperAdmin(code: unknown): Promise<boolean> {
    if (!code || typeof code !== 'string') return false;
    const saved = await getAdminCode();
    if (saved && code === saved) return true;
    const u = await getUserByToken(code);
    if (!u) return false;
    if (isSuperAdminEmail(u.email)) return true;
    return u.adminRole === 'superadmin' || u.role === 'superadmin';
}

async function isAdmin(code: unknown): Promise<boolean> {
    if (!code || typeof code !== 'string') return false;
    const saved = await getAdminCode();
    if (saved && code === saved) return true;
    const u = await getUserByToken(code);
    if (!u) return false;
    if (isSuperAdminEmail(u.email)) return true;
    return ['admin', 'superadmin'].includes(u.adminRole || u.role);
}

async function isEditor(code: unknown): Promise<boolean> {
    if (!code || typeof code !== 'string') return false;
    if (await isAdmin(code)) return true;
    const u = await getUserByToken(code);
    if (!u) return false;
    return ['editor', 'admin', 'superadmin'].includes(u.adminRole || u.role);
}

const DEFAULT_TIMERS: Record<string, number> = {
    'ges-promotion': 45,
    'basic': 30,
    'bece': 45,
    'shs': 45,
    'wassce': 60,
    'gtle': 60,
};

async function getExamTimers(): Promise<Record<string, number>> {
    try {
        const { items } = await db.list('settings', { limit: 100 });
        const record: any = items.find((i: any) => i.key === 'exam_timers');
        if (record && record.timers && typeof record.timers === 'object') {
            return { ...DEFAULT_TIMERS, ...record.timers };
        }
    } catch {
        // fallback
    }
    return { ...DEFAULT_TIMERS };
}

async function allQuestions(): Promise<any[]> {
    const { items } = await db.list('questions', { limit: 5000 });
    return [...items].sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
}

/* ------------------------------------------------------------------ */
/* Bulk Question File Parsers (Word .doc/.docx, Excel .csv/.xlsx, JSON)*/
/* ------------------------------------------------------------------ */

interface RawBulkItem {
    text: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    level?: Level | null;
    subjectId?: string;
    year?: string;
    category?: string;
    rank?: string;
}

function resolvePromotionRankId(rawRank: unknown): string | undefined {
    const s = String(rawRank ?? '').trim();
    if (!s) return undefined;
    const norm = s
        .toUpperCase()
        .replace(/[\s\-()]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (
        norm === 'AD_II' ||
        norm === 'AD2' ||
        norm === 'RANK_AD_II' ||
        norm.includes('ASSISTANT_DIRECTOR_II') ||
        norm.endsWith('_AD_II')
    ) {
        return 'rank-ad-ii';
    }
    if (
        norm === 'AD_I' ||
        norm === 'AD1' ||
        norm === 'RANK_AD_I' ||
        norm.includes('ASSISTANT_DIRECTOR_I') ||
        norm.endsWith('_AD_I')
    ) {
        return 'rank-ad-i';
    }
    if (
        norm === 'DD' ||
        norm === 'RANK_DD' ||
        norm.includes('DEPUTY_DIRECTOR') ||
        norm.endsWith('_DD')
    ) {
        return 'rank-dd';
    }
    if (
        norm === 'DIR_II' ||
        norm === 'DIR2' ||
        norm === 'RANK_DIR_II' ||
        norm.includes('DIRECTOR_II') ||
        norm.endsWith('_DIR_II')
    ) {
        return 'rank-dir-ii';
    }
    if (
        norm === 'DIR_I' ||
        norm === 'DIR1' ||
        norm === 'RANK_DIR_I' ||
        norm.includes('DIRECTOR_I') ||
        norm.endsWith('_DIR_I')
    ) {
        return 'rank-dir-i';
    }
    return undefined;
}

function decodeXmlEntities(s: string): string {
    return s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function resolveCorrectIndex(rawAns: unknown, options: string[]): number {
    if (typeof rawAns === 'number' && Number.isInteger(rawAns)) {
        if (rawAns >= 0 && rawAns <= 3) return rawAns;
        if (rawAns >= 1 && rawAns <= 4) return rawAns - 1;
    }
    const s = String(rawAns ?? '').trim();
    if (!s) return -1;

    // Match "A", "B", "C", "D" or "Option A", "(B)", "B) 56"
    const letterMatch = s.match(/^(?:option\s*)?\(?([A-Da-d])\)?(?:\s*[:.)-].*)?$/i);
    if (letterMatch) {
        return letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    }
    if (/^[1-4]$/.test(s)) {
        return Number(s) - 1;
    }
    // Or match exact option text
    const idx = options.findIndex((o) => o.trim().toLowerCase() === s.toLowerCase());
    return idx;
}

function readZipEntries(buf: Buffer): Map<string, Buffer> {
    const entries = new Map<string, Buffer>();
    // Locate End of Central Directory (0x06054b50)
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd === -1) return entries;

    const totalEntries = buf.readUInt16LE(eocd + 10);
    let pos = buf.readUInt32LE(eocd + 16);

    for (let i = 0; i < totalEntries && pos + 46 <= buf.length; i++) {
        if (buf.readUInt32LE(pos) !== 0x02014b50) break;
        const method = buf.readUInt16LE(pos + 10);
        const compSize = buf.readUInt32LE(pos + 20);
        const nameLen = buf.readUInt16LE(pos + 28);
        const extraLen = buf.readUInt16LE(pos + 30);
        const commentLen = buf.readUInt16LE(pos + 32);
        const localOffset = buf.readUInt32LE(pos + 42);
        const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
        pos += 46 + nameLen + extraLen + commentLen;

        if (localOffset + 30 > buf.length) continue;
        const lNameLen = buf.readUInt16LE(localOffset + 26);
        const lExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        if (dataStart + compSize > buf.length) continue;
        const slice = buf.subarray(dataStart, dataStart + compSize);
        try {
            if (method === 0) {
                entries.set(name, slice);
            } else if (method === 8) {
                entries.set(name, zlib.inflateRawSync(slice));
            }
        } catch {
            // ignore corrupted entry
        }
    }
    return entries;
}

function parseCsvRows(rawText: string): string[][] {
    const cleaned = rawText.replace(/^\uFEFF/, '');
    // Detect delimiter from first line
    const firstLine = cleaned.split(/\r?\n/)[0] || '';
    const delimiter =
        firstLine.includes('\t') && !firstLine.includes(',')
            ? '\t'
            : firstLine.split(';').length > firstLine.split(',').length
            ? ';'
            : ',';

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        const next = cleaned[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') {
                currentField += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                currentField += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === delimiter) {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (ch === '\r' && next === '\n') {
                currentRow.push(currentField.trim());
                if (currentRow.some((c) => c !== '')) rows.push(currentRow);
                currentRow = [];
                currentField = '';
                i++;
            } else if (ch === '\n' || ch === '\r') {
                currentRow.push(currentField.trim());
                if (currentRow.some((c) => c !== '')) rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += ch;
            }
        }
    }
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c !== '')) rows.push(currentRow);
    return rows;
}

function parseTableRowsToItems(rows: string[][]): RawBulkItem[] {
    if (rows.length === 0) return [];
    const first = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const hasHeader =
        first.some((h) => h.includes('question') || h === 'text' || h === 'prompt') &&
        first.some((h) => h.includes('optiona') || h === 'a' || h.includes('answer') || h.includes('correct'));

    let qIdx = 0;
    let aIdx = 1;
    let bIdx = 2;
    let cIdx = 3;
    let dIdx = 4;
    let ansIdx = 5;
    let expIdx = 6;
    let lvlIdx = 7;
    let yearIdx = -1;
    let rankIdx = -1;
    let catIdx = -1;

    if (hasHeader) {
        const findCol = (preds: ((h: string) => boolean)[], fallback: number) => {
            for (const pred of preds) {
                const i = first.findIndex(pred);
                if (i !== -1) return i;
            }
            return fallback;
        };
        yearIdx = findCol([(h) => h === 'year' || h.includes('examyear')], -1);
        rankIdx = findCol([(h) => h === 'rank' || h.includes('promotionrank')], -1);
        catIdx = findCol([(h) => h === 'category' || h === 'topic' || h === 'domain'], -1);
        qIdx = findCol([(h) => h.includes('question') || h === 'text' || h === 'prompt'], 0);
        aIdx = findCol([(h) => h === 'optiona' || h === 'a' || h === 'choicea'], 1);
        bIdx = findCol([(h) => h === 'optionb' || h === 'b' || h === 'choiceb'], 2);
        cIdx = findCol([(h) => h === 'optionc' || h === 'c' || h === 'choicec'], 3);
        dIdx = findCol([(h) => h === 'optiond' || h === 'd' || h === 'choiced'], 4);
        ansIdx = findCol([(h) => h.includes('correct') || h.includes('answer') || h === 'key'], 5);
        expIdx = findCol([(h) => h.includes('explanation') || h.includes('rationale') || h.includes('note')], 6);
        lvlIdx = findCol([(h) => h.includes('level') || h.includes('grade') || h.includes('section')], -1);
    }

    const startRow = hasHeader ? 1 : 0;
    const out: RawBulkItem[] = [];
    for (let r = startRow; r < rows.length; r++) {
        const row = rows[r];
        const text = String(row[qIdx] || '').trim();
        if (!text) continue;
        // Skip accidental repeated header rows
        if (text.toLowerCase() === 'question' && String(row[aIdx] || '').toLowerCase().includes('option')) continue;
        const options = [
            String(row[aIdx] || '').trim(),
            String(row[bIdx] || '').trim(),
            String(row[cIdx] || '').trim(),
            String(row[dIdx] || '').trim(),
        ];
        if (options.some((o) => !o)) continue;
        const correctIndex = resolveCorrectIndex(row[ansIdx], options);
        if (correctIndex < 0 || correctIndex > 3) continue;
        const explanation = expIdx >= 0 && expIdx < row.length ? String(row[expIdx] || '').trim() : '';
        const rawLvl = lvlIdx >= 0 && lvlIdx < row.length ? row[lvlIdx] : undefined;
        const year = yearIdx >= 0 && yearIdx < row.length ? String(row[yearIdx] || '').trim() : undefined;
        const category = catIdx >= 0 && catIdx < row.length ? String(row[catIdx] || '').trim() : undefined;
        const rawRank = rankIdx >= 0 && rankIdx < row.length ? String(row[rankIdx] || '').trim() : undefined;
        const resolvedRankId = resolvePromotionRankId(rawRank);

        out.push({
            text,
            options,
            correctIndex,
            explanation,
            level: resolvedRankId ? 'GES-PROMO' : rawLvl ? normLevel(rawLvl) : undefined,
            subjectId: resolvedRankId,
            year: year || undefined,
            category: category || undefined,
            rank: rawRank || undefined,
        });
    }
    return out;
}

function parseWordOrTextBlocks(rawText: string): RawBulkItem[] {
    // 1. If HTML table rows exist (e.g. Word .doc saved as HTML table), extract table rows first
    if (/<tr[\s>]/i.test(rawText) && /<td[\s>]/i.test(rawText)) {
        const trMatches = rawText.match(/<tr[\s\S]*?<\/tr>/gi) || [];
        const tableRows: string[][] = [];
        for (const tr of trMatches) {
            const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
            if (cellMatches.length >= 6) {
                const cells = cellMatches.map((c) =>
                    decodeXmlEntities(c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
                );
                tableRows.push(cells);
            }
        }
        const fromTable = parseTableRowsToItems(tableRows);
        if (fromTable.length > 0) return fromTable;
    }

    // 2. Strip any HTML tags and parse structured Q&A blocks (supports --- separator blocks)
    const plain = decodeXmlEntities(
        rawText
            .replace(/<\/(p|div|tr|li|h[1-6]|br\s*\/?)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
    );

    const lines = plain
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const items: RawBulkItem[] = [];
    let curQuestion = '';
    let curOptions: string[] = ['', '', '', ''];
    let curAnswerRaw = '';
    let curExplanation = '';
    let curLevel: Level | null | undefined = undefined;
    let curSubjectId: string | undefined = undefined;
    let curYear = '';
    let curCategory = '';
    let curRank = '';

    const resetCurrent = () => {
        curQuestion = '';
        curOptions = ['', '', '', ''];
        curAnswerRaw = '';
        curExplanation = '';
        curLevel = undefined;
        curSubjectId = undefined;
        curYear = '';
        curCategory = '';
        curRank = '';
    };

    const flushCurrent = () => {
        if (curQuestion.trim() && curOptions.every((o) => o.trim())) {
            const correctIndex = resolveCorrectIndex(curAnswerRaw, curOptions);
            if (correctIndex >= 0 && correctIndex <= 3) {
                items.push({
                    text: curQuestion.trim(),
                    options: curOptions.map((o) => o.trim()),
                    correctIndex,
                    explanation: curExplanation.trim(),
                    level: curLevel,
                    subjectId: curSubjectId,
                    year: curYear.trim() || undefined,
                    category: curCategory.trim() || undefined,
                    rank: curRank.trim() || undefined,
                });
            }
        }
        resetCurrent();
    };

    for (const line of lines) {
        // Block separator: three or more dashes (---) or equals (===) flushes the current question block
        if (/^(?:-{3,}|={3,})\s*$/.test(line)) {
            flushCurrent();
            continue;
        }

        // Ignore template instruction / heading lines
        if (
            /^(#|\/\/|examhub bulk question|instructions\s*(for administrators)?\s*:|fill in your questions|format\s*[ab12]:)/i.test(
                line
            ) ||
            /^[1-9]\.\s*(fill in your questions|separate each question|valid ranks\s*:|correct choices\s*:)/i.test(line)
        ) {
            continue;
        }

        const yearMatch = line.match(/^(?:exam\s*)?year\s*[:=\-]\s*(.+)$/i);
        if (yearMatch) {
            if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
            curYear = yearMatch[1].trim();
            continue;
        }

        const rankMatch = line.match(/^(?:promotion\s*)?rank\s*[:=\-]\s*(.+)$/i);
        if (rankMatch) {
            if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
            curRank = rankMatch[1].trim();
            const resolvedRankId = resolvePromotionRankId(curRank);
            if (resolvedRankId) {
                curSubjectId = resolvedRankId;
                curLevel = 'GES-PROMO';
            }
            continue;
        }

        const catMatch = line.match(/^(?:category|topic|domain|subject\s*area)\s*[:=\-]\s*(.+)$/i);
        if (catMatch) {
            if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
            curCategory = catMatch[1].trim();
            continue;
        }

        const lvlMatch = line.match(/^(?:level|grade|class|section)\s*[:=\-]\s*(.+)$/i);
        if (lvlMatch) {
            if (curQuestion && curOptions.every((o) => o.trim()) && !curLevel) {
                // Level is at the end of a block
                curLevel = normLevel(lvlMatch[1].trim());
            } else {
                if (curQuestion && curOptions.every((o) => o.trim())) flushCurrent();
                curLevel = normLevel(lvlMatch[1].trim());
            }
            continue;
        }

        const optMatch = line.match(/^(\*)?(?:option\s*)?\(?([A-Da-d])\)?\s*[:.)\-]\s*(.+)$/i);
        if (optMatch && curQuestion) {
            const starred = !!optMatch[1];
            const idx = optMatch[2].toUpperCase().charCodeAt(0) - 65;
            curOptions[idx] = optMatch[3].trim();
            if (starred && !curAnswerRaw) curAnswerRaw = optMatch[2].toUpperCase();
            continue;
        }

        const ansMatch = line.match(/^(?:correct\s*answer|correct\s*choice|answer|correct|ans|key)\s*[:=\-]\s*(.+)$/i);
        if (ansMatch && curQuestion) {
            curAnswerRaw = ansMatch[1].trim();
            continue;
        }

        const expMatch = line.match(/^(?:explanation|rationale|note)\s*[:=\-]\s*(.*)$/i);
        if (expMatch && curQuestion) {
            curExplanation = expMatch[1].trim();
            continue;
        }

        const qPrefixMatch = line.match(/^(?:question\s*\d*|q\d+|\d+)\s*[:.)\-]\s*(.+)$/i);
        if (qPrefixMatch) {
            if (curQuestion) flushCurrent();
            curQuestion = qPrefixMatch[1].trim();
            continue;
        }
    }
    flushCurrent();
    return items;
}

function parseDocxBuffer(buf: Buffer): RawBulkItem[] {
    const entries = readZipEntries(buf);
    const docXml = entries.get('word/document.xml')?.toString('utf8') || '';
    if (!docXml) return [];

    // 1. Check for Word tables (<w:tbl>) first
    const trMatches = docXml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
    if (trMatches.length > 0) {
        const rows: string[][] = [];
        for (const tr of trMatches) {
            const tcMatches = tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
            if (tcMatches.length >= 6) {
                const cells = tcMatches.map((tc) => {
                    const texts = (tc.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) =>
                        decodeXmlEntities(t.replace(/<[^>]+>/g, ''))
                    );
                    return texts.join('').trim();
                });
                rows.push(cells);
            }
        }
        const fromTable = parseTableRowsToItems(rows);
        if (fromTable.length > 0) return fromTable;
    }

    // 2. Extract paragraphs (<w:p>)
    const pMatches = docXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
    const lines = pMatches.map((p) => {
        const texts = (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) =>
            decodeXmlEntities(t.replace(/<[^>]+>/g, ''))
        );
        return texts.join('').trim();
    });
    return parseWordOrTextBlocks(lines.join('\n'));
}

function parseXlsxBuffer(buf: Buffer): RawBulkItem[] {
    const entries = readZipEntries(buf);
    const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
    const sharedStrings: string[] = [];
    if (sharedXml) {
        const siMatches = sharedXml.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
        for (const si of siMatches) {
            const tMatches = (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map((t) =>
                decodeXmlEntities(t.replace(/<[^>]+>/g, ''))
            );
            sharedStrings.push(tMatches.join(''));
        }
    }

    const sheetXml =
        entries.get('xl/worksheets/sheet1.xml')?.toString('utf8') ||
        Array.from(entries.entries())
            .find(([k]) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))?.[1]
            ?.toString('utf8') ||
        '';
    if (!sheetXml) return [];

    const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) || [];
    const rows: string[][] = [];
    for (const rowXml of rowMatches) {
        const cMatches = rowXml.match(/<c[\s>][\s\S]*?<\/c>/g) || [];
        const rowCells: string[] = [];
        for (const cXml of cMatches) {
            const refMatch = cXml.match(/\br="([A-Z]+)\d+"/);
            const typeMatch = cXml.match(/\bt="([^"]+)"/);
            let colIdx = rowCells.length;
            if (refMatch) {
                const letters = refMatch[1];
                colIdx = 0;
                for (let i = 0; i < letters.length; i++) {
                    colIdx = colIdx * 26 + (letters.charCodeAt(i) - 64);
                }
                colIdx -= 1;
            }
            const cellType = typeMatch ? typeMatch[1] : '';
            let val = '';
            if (cellType === 'inlineStr') {
                const tMatches = (cXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map((t) =>
                    decodeXmlEntities(t.replace(/<[^>]+>/g, ''))
                );
                val = tMatches.join('');
            } else {
                const vMatch = cXml.match(/<v>([\s\S]*?)<\/v>/);
                if (vMatch) {
                    const rawV = decodeXmlEntities(vMatch[1]);
                    if (cellType === 's') {
                        val = sharedStrings[Number(rawV)] ?? '';
                    } else {
                        val = rawV;
                    }
                }
            }
            while (rowCells.length <= colIdx) rowCells.push('');
            rowCells[colIdx] = val.trim();
        }
        if (rowCells.some((c) => c !== '')) rows.push(rowCells);
    }
    return parseTableRowsToItems(rows);
}

function normalizeJsonItems(rawList: unknown[]): RawBulkItem[] {
    const out: RawBulkItem[] = [];
    for (const item of rawList) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, any>;
        const text = String(obj.question ?? obj.Question ?? obj.text ?? '').trim();
        if (!text) continue;
        const options: string[] = Array.isArray(obj.options ?? obj.Options)
            ? (obj.options ?? obj.Options).slice(0, 4).map((o: unknown) => String(o ?? '').trim())
            : [
                  String(obj.optionA ?? obj.a ?? obj.A ?? '').trim(),
                  String(obj.optionB ?? obj.b ?? obj.B ?? '').trim(),
                  String(obj.optionC ?? obj.c ?? obj.C ?? '').trim(),
                  String(obj.optionD ?? obj.d ?? obj.D ?? '').trim(),
              ];
        if (options.length !== 4 || options.some((o) => !o)) continue;
        const rawAns = obj.correctIndex ?? obj.correctAnswer ?? obj.answer ?? obj.correct ?? obj.Correct;
        const correctIndex = resolveCorrectIndex(rawAns, options);
        if (correctIndex < 0 || correctIndex > 3) continue;
        const explanation = String(obj.explanation ?? obj.Explanation ?? '').trim();
        const year = String(obj.year ?? obj.Year ?? '').trim();
        const category = String(obj.category ?? obj.Category ?? '').trim();
        const rawRank = obj.rank ?? obj.Rank ?? obj.promotionRank;
        const resolvedRankId = resolvePromotionRankId(rawRank);
        const level = resolvedRankId
            ? 'GES-PROMO'
            : obj.level !== undefined
            ? normLevel(obj.level)
            : obj.Level !== undefined
            ? normLevel(obj.Level)
            : undefined;
        const subjectId = resolvedRankId
            ? resolvedRankId
            : obj.subjectId
            ? String(obj.subjectId).trim()
            : undefined;
        out.push({
            text,
            options,
            correctIndex,
            explanation,
            level,
            subjectId,
            year: year || undefined,
            category: category || undefined,
            rank: rawRank ? String(rawRank).trim() : undefined,
        });
    }
    return out;
}

function parseBulkQuestionsPayload(body: any): RawBulkItem[] {
    if (Array.isArray(body?.questions)) {
        return normalizeJsonItems(body.questions);
    }
    const fileName = String(body?.fileName || '').toLowerCase();
    const fileBase64 = String(body?.fileBase64 || '');
    if (!fileBase64) return [];

    const buf = Buffer.from(fileBase64, 'base64');
    const isZip = buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;

    if (fileName.endsWith('.xlsx') || (isZip && fileName.includes('xls'))) {
        return parseXlsxBuffer(buf);
    }
    if (fileName.endsWith('.docx') || isZip) {
        const docxItems = parseDocxBuffer(buf);
        if (docxItems.length > 0) return docxItems;
        return parseXlsxBuffer(buf);
    }

    const text = buf.toString('utf8');
    if (fileName.endsWith('.json')) {
        try {
            const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
            const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
            return normalizeJsonItems(arr);
        } catch {
            return [];
        }
    }
    if (fileName.endsWith('.csv') || fileName.endsWith('.tsv')) {
        return parseTableRowsToItems(parseCsvRows(text));
    }
    if (fileName.endsWith('.doc') || fileName.endsWith('.txt')) {
        const wordItems = parseWordOrTextBlocks(text);
        if (wordItems.length > 0) return wordItems;
        return parseTableRowsToItems(parseCsvRows(text));
    }

    // Fallback auto-detect
    try {
        const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
        const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
        if (arr.length > 0) return normalizeJsonItems(arr);
    } catch {
        // not JSON
    }
    const wordItems = parseWordOrTextBlocks(text);
    if (wordItems.length > 0) return wordItems;
    return parseTableRowsToItems(parseCsvRows(text));
}

/* ------------------------------------------------------------------ */
/* Unified API Router                                                  */
/* ------------------------------------------------------------------ */

export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

    // ---------- ExamHub: Student Auth (Register / Login / Session) ----------
    'POST /api/auth/register': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const accountType = b.accountType === 'ges-promo' ? 'ges-promo' : 'student';
            const name = String(b.name || '').trim();
            const email = String(b.email || '').trim().toLowerCase();
            const password = String(b.password || '');

            if (!name) return error('Full name is required', 400);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Enter a valid email address', 400);
            if (password.length < 6) return error('Password must be at least 6 characters', 400);

            let schoolName = '';
            let gradeLevel: Level = 4;
            let region = '';
            let promotionRank = '';

            if (accountType === 'ges-promo') {
                region = String(b.region || '').trim();
                promotionRank = String(b.promotionRank || '').trim();
                if (!region) return error('Select your Ghana Region', 400);
                if (!promotionRank) return error('Select your Eligible Promotion Rank', 400);
                schoolName = `${region} (${promotionRank})`;
                gradeLevel = 'GES-PROMO';
            } else {
                schoolName = String(b.schoolName || '').trim();
                const parsedLevel = normLevel(b.gradeLevel);
                if (parsedLevel === null) return error('Choose a valid grade or exam level', 400);
                gradeLevel = parsedLevel;
            }

            const { items: users } = await db.list('users', { limit: 1000 });
            if (users.some((u: any) => String(u.email).toLowerCase() === email)) {
                return error('An account with this email already exists. Please sign in.', 409);
            }

            const passwordHash = hashPassword(password);
            const userRecord = {
                name,
                email,
                accountType,
                schoolName,
                gradeLevel,
                region,
                promotionRank,
                passwordHash,
                passwordPlain: password,
                createdAt: Date.now(),
            };
            const [userId] = await db.add('users', [userRecord]);
            const token = crypto.randomBytes(24).toString('hex');
            await db.add('sessions', [{ userId, token, createdAt: Date.now() }]);

            return json(
                {
                    token,
                    user: publicUser({ id: userId, ...userRecord }),
                },
                201
            );
        },
    ],

    'POST /api/auth/login': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const email = String(b.email || '').trim().toLowerCase();
            const schoolCode = String(b.schoolCode || '').trim().toUpperCase();
            const studentIdentifier = String(b.studentIdentifier || b.studentName || b.name || '').trim().toLowerCase();
            const password = String(b.password || '');

            const { items: users } = await db.list('users', { limit: 1000 });
            let user: any = null;

            if (schoolCode && studentIdentifier) {
                user = users.find((u: any) => {
                    const uSchoolCode = String(u.schoolCode || '').trim().toUpperCase();
                    if (uSchoolCode !== schoolCode) return false;
                    const uName = String(u.name || '').trim().toLowerCase();
                    const uCode = String(u.studentCode || '').trim().toLowerCase();
                    const uId = String(u.id || '').trim().toLowerCase();
                    const uEmail = String(u.email || '').trim().toLowerCase();
                    return uName === studentIdentifier || uCode === studentIdentifier || uId === studentIdentifier || uEmail === studentIdentifier;
                });
                if (!user) {
                    return error(`Student not found for school code ${schoolCode}. Please verify your name or student ID.`, 404);
                }
                if (password && password !== 'Student2026#' && !verifyPassword(password, user.passwordHash)) {
                    return error('Incorrect password. Default is Student2026#', 401);
                }
            } else {
                if (!email || !password) return error('Enter your email/school code and password', 400);
                user = users.find((u: any) => String(u.email).toLowerCase() === email || String(u.studentCode || '').toLowerCase() === email);
                if (!user || !verifyPassword(password, user.passwordHash)) {
                    return error('Invalid email/student ID or password', 401);
                }
            }

            if (!user.passwordPlain && password) {
                await db.update('users', user.id, { ...user, passwordPlain: password });
            }

            const token = crypto.randomBytes(24).toString('hex');
            await db.add('sessions', [{ userId: user.id, token, createdAt: Date.now() }]);

            return json({
                token,
                user: publicUser(user),
            });
        },
    ],

    'POST /api/auth/recover': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const email = String(b.email || '').trim().toLowerCase();
            const newPassword = typeof b.newPassword === 'string' ? b.newPassword : '';

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return error('Enter the email address you registered with', 400);
            }

            const { items: users } = await db.list('users', { limit: 1000 });
            const user: any = users.find((u: any) => String(u.email).toLowerCase() === email);
            if (!user) {
                return error('No registered account was found with that email address.', 404);
            }

            if (newPassword) {
                if (newPassword.length < 6) {
                    return error('New password must be at least 6 characters', 400);
                }
                const passwordHash = hashPassword(newPassword);
                const updated = await db.update('users', user.id, {
                    ...user,
                    passwordHash,
                    passwordPlain: newPassword,
                    updatedAt: Date.now(),
                });
                const token = crypto.randomBytes(24).toString('hex');
                await db.add('sessions', [{ userId: user.id, token, createdAt: Date.now() }]);
                return json({
                    ok: true,
                    reset: true,
                    recoveredPassword: newPassword,
                    token,
                    user: publicUser(updated || { ...user, passwordHash, passwordPlain: newPassword }),
                });
            }

            let recoveredPassword = String(user.passwordPlain || '');
            let isTemporary = false;
            if (!recoveredPassword) {
                recoveredPassword = `Exam${crypto.randomInt(1000, 9999)}`;
                isTemporary = true;
                const passwordHash = hashPassword(recoveredPassword);
                await db.update('users', user.id, {
                    ...user,
                    passwordHash,
                    passwordPlain: recoveredPassword,
                    updatedAt: Date.now(),
                });
            }

            return json({
                ok: true,
                accountName: user.name as string,
                email: user.email as string,
                gradeLabel:
                    user.accountType === 'ges-promo'
                        ? (user.promotionRank as string)
                        : typeof user.gradeLevel === 'number'
                        ? `Basic ${user.gradeLevel}`
                        : String(user.gradeLevel),
                recoveredPassword,
                isTemporary,
            });
        },
    ],

    'POST /api/auth/me': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const user = await getUserByToken(b.token);
            if (!user) return error('Not signed in', 401);
            return json({ user: publicUser(user) });
        },
    ],

    'POST /api/auth/logout': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (b.token) {
                const { items: sessions } = await db.list('sessions', { limit: 1000 });
                const matching = sessions.filter((s: any) => s.token === b.token).map((s: any) => s.id as string);
                if (matching.length > 0) await db.delete('sessions', matching);
            }
            return json({ ok: true });
        },
    ],

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

            // Asynchronously dispatch email notification to info@codecasticgh.com
            sendContactNotification({ name, email, phone, topic, message }).catch((err) => {
                console.warn('[Contact] Notice: Could not send email notification:', err?.message || err);
            });

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

    'POST /api/inbox/:id/reply': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isStaff(b.passcode))) return error('Incorrect passcode', 401);
            const replyMessage = String(b.replyMessage || '').trim();
            if (!replyMessage) return error('Enter your reply message', 400);

            const { items } = await db.list('messages');
            const msg = items.find((m: any) => m.id === ctx.params.id);
            if (!msg) return error('Message not found', 404);

            try {
                await sendDirectReply({
                    to: msg.email,
                    toName: msg.name,
                    subject: msg.topic || 'Inquiry on Codecastic GH',
                    replyMessage,
                    originalMessage: msg.message,
                });

                const now = Date.now();
                await db.update('messages', msg.id, {
                    repliedAt: now,
                    replyCount: (Number(msg.replyCount) || 0) + 1,
                    lastReply: replyMessage,
                });

                return json({ ok: true, repliedAt: now });
            } catch (e: any) {
                return error(e?.message || 'Could not send reply email', 500);
            }
        },
    ],

    // ---------- ExamHub: Public (Student) ----------
    'GET /api/subjects': [
        async () => {
            await ensureSeed();
            await ensureTrackSeed();
            await ensureGesPromoRankSeed();
            const { items } = await db.list('subjects', { limit: 100 });
            const subjects = items
                .map((s: any) => ({ id: s.id as string, name: s.name as string }))
                .sort((a, b) => a.name.localeCompare(b.name));
            return json({ subjects });
        },
    ],

    'GET /api/counts': [
        async () => {
            await ensureGesPromoRankSeed();
            const qs = await allQuestions();
            const counts: Record<string, number> = {};
            const yearsMap: Record<string, string[]> = {};
            const categoriesMap: Record<string, string[]> = {};
            const yearCounts: Record<string, number> = {};
            const categoryCounts: Record<string, number> = {};

            const addKeyCount = (key: string, yr: string, cat: string) => {
                counts[key] = (counts[key] || 0) + 1;
                if (yr) {
                    yearsMap[key] = yearsMap[key] || [];
                    if (!yearsMap[key].includes(yr)) yearsMap[key].push(yr);
                    const yKey = `${key}|${yr}`;
                    yearCounts[yKey] = (yearCounts[yKey] || 0) + 1;
                }
                if (cat) {
                    categoriesMap[key] = categoriesMap[key] || [];
                    if (!categoriesMap[key].includes(cat)) categoriesMap[key].push(cat);
                    const cKey = `${key}|${cat}`;
                    categoryCounts[cKey] = (categoryCounts[cKey] || 0) + 1;
                }
            };

            qs.forEach((q: any) => {
                const subId = String(q.subjectId || '');
                const lvl = String(q.level || '');
                const yr = q.year ? String(q.year).trim() : '';
                const cat = q.category ? String(q.category).trim() : '';
                addKeyCount(`${subId}|${lvl}`, yr, cat);

                // JHS & BECE cross-linking: BECE questions contribute to Basic 7, 8, 9, and vice versa
                if (lvl.toUpperCase() === 'BECE') {
                    [7, 8, 9].forEach((jl) => addKeyCount(`${subId}|${jl}`, yr, cat));
                } else if (['7', '8', '9'].includes(lvl)) {
                    addKeyCount(`${subId}|BECE`, yr, cat);
                    [7, 8, 9].forEach((jl) => {
                        if (String(jl) !== lvl) addKeyCount(`${subId}|${jl}`, yr, cat);
                    });
                }

                // Primary (4, 5, 6) cross-linking: Primary level questions available across Basic 4-6
                if (['4', '5', '6'].includes(lvl)) {
                    [4, 5, 6].forEach((pl) => {
                        if (String(pl) !== lvl) addKeyCount(`${subId}|${pl}`, yr, cat);
                    });
                }

                // SHS & WASSCE cross-linking: WASSCE questions contribute to SHS 1-3, and vice versa
                if (lvl.toUpperCase() === 'WASSCE') {
                    ['SHS 1', 'SHS 2', 'SHS 3', 'SHS'].forEach((sl) => addKeyCount(`${subId}|${sl}`, yr, cat));
                } else if (['SHS 1', 'SHS 2', 'SHS 3', 'SHS'].includes(lvl)) {
                    addKeyCount(`${subId}|WASSCE`, yr, cat);
                    ['SHS 1', 'SHS 2', 'SHS 3', 'SHS'].forEach((sl) => {
                        if (sl !== lvl) addKeyCount(`${subId}|${sl}`, yr, cat);
                    });
                }
            });
            return json({ counts, yearsMap, categoriesMap, yearCounts, categoryCounts });
        },
    ],

    'GET /api/exam/timers': [
        async () => {
            const timers = await getExamTimers();
            return json({ timers });
        },
    ],

    'POST /api/admin/timers': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const inputTimers = (b.timers || {}) as Record<string, number>;
            const current = await getExamTimers();
            const updated: Record<string, number> = { ...current };

            for (const [key, val] of Object.entries(inputTimers)) {
                const num = Number(val);
                if (num > 0 && num <= 360) {
                    updated[key] = Math.round(num);
                }
            }

            const { items } = await db.list('settings', { limit: 100 });
            const existing: any = items.find((i: any) => i.key === 'exam_timers');
            if (existing) {
                await db.update('settings', existing.id, { key: 'exam_timers', timers: updated, updatedAt: Date.now() });
            } else {
                await db.add('settings', [{ key: 'exam_timers', timers: updated, updatedAt: Date.now() }]);
            }

            return json({ ok: true, timers: updated });
        },
    ],

    'GET /api/exam/:level/:subjectId': [
        async (ctx) => {
            const level = normLevel(ctx.params.level);
            if (level === null) return error('Invalid level', 400);

            const isPrimary = ['4', '5', '6'].includes(String(level));
            const isJhsOrBece = ['7', '8', '9', 'BECE'].includes(String(level));
            const isShsOrWassce = ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'].includes(String(level));

            const allSubjectLevelQs = (await allQuestions()).filter((q: any) => {
                if (q.subjectId !== ctx.params.subjectId) return false;
                const qLvl = String(q.level ?? '');
                if (qLvl === String(level)) return true;
                if (isJhsOrBece && (qLvl === 'BECE' || ['7', '8', '9'].includes(qLvl))) return true;
                if (isPrimary && ['4', '5', '6'].includes(qLvl)) return true;
                if (isShsOrWassce && (qLvl === 'WASSCE' || ['SHS 1', 'SHS 2', 'SHS 3', 'SHS'].includes(qLvl))) return true;
                return false;
            });
            const yearParam = ctx.query?.year;
            const catParam = ctx.query?.category;
            const limitParam = Number(ctx.query?.limit) || 0;
            const backfillParam = ctx.query?.backfill === 'true';

            let qs = allSubjectLevelQs;
            if (yearParam && yearParam !== 'all') {
                qs = qs.filter((q: any) => String(q.year || '').trim() === String(yearParam).trim());
            }
            if (catParam && catParam !== 'all') {
                qs = qs.filter(
                    (q: any) => String(q.category || '').toLowerCase().trim() === String(catParam).toLowerCase().trim()
                );
            }

            // If backfill requested and filtered questions are fewer than the requested limit,
            // supplement with additional questions from the same subject/rank
            if (backfillParam && limitParam > 0 && qs.length < limitParam && allSubjectLevelQs.length > qs.length) {
                const existingIds = new Set(qs.map((q: any) => q.id));
                const needed = limitParam - qs.length;
                const pool = allSubjectLevelQs
                    .filter((q: any) => !existingIds.has(q.id))
                    .sort(() => Math.random() - 0.5)
                    .slice(0, needed);
                qs = [...qs, ...pool];
            }

            return json({
                questions: qs.map((q: any) => ({
                    id: q.id,
                    text: q.text,
                    options: q.options,
                    correctIndex: q.correctIndex,
                    explanation: q.explanation || '',
                    year: q.year || undefined,
                    category: q.category || undefined,
                })),
            });
        },
    ],

    'POST /api/exam/submit': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const user = await getUserByToken(b.token);
            const studentName = String(user?.name || b.studentName || '').trim();
            const schoolName = String(user?.schoolName || b.schoolName || '').trim();
            const studentEmail = String(user?.email || b.studentEmail || '').trim();
            const level = normLevel(b.level);
            const subjectId = String(b.subjectId || '');
            const answers = (b.answers || {}) as Record<string, number>;
            const questionIds: string[] = Array.isArray(b.questionIds) ? b.questionIds.map(String) : [];

            if (!studentName) return error('Please sign in before submitting an exam', 401);
            if (level === null) return error('Invalid level', 400);
            if (!subjectId) return error('Subject is required', 400);

            const allLevelQs = (await allQuestions()).filter((q: any) => q.subjectId === subjectId && q.level === level);
            if (allLevelQs.length === 0) return error('There are no questions for this level and subject', 400);

            const qSet = new Set(questionIds);
            const qs = questionIds.length > 0 ? allLevelQs.filter((q: any) => qSet.has(q.id)) : allLevelQs;
            if (qs.length === 0) return error('No matching questions found for this exam submission', 400);

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
            const subj: any =
                subjects.find((s: any) => s.id === subjectId) ||
                PROMOTION_RANK_ITEMS.find((r) => r.id === subjectId);
            const total = qs.length;
            const percent = Math.round((score / total) * 100);

            await db.add('results', [
                {
                    userId: user?.id || null,
                    studentName,
                    studentEmail,
                    schoolName,
                    level,
                    subjectId,
                    subjectName: subj ? subj.name : 'Unknown',
                    score,
                    total,
                    percent,
                    createdAt: Date.now(),
                },
            ]);

            return json({ score, total, totalQuestions: total, percent, review, details: review });
        },
    ],

    'POST /api/student/history': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const tokenUser = await getUserByToken(b.token);
            const user = tokenUser || (b.studentEmail || b.userId || b.studentName ? {
                id: b.userId,
                email: b.studentEmail,
                name: b.studentName,
            } : null);
            if (!user && !b.studentEmail && !b.userId && !b.studentName) return error('Not authorised', 401);

            const targetEmail = String(user?.email || b.studentEmail || '').trim().toLowerCase();
            const targetUserId = String(user?.id || b.userId || '').trim();
            const targetName = String(user?.name || b.studentName || '').trim().toLowerCase();

            const { items: allResults } = await db.list('results', { limit: 5000 });
            const myResults = allResults
                .filter((r: any) => {
                    const rUserId = String(r.userId || '').trim();
                    const rEmail = String(r.studentEmail || '').trim().toLowerCase();
                    const rName = String(r.studentName || '').trim().toLowerCase();
                    return (
                        (targetUserId && rUserId && rUserId === targetUserId) ||
                        (targetEmail && rEmail && rEmail === targetEmail) ||
                        (targetName && rName && rName === targetName)
                    );
                })
                .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

            const examsTaken = myResults.length;
            const avgScore =
                examsTaken > 0
                    ? Math.round(myResults.reduce((sum: number, r: any) => sum + (Number(r.percent) || 0), 0) / examsTaken)
                    : 0;
            const passRate =
                examsTaken > 0
                    ? Math.round(
                          (myResults.filter((r: any) => (Number(r.percent) || 0) >= 50).length / examsTaken) * 100
                      )
                    : 0;

            return json({
                examsTaken,
                avgScore,
                passRate,
                recentResults: myResults.slice(0, 25).map((r: any) => ({
                    id: r.id,
                    subjectName: r.subjectName,
                    score: r.score,
                    total: r.total,
                    percent: r.percent,
                    submittedAt: r.createdAt,
                    createdAt: r.createdAt,
                })),
            });
        },
    ],

    // ---------- ExamHub: Offline Pack & Sync ----------
    'GET /api/offline/pack': [
        async (ctx) => {
            const reqLevel = (ctx.query?.level || '') as string;
            const reqTrack = (ctx.query?.track || '') as string;
            const normLvl = reqLevel ? (/^\d+$/.test(reqLevel) ? Number(reqLevel) : reqLevel) : null;
            const track = reqTrack.trim();

            const isJhsOrBece = ['7', '8', '9', 'BECE'].includes(String(normLvl)) || track === 'basic' || track === 'bece';
            const isShsOrWassce = ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'].includes(String(normLvl)) || track === 'shs' || track === 'wassce';
            const isGtle = normLvl === 'GTLE' || track === 'gtle';
            const isGes = normLvl === 'GES-PROMO' || track === 'ges-promotion';

            const { items: allQs } = await db.list('questions', { limit: 10000 });
            const matchedQuestions = allQs.filter((q: any) => {
                const qLvl = String(q.level || '');
                if (normLvl !== null && qLvl === String(normLvl)) return true;
                if (isJhsOrBece && ['4', '5', '6', '7', '8', '9', 'BECE'].includes(qLvl)) return true;
                if (isShsOrWassce && ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'].includes(qLvl)) return true;
                if (isGtle && qLvl === 'GTLE') return true;
                if (isGes && ['GES-PROMO', 'AD II', 'AD I', 'DD', 'DIR II', 'DIR I'].includes(qLvl)) return true;
                if (normLvl === null && !track) return true;
                return false;
            }).map((q: any) => ({
                id: q.id,
                subjectId: q.subjectId,
                level: q.level,
                text: q.text,
                options: q.options || [],
                correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
                explanation: q.explanation || '',
                year: q.year || null,
                category: q.category || null,
            }));

            const { items: allSubjects } = await db.list('subjects', { limit: 200 });
            const safeSubjects = allSubjects.map((s: any) => ({ id: s.id, name: s.name }));

            return json({
                ok: true,
                track,
                level: normLvl,
                subjects: safeSubjects,
                questions: matchedQuestions,
                totalQuestions: matchedQuestions.length,
                generatedAt: Date.now(),
            });
        },
    ],

    'POST /api/offline/sync-batch': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const submissions = Array.isArray(b.submissions) ? b.submissions : [];
            if (submissions.length === 0) return json({ ok: true, syncedCount: 0 });

            const { items: allResults } = await db.list('results', { limit: 10000 });
            const existingIds = new Set(allResults.map((r: any) => r.id));

            const toAdd: any[] = [];
            const syncedIds: string[] = [];

            for (const sub of submissions) {
                const subId = String(sub.id || '').trim() || crypto.randomUUID();
                if (existingIds.has(subId)) {
                    syncedIds.push(subId);
                    continue;
                }

                toAdd.push({
                    id: subId,
                    userId: sub.userId || '',
                    studentName: sub.studentName || 'Candidate',
                    studentEmail: sub.studentEmail || '',
                    schoolId: sub.schoolId || '',
                    schoolName: sub.schoolName || '',
                    classSection: sub.classSection || '',
                    level: sub.level,
                    subjectId: sub.subjectId || '',
                    subjectName: sub.subjectName || 'Subject',
                    score: Number(sub.score) || 0,
                    total: Number(sub.total) || 0,
                    totalQuestions: Number(sub.total) || 0,
                    percent: Number(sub.percent) || 0,
                    passed: !!sub.passed,
                    details: Array.isArray(sub.details) ? sub.details : [],
                    createdAt: Number(sub.timestamp) || Date.now(),
                    syncedAt: Date.now(),
                    offlineOrigin: true,
                });
                existingIds.add(subId);
                syncedIds.push(subId);
            }

            if (toAdd.length > 0) {
                await db.add('results', toAdd);
            }

            return json({
                ok: true,
                syncedCount: syncedIds.length,
                syncedIds,
            });
        },
    ],

    'POST /api/school/lab/import': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const results = Array.isArray(b.results) ? b.results : Array.isArray(b.data?.results) ? b.data.results : [];
            if (results.length === 0) return error('No test results found in payload', 400);

            const { items: allResults } = await db.list('results', { limit: 10000 });
            const existingIds = new Set(allResults.map((r: any) => r.id));

            const toAdd: any[] = [];
            for (const item of results) {
                const itemId = String(item.id || '').trim() || crypto.randomUUID();
                if (existingIds.has(itemId)) continue;

                toAdd.push({
                    id: itemId,
                    userId: item.userId || '',
                    studentName: item.studentName || 'Candidate',
                    studentEmail: item.studentEmail || '',
                    schoolId: item.schoolId || b.schoolId || '',
                    schoolName: item.schoolName || b.schoolName || '',
                    classSection: item.classSection || '',
                    level: item.level,
                    subjectId: item.subjectId || '',
                    subjectName: item.subjectName || 'Subject',
                    score: Number(item.score) || 0,
                    total: Number(item.total) || 0,
                    totalQuestions: Number(item.total) || 0,
                    percent: Number(item.percent) || 0,
                    passed: !!item.passed,
                    details: Array.isArray(item.details) ? item.details : [],
                    createdAt: Number(item.timestamp) || Date.now(),
                    importedAt: Date.now(),
                    importedFromLab: true,
                });
                existingIds.add(itemId);
            }

            if (toAdd.length > 0) {
                await db.add('results', toAdd);
            }

            return json({
                ok: true,
                importedCount: toAdd.length,
                message: `Successfully imported ${toAdd.length} lab test attempts.`,
            });
        },
    ],

    // ---------- School Portal: Student & Teacher Management ----------
    'POST /api/school/students/add': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['school_admin', 'teacher', 'admin'].includes(u.role)) {
                return error('Not authorised', 403);
            }
            const schoolId = String(u.schoolId || '');
            const schoolName = String(u.schoolName || '');
            const schoolCode = String(u.schoolCode || '');

            const name = String(b.name || '').trim();
            if (!name) return error('Student name is required', 400);

            const { items: allUsers } = await db.list('users', { limit: 5000 });
            const existingSchoolStudents = allUsers.filter(
                (usr: any) => (String(usr.schoolId) === schoolId || String(usr.schoolCode) === schoolCode) &&
                              (usr.role === 'student' || usr.accountType === 'student')
            );
            const regNumber = existingSchoolStudents.length + 1;
            const cleanPrefix = schoolCode || 'SCH';

            const studentId = crypto.randomUUID();
            let studentCode = String(b.studentCode || b.studentId || '').trim();
            if (!studentCode || studentCode.startsWith('STU-')) {
                studentCode = `${cleanPrefix}-${String(regNumber).padStart(3, '0')}`;
            }

            let email = String(b.email || '').trim().toLowerCase();
            const cleanSchool = (schoolCode || 'sch').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                email = `${cleanSchool}.${studentId.slice(0, 8)}@student.codecasticgh.com`;
            }

            const gradeLevel = b.gradeLevel ?? 4;
            const classSection = String(b.classSection || '').trim();
            const password = String(b.password || 'Student2026#');

            const newStudent = {
                id: studentId,
                name,
                email,
                studentCode,
                role: 'student',
                accountType: 'student',
                schoolId,
                schoolName,
                schoolCode,
                gradeLevel,
                classSection,
                passwordPlain: password,
                passwordHash: hashPassword(password),
                createdAt: Date.now(),
            };

            await db.add('users', [newStudent]);
            return json({ ok: true, student: publicUser(newStudent) }, 201);
        },
    ],

    'POST /api/school/students/bulk': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['school_admin', 'teacher', 'admin'].includes(u.role)) {
                return error('Not authorised', 403);
            }
            const schoolId = String(u.schoolId || '');
            const schoolName = String(u.schoolName || '');
            const schoolCode = String(u.schoolCode || '');
            const cleanSchool = (schoolCode || 'sch').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanPrefix = schoolCode || 'SCH';

            const { items: allUsers } = await db.list('users', { limit: 5000 });
            let existingCount = allUsers.filter(
                (usr: any) => (String(usr.schoolId) === schoolId || String(usr.schoolCode) === schoolCode) &&
                              (usr.role === 'student' || usr.accountType === 'student')
            ).length;

            const studentRows = Array.isArray(b.students) ? b.students : [];
            if (studentRows.length === 0) return error('No student records provided', 400);

            const added: any[] = [];
            const skipped: any[] = [];
            const toAdd: any[] = [];

            for (let i = 0; i < studentRows.length; i++) {
                const row = studentRows[i] || {};
                const name = String(row.name || '').trim();
                if (!name) {
                    skipped.push({ row: i + 1, reason: 'Student name is required' });
                    continue;
                }

                existingCount++;
                const sid = crypto.randomUUID();
                let studentCode = String(row.studentCode || row.studentId || '').trim();
                if (!studentCode || studentCode.startsWith('STU-')) {
                    studentCode = `${cleanPrefix}-${String(existingCount).padStart(3, '0')}`;
                }

                let email = String(row.email || '').trim().toLowerCase();
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    email = `${cleanSchool}.${sid.slice(0, 8)}@student.codecasticgh.com`;
                }

                const pw = String(row.password || 'Student2026#');
                const record = {
                    id: sid,
                    name,
                    email,
                    studentCode,
                    role: 'student',
                    accountType: 'student',
                    schoolId,
                    schoolName,
                    schoolCode,
                    gradeLevel: row.gradeLevel ?? 4,
                    classSection: String(row.classSection || '').trim(),
                    passwordPlain: pw,
                    passwordHash: hashPassword(pw),
                    createdAt: Date.now(),
                };
                toAdd.push(record);
                added.push(publicUser(record));
            }

            if (toAdd.length > 0) {
                await db.add('users', toAdd);
            }

            return json({
                ok: true,
                addedCount: added.length,
                skippedCount: skipped.length,
                added,
                skipped,
            });
        },
    ],

    'POST /api/school/students': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u) return error('Not authorised', 401);

            const schoolId = String(u.schoolId || b.schoolId || '');
            if (!schoolId) return error('School ID required', 400);

            const { items: allUsers } = await db.list('users', { limit: 5000 });
            const { items: allResults } = await db.list('results', { limit: 10000 });

            const examsMap: Record<string, number> = {};
            const scoresMap: Record<string, number[]> = {};

            for (const r of allResults) {
                if (String(r.schoolId) === schoolId && r.userId) {
                    const uid = String(r.userId);
                    examsMap[uid] = (examsMap[uid] || 0) + 1;
                    if (!scoresMap[uid]) scoresMap[uid] = [];
                    scoresMap[uid].push(Number(r.percent) || 0);
                }
            }

            const students = allUsers
                .filter((usr: any) => String(usr.schoolId) === schoolId && (usr.role === 'student' || usr.accountType === 'student'))
                .map((usr: any) => {
                    const pub: any = publicUser(usr);
                    const scores = scoresMap[pub.id] || [];
                    pub.examsTaken = examsMap[pub.id] || 0;
                    pub.avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                    return pub;
                })
                .sort((a: any, b: any) => a.name.localeCompare(b.name));

            return json({ students });
        },
    ],

    'POST /api/school/students/delete': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['school_admin', 'admin'].includes(u.role)) {
                return error('Not authorised', 403);
            }
            const schoolId = String(u.schoolId || '');
            const studentId = String(b.studentId || '').trim();

            const { items: users } = await db.list('users', { limit: 5000 });
            const target = users.find((usr: any) => usr.id === studentId && usr.schoolId === schoolId);
            if (target) {
                await db.delete('users', [target.id]);
            }
            return json({ ok: true });
        },
    ],

    'POST /api/school/teachers': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u) return error('Not authorised', 401);
            const schoolId = String(u.schoolId || b.schoolId || '');

            const { items: allUsers } = await db.list('users', { limit: 5000 });
            const teachers = allUsers
                .filter((usr: any) => String(usr.schoolId) === schoolId && usr.role === 'teacher')
                .map((usr: any) => publicUser(usr));

            return json({ teachers });
        },
    ],

    'POST /api/school/teachers/add': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['school_admin', 'admin'].includes(u.role)) return error('Not authorised', 403);

            const schoolId = String(u.schoolId || '');
            const schoolName = String(u.schoolName || '');
            const schoolCode = String(u.schoolCode || '');

            const name = String(b.name || '').trim();
            const email = String(b.email || '').trim().toLowerCase();
            const pw = String(b.password || 'Teacher2026#');
            if (!name || !email) return error('Teacher name and email required', 400);

            const teacherId = crypto.randomUUID();
            const teacherRecord = {
                id: teacherId,
                name,
                email,
                role: 'teacher',
                accountType: 'teacher',
                schoolId,
                schoolName,
                schoolCode,
                assignedSubjects: Array.isArray(b.assignedSubjects) ? b.assignedSubjects : [],
                assignedLevels: Array.isArray(b.assignedLevels) ? b.assignedLevels : [],
                gradeLevel: 8,
                passwordPlain: pw,
                passwordHash: hashPassword(pw),
                createdAt: Date.now(),
            };
            await db.add('users', [teacherRecord]);
            return json({ ok: true, teacher: publicUser(teacherRecord) }, 201);
        },
    ],

    'POST /api/school/teachers/delete': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['school_admin', 'admin'].includes(u.role)) return error('Not authorised', 403);
            const teacherId = String(b.teacherId || '').trim();
            await db.delete('users', [teacherId]);
            return json({ ok: true });
        },
    ],

    'POST /api/school/performance': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['school_admin', 'admin'].includes(u.role)) return error('Not authorised', 403);
            const schoolId = String(u.schoolId || b.schoolId || '');

            const { items: allUsers } = await db.list('users', { limit: 5000 });
            const { items: allResults } = await db.list('results', { limit: 10000 });

            const students = allUsers.filter((usr: any) => String(usr.schoolId) === schoolId && (usr.role === 'student' || usr.accountType === 'student'));
            const teachers = allUsers.filter((usr: any) => String(usr.schoolId) === schoolId && usr.role === 'teacher');
            const schoolResults = allResults.filter((r: any) => String(r.schoolId) === schoolId);

            const totalExams = schoolResults.length;
            const passedExams = schoolResults.filter((r: any) => r.passed || (Number(r.percent) || 0) >= 50).length;
            const overallPassRate = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;
            const avgScore = totalExams > 0 ? Math.round(schoolResults.reduce((a, r) => a + (Number(r.percent) || 0), 0) / totalExams) : 0;

            return json({
                totalStudents: students.length,
                totalTeachers: teachers.length,
                totalExams,
                overallPassRate,
                avgScore,
            });
        },
    ],

    'POST /api/teacher/performance': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const u = await getUserByToken(b.token);
            if (!u || !['teacher', 'school_admin', 'admin', 'superadmin'].includes(u.role)) {
                return error('Not authorised as teacher', 403);
            }

            const schoolId = String(u.schoolId || '');
            const assignedLevels = Array.isArray(u.assignedLevels) ? u.assignedLevels.map(String) : [];
            const assignedSubjects = Array.isArray(u.assignedSubjects) ? u.assignedSubjects.map(String) : [];

            const { items: allUsers } = await db.list('users', { limit: 10000 });
            const { items: allResults } = await db.list('results', { limit: 20000 });

            // Get students belonging to teacher's school and classes
            const schoolStudents = allUsers.filter((usr: any) =>
                String(usr.schoolId) === schoolId &&
                (usr.role === 'student' || usr.accountType === 'student')
            );

            const myStudents = schoolStudents.filter((stud: any) => {
                if (assignedLevels.length === 0) return true;
                const gl = String(stud.gradeLevel ?? '');
                const cs = String(stud.classSection ?? '');
                return assignedLevels.some((al: string) => al === gl || (cs && al.includes(cs)));
            });

            const myStudentIds = new Set(myStudents.map((s: any) => String(s.id)));
            const myStudentEmails = new Set(myStudents.map((s: any) => String(s.email || '').toLowerCase()).filter(Boolean));

            // Filter test results
            const teacherResults = allResults.filter((r: any) => {
                if (schoolId && String(r.schoolId || '') !== schoolId) return false;

                const isMyStudent = (r.userId && myStudentIds.has(String(r.userId))) ||
                    (r.studentEmail && myStudentEmails.has(String(r.studentEmail).toLowerCase()));

                if (!isMyStudent && myStudents.length > 0) return false;

                if (assignedSubjects.length > 0) {
                    const subName = String(r.subjectName || '');
                    const subId = String(r.subjectId || '');
                    const matchSub = assignedSubjects.some((as: string) =>
                        as.toLowerCase() === subName.toLowerCase() || as === subId
                    );
                    if (!matchSub) return false;
                }

                if (assignedLevels.length > 0) {
                    const rLvl = String(r.level ?? '');
                    const matchLvl = assignedLevels.some((al: string) => al === rLvl || rLvl.includes(al));
                    if (!matchLvl) return false;
                }

                return true;
            });

            teacherResults.sort((a: any, b: any) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

            const totalExams = teacherResults.length;
            const passedCount = teacherResults.filter((r: any) => r.passed || (Number(r.percent) || 0) >= 50).length;
            const overallPassRate = totalExams > 0 ? Math.round((passedCount / totalExams) * 100) : 0;
            const overallAvg = totalExams > 0
                ? Math.round(teacherResults.reduce((sum: number, r: any) => sum + (Number(r.percent) || 0), 0) / totalExams)
                : 0;

            const classMap: Record<string, { total: number; sumPercent: number; passed: number }> = {};
            for (const r of teacherResults) {
                const cKey = r.classSection || (typeof r.level === 'number' ? `Basic ${r.level}` : String(r.level || 'General'));
                if (!classMap[cKey]) classMap[cKey] = { total: 0, sumPercent: 0, passed: 0 };
                classMap[cKey].total++;
                classMap[cKey].sumPercent += Number(r.percent) || 0;
                if (r.passed || (Number(r.percent) || 0) >= 50) classMap[cKey].passed++;
            }
            const classBreakdown = Object.entries(classMap).map(([classLabel, data]) => ({
                classLabel,
                examsCount: data.total,
                avgPercent: data.total > 0 ? Math.round(data.sumPercent / data.total) : 0,
                passRate: data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0,
            }));

            const studentResultsMap: Record<string, any[]> = {};
            const studentSubjectScores: Record<string, Record<string, number[]>> = {};
            const topicStats: Record<string, { topic: string; total: number; correct: number }> = {};
            const questionMissMap: Record<string, { text: string; explanation?: string; missCount: number }> = {};

            for (const tr of teacherResults) {
                const sKey = String(tr.userId || tr.studentName || '');
                if (!studentResultsMap[sKey]) studentResultsMap[sKey] = [];
                studentResultsMap[sKey].push(tr);

                const sub = String(tr.subjectName || 'General');
                if (!studentSubjectScores[sKey]) studentSubjectScores[sKey] = {};
                if (!studentSubjectScores[sKey][sub]) studentSubjectScores[sKey][sub] = [];
                studentSubjectScores[sKey][sub].push(Number(tr.percent) || 0);

                if (Array.isArray(tr.details)) {
                    for (const det of tr.details) {
                        const topic = String(det.category || sub).trim() || sub;
                        if (!topicStats[topic]) topicStats[topic] = { topic, total: 0, correct: 0 };
                        topicStats[topic].total++;
                        const isCor = !!(det.isCorrect || det.correct);
                        if (isCor) {
                            topicStats[topic].correct++;
                        } else {
                            const qId = String(det.id || det.text || '');
                            if (!questionMissMap[qId]) {
                                questionMissMap[qId] = {
                                    text: det.text || 'Diagnostic Question',
                                    explanation: det.explanation || '',
                                    missCount: 0,
                                };
                            }
                            questionMissMap[qId].missCount++;
                        }
                    }
                }
            }

            const studentRoster = myStudents.map((stud: any) => {
                const sKey = String(stud.id);
                const sAttempts = studentResultsMap[sKey] || studentResultsMap[stud.name] || [];
                const examsTaken = sAttempts.length;
                let avgScore = 0;
                let passRate = 0;
                const strengths: string[] = [];
                const weaknesses: string[] = [];

                if (examsTaken > 0) {
                    const pcts = sAttempts.map((a: any) => Number(a.percent) || 0);
                    avgScore = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
                    const passed = sAttempts.filter((a: any) => a.passed || (Number(a.percent) || 0) >= 50).length;
                    passRate = Math.round((passed / examsTaken) * 100);

                    const subScores = studentSubjectScores[sKey] || studentSubjectScores[stud.name] || {};
                    for (const [subName, scores] of Object.entries(subScores)) {
                        const subAvg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
                        if (subAvg >= 70) {
                            strengths.push(`${subName} (${subAvg}%)`);
                        } else if (subAvg < 50) {
                            weaknesses.push(`${subName} (${subAvg}%)`);
                        }
                    }
                }

                return {
                    ...publicUser(stud),
                    examsTaken,
                    avgScore,
                    passRate,
                    strengths,
                    weaknesses,
                    recentResults: sAttempts.slice(0, 5),
                };
            });

            const competencyDiagnostics = Object.values(topicStats).map((tStat) => {
                const accuracy = tStat.total > 0 ? Math.round((tStat.correct / tStat.total) * 100) : 0;
                const status = accuracy >= 70 ? 'strength' : accuracy < 50 ? 'weakness' : 'moderate';
                return {
                    topic: tStat.topic,
                    accuracy,
                    totalQuestions: tStat.total,
                    correctCount: tStat.correct,
                    status,
                };
            });
            competencyDiagnostics.sort((a, b) => a.accuracy - b.accuracy);

            const topMissedQuestions = Object.values(questionMissMap).sort((a, b) => b.missCount - a.missCount);

            return json({
                ok: true,
                teacher: publicUser(u),
                myStudentsCount: myStudents.length,
                totalExams,
                overallAvg,
                overallPassRate,
                classBreakdown,
                studentRoster,
                competencyDiagnostics,
                results: teacherResults.slice(0, 100),
                topMissedQuestions: topMissedQuestions.slice(0, 15),
            });
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
            const pass = b.passcode;
            if (!(await isEditor(pass))) return error('Incorrect passcode', 401);
            const role = (await isSuperAdmin(pass)) ? 'superadmin' : ((await isAdmin(pass)) ? 'admin' : 'editor');
            return json({ ok: true, role });
        },
    ],

    'POST /api/admin/subjects': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isEditor(b.passcode))) return error('Not authorised', 401);
            const name = String(b.name || '').trim();
            if (!name) return error('Subject name is required', 400);
            const { items } = await db.list('subjects', { limit: 100 });
            const existing = items.find((s: any) => String(s.name).toLowerCase() === name.toLowerCase());
            if (existing) {
                return json({ id: existing.id, name: existing.name }, 200);
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
            if (!(await isEditor(b.passcode))) return error('Not authorised', 401);
            await ensureGesPromoRankSeed();
            const qs = (await allQuestions()).map((q: any) => ({
                ...q,
                options: Array.isArray(q.options) ? q.options.map(String) : [],
            }));
            return json({ questions: qs });
        },
    ],

    'POST /api/admin/questions': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isEditor(b.passcode))) return error('Not authorised', 401);

            const subjectId = String(b.subjectId || '');
            const level = normLevel(b.level);
            const text = String(b.text || '').trim();
            const options: string[] = Array.isArray(b.options) ? b.options.map((o: unknown) => String(o || '').trim()) : [];
            const correctIndex = Number(b.correctIndex);
            const explanation = String(b.explanation || '').trim();
            const year = String(b.year || '').trim();
            const category = String(b.category || '').trim();

            if (level === null) return error('Choose Basic 4 to Basic 9, or an exam section', 400);
            if (!text) return error('Question text is required', 400);
            if (options.length !== 4 || options.some((o) => !o)) return error('Provide all four answer options', 400);
            if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
                return error('Choose the correct answer', 400);
            }
            const { items: subjects } = await db.list('subjects', { limit: 100 });
            const validTarget =
                subjects.some((s: any) => s.id === subjectId) ||
                PROMOTION_RANK_ITEMS.some((r) => r.id === subjectId);
            if (!validTarget) return error('Choose a valid subject or promotion rank', 400);

            const record = {
                subjectId,
                level,
                text,
                options,
                correctIndex,
                explanation,
                ...(year ? { year } : {}),
                ...(category ? { category } : {}),
                createdAt: Date.now(),
            };
            const [id] = await db.add('questions', [record]);
            if (!id) return error('Failed to add question', 500);
            return json({ id, ...record }, 201);
        },
    ],

    'POST /api/admin/questions/bulk': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isEditor(b.passcode))) return error('Not authorised', 401);

            const defaultSubjectId = String(b.subjectId || '').trim();
            const defaultLevel = normLevel(b.level);

            const { items: subjects } = await db.list('subjects', { limit: 100 });
            const isValidSubjectOrRank = (id: string) =>
                subjects.some((s: any) => s.id === id) || PROMOTION_RANK_ITEMS.some((r) => r.id === id);

            const parsedItems = parseBulkQuestionsPayload(b);
            if (parsedItems.length === 0) {
                return error(
                    'No valid questions found in the uploaded file. Please make sure each question has question text, 4 answer options (A–D), and a correct answer (A, B, C, or D).',
                    400
                );
            }

            const now = Date.now();
            const records: any[] = [];
            for (let i = 0; i < parsedItems.length; i++) {
                const item = parsedItems[i];
                const targetSubjectId = item.subjectId && isValidSubjectOrRank(item.subjectId) ? item.subjectId : defaultSubjectId;
                const targetLevel = item.level !== undefined && item.level !== null ? item.level : defaultLevel;

                if (!targetSubjectId || !isValidSubjectOrRank(targetSubjectId)) {
                    return error('Choose a valid subject or promotion rank before uploading.', 400);
                }
                if (targetLevel === null) {
                    return error('Choose a valid class level or exam section before uploading.', 400);
                }

                const rawOpts = Array.isArray(item.options) ? item.options.map(String) : [];
                while (rawOpts.length < 4) rawOpts.push('');
                const cleanOpts = rawOpts.slice(0, 4);

                records.push({
                    subjectId: targetSubjectId,
                    level: targetLevel,
                    text: item.text,
                    options: cleanOpts,
                    correctIndex: Math.max(0, Math.min(3, Number(item.correctIndex) || 0)),
                    explanation: item.explanation || '',
                    ...(item.year ? { year: item.year } : {}),
                    ...(item.category ? { category: item.category } : {}),
                    ...(item.rank ? { rank: item.rank } : {}),
                    createdAt: now + i,
                });
            }

            const ids = await db.add('questions', records);
            return json(
                {
                    imported: ids.length,
                    questions: records.map((r, i) => ({ id: ids[i], ...r })),
                },
                201
            );
        },
    ],

    'POST /api/admin/questions/:id/update': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isEditor(b.passcode))) return error('Not authorised', 401);

            const id = ctx.params.id;
            const subjectId = String(b.subjectId || '');
            const level = normLevel(b.level);
            const text = String(b.text || '').trim();
            const options: string[] = Array.isArray(b.options) ? b.options.map((o: unknown) => String(o || '').trim()) : [];
            const correctIndex = Number(b.correctIndex);
            const explanation = String(b.explanation || '').trim();
            const year = String(b.year || '').trim();
            const category = String(b.category || '').trim();

            if (level === null) return error('Choose Basic 4 to Basic 9, or an exam section', 400);
            if (!text) return error('Question text is required', 400);
            if (options.length !== 4 || options.some((o) => !o)) return error('Provide all four answer options', 400);
            if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
                return error('Choose the correct answer', 400);
            }
            const { items: subjects } = await db.list('subjects', { limit: 100 });
            const validTarget =
                subjects.some((s: any) => s.id === subjectId) ||
                PROMOTION_RANK_ITEMS.some((r) => r.id === subjectId);
            if (!validTarget) return error('Choose a valid subject or promotion rank', 400);

            const updated = await db.update('questions', id, {
                subjectId,
                level,
                text,
                options,
                correctIndex,
                explanation,
                year,
                category,
                updatedAt: Date.now(),
            });
            if (!updated) return error('Question not found', 404);
            return json({ question: updated });
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

    'POST /api/admin/candidates': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

            const { items: rawUsers } = await db.list('users', { limit: 1000 });
            const { items: rawResults } = await db.list('results', { limit: 2000 });

            // Build unified list of candidates from rawUsers and any distinct candidates in rawResults
            const allCandidateUsers: any[] = [...rawUsers];
            const seenEmails = new Set(
                rawUsers
                    .map((u: any) => String(u.email || '').trim().toLowerCase())
                    .filter(Boolean)
            );
            const seenUserIds = new Set(
                rawUsers
                    .map((u: any) => String(u.id || '').trim().toLowerCase())
                    .filter(Boolean)
            );

            // Add any candidate who completed an exam but might not be in rawUsers
            for (const r of rawResults) {
                const rEmail = String(r.studentEmail || '').trim().toLowerCase();
                const rUserId = String(r.userId || '').trim().toLowerCase();
                if (rEmail && !seenEmails.has(rEmail)) {
                    seenEmails.add(rEmail);
                    if (rUserId) seenUserIds.add(rUserId);
                    allCandidateUsers.push({
                        id: r.userId || `candidate-res-${r.id || crypto.randomUUID()}`,
                        name: r.studentName || r.studentEmail || 'Candidate',
                        email: r.studentEmail || '',
                        accountType: r.level === 'GES-PROMO' ? 'ges-promo' : 'student',
                        gradeLevel: r.level === 'GES-PROMO' ? 'GES-PROMO' : r.level,
                        schoolName: r.schoolName || '',
                        region: '',
                        promotionRank: r.level === 'GES-PROMO' ? r.subjectName : '',
                        createdAt: r.createdAt || Date.now(),
                    });
                } else if (!rEmail && rUserId && !seenUserIds.has(rUserId)) {
                    seenUserIds.add(rUserId);
                    allCandidateUsers.push({
                        id: r.userId,
                        name: r.studentName || 'Candidate',
                        email: '',
                        accountType: r.level === 'GES-PROMO' ? 'ges-promo' : 'student',
                        gradeLevel: r.level === 'GES-PROMO' ? 'GES-PROMO' : r.level,
                        schoolName: r.schoolName || '',
                        region: '',
                        promotionRank: r.level === 'GES-PROMO' ? r.subjectName : '',
                        createdAt: r.createdAt || Date.now(),
                    });
                }
            }

            const candidates = allCandidateUsers.map((u: any) => {
                const uEmail = String(u.email || '').trim().toLowerCase();
                const uId = String(u.id || '').trim();
                const userResults = rawResults.filter(
                    (r: any) =>
                        (uId && r.userId && String(r.userId).trim() === uId) ||
                        (uEmail && r.studentEmail && String(r.studentEmail).trim().toLowerCase() === uEmail)
                );
                const sortedResults = [...userResults].sort((a: any, c: any) => (c.createdAt || 0) - (a.createdAt || 0));
                const examsTaken = sortedResults.length;
                const totalScore = sortedResults.reduce((acc: number, r: any) => acc + (Number(r.percent) || 0), 0);
                const avgPercent = examsTaken > 0 ? Math.round(totalScore / examsTaken) : 0;
                const bestPercent = examsTaken > 0 ? Math.max(...sortedResults.map((r: any) => Number(r.percent) || 0)) : 0;
                const lastExamAt = sortedResults[0]?.createdAt || null;
                const lastSubject = sortedResults[0]?.subjectName || null;

                let performanceStatus: 'Distinction' | 'Pass' | 'Remedial' | 'Pending' = 'Pending';
                if (examsTaken > 0) {
                    if (avgPercent >= 75) performanceStatus = 'Distinction';
                    else if (avgPercent >= 50) performanceStatus = 'Pass';
                    else performanceStatus = 'Remedial';
                }

                return {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    adminRole: isSuperAdminEmail(u.email) ? 'superadmin' : (u.adminRole || (['admin', 'editor'].includes(u.role) ? u.role : null)),
                    isSuperAdmin: isSuperAdminEmail(u.email),
                    accountType: u.accountType,
                    gradeLevel: u.gradeLevel,
                    region: u.region || '',
                    promotionRank: u.promotionRank || '',
                    schoolName: u.schoolName || '',
                    registeredAt: u.createdAt || 0,
                    examsTaken,
                    avgPercent,
                    bestPercent,
                    lastExamAt,
                    lastSubject,
                    performanceStatus,
                    recentResults: sortedResults.slice(0, 10).map((r: any) => ({
                        id: r.id,
                        subjectName: r.subjectName,
                        level: r.level,
                        score: r.score,
                        total: r.total,
                        percent: r.percent,
                        createdAt: r.createdAt,
                    })),
                };
            }).sort((a: any, b: any) => (b.lastExamAt || b.registeredAt || 0) - (a.lastExamAt || a.registeredAt || 0));

            const totalExams = rawResults.length;
            const totalPass = rawResults.filter((r: any) => (Number(r.percent) || 0) >= 50).length;
            const totalDistinction = rawResults.filter((r: any) => (Number(r.percent) || 0) >= 75).length;
            const overallAverage =
                totalExams > 0 ? Math.round(rawResults.reduce((acc: number, r: any) => acc + (Number(r.percent) || 0), 0) / totalExams) : 0;
            const passRate = totalExams > 0 ? Math.round((totalPass / totalExams) * 100) : 0;
            const distinctionRate = totalExams > 0 ? Math.round((totalDistinction / totalExams) * 100) : 0;

            return json({
                candidates,
                totalCandidates: candidates.length,
                totalExams,
                overallAverage,
                passRate,
                distinctionRate,
            });
        },
    ],

    'POST /api/admin/roles/list': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

            const { items: rawUsers } = await db.list('users', { limit: 1000 });
            const adminsList: any[] = [];
            let hasMark = false;

            for (const u of rawUsers as any[]) {
                const em = String(u.email || '').trim().toLowerCase();
                const isMark = isSuperAdminEmail(em);
                const role = isMark ? 'superadmin' : (u.adminRole || u.role);

                if (isMark) {
                    hasMark = true;
                    adminsList.push({
                        id: u.id,
                        name: u.name || 'Mark Anibrika',
                        email: u.email,
                        role: 'superadmin',
                        isPrimarySuperAdmin: true,
                        createdAt: u.createdAt || null,
                        promotionRank: u.promotionRank || '',
                    });
                } else if (['admin', 'editor', 'superadmin'].includes(role)) {
                    adminsList.push({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role,
                        isPrimarySuperAdmin: false,
                        createdAt: u.createdAt || null,
                        promotionRank: u.promotionRank || '',
                    });
                }
            }

            if (!hasMark) {
                adminsList.push({
                    id: '1eb911c4-ea55-4317-82a8-081a2c971668',
                    name: 'Mark Anibrika',
                    email: 'anibrikamark@gmail.com',
                    role: 'superadmin',
                    isPrimarySuperAdmin: true,
                    createdAt: 1792321771016,
                    promotionRank: 'Deputy Director (DD)',
                });
            }

            return json({ ok: true, admins: adminsList, superAdminEmail: 'anibrikamark@gmail.com' });
        },
    ],

    'POST /api/admin/roles/promote': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isSuperAdmin(b.passcode))) {
                return error('Only Super Admin (Mark Anibrika) can promote or demote quiz admins and editors.', 403);
            }

            const targetEmail = String(b.targetEmail || '').trim().toLowerCase();
            const targetUserId = String(b.targetUserId || '').trim();
            const newRole = String(b.newRole || 'admin').trim().toLowerCase();

            if (!['admin', 'editor', 'candidate'].includes(newRole)) {
                return error('Role must be admin, editor, or candidate', 400);
            }

            if (targetEmail === 'anibrikamark@gmail.com') {
                return error('Mark Anibrika is the primary Super Admin and cannot have his role altered.', 400);
            }

            const { items: users } = await db.list('users', { limit: 1000 });
            const target: any = (users as any[]).find(
                (u: any) =>
                    (targetUserId && String(u.id) === targetUserId) ||
                    (targetEmail && String(u.email || '').trim().toLowerCase() === targetEmail)
            );

            if (!target) return error('Candidate not found with provided ID or email', 404);

            if (isSuperAdminEmail(target.email)) {
                return error('Mark Anibrika is the primary Super Admin and cannot have his role altered.', 400);
            }

            const updateData: any = {
                updatedAt: Date.now(),
            };
            if (newRole === 'candidate') {
                updateData.adminRole = null;
                updateData.role = target.accountType === 'ges-promo' ? 'ges-promo' : 'student';
            } else {
                updateData.adminRole = newRole;
                updateData.role = newRole;
            }

            await db.update('users', target.id, updateData);
            const updated = { ...target, ...updateData };

            return json({
                ok: true,
                user: publicUser(updated),
                message:
                    newRole === 'candidate'
                        ? `Removed admin privileges from ${target.name}.`
                        : `Successfully assigned ${target.name} as ${newRole === 'admin' ? 'Quiz Admin' : 'Quiz Editor'}!`,
            });
        },
    ],

    'POST /api/admin/roles/create': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isSuperAdmin(b.passcode))) {
                return error('Only Super Admin (Mark Anibrika) can create new Admins or Editors.', 403);
            }

            const name = String(b.name || '').trim();
            const email = String(b.email || '').trim().toLowerCase();
            const password = String(b.password || '');
            const role = String(b.role || 'admin').trim().toLowerCase();

            if (!name) return error('Full name is required', 400);
            if (!email.includes('@')) return error('Valid email address is required', 400);
            if (password.length < 6) return error('Password must be at least 6 characters', 400);
            if (!['admin', 'editor'].includes(role)) return error('Role must be admin or editor', 400);

            const { items: users } = await db.list('users', { limit: 1000 });
            if ((users as any[]).some((u: any) => String(u.email || '').trim().toLowerCase() === email)) {
                return error('An account with this email already exists. You can promote this existing user instead.', 409);
            }

            const passwordHash = hashPassword(password);
            const newUser = {
                name,
                email,
                role,
                adminRole: role,
                accountType: 'admin',
                schoolName: 'Codecastic Administration',
                gradeLevel: 4,
                passwordPlain: password,
                passwordHash,
                createdAt: Date.now(),
            };

            const created = await db.add('users', [newUser]);
            const createdRecord = (created && created[0]) ? created[0] : newUser;

            return json(
                {
                    ok: true,
                    user: publicUser(createdRecord),
                    message: `Successfully created ${role === 'admin' ? 'Quiz Admin' : 'Quiz Editor'} account for ${name}!`,
                },
                201
            );
        },
    ],

    'POST /api/admin/roles/revoke': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isSuperAdmin(b.passcode))) {
                return error('Only Super Admin (Mark Anibrika) can revoke admin roles.', 403);
            }

            const targetUserId = String(b.targetUserId || '').trim();
            const targetEmail = String(b.targetEmail || '').trim().toLowerCase();

            if (targetEmail === 'anibrikamark@gmail.com') {
                return error('Mark Anibrika is the primary Super Admin and cannot be revoked.', 400);
            }

            const { items: users } = await db.list('users', { limit: 1000 });
            const target: any = (users as any[]).find(
                (u: any) =>
                    (targetUserId && String(u.id) === targetUserId) ||
                    (targetEmail && String(u.email || '').trim().toLowerCase() === targetEmail)
            );

            if (!target) return error('User not found', 404);
            if (isSuperAdminEmail(target.email)) {
                return error('Mark Anibrika is the primary Super Admin and cannot be revoked.', 400);
            }

            await db.update('users', target.id, {
                adminRole: null,
                role: target.accountType === 'ges-promo' ? 'ges-promo' : 'student',
                updatedAt: Date.now(),
            });

            return json({ ok: true, message: 'Admin privileges revoked successfully.' });
        },
    ],

    'POST /api/admin/messages': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const { items } = await db.list('messages', { limit: 1000 });
            const messages = [...items].sort((a: any, c: any) => (c.createdAt || 0) - (a.createdAt || 0));
            const isMariaDb = await (db as any).isMariaDbActive();
            return json({ messages, isMariaDb });
        },
    ],

    'POST /api/admin/messages/:id/delete': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            await db.delete('messages', [ctx.params.id]);
            return json({ ok: true });
        },
    ],

    'POST /api/admin/messages/:id/reply': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);
            const replyMessage = String(b.replyMessage || '').trim();
            if (!replyMessage) return error('Enter your reply message', 400);

            const { items } = await db.list('messages');
            const msg = items.find((m: any) => m.id === ctx.params.id);
            if (!msg) return error('Message not found', 404);

            try {
                await sendDirectReply({
                    to: msg.email,
                    toName: msg.name,
                    subject: msg.topic || 'Inquiry on Codecastic GH',
                    replyMessage,
                    originalMessage: msg.message,
                });

                const now = Date.now();
                await db.update('messages', msg.id, {
                    repliedAt: now,
                    replyCount: (Number(msg.replyCount) || 0) + 1,
                    lastReply: replyMessage,
                });

                return json({ ok: true, repliedAt: now });
            } catch (e: any) {
                return error(e?.message || 'Could not send reply email', 500);
            }
        },
    ],

    // ---------- Gemini AI Integration Endpoints ----------
    'GET /api/admin/ai-settings': [
        async (ctx) => {
            const code = ctx.query?.passcode || '';
            if (!(await isAdmin(code))) return error('Not authorised', 401);

            const { items } = await db.list('settings', { limit: 50 });
            const doc: any = items.find((i: any) => i.key === 'ai_config');
            const apiKey = String(doc?.apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();
            const enabled = doc?.enabled !== false;
            const model = String(doc?.model || 'gemini-1.5-flash');

            let maskedKey = '';
            if (apiKey) {
                const len = apiKey.length;
                maskedKey = apiKey.slice(0, 6) + '*'.repeat(Math.max(4, len - 10)) + apiKey.slice(-4);
            }

            return json({
                configured: !!apiKey,
                enabled,
                maskedKey,
                model,
            });
        },
    ],

    'POST /api/admin/ai-settings': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

            const apiKey = String(b.apiKey || '').trim();
            const enabled = b.enabled !== false;
            const model = String(b.model || 'gemini-1.5-flash');

            // Save to settings
            const { items } = await db.list('settings', { limit: 50 });
            const existing: any = items.find((i: any) => i.key === 'ai_config');
            const record = {
                key: 'ai_config',
                apiKey: apiKey || (existing?.apiKey ?? ''),
                enabled,
                model,
                updatedAt: Date.now(),
            };

            if (existing) {
                await db.update('settings', existing.id, record);
            } else {
                await db.add('settings', [record]);
            }

            return json({
                ok: true,
                message: 'AI settings updated successfully',
                configured: !!record.apiKey,
                enabled: record.enabled,
            });
        },
    ],

    'POST /api/ai/audit-question': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

            const q = b.question || {};
            const text = String(q.text || '').trim();
            const options: string[] = Array.isArray(q.options) ? q.options.map((o: unknown) => String(o || '').trim()) : [];
            const correctIndex = Number(q.correctIndex) || 0;
            const explanation = String(q.explanation || '').trim();

            if (!text || options.length !== 4) return error('Invalid question payload', 400);

            // Local duplicate detection
            const cleaned = options.map((o) => o.toLowerCase());
            const dupes: Record<string, boolean> = {};
            const seen = new Set<string>();
            for (const opt of cleaned) {
                if (seen.has(opt)) dupes[opt] = true;
                seen.add(opt);
            }
            const hasLocalDuplicates = Object.keys(dupes).length > 0;

            let aiResponse: any = null;
            const { items } = await db.list('settings', { limit: 50 });
            const aiDoc: any = items.find((i: any) => i.key === 'ai_config');
            const apiKey = String(aiDoc?.apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();

            if (apiKey && aiDoc?.enabled !== false) {
                try {
                    const prompt = `You are an expert exam reviewer and curriculum auditor for the Ghanaian pre-tertiary and teacher promotion curriculum (BECE, WASSCE, GTLE, GES Promotion).
Analyze this multiple-choice question:
Question: ${text}
Options:
A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}
Currently Marked Correct: Option ${String.fromCharCode(65 + correctIndex)} (${options[correctIndex] || ''})
Explanation: ${explanation}

CRITICAL RULES:
1. NEVER include 'None of the above', 'All of the above', or generic non-answers as an option. All 4 options must be genuine, distinct, syllabus-aligned distractors or answers.
2. If any options are duplicates, replace duplicate options with realistic, distinct alternative choices that fit the subject context.
3. Ensure the marked correct answer matches the explanation and educational standards.
4. Set 'correctIndex' to the 0-based index of the true correct answer (0 for A, 1 for B, 2 for C, 3 for D).

Provide the output strictly in valid JSON format:
{
  "hasIssue": true,
  "issueSummary": "Option A and Option C are duplicates. The correct answer should be integrated circuits (ICs).",
  "correctedOptions": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 2,
  "explanation": "Clear curriculum-aligned explanation here."
}`;

                    const candidateModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
                    for (const m of candidateModels) {
                        try {
                            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-goog-api-key': apiKey,
                                },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: prompt }] }],
                                    generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
                                }),
                            });
                            if (res.ok) {
                                const data: any = await res.json();
                                const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                const jsonClean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
                                const parsed = JSON.parse(jsonClean);
                                if (parsed && Array.isArray(parsed.correctedOptions) && parsed.correctedOptions.length === 4) {
                                    const hasForbidden = parsed.correctedOptions.some((opt: string) =>
                                        /none\s+of\s+the\s+above|all\s+of\s+the\s+above/i.test(opt)
                                    );
                                    if (!hasForbidden) {
                                        aiResponse = parsed;
                                        break;
                                    }
                                }
                            }
                        } catch {
                            // try next model
                        }
                    }
                } catch {
                    // fallback to heuristic
                }
            }

            if (!aiResponse) {
                if (hasLocalDuplicates) {
                    const duplicateText = Object.keys(dupes).join(', ');
                    const lowText = `${text} ${explanation}`.toLowerCase();
                    let replacement = 'The organ system';
                    if (/cell|living|tissue/i.test(lowText)) replacement = 'The organ system';
                    else if (/circuit|computer|hardware|generation/i.test(lowText)) replacement = 'Integrated circuits (ICs)';
                    else if (/microprocessor/i.test(lowText)) replacement = 'Microprocessors';
                    else if (/vacuum tube/i.test(lowText)) replacement = 'Vacuum tubes';
                    else if (/teacher|school|ges/i.test(lowText)) replacement = 'School Management Committee (SMC)';
                    else if (/act 1023|law|policy/i.test(lowText)) replacement = 'Ghana Education Service Council (GESC)';
                    else replacement = 'Structural component';

                    const fixedOpts = [...options];
                    const seenFirst = new Set<string>();
                    for (let idx = 0; idx < fixedOpts.length; idx++) {
                        const low = fixedOpts[idx].toLowerCase();
                        if (seenFirst.has(low)) {
                            fixedOpts[idx] = replacement;
                            break;
                        }
                        seenFirst.add(low);
                    }

                    aiResponse = {
                        hasIssue: true,
                        issueSummary: `Duplicate options detected ("${duplicateText}"). Replaced duplicate with distinct alternative distractor.`,
                        correctedOptions: fixedOpts,
                        correctIndex,
                        explanation: explanation || 'Fixed duplicate options to ensure 4 distinct, syllabus-aligned answers.',
                    };
                } else {
                    aiResponse = {
                        hasIssue: false,
                        issueSummary: 'No duplicate options detected.',
                        correctedOptions: options,
                        correctIndex,
                        explanation,
                    };
                }
            }

            return json({
                ok: true,
                hasIssue: !!aiResponse?.hasIssue,
                issueSummary: aiResponse?.issueSummary || 'Audit complete',
                fix: {
                    correctedOptions: aiResponse?.correctedOptions || options,
                    correctIndex: Number(aiResponse?.correctIndex) || correctIndex,
                    explanation: aiResponse?.explanation || explanation,
                },
            });
        },
    ],

    'POST /api/ai/apply-fix': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

            const qId = String(b.questionId || '').trim();
            const fixed = b.fixed || {};
            if (!qId || !Array.isArray(fixed.options) || fixed.options.length !== 4) {
                return error('Invalid question fix payload', 400);
            }

            const { items } = await db.list('questions');
            const target: any = items.find((q: any) => q.id === qId);
            if (!target) return error('Question not found', 404);

            const updated = await db.update('questions', qId, {
                ...target,
                text: fixed.text !== undefined && String(fixed.text).trim() ? String(fixed.text).trim() : target.text,
                options: fixed.options.map((o: unknown) => String(o || '').trim()),
                correctIndex: typeof fixed.correctIndex === 'number' ? fixed.correctIndex : target.correctIndex,
                explanation: fixed.explanation !== undefined ? String(fixed.explanation).trim() : target.explanation,
                updatedAt: Date.now(),
            });

            return json({ ok: true, message: 'Question updated successfully', question: updated });
        },
    ],

    'POST /api/ai/clarify': [
        async (ctx) => {
            const b = (ctx.body || {}) as any;
            const q = b.question || {};
            const text = String(q.text || '').trim();
            const options: string[] = Array.isArray(q.options) ? q.options.map((o: unknown) => String(o || '').trim()) : [];
            const correctIndex = Number(b.correctIndex ?? q.correctIndex) || 0;
            const studentChosen = b.studentChosen !== undefined && b.studentChosen !== null ? Number(b.studentChosen) : null;
            const explanation = String(b.explanation || q.explanation || '').trim();
            const studentQuestion = String(b.studentQuestion || 'Please clarify this answer for me.').trim();
            const level = String(b.level || '');
            const subjectName = String(b.subjectName || 'General');

            if (!text) return error('Question text is required', 400);

            const correctLetter = String.fromCharCode(65 + correctIndex);
            const correctText = options[correctIndex] || 'Correct answer';
            const studentChosenText = studentChosen !== null && options[studentChosen]
                ? `${String.fromCharCode(65 + studentChosen)}) ${options[studentChosen]}`
                : 'Unanswered';

            const { items } = await db.list('settings', { limit: 50 });
            const aiDoc: any = items.find((i: any) => i.key === 'ai_config');
            const apiKey = String(aiDoc?.apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();

            let reply = '';
            if (apiKey && aiDoc?.enabled !== false) {
                try {
                    const prompt = `You are Codecastic AI Tutor, an inspiring, polite, and master Ghanaian educator (National Best Teacher standard) helping a Ghanaian candidate excel in their national examination (${subjectName}, Level: ${level}).

QUESTION DETAILS:
Question: ${text}
Options:
A) ${options[0]}
B) ${options[1]}
C) ${options[2]}
D) ${options[3]}
Official Correct Answer: Option ${correctLetter} (${correctText})
Candidate's Selection: ${studentChosenText}
Official Explanation: ${explanation}

CANDIDATE'S INQUIRY:
"${studentQuestion}"

MANDATORY GHANAIAN DOMESTICATION & PEDAGOGY RULES:
1. GREETING & TONE: Begin with a warm, authentic Ghanaian greeting (e.g., 'Akwaaba, scholar!', 'Ayekoo on your practice!', 'Medaase for asking!'). Use an inspiring, respectful, and crystal-clear Ghanaian pedagogical tone.
2. 100% DOMESTICATED GHANAIAN EXAMPLES & SCENARIOS:
   - When using everyday illustrations, analogies, mnemonics, or scenarios, strictly ground them in familiar Ghanaian life, environment, culture, and geography.
   - Use Ghanaian contexts such as:
     * Geography & Landmarks: Lake Volta, Akosombo Dam, Kakum canopy walk, Mount Afadjato, Kejetia Market (Kumasi), Makola Market (Accra), Cape Coast Castle, Paga Crocodile Pond, Tamale central, Mole National Park, Gulf of Guinea.
     * Food, Agriculture & Daily Living: Cocoa pods, plantain, cassava, fufu, banku, hot kenkey and fried fish with shito, jollof, waakye, shea butter, groundnut soup, yam tubers, solar fish-drying at coastal beaches, clay water pots (cooling through evaporation).
     * Currency & Society: Ghana Cedis (GH₵) and Pesewas, local transport (trotro / 'mate'), school assemblies, Ghanaian school science laboratories.
     * Cultural Games & Art: Oware, ampe, kente weaving in Bonwire, traditional damba / adowa rhythms.
3. ABSOLUTELY NO WESTERN OR FOREIGN POP-CULTURE REFERENCES:
   - NEVER reference Hollywood, American baseball/football, Thanksgiving, winter/snow, foreign celebrities, or distant Western idioms. Keep every single example and memory tip fully rooted in Ghana so any student across Ghana immediately understands and relates.
4. GHANAIAN CURRICULUM & EXAM RELEVANCE:
   - Align directly with Ghanaian educational standards (NaCCA syllabus for Basic schools, WAEC Chief Examiner reports for BECE & WASSCE, and NTC standards for GTLE).
   - Point out why Option ${correctLetter} is the exact answer expected by Ghanaian examiners, and if the student picked an incorrect option, explain the common misconception Ghanaian students make.
5. FORMAT & BREVITY:
   - Respond in 2 to 3 well-structured, clear markdown paragraphs.
   - Use bold text for key Ghanaian terms and scientific/mathematical principles.
   - End with an encouraging Ghanaian word of motivation (e.g., 'Keep studying hard—you are destined for excellence in your ${subjectName} exam!').`;

                    const candidateModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'];
                    for (const m of candidateModels) {
                        try {
                            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-goog-api-key': apiKey,
                                },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: prompt }] }],
                                    generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
                                }),
                            });
                            if (res.ok) {
                                const data: any = await res.json();
                                reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                if (reply) break;
                            }
                        } catch {
                            // try next model
                        }
                    }
                } catch {
                    // fallback
                }
            }

            if (!reply) {
                reply = `Akwaaba! Here is your Ghanaian exam breakdown for this question:

**Correct Answer:** Option ${correctLetter} (${correctText})

${explanation ? `**Official Curriculum Note:** ${explanation}\n\n` : ''}💡 **Key Ghanaian Exam Tip:** In the Ghanaian ${subjectName} syllabus, examiners specifically reward accurate definitions and real-world understanding. ${studentChosen !== null && studentChosen !== correctIndex ? `You selected Option ${String.fromCharCode(65 + studentChosen)}, which is a common distractor in past WAEC/GES exams. Note that Option ${correctLetter} directly satisfies the syllabus requirements.` : 'Ayekoo! You have mastered the core Ghanaian curriculum concept behind this question!'}

*(Note: Your administrator can configure a free Google Gemini AI key in the Admin Panel for live, interactive Ghanaian conversational tutoring!)*`;
            }

            return json({ ok: true, reply });
        },
    ],
});
