import { useEffect, useState, useCallback } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '@appdeploy/client';
import { TRACKS } from '../exams';
import {
    GraduationCap,
    BookOpen,
    Calculator,
    Monitor,
    FlaskConical,
    Languages,
    Lock,
    LogOut,
    Plus,
    Trash2,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    XCircle,
    Loader2,
    RotateCcw,
    Trophy,
    ClipboardCheck,
    ArrowLeft,
    UserCheck,
    School,
    Eye,
    EyeOff,
    Pencil,
} from 'lucide-react';

export type Level = number | string;
type Subject = { id: string; name: string };
type ExamQ = { id: string; text: string; options: string[] };
type AdminQ = ExamQ & { subjectId: string; level: Level; correctIndex: number; explanation: string };
type ReviewItem = { id: string; correctIndex: number; chosen: number | null; correct: boolean; explanation: string };
type ResultRow = {
    id: string;
    studentName: string;
    studentEmail?: string;
    schoolName?: string;
    level: Level;
    subjectName: string;
    score: number;
    total: number;
    percent: number;
    createdAt: number;
};

type StudentUser = {
    id: string;
    name: string;
    email: string;
    accountType?: 'student' | 'ges-promo';
    schoolName: string;
    gradeLevel: number;
    region?: string;
    promotionRank?: string;
};

const TOKEN_KEY = 'codecastic_examhub_token';
const SCHOOL_LEVELS: number[] = [4, 5, 6, 7, 8, 9];
const EXAM_TRACKS: { id: string; label: string }[] = [
    { id: 'BECE', label: 'BECE' },
    { id: 'WASSCE', label: 'WASSCE' },
    { id: 'GTLE', label: 'GTLE' },
    { id: 'GES-PROMO', label: 'GES Promotion' },
];
const GHANA_REGIONS: string[] = [
    'Ahafo',
    'Ashanti',
    'Bono',
    'Bono East',
    'Central',
    'Eastern',
    'Greater Accra',
    'North East',
    'Northern',
    'Oti',
    'Savannah',
    'Upper East',
    'Upper West',
    'Volta',
    'Western',
    'Western North',
];
const PROMOTION_RANKS: string[] = [
    'Assistant Director II (AD II)',
    'Assistant Director I (AD I)',
    'Deputy Director (DD)',
    'Director II (Dir II)',
];
const LETTERS = ['A', 'B', 'C', 'D'];

function levelLabel(l: Level): string {
    if (typeof l === 'number') return `Basic ${l}`;
    return EXAM_TRACKS.find((t) => t.id === l)?.label ?? String(l);
}

function parseLevel(v: string): Level {
    return /^\d+$/.test(v) ? Number(v) : v;
}

function errMsg(e: any, fallback: string): string {
    return e?.response?.data?.error || fallback;
}

function SubjectIcon({ name, size = 20 }: { name: string; size?: number }) {
    const n = name.toLowerCase();
    if (n.includes('math')) return <Calculator size={size} />;
    if (n.includes('comput') || n.includes('ict')) return <Monitor size={size} />;
    if (n.includes('sci')) return <FlaskConical size={size} />;
    if (n.includes('eng') || n.includes('lang')) return <Languages size={size} />;
    if (n.includes('prof') || n.includes('teach')) return <ClipboardCheck size={size} />;
    return <BookOpen size={size} />;
}

type Tab = 'student' | 'admin';

