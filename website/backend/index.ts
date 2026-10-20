import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { router, json, error, db } from './sdk';

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

function publicUser(u: any) {
    return {
        id: u.id as string,
        name: u.name as string,
        email: u.email as string,
        accountType: (u.accountType || 'student') as 'student' | 'ges-promo',
        schoolName: (u.schoolName || '') as string,
        gradeLevel: (u.gradeLevel ?? 4) as Level,
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

    q('Professional Studies', 'GES-PROMO', 'A teacher notices that a pupil often comes to school hungry and tired. What is the most professional first step?', ['Punish the pupil', 'Ignore it', 'Speak with the pupil privately and involve the school’s guidance or welfare support', 'Tell the whole class'], 2, 'Handle the matter privately, kindly and through the proper school channels.'),
    q('Professional Studies', 'GES-PROMO', 'Keeping accurate records of learners’ attendance and progress mainly helps a teacher to:', ['Avoid planning lessons', 'Track progress and support learners who fall behind', 'Reduce the number of lessons', 'Replace assessment'], 1, 'Good records show who needs extra help and whether teaching is working.'),
    q('Professional Studies', 'GES-PROMO', 'A lesson plan should be prepared:', ['After teaching the lesson', 'Before teaching the lesson', 'Only when inspectors visit', 'Only at the end of term'], 1, 'Planning ahead keeps the lesson focused on its objectives.'),
];

const PROMOTION_RANK_ITEMS = [
    { id: 'rank-ad-ii', name: 'Assistant Director II (AD II)' },
    { id: 'rank-ad-i', name: 'Assistant Director I (AD I)' },
    { id: 'rank-dd', name: 'Deputy Director (DD)' },
    { id: 'rank-dir-ii', name: 'Director II (Dir II)' },
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
    const { items: settings } = await db.list('settings', { limit: 50 });
    if (settings.some((s: any) => s.key === 'seed-ges-ranks-v1')) return;
    await db.add('settings', [{ key: 'seed-ges-ranks-v1' }]);

    const validRankIds = new Set(PROMOTION_RANK_ITEMS.map((r) => r.id));
    const existingQs = await allQuestions();
    for (const eq of existingQs) {
        if (eq.level === 'GES-PROMO' && !validRankIds.has(eq.subjectId)) {
            await db.update('questions', eq.id, { subjectId: 'rank-ad-ii' });
        }
    }

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

async function isAdmin(code: unknown): Promise<boolean> {
    const saved = await getAdminCode();
    return !!saved && typeof code === 'string' && code === saved;
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
            const password = String(b.password || '');

            if (!email || !password) return error('Enter your email and password', 400);

            const { items: users } = await db.list('users', { limit: 1000 });
            const user: any = users.find((u: any) => String(u.email).toLowerCase() === email);
            if (!user || !verifyPassword(password, user.passwordHash)) {
                return error('Invalid email or password', 401);
            }

            if (!user.passwordPlain) {
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
            await ensureGesPromoRankSeed();
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
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

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

                records.push({
                    subjectId: targetSubjectId,
                    level: targetLevel,
                    text: item.text,
                    options: item.options,
                    correctIndex: item.correctIndex,
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
            if (!(await isAdmin(b.passcode))) return error('Not authorised', 401);

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

            const candidates = rawUsers.map((u: any) => {
                const userResults = rawResults.filter(
                    (r: any) =>
                        (r.userId && r.userId === u.id) ||
                        (r.studentEmail && String(r.studentEmail).toLowerCase() === String(u.email).toLowerCase())
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
});