export default function ExamHubPortal({
    activeSlug,
    initialLevel,
    sectionLabel,
}: {
    activeSlug: string;
    initialLevel: Level | null;
    sectionLabel: string;
}) {
    const [tab, setTab] = useState<Tab>('student');
    const [user, setUser] = useState<StudentUser | null>(null);
    const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || '');
    const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
    const isGesPromoSection = activeSlug === 'ges-promotion' || initialLevel === 'GES-PROMO';

    useEffect(() => {
        const saved = localStorage.getItem(TOKEN_KEY);
        if (!saved) {
            setCheckingAuth(false);
            return;
        }
        api.post('/api/auth/me', { token: saved })
            .then((r) => {
                setUser(r.data.user);
                setToken(saved);
            })
            .catch(() => {
                localStorage.removeItem(TOKEN_KEY);
                setUser(null);
                setToken('');
            })
            .finally(() => setCheckingAuth(false));
    }, []);

    const handleAuthenticated = (newUser: StudentUser, newToken: string) => {
        localStorage.setItem(TOKEN_KEY, newToken);
        setUser(newUser);
        setToken(newToken);
    };

    const handleStudentLogout = async () => {
        try {
            if (token) await api.post('/api/auth/logout', { token });
        } catch {
            // ignore
        }
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setToken('');
    };

    const requiresAuth = !user || (isGesPromoSection && user.accountType !== 'ges-promo');

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
            {/* Full-screen Portal Top Bar */}
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
                    <div className="flex items-center gap-3">
                        <a
                            href="#/"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                        >
                            <ArrowLeft size={14} />
                            Back to Website
                        </a>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#364c83] text-white">
                                <GraduationCap size={19} />
                            </div>
                            <div>
                                <div className="text-base font-bold leading-tight text-slate-900">ExamHub Portal</div>
                                <p className="text-xs leading-tight text-slate-500">{sectionLabel}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {tab === 'student' && user && !requiresAuth && (
                            <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                                <UserCheck size={14} className="text-emerald-600 shrink-0" />
                                <div className="leading-tight">
                                    <span className="font-semibold text-slate-800">{user.name}</span>
                                    <span className="text-slate-500">
                                        {' '}
                                        &middot;{' '}
                                        {user.accountType === 'ges-promo'
                                            ? `${user.region} (${user.promotionRank})`
                                            : `${user.schoolName} (Basic ${user.gradeLevel})`}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleStudentLogout}
                                    className="ml-1 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                    Sign out
                                </button>
                            </div>
                        )}

                        <nav className="flex gap-1 rounded-lg bg-slate-100 p-1" aria-label="Portal mode">
                            {(['student', 'admin'] as Tab[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={`rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition ${
                                        tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Section Sub-Tabs inside Full-Screen Portal */}
                <div className="border-t border-slate-100 bg-slate-50/70">
                    <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6">
                        <a
                            href="#/exams"
                            className="rounded-full px-3.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 whitespace-nowrap"
                        >
                            All Sections
                        </a>
                        {TRACKS.map((t) => {
                            const isCurrent = t.slug === activeSlug;
                            return (
                                <a
                                    key={t.slug}
                                    href={`#/exams/${t.slug}`}
                                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition whitespace-nowrap ${
                                        isCurrent
                                            ? 'bg-[#364c83] text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                    }`}
                                >
                                    {t.label}
                                </a>
                            );
                        })}
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
                {tab === 'admin' ? (
                    <AdminView />
                ) : checkingAuth ? (
                    <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
                        <Loader2 className="animate-spin" size={18} />
                        Loading your account...
                    </div>
                ) : requiresAuth ? (
                    <StudentAuthView
                        key={isGesPromoSection ? 'ges-promo-auth' : 'student-auth'}
                        isGesPromo={isGesPromoSection}
                        onAuthenticated={handleAuthenticated}
                    />
                ) : (
                    <StudentView
                        key={`${activeSlug}-${user.id}`}
                        user={user}
                        token={token}
                        initialLevel={initialLevel}
                    />
                )}
            </main>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Student / Candidate Registration & Login Gate                       */
/* ------------------------------------------------------------------ */

function StudentAuthView({
    isGesPromo,
    onAuthenticated,
}: {
    isGesPromo: boolean;
    onAuthenticated: (u: StudentUser, token: string) => void;
}) {
    const [mode, setMode] = useState<'login' | 'register'>(isGesPromo ? 'register' : 'login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [gradeLevel, setGradeLevel] = useState<number>(4);
    const [region, setRegion] = useState('');
    const [promotionRank, setPromotionRank] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
            if (mode === 'register') {
                const payload = isGesPromo
                    ? {
                          accountType: 'ges-promo',
                          name: name.trim(),
                          email: email.trim(),
                          region,
                          promotionRank,
                          password,
                      }
                    : {
                          accountType: 'student',
                          name: name.trim(),
                          email: email.trim(),
                          schoolName: schoolName.trim(),
                          gradeLevel,
                          password,
                      };
                const res = await api.post('/api/auth/register', payload);
                onAuthenticated(res.data.user, res.data.token);
            } else {
                const res = await api.post('/api/auth/login', {
                    email: email.trim(),
                    password,
                });
                onAuthenticated(res.data.user, res.data.token);
            }
        } catch (e2) {
            setErr(errMsg(e2, mode === 'register' ? 'Could not create account.' : 'Could not sign in.'));
        } finally {
            setBusy(false);
        }
    };

    if (isGesPromo) {
        return (
            <div className="mx-auto max-w-md py-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <div className="text-center">
                        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                            {mode === 'register' ? 'Create Account' : 'Candidate Sign In'}
                        </h2>
                        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#364c83]">
                            {mode === 'register'
                                ? 'REGISTER TO ACCESS YOUR GES PROMOTION TRIAL EXAM PORTAL'
                                : 'SIGN IN TO ACCESS YOUR GES PROMOTION TRIAL EXAM PORTAL'}
                        </p>
                    </div>

                    {err && (
                        <div className="mt-5 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700" role="alert">
                            {err}
                        </div>
                    )}

                    <form onSubmit={submit} className="mt-6 space-y-4">
                        {mode === 'register' && (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                                    Full Name (Candidate) <span className="text-red-500">*</span>
                                </span>
                                <input
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Kwaku Mensah Addo"
                                    autoComplete="name"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#364c83] focus:bg-white focus:ring-2 focus:ring-[#364c83]/15"
                                />
                            </label>
                        )}

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                                Candidate Email Address <span className="text-red-500">*</span>
                            </span>
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@ges.gov.gh"
                                autoComplete="email"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#364c83] focus:bg-white focus:ring-2 focus:ring-[#364c83]/15"
                            />
                        </label>

                        {mode === 'register' && (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                                    Ghana Region <span className="text-red-500">*</span>
                                </span>
                                <select
                                    required
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#364c83] focus:bg-white focus:ring-2 focus:ring-[#364c83]/15"
                                >
                                    <option value="" disabled>
                                        Select Your Region in Ghana...
                                    </option>
                                    {GHANA_REGIONS.map((reg) => (
                                        <option key={reg} value={reg}>
                                            {reg}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                                Candidate Password <span className="text-red-500">*</span>
                            </span>
                            <div className="relative">
                                <input
                                    required
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-4 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#364c83] focus:bg-white focus:ring-2 focus:ring-[#364c83]/15"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg bg-slate-200/70 p-1.5 text-slate-600 transition hover:bg-slate-300/70"
                                >
                                    {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                            </div>
                        </label>

                        {mode === 'register' && (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                                    Eligible Promotion Rank <span className="text-red-500">*</span>
                                </span>
                                <select
                                    required
                                    value={promotionRank}
                                    onChange={(e) => setPromotionRank(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#364c83] focus:bg-white focus:ring-2 focus:ring-[#364c83]/15"
                                >
                                    <option value="" disabled>
                                        Select Your Promotion Trial Examination Rank...
                                    </option>
                                    {PROMOTION_RANKS.map((rk) => (
                                        <option key={rk} value={rk}>
                                            {rk}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#364c83] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1f2d57] disabled:opacity-50"
                        >
                            {busy && <Loader2 className="animate-spin" size={16} />}
                            {mode === 'register' ? 'Register Account & Launch Portal →' : 'Sign In & Launch Portal →'}
                        </button>
                    </form>

                    <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                        {mode === 'register' ? (
                            <>
                                Already registered for GES Promotion?{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('login');
                                        setErr('');
                                    }}
                                    className="font-semibold text-[#364c83] hover:underline"
                                >
                                    Sign in here
                                </button>
                            </>
                        ) : (
                            <>
                                Need to create a candidate account?{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('register');
                                        setErr('');
                                    }}
                                    className="font-semibold text-[#364c83] hover:underline"
                                >
                                    Register Account
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-md py-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                        <GraduationCap size={22} />
                    </div>
                    <div className="flex rounded-lg bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => {
                                setMode('login');
                                setErr('');
                            }}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('register');
                                setErr('');
                            }}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Register
                        </button>
                    </div>
                </div>

                <h2 className="mt-4 text-xl font-bold text-slate-900">
                    {mode === 'login' ? 'Sign in to ExamHub' : 'Create your ExamHub account'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    {mode === 'login'
                        ? 'Enter your registered email and password to access exams and track your scores.'
                        : 'Register with your details below to start practising exams on ExamHub.'}
                </p>

                {err && (
                    <div className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700" role="alert">
                        {err}
                    </div>
                )}

                <form onSubmit={submit} className="mt-5 space-y-4">
                    {mode === 'register' && (
                        <Field label="Full Name">
                            <input
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Kofi Mensah"
                                autoComplete="name"
                                className="input"
                            />
                        </Field>
                    )}

                    <Field label="Email Address">
                        <input
                            required
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="e.g. kofi@example.com"
                            autoComplete="email"
                            className="input"
                        />
                    </Field>

                    {mode === 'register' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                                <Field label="School Name">
                                    <input
                                        required
                                        value={schoolName}
                                        onChange={(e) => setSchoolName(e.target.value)}
                                        placeholder="e.g. Achimota Basic School"
                                        className="input"
                                    />
                                </Field>
                            </div>
                            <div>
                                <Field label="Grade Level">
                                    <select
                                        value={gradeLevel}
                                        onChange={(e) => setGradeLevel(Number(e.target.value))}
                                        className="input"
                                    >
                                        {SCHOOL_LEVELS.map((lvl) => (
                                            <option key={lvl} value={lvl}>
                                                Basic {lvl}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                        </div>
                    )}

                    <Field label={mode === 'register' ? 'Password (min. 6 characters)' : 'Password'}>
                        <input
                            required
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                            className="input"
                        />
                    </Field>

                    <button
                        type="submit"
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#364c83] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f2d57] disabled:opacity-50"
                    >
                        {busy && <Loader2 className="animate-spin" size={16} />}
                        {mode === 'login' ? 'Sign in to ExamHub' : 'Create account & continue'}
                    </button>
                </form>

                <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                    {mode === 'login' ? (
                        <>
                            Don&apos;t have an account yet?{' '}
                            <button
                                type="button"
                                onClick={() => {
                                    setMode('register');
                                    setErr('');
                                }}
                                className="font-semibold text-[#364c83] hover:underline"
                            >
                                Register now
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={() => {
                                    setMode('login');
                                    setErr('');
                                }}
                                className="font-semibold text-[#364c83] hover:underline"
                            >
                                Sign in
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Student Exam Interface                                              */
/* ------------------------------------------------------------------ */

function StudentView({
    user,
    token,
    initialLevel,
}: {
    user: StudentUser;
    token: string;
    initialLevel: Level | null;
}) {
    const [stage, setStage] = useState<'select' | 'exam' | 'result'>('select');
    const [level, setLevel] = useState<Level>(initialLevel ?? user.gradeLevel);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState('');
    const [starting, setStarting] = useState<string | null>(null);

    const [subject, setSubject] = useState<Subject | null>(null);
    const [questions, setQuestions] = useState<ExamQ[]>([]);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [index, setIndex] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ score: number; total: number; percent: number; review: ReviewItem[] } | null>(null);

    const loadCatalog = useCallback(async () => {
        const s = await api.get('/api/subjects');
        setSubjects(s.data.subjects);
        const c = await api.get('/api/counts');
        setCounts(c.data.counts);
    }, []);

    useEffect(() => {
        (async () => {
            try {
                await loadCatalog();
            } catch {
                setNotice('Could not load exams. Please refresh.');
            } finally {
                setLoading(false);
            }
        })();
    }, [loadCatalog]);

    const startExam = async (s: Subject) => {
        if (level === null) return;
        setNotice('');
        setStarting(s.id);
        try {
            const res = await api.get(`/api/exam/${level}/${s.id}`);
            const qs: ExamQ[] = res.data.questions;
            if (qs.length === 0) {
                setNotice('There are no questions for this section and subject yet.');
                return;
            }
            setSubject(s);
            setQuestions(qs);
            setAnswers({});
            setIndex(0);
            setResult(null);
            setStage('exam');
        } catch (e) {
            setNotice(errMsg(e, 'Could not start the exam.'));
        } finally {
            setStarting(null);
        }
    };

    const submitExam = async () => {
        const unanswered = questions.filter((q) => answers[q.id] === undefined).length;
        if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
        if (!subject || level === null) return;
        setSubmitting(true);
        try {
            const res = await api.post('/api/exam/submit', {
                token,
                studentName: user.name,
                schoolName: user.schoolName,
                studentEmail: user.email,
                level,
                subjectId: subject.id,
                answers,
            });
            setResult(res.data);
            setStage('result');
            window.scrollTo({ top: 0 });
            loadCatalog().catch(() => undefined);
        } catch (e) {
            setNotice(errMsg(e, 'Could not submit the exam. Please try again.'));
        } finally {
            setSubmitting(false);
        }
    };

    const backToStart = () => {
        setStage('select');
        setSubject(null);
        setQuestions([]);
        setAnswers({});
        setResult(null);
        setNotice('');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
                <Loader2 className="animate-spin" size={18} />
                Loading...
            </div>
        );
    }

    /* ---------------- Exam ---------------- */
    if (stage === 'exam' && subject && level !== null) {
        const q = questions[index];
        const isLast = index === questions.length - 1;
        const answered = questions.filter((x) => answers[x.id] !== undefined).length;
        return (
            <div className="mx-auto max-w-2xl">
                <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-[#364c83]">
                        <SubjectIcon name={subject.name} size={16} />
                        {subject.name} &middot; {levelLabel(level)}
                    </span>
                    <span className="text-slate-500">
                        {answered}/{questions.length} answered
                    </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                        className="h-full rounded-full bg-[#364c83] transition-all"
                        style={{ width: `${((index + 1) / questions.length) * 100}%` }}
                    />
                </div>

                {notice && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Question {index + 1} of {questions.length}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-900">{q.text}</h2>
                    <div className="mt-4 space-y-2.5">
                        {q.options.map((opt, i) => {
                            const selected = answers[q.id] === i;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i }))}
                                    className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition ${
                                        selected
                                            ? 'border-[#364c83] bg-indigo-50 text-slate-900'
                                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    <span
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                            selected ? 'bg-[#364c83] text-white' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {LETTERS[i]}
                                    </span>
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                    {questions.map((x, i) => (
                        <button
                            key={x.id}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`Go to question ${i + 1}`}
                            className={`h-8 w-8 rounded-md text-xs font-medium transition ${
                                i === index
                                    ? 'bg-[#364c83] text-white'
                                    : answers[x.id] !== undefined
                                    ? 'bg-indigo-100 text-[#364c83]'
                                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
                            }`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>

                <div className="mt-5 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                        disabled={index === 0}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                        <ChevronLeft size={16} />
                        Previous
                    </button>
                    {isLast ? (
                        <button
                            type="button"
                            onClick={submitExam}
                            disabled={submitting}
                            className="flex items-center gap-2 rounded-lg bg-[#364c83] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f2d57] disabled:opacity-60"
                        >
                            {submitting && <Loader2 className="animate-spin" size={15} />}
                            Submit exam
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                            className="flex items-center gap-1 rounded-lg bg-[#364c83] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#1f2d57]"
                        >
                            Next
                            <ChevronRight size={16} />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    /* ---------------- Result ---------------- */
    if (stage === 'result' && result && subject && level !== null) {
        const msg =
            result.percent >= 70 ? 'Excellent work!' : result.percent >= 50 ? 'Good effort, keep going!' : 'Keep practising, you will improve.';
        const reviewById = new Map(result.review.map((r) => [r.id, r]));
        return (
            <div className="mx-auto max-w-2xl">
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-[#364c83]">
                        <Trophy size={22} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">
                        {user.name} ({user.schoolName}) &middot; {subject.name} &middot; {levelLabel(level)}
                    </p>
                    <p className="mt-1 text-4xl font-bold text-slate-900">
                        {result.score}/{result.total}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#364c83]">{result.percent}%</p>
                    <p className="mt-2 text-sm text-slate-600">{msg}</p>
                    <button
                        type="button"
                        onClick={backToStart}
                        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#364c83] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f2d57]"
                    >
                        <RotateCcw size={15} />
                        Take another exam
                    </button>
                </div>

                <h3 className="mt-8 text-sm font-semibold text-slate-900">Review your answers</h3>
                <div className="mt-3 space-y-3">
                    {questions.map((q, i) => {
                        const r = reviewById.get(q.id);
                        if (!r) return null;
                        return (
                            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex items-start gap-2">
                                    {r.correct ? (
                                        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={17} />
                                    ) : (
                                        <XCircle className="mt-0.5 shrink-0 text-red-500" size={17} />
                                    )}
                                    <p className="text-sm font-medium text-slate-900">
                                        {i + 1}. {q.text}
                                    </p>
                                </div>
                                <div className="mt-2.5 space-y-1.5 pl-6">
                                    {q.options.map((opt, oi) => {
                                        const isCorrect = oi === r.correctIndex;
                                        const isChosenWrong = oi === r.chosen && !r.correct;
                                        return (
                                            <p
                                                key={oi}
                                                className={`rounded-md px-2.5 py-1.5 text-sm ${
                                                    isCorrect
                                                        ? 'bg-emerald-50 font-medium text-emerald-800'
                                                        : isChosenWrong
                                                        ? 'bg-red-50 text-red-700'
                                                        : 'text-slate-500'
                                                }`}
                                            >
                                                {LETTERS[oi]}. {opt}
                                                {isCorrect && ' (correct)'}
                                                {isChosenWrong && ' (your answer)'}
                                            </p>
                                        );
                                    })}
                                    {r.chosen === null && <p className="text-xs text-amber-600">Not answered</p>}
                                    {r.explanation && <p className="pt-1 text-xs text-slate-500">{r.explanation}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    /* ---------------- Select ---------------- */
    const isTrackSection = typeof level === 'string' && EXAM_TRACKS.some((t) => t.id === level);

    return (
        <div className="mx-auto max-w-2xl">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {isTrackSection ? `${levelLabel(level)} Practice` : 'Basic 4 to 9 Exams'}
                        </h2>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                            <School size={14} className="text-slate-400" />
                            Signed in as <strong className="text-slate-700">{user.name}</strong> &middot; {user.schoolName}
                        </p>
                    </div>
                </div>

                {!isTrackSection && (
                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <span className="mb-2 block text-xs font-medium text-slate-600">
                            School level (your registered grade is Basic {user.gradeLevel})
                        </span>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {SCHOOL_LEVELS.map((l) => (
                                <LevelButton
                                    key={String(l)}
                                    l={l}
                                    active={level === l}
                                    onPick={() => {
                                        setLevel(l);
                                        setNotice('');
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {notice && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

            {level !== null && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-900">Choose a {levelLabel(level)} subject to start</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {subjects.map((s) => {
                            const count = counts[`${s.id}|${level}`] || 0;
                            const disabled = count === 0 || starting !== null;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => startExam(s)}
                                    disabled={disabled}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#364c83] hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:shadow-none"
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                                        {starting === s.id ? <Loader2 className="animate-spin" size={18} /> : <SubjectIcon name={s.name} />}
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                                        <span className="block text-xs text-slate-500">
                                            {count === 0 ? 'No questions yet' : `${count} question${count === 1 ? '' : 's'}`}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function LevelButton({ l, active, onPick }: { l: Level; active: boolean; onPick: () => void }) {
    return (
        <button
            type="button"
            onClick={onPick}
            className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                active
                    ? 'border-[#364c83] bg-[#364c83] text-white'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
            {levelLabel(l)}
        </button>
    );
}

function LevelOptions() {
    return (
        <>
            <optgroup label="School levels">
                {SCHOOL_LEVELS.map((l) => (
                    <option key={String(l)} value={String(l)}>
                        {levelLabel(l)}
                    </option>
                ))}
            </optgroup>
            <optgroup label="Exam sections">
                {EXAM_TRACKS.map((t) => (
                    <option key={t.id} value={t.id}>
                        {t.label}
                    </option>
                ))}
            </optgroup>
        </>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
            {children}
        </label>
    );
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

function AdminView() {
    const [status, setStatus] = useState<'loading' | 'setup' | 'login' | 'in'>('loading');
    const [code, setCode] = useState('');
    const [input, setInput] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.get('/api/admin/status')
            .then((r) => setStatus(r.data.configured ? 'login' : 'setup'))
            .catch(() => setErr('Could not reach the server. Please refresh.'));
    }, []);

    const handleAuth = async (e: FormEvent) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
            if (status === 'setup') {
                await api.post('/api/admin/setup', { passcode: input.trim() });
            } else {
                await api.post('/api/admin/login', { passcode: input.trim() });
            }
            setCode(input.trim());
            setInput('');
            setStatus('in');
        } catch (e2) {
            setErr(errMsg(e2, 'Could not sign in.'));
        } finally {
            setBusy(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
                {err ? (
                    <span className="text-red-600">{err}</span>
                ) : (
                    <>
                        <Loader2 className="animate-spin" size={18} />
                        Loading...
                    </>
                )}
            </div>
        );
    }

    if (status !== 'in') {
        return (
            <div className="mx-auto max-w-sm">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                        <Lock size={18} />
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-slate-900">
                        {status === 'setup' ? 'Create admin passcode' : 'Admin sign in'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {status === 'setup'
                            ? 'This is the first run. Choose a passcode (at least 4 characters) to protect the admin area.'
                            : 'Enter the admin passcode to manage subjects, questions and results.'}
                    </p>
                    <form onSubmit={handleAuth} className="mt-4 space-y-3">
                        <input
                            type="password"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Passcode"
                            className="input"
                        />
                        {err && <p className="text-sm text-red-600">{err}</p>}
                        <button
                            type="submit"
                            disabled={busy || !input.trim()}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#364c83] py-2.5 text-sm font-medium text-white hover:bg-[#1f2d57] disabled:opacity-50"
                        >
                            {busy && <Loader2 className="animate-spin" size={15} />}
                            {status === 'setup' ? 'Create passcode' : 'Sign in'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <AdminPanel
            code={code}
            onLogout={() => {
                setCode('');
                setStatus('login');
            }}
        />
    );
}

type AdminTab = 'questions' | 'subjects' | 'results';

function AdminPanel({ code, onLogout }: { code: string; onLogout: () => void }) {
    const [tab, setTab] = useState<AdminTab>('questions');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [questions, setQuestions] = useState<AdminQ[]>([]);
    const [results, setResults] = useState<ResultRow[]>([]);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const flash = useCallback((ok: boolean, text: string) => {
        setMsg({ ok, text });
        window.setTimeout(() => setMsg(null), 3500);
    }, []);

    const loadSubjects = useCallback(async () => {
        const r = await api.get('/api/subjects');
        setSubjects(r.data.subjects);
    }, []);

    const loadQuestions = useCallback(async () => {
        const r = await api.post('/api/admin/questions/list', { passcode: code });
        setQuestions(r.data.questions);
    }, [code]);

    const loadResults = useCallback(async () => {
        const r = await api.post('/api/admin/results', { passcode: code });
        setResults(r.data.results);
    }, [code]);

    useEffect(() => {
        (async () => {
            try {
                await loadSubjects();
                await Promise.all([loadQuestions(), loadResults()]);
            } catch (e) {
                flash(false, errMsg(e, 'Could not load admin data.'));
            }
        })();
    }, [loadSubjects, loadQuestions, loadResults, flash]);

    const tabs: { id: AdminTab; label: string }[] = [
        { id: 'questions', label: 'Questions' },
        { id: 'subjects', label: 'Subjects' },
        { id: 'results', label: 'Results' },
    ];

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onLogout}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                    <LogOut size={13} />
                    Sign out
                </button>
            </div>

            {msg && (
                <p
                    className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                        msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                >
                    {msg.text}
                </p>
            )}

            <div className="mt-6">
                {tab === 'questions' && (
                    <QuestionsAdmin code={code} subjects={subjects} questions={questions} reload={loadQuestions} flash={flash} />
                )}
                {tab === 'subjects' && (
                    <SubjectsAdmin
                        code={code}
                        subjects={subjects}
                        questions={questions}
                        reloadSubjects={loadSubjects}
                        reloadQuestions={loadQuestions}
                        flash={flash}
                    />
                )}
                {tab === 'results' && <ResultsAdmin results={results} reload={loadResults} flash={flash} />}
            </div>
        </div>
    );
}

type Flash = (ok: boolean, text: string) => void;

function SubjectsAdmin({
    code,
    subjects,
    questions,
    reloadSubjects,
    reloadQuestions,
    flash,
}: {
    code: string;
    subjects: Subject[];
    questions: AdminQ[];
    reloadSubjects: () => Promise<void>;
    reloadQuestions: () => Promise<void>;
    flash: Flash;
}) {
    const [name, setName] = useState('');
    const [adding, setAdding] = useState(false);

    const add = async (e: FormEvent) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        setAdding(true);
        try {
            await api.post('/api/admin/subjects', { passcode: code, name: n });
            setName('');
            await reloadSubjects();
            flash(true, `"${n}" added.`);
        } catch (e2) {
            flash(false, errMsg(e2, 'Could not add subject.'));
        } finally {
            setAdding(false);
        }
    };

    const remove = async (s: Subject) => {
        const n = questions.filter((q) => q.subjectId === s.id).length;
        if (!window.confirm(`Delete "${s.name}" and its ${n} question(s)? This cannot be undone.`)) return;
        try {
            await api.post(`/api/admin/subjects/${s.id}/delete`, { passcode: code });
            await Promise.all([reloadSubjects(), reloadQuestions()]);
            flash(true, `"${s.name}" deleted.`);
        } catch (e2) {
            flash(false, errMsg(e2, 'Could not delete subject.'));
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Subjects</h2>
            <form onSubmit={add} className="mt-3 flex gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Add a subject, e.g. History"
                    className="input flex-1"
                />
                <button
                    type="submit"
                    disabled={adding || !name.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-[#364c83] px-3.5 text-sm font-medium text-white hover:bg-[#1f2d57] disabled:opacity-50"
                >
                    <Plus size={15} />
                    Add
                </button>
            </form>
            <div className="mt-4 divide-y divide-slate-100">
                {subjects.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5">
                        <span className="flex items-center gap-2.5 text-sm font-medium text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                                <SubjectIcon name={s.name} size={16} />
                            </span>
                            {s.name}
                            <span className="text-xs font-normal text-slate-400">
                                {questions.filter((q) => q.subjectId === s.id).length} questions
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={() => remove(s)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete ${s.name}`}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}
                {subjects.length === 0 && <p className="py-3 text-sm text-slate-400">No subjects yet.</p>}
            </div>
        </section>
    );
}

function belongsToCategory(qLevel: Level, trackCode: string | null): boolean {
    if (trackCode === null) {
        return typeof qLevel === 'number' && SCHOOL_LEVELS.includes(qLevel);
    }
    return qLevel === trackCode;
}

function QuestionsAdmin({
    code,
    subjects,
    questions,
    reload,
    flash,
}: {
    code: string;
    subjects: Subject[];
    questions: AdminQ[];
    reload: () => Promise<void>;
    flash: Flash;
}) {
    const [selectedTrackSlug, setSelectedTrackSlug] = useState<string | null>(null);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

    // Add question form state
    const [subjectId, setSubjectId] = useState('');
    const [level, setLevel] = useState<Level>(4);
    const [text, setText] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correct, setCorrect] = useState(0);
    const [explanation, setExplanation] = useState('');
    const [saving, setSaving] = useState(false);

    // Filter state inside a subject portal (for Basic 4-9 class levels)
    const [fLevel, setFLevel] = useState<'all' | Level>('all');

    // Edit / Update existing question state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editSubjectId, setEditSubjectId] = useState('');
    const [editLevel, setEditLevel] = useState<Level>(4);
    const [editText, setEditText] = useState('');
    const [editOptions, setEditOptions] = useState(['', '', '', '']);
    const [editCorrect, setEditCorrect] = useState(0);
    const [editExplanation, setEditExplanation] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (!subjectId && subjects.length > 0) setSubjectId(subjects[0].id);
    }, [subjects, subjectId]);

    const activeTrack = TRACKS.find((t) => t.slug === selectedTrackSlug) || null;
    const activeSubject = subjects.find((s) => s.id === selectedSubjectId) || null;

    const openTrackSubjects = (slug: string) => {
        const track = TRACKS.find((t) => t.slug === slug);
        if (!track) return;
        setSelectedTrackSlug(slug);
        setSelectedSubjectId(null);
        setEditingId(null);
        if (track.code === null) {
            setLevel(4);
            setFLevel('all');
        } else {
            setLevel(track.code);
            setFLevel(track.code);
        }
    };

    const openSubjectPortal = (subjId: string) => {
        setSelectedSubjectId(subjId);
        setSubjectId(subjId);
        setEditingId(null);
        if (activeTrack) {
            if (activeTrack.code === null) {
                setLevel(4);
                setFLevel('all');
            } else {
                setLevel(activeTrack.code);
                setFLevel(activeTrack.code);
            }
        }
    };

    const startEditing = (q: AdminQ) => {
        setEditingId(q.id);
        setEditSubjectId(q.subjectId);
        setEditLevel(q.level);
        setEditText(q.text);
        setEditOptions([...q.options]);
        setEditCorrect(q.correctIndex);
        setEditExplanation(q.explanation || '');
    };

    const cancelEditing = () => {
        setEditingId(null);
    };

    const save = async (e: FormEvent) => {
        e.preventDefault();
        const targetSubjectId = activeSubject ? activeSubject.id : subjectId;
        if (!targetSubjectId || !text.trim() || options.some((o) => !o.trim())) {
            flash(false, 'Fill in the question and all four answer options.');
            return;
        }
        setSaving(true);
        try {
            await api.post('/api/admin/questions', {
                passcode: code,
                subjectId: targetSubjectId,
                level,
                text: text.trim(),
                options: options.map((o) => o.trim()),
                correctIndex: correct,
                explanation: explanation.trim(),
            });
            setText('');
            setOptions(['', '', '', '']);
            setCorrect(0);
            setExplanation('');
            await reload();
            flash(true, 'Question added.');
        } catch (e2) {
            flash(false, errMsg(e2, 'Could not add question.'));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateQuestion = async (e: FormEvent, qId: string) => {
        e.preventDefault();
        if (!editSubjectId || !editText.trim() || editOptions.some((o) => !o.trim())) {
            flash(false, 'Fill in the question and all four answer options.');
            return;
        }
        setUpdating(true);
        try {
            await api.post(`/api/admin/questions/${qId}/update`, {
                passcode: code,
                subjectId: editSubjectId,
                level: editLevel,
                text: editText.trim(),
                options: editOptions.map((o) => o.trim()),
                correctIndex: editCorrect,
                explanation: editExplanation.trim(),
            });
            setEditingId(null);
            await reload();
            flash(true, 'Question updated.');
        } catch (e2) {
            flash(false, errMsg(e2, 'Could not update question.'));
        } finally {
            setUpdating(false);
        }
    };

    const remove = async (q: AdminQ) => {
        if (!window.confirm('Delete this question?')) return;
        try {
            await api.post(`/api/admin/questions/${q.id}/delete`, { passcode: code });
            if (editingId === q.id) setEditingId(null);
            await reload();
            flash(true, 'Question deleted.');
        } catch (e2) {
            flash(false, errMsg(e2, 'Could not delete question.'));
        }
    };

    const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || 'Unknown';

    /* ---------------- Step 1: Exam Category Cards View ---------------- */
    if (!activeTrack) {
        return (
            <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-bold text-slate-900">Select an Exam Category</h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Choose an examination category card below to view its subject cards, then open any subject portal to set and update questions.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TRACKS.map((t) => {
                        const catQuestions = questions.filter((q) => belongsToCategory(q.level, t.code));
                        const badgeText = t.code === null ? 'Basic 4 – Basic 9' : t.code;

                        return (
                            <button
                                key={t.slug}
                                type="button"
                                onClick={() => openTrackSubjects(t.slug)}
                                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#364c83] hover:shadow-md"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83] transition-colors group-hover:bg-[#364c83] group-hover:text-white">
                                            {t.slug === 'basic' ? (
                                                <School size={20} />
                                            ) : t.slug === 'gtle' || t.slug === 'ges-promotion' ? (
                                                <ClipboardCheck size={20} />
                                            ) : (
                                                <GraduationCap size={20} />
                                            )}
                                        </span>
                                        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                                            {badgeText}
                                        </span>
                                    </div>

                                    <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-[#364c83]">
                                        {t.label}
                                    </h3>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.lead}</p>
                                </div>

                                <div className="mt-5 border-t border-slate-100 pt-3.5">
                                    <div className="flex items-center justify-between text-xs text-slate-500">
                                        <span>
                                            <strong className="font-semibold text-slate-800">{subjects.length}</strong>{' '}
                                            subject card{subjects.length === 1 ? '' : 's'}
                                        </span>
                                        <span>
                                            <strong className="font-semibold text-slate-800">{catQuestions.length}</strong>{' '}
                                            question{catQuestions.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#364c83]">
                                        <span>View {t.label} subjects</span>
                                        <ChevronRight
                                            size={15}
                                            className="transition-transform group-hover:translate-x-1"
                                        />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    const isBasicPortal = activeTrack.code === null;
    const categoryQuestions = questions.filter((q) => belongsToCategory(q.level, activeTrack.code));

    /* ---------------- Step 2: Subject Cards View under Selected Exam Category ---------------- */
    if (!activeSubject) {
        const badgeText = activeTrack.code === null ? 'Basic 4 – Basic 9' : activeTrack.code;

        return (
            <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedTrackSlug(null);
                                setSelectedSubjectId(null);
                                setEditingId(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#364c83] hover:bg-white hover:text-[#364c83]"
                        >
                            <ArrowLeft size={14} />
                            All Exam Categories
                        </button>

                        <div className="flex flex-wrap gap-1.5">
                            {TRACKS.map((t) => {
                                const active = t.slug === activeTrack.slug;
                                return (
                                    <button
                                        key={t.slug}
                                        type="button"
                                        onClick={() => openTrackSubjects(t.slug)}
                                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                                            active
                                                ? 'bg-[#364c83] text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                                {activeTrack.label} &middot; Select a Subject
                            </span>
                            <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                                {activeTrack.label} Subject Cards
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Click any subject card below to open its dedicated {activeTrack.label} portal to set new questions and update existing questions.
                            </p>
                        </div>
                        <div className="rounded-lg bg-indigo-50 px-3.5 py-2 text-right">
                            <span className="block text-lg font-bold text-[#364c83]">{categoryQuestions.length}</span>
                            <span className="block text-[11px] font-medium text-slate-600">
                                Total {activeTrack.label} Questions
                            </span>
                        </div>
                    </div>
                </div>

                {subjects.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                        No subjects available yet. Add a subject in the <strong>Subjects</strong> tab first.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {subjects.map((s) => {
                            const subjQuestions = categoryQuestions.filter((q) => q.subjectId === s.id);
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => openSubjectPortal(s.id)}
                                    className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#364c83] hover:shadow-md"
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83] transition-colors group-hover:bg-[#364c83] group-hover:text-white">
                                                <SubjectIcon name={s.name} size={20} />
                                            </span>
                                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                                                {badgeText}
                                            </span>
                                        </div>

                                        <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-[#364c83]">
                                            {s.name}
                                        </h3>
                                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                            Manage {activeTrack.label} questions, answer options, and explanations for {s.name}.
                                        </p>
                                    </div>

                                    <div className="mt-5 border-t border-slate-100 pt-3.5">
                                        <div className="flex items-center justify-between text-xs text-slate-500">
                                            <span>
                                                <strong className="font-semibold text-slate-800">{subjQuestions.length}</strong>{' '}
                                                question{subjQuestions.length === 1 ? '' : 's'} in {activeTrack.label}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#364c83]">
                                            <span>Open portal to set &amp; update questions</span>
                                            <ChevronRight
                                                size={15}
                                                className="transition-transform group-hover:translate-x-1"
                                            />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    /* ---------------- Step 3: Dedicated Subject + Category Portal View ---------------- */
    const subjectCategoryQuestions = categoryQuestions.filter((q) => q.subjectId === activeSubject.id);
    const shown = subjectCategoryQuestions.filter((q) =>
        isBasicPortal ? fLevel === 'all' || q.level === fLevel : true
    );

    return (
        <div className="space-y-6">
            {/* Portal Header & Subject Switcher */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSubjectId(null);
                                setEditingId(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#364c83] hover:bg-white hover:text-[#364c83]"
                        >
                            <ArrowLeft size={14} />
                            {activeTrack.label} Subject Cards
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedTrackSlug(null);
                                setSelectedSubjectId(null);
                                setEditingId(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                        >
                            All Exam Categories
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {subjects.map((s) => {
                            const active = s.id === activeSubject.id;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => openSubjectPortal(s.id)}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                                        active
                                            ? 'bg-[#364c83] text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {s.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                            <SubjectIcon name={activeSubject.name} size={22} />
                        </span>
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                                {activeTrack.label} &middot; Dedicated Subject Portal
                            </span>
                            <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                                {activeSubject.name} ({activeTrack.label})
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Set new {activeSubject.name} questions and update existing questions for {activeTrack.label}.
                            </p>
                        </div>
                    </div>
                    <div className="rounded-lg bg-indigo-50 px-3.5 py-2 text-right">
                        <span className="block text-lg font-bold text-[#364c83]">{subjectCategoryQuestions.length}</span>
                        <span className="block text-[11px] font-medium text-slate-600">
                            {activeSubject.name} Questions
                        </span>
                    </div>
                </div>
            </div>

            {/* Set / Add a Question Form */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                    Set a new {activeSubject.name} question ({activeTrack.label})
                </h2>
                <form onSubmit={save} className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Subject">
                            <input
                                type="text"
                                value={activeSubject.name}
                                disabled
                                className="input cursor-not-allowed bg-slate-50 font-medium text-slate-600"
                            />
                        </Field>
                        {isBasicPortal ? (
                            <Field label="Class Level (Basic 4 to 9)">
                                <select
                                    value={String(level)}
                                    onChange={(e) => setLevel(parseLevel(e.target.value))}
                                    className="input"
                                >
                                    {SCHOOL_LEVELS.map((l) => (
                                        <option key={l} value={String(l)}>
                                            {levelLabel(l)}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ) : (
                            <Field label="Exam Section">
                                <input
                                    type="text"
                                    value={activeTrack.label}
                                    disabled
                                    className="input cursor-not-allowed bg-slate-50 font-medium text-slate-600"
                                />
                            </Field>
                        )}
                    </div>
                    <Field label="Question">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={2}
                            placeholder={`Type the ${activeSubject.name} (${activeTrack.label}) question here`}
                            className="input"
                        />
                    </Field>
                    <div>
                        <span className="mb-1.5 block text-xs font-medium text-slate-600">
                            Answer options (select the correct one)
                        </span>
                        <div className="space-y-2">
                            {options.map((o, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="correct-option"
                                        checked={correct === i}
                                        onChange={() => setCorrect(i)}
                                        aria-label={`Option ${LETTERS[i]} is correct`}
                                        className="h-4 w-4 accent-[#364c83]"
                                    />
                                    <span className="w-4 text-xs font-semibold text-slate-400">{LETTERS[i]}</span>
                                    <input
                                        value={o}
                                        onChange={(e) =>
                                            setOptions((prev) => prev.map((p, pi) => (pi === i ? e.target.value : p)))
                                        }
                                        placeholder={`Option ${LETTERS[i]}`}
                                        className="input"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <Field label="Explanation (optional, shown after the exam)">
                        <input value={explanation} onChange={(e) => setExplanation(e.target.value)} className="input" />
                    </Field>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-[#364c83] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f2d57] disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                        Add question
                    </button>
                </form>
            </section>

            {/* Question Bank with Edit / Update & Delete */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900">
                            {activeSubject.name} &middot; {activeTrack.label} Question Bank ({shown.length})
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Click <strong>Edit</strong> on any question below to update its text, options, correct answer, or explanation.
                        </p>
                    </div>
                    {isBasicPortal && (
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={String(fLevel)}
                                onChange={(e) => setFLevel(e.target.value === 'all' ? 'all' : parseLevel(e.target.value))}
                                className="input !w-auto"
                            >
                                <option value="all">All Basic 4–9 levels</option>
                                {SCHOOL_LEVELS.map((l) => (
                                    <option key={l} value={String(l)}>
                                        {levelLabel(l)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="mt-4 space-y-3">
                    {shown.map((q) => {
                        const isEditing = editingId === q.id;

                        if (isEditing) {
                            return (
                                <form
                                    key={q.id}
                                    onSubmit={(e) => handleUpdateQuestion(e, q.id)}
                                    className="rounded-xl border-2 border-[#364c83] bg-indigo-50/30 p-4 space-y-4"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#364c83]">
                                            <Pencil size={13} />
                                            Updating Question
                                        </span>
                                        <button
                                            type="button"
                                            onClick={cancelEditing}
                                            className="text-xs font-medium text-slate-500 hover:text-slate-800"
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <Field label="Subject">
                                            <select
                                                value={editSubjectId}
                                                onChange={(e) => setEditSubjectId(e.target.value)}
                                                className="input bg-white"
                                            >
                                                {subjects.map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="Level or exam section">
                                            <select
                                                value={String(editLevel)}
                                                onChange={(e) => setEditLevel(parseLevel(e.target.value))}
                                                className="input bg-white"
                                            >
                                                <LevelOptions />
                                            </select>
                                        </Field>
                                    </div>

                                    <Field label="Question">
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            rows={2}
                                            className="input bg-white"
                                        />
                                    </Field>

                                    <div>
                                        <span className="mb-1.5 block text-xs font-medium text-slate-600">
                                            Answer options (select the correct one)
                                        </span>
                                        <div className="space-y-2">
                                            {editOptions.map((o, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name={`edit-correct-${q.id}`}
                                                        checked={editCorrect === i}
                                                        onChange={() => setEditCorrect(i)}
                                                        className="h-4 w-4 accent-[#364c83]"
                                                    />
                                                    <span className="w-4 text-xs font-semibold text-slate-500">
                                                        {LETTERS[i]}
                                                    </span>
                                                    <input
                                                        value={o}
                                                        onChange={(e) =>
                                                            setEditOptions((prev) =>
                                                                prev.map((p, pi) => (pi === i ? e.target.value : p))
                                                            )
                                                        }
                                                        className="input bg-white"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Field label="Explanation (optional, shown after the exam)">
                                        <input
                                            value={editExplanation}
                                            onChange={(e) => setEditExplanation(e.target.value)}
                                            className="input bg-white"
                                        />
                                    </Field>

                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="submit"
                                            disabled={updating}
                                            className="flex items-center gap-1.5 rounded-lg bg-[#364c83] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1f2d57] disabled:opacity-50"
                                        >
                                            {updating ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                                            Update question
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancelEditing}
                                            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            );
                        }

                        return (
                            <div key={q.id} className="rounded-lg border border-slate-200 p-3.5 transition hover:border-slate-300">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium text-[#364c83]">
                                            {subjectName(q.subjectId)} &middot; {levelLabel(q.level)}
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">{q.text}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => startEditing(q)}
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[#364c83] hover:bg-indigo-50 hover:text-[#364c83]"
                                            aria-label="Edit question"
                                        >
                                            <Pencil size={13} />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(q)}
                                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            aria-label="Delete question"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                    {q.options.map((o, i) => (
                                        <p
                                            key={i}
                                            className={`rounded px-2 py-1 text-xs ${
                                                i === q.correctIndex
                                                    ? 'bg-emerald-50 font-medium text-emerald-800'
                                                    : 'text-slate-500'
                                            }`}
                                        >
                                            {LETTERS[i]}. {o}
                                        </p>
                                    ))}
                                </div>
                                {q.explanation && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        <strong className="font-medium text-slate-600">Explanation:</strong> {q.explanation}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                    {shown.length === 0 && (
                        <p className="text-sm text-slate-400">
                            No {activeSubject.name} questions in {activeTrack.label} yet. Use the form above to add one.
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
}

function ResultsAdmin({
    results,
    reload,
    flash,
}: {
    results: ResultRow[];
    reload: () => Promise<void>;
    flash: Flash;
}) {
    const refresh = async () => {
        try {
            await reload();
        } catch (e) {
            flash(false, errMsg(e, 'Could not refresh results.'));
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Student results ({results.length})</h2>
                <button
                    type="button"
                    onClick={refresh}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                    <RotateCcw size={13} />
                    Refresh
                </button>
            </div>
            {results.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">No exams have been taken yet.</p>
            ) : (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                                <th className="py-2 pr-3 font-medium">Student</th>
                                <th className="py-2 pr-3 font-medium">School</th>
                                <th className="py-2 pr-3 font-medium">Level</th>
                                <th className="py-2 pr-3 font-medium">Subject</th>
                                <th className="py-2 pr-3 font-medium">Score</th>
                                <th className="py-2 pr-3 font-medium">%</th>
                                <th className="py-2 pr-3 font-medium">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r) => (
                                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                                    <td className="py-2.5 pr-3 font-medium text-slate-900">{r.studentName}</td>
                                    <td className="py-2.5 pr-3 text-slate-500">{r.schoolName || '—'}</td>
                                    <td className="py-2.5 pr-3 text-slate-500">{levelLabel(r.level)}</td>
                                    <td className="py-2.5 pr-3 text-slate-500">{r.subjectName}</td>
                                    <td className="py-2.5 pr-3 text-slate-500">
                                        {r.score}/{r.total}
                                    </td>
                                    <td className="py-2.5 pr-3 text-slate-500">{r.percent}%</td>
                                    <td className="py-2.5 pr-3 text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
