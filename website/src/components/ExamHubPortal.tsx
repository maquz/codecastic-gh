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
    Download,
    Upload,
    FileText,
    FileSpreadsheet,
    FileCode,
    Users,
    Activity,
    TrendingUp,
    Award,
    Search,
    Calendar,
    Clock,
    BarChart3,
    Sparkles,
} from 'lucide-react';

export type Level = number | string;
type Subject = { id: string; name: string };
type ExamQ = {
    id: string;
    text: string;
    options: string[];
    correctIndex?: number;
    explanation?: string;
    year?: string;
    category?: string;
    rank?: string;
};
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

type CandidateRow = {
    id: string;
    name: string;
    email: string;
    accountType: 'ges-promo' | 'student';
    gradeLevel: Level;
    region: string;
    promotionRank: string;
    schoolName: string;
    registeredAt: number;
    examsTaken: number;
    avgPercent: number;
    bestPercent: number;
    lastExamAt: number | null;
    lastSubject: string | null;
    performanceStatus: 'Distinction' | 'Pass' | 'Remedial' | 'Pending';
    recentResults: {
        id: string;
        subjectName: string;
        level: Level;
        score: number;
        total: number;
        percent: number;
        createdAt: number;
    }[];
};

type CandidatesStats = {
    totalCandidates: number;
    totalExams: number;
    overallAverage: number;
    passRate: number;
    distinctionRate: number;
};

type StudentUser = {
    id: string;
    name: string;
    email: string;
    accountType?: 'student' | 'ges-promo';
    schoolName: string;
    gradeLevel: Level;
    region?: string;
    promotionRank?: string;
};

const TOKEN_KEY = 'codecastic_examhub_token';
const SCHOOL_LEVELS: number[] = [4, 5, 6, 7, 8, 9];
const SHS_LEVELS: string[] = ['SHS 1', 'SHS 2', 'SHS 3'];
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
const PROMOTION_RANK_ITEMS: Subject[] = [
    { id: 'rank-ad-ii', name: 'Assistant Director II (AD II)' },
    { id: 'rank-ad-i', name: 'Assistant Director I (AD I)' },
    { id: 'rank-dd', name: 'Deputy Director (DD)' },
    { id: 'rank-dir-ii', name: 'Director II (Dir II)' },
];
const PROMOTION_RANK_CODE_BY_ID: Record<string, string> = {
    'rank-ad-ii': 'AD_II',
    'rank-ad-i': 'AD_I',
    'rank-dd': 'DD',
    'rank-dir-ii': 'DIR_II',
};
const LETTERS = ['A', 'B', 'C', 'D'];

function levelLabel(l: Level): string {
    if (typeof l === 'number') return `Basic ${l}`;
    if (l === 'SHS') return 'SHS 1 - 3';
    if (SHS_LEVELS.includes(String(l))) return String(l);
    return EXAM_TRACKS.find((t) => t.id === l)?.label ?? String(l);
}

function parseLevel(v: string): Level {
    return /^\d+$/.test(v) ? Number(v) : v;
}

function errMsg(e: any, fallback: string): string {
    return e?.response?.data?.error || fallback;
}

function slugForUser(u: StudentUser): string {
    if (u.accountType === 'ges-promo' || u.gradeLevel === 'GES-PROMO') return 'ges-promotion';
    if (u.gradeLevel === 'BECE') return 'bece';
    if (u.gradeLevel === 'SHS' || SHS_LEVELS.includes(String(u.gradeLevel))) return 'shs';
    if (u.gradeLevel === 'WASSCE') return 'wassce';
    if (u.gradeLevel === 'GTLE') return 'gtle';
    return 'basic';
}

function userMatchesSection(u: StudentUser, activeSlug: string): boolean {
    return slugForUser(u) === activeSlug;
}

function SubjectIcon({ name, size = 20 }: { name: string; size?: number }) {
    const n = name.toLowerCase();
    if (n.includes('math')) return <Calculator size={size} />;
    if (n.includes('comput') || n.includes('ict')) return <Monitor size={size} />;
    if (n.includes('sci')) return <FlaskConical size={size} />;
    if (n.includes('eng') || n.includes('lang')) return <Languages size={size} />;
    if (n.includes('prof') || n.includes('teach') || n.includes('director')) return <ClipboardCheck size={size} />;
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
        const targetSlug = slugForUser(newUser);
        if (targetSlug !== activeSlug) {
            window.location.hash = `#/exams/${targetSlug}`;
        }
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

    const requiresAuth = !user || !userMatchesSection(user, activeSlug);
    const visibleTracks =
        tab === 'student' && user && !requiresAuth
            ? TRACKS.filter((t) => t.slug === slugForUser(user))
            : TRACKS;

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
                                            : user.schoolName
                                            ? `${user.schoolName} (${levelLabel(user.gradeLevel)})`
                                            : levelLabel(user.gradeLevel)}
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

                {/* Section Sub-Tabs inside Full-Screen Portal (All Sections removed; locked to user's section once signed in) */}
                <div className="border-t border-slate-100 bg-slate-50/70">
                    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-4 py-2.5 sm:px-6">
                        {visibleTracks.map((t) => {
                            const isCurrent = t.slug === activeSlug;
                            const labelText =
                                tab === 'student' && user && !requiresAuth
                                    ? user.accountType === 'ges-promo'
                                        ? `${t.label} · ${user.promotionRank}`
                                        : typeof user.gradeLevel === 'number'
                                        ? `Basic ${user.gradeLevel}`
                                        : SHS_LEVELS.includes(String(user.gradeLevel))
                                        ? String(user.gradeLevel)
                                        : t.label
                                    : t.label;
                            return (
                                <a
                                    key={t.slug}
                                    href={`#/exams/${t.slug}`}
                                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                                        isCurrent
                                            ? 'bg-[#364c83] text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                    }`}
                                >
                                    {labelText}
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
                        key={`${activeSlug}-auth`}
                        isGesPromo={isGesPromoSection}
                        initialLevel={initialLevel}
                        onAuthenticated={handleAuthenticated}
                    />
                ) : (
                    <StudentView
                        key={`${activeSlug}-${user.id}`}
                        user={user}
                        token={token}
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
    initialLevel,
    onAuthenticated,
}: {
    isGesPromo: boolean;
    initialLevel: Level | null;
    onAuthenticated: (u: StudentUser, token: string) => void;
}) {
    const [mode, setMode] = useState<'login' | 'register' | 'recover'>(isGesPromo ? 'register' : 'login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [gradeLevel, setGradeLevel] = useState<Level>(initialLevel === 'SHS' ? 'SHS 1' : initialLevel ?? 4);
    const [region, setRegion] = useState('');
    const [promotionRank, setPromotionRank] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [recoveredInfo, setRecoveredInfo] = useState<{
        accountName: string;
        email: string;
        gradeLabel: string;
        recoveredPassword: string;
        isTemporary?: boolean;
    } | null>(null);
    const [copiedRecovery, setCopiedRecovery] = useState(false);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setGradeLevel(initialLevel === 'SHS' ? 'SHS 1' : initialLevel ?? 4);
    }, [initialLevel]);

    const switchMode = (nextMode: 'login' | 'register' | 'recover') => {
        setMode(nextMode);
        setErr('');
        setRecoveredInfo(null);
        setNewPassword('');
        setCopiedRecovery(false);
    };

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
                          gradeLevel,
                          password,
                      };
                const res = await api.post('/api/auth/register', payload);
                onAuthenticated(res.data.user, res.data.token);
            } else if (mode === 'login') {
                const res = await api.post('/api/auth/login', {
                    email: email.trim(),
                    password,
                });
                onAuthenticated(res.data.user, res.data.token);
            } else {
                const res = await api.post('/api/auth/recover', {
                    email: email.trim(),
                });
                setRecoveredInfo(res.data);
            }
        } catch (e2) {
            setErr(
                errMsg(
                    e2,
                    mode === 'register'
                        ? 'Could not create account.'
                        : mode === 'recover'
                        ? 'Could not recover password.'
                        : 'Could not sign in.'
                )
            );
        } finally {
            setBusy(false);
        }
    };

    const handleResetPasswordAndLogin = async (e: FormEvent) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
            const res = await api.post('/api/auth/recover', {
                email: email.trim(),
                newPassword,
            });
            onAuthenticated(res.data.user, res.data.token);
        } catch (e2) {
            setErr(errMsg(e2, 'Could not update password.'));
        } finally {
            setBusy(false);
        }
    };

    const handleUseRecoveredPassword = async () => {
        if (!recoveredInfo) return;
        setErr('');
        setBusy(true);
        try {
            const res = await api.post('/api/auth/login', {
                email: recoveredInfo.email,
                password: recoveredInfo.recoveredPassword,
            });
            onAuthenticated(res.data.user, res.data.token);
        } catch (e2) {
            setErr(errMsg(e2, 'Could not sign in with recovered password.'));
        } finally {
            setBusy(false);
        }
    };

    const renderBrowserRecoveryPanel = () => (
        <div className="mt-5 space-y-4">
            <form onSubmit={submit} className="space-y-4">
                <Field label="Registered Email Address">
                    <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setRecoveredInfo(null);
                        }}
                        placeholder={isGesPromo ? 'admin@ges.gov.gh' : 'e.g. kofi@example.com'}
                        autoComplete="email"
                        className="input"
                    />
                </Field>
                <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#364c83] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f2d57] disabled:opacity-50"
                >
                    {busy && !recoveredInfo && <Loader2 className="animate-spin" size={16} />}
                    Show Recovered Password in Browser
                </button>
            </form>

            {recoveredInfo && (
                <div
                    className="rounded-xl border-2 border-[#364c83]/30 bg-indigo-50/50 p-4 space-y-3.5"
                    role="region"
                    aria-label="Recovered password details"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                                <CheckCircle2 size={13} />
                                Account Verified in Browser
                            </span>
                            <p className="mt-0.5 text-sm font-bold text-slate-900">{recoveredInfo.accountName}</p>
                            <p className="text-xs text-slate-500">
                                {recoveredInfo.email} &middot; {recoveredInfo.gradeLabel}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border border-indigo-200 bg-white p-3">
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {recoveredInfo.isTemporary ? 'Your Temporary Recovery Password' : 'Your Recovered Password'}
                        </span>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                            <code className="rounded bg-slate-100 px-2.5 py-1 font-mono text-base font-bold tracking-wide text-[#364c83]">
                                {recoveredInfo.recoveredPassword}
                            </code>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard?.writeText(recoveredInfo.recoveredPassword);
                                    setCopiedRecovery(true);
                                    setTimeout(() => setCopiedRecovery(false), 2000);
                                }}
                                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                                {copiedRecovery ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={handleUseRecoveredPassword}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#364c83] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1f2d57] disabled:opacity-50"
                    >
                        {busy && <Loader2 className="animate-spin" size={14} />}
                        Sign In Now with Recovered Password →
                    </button>

                    <form onSubmit={handleResetPasswordAndLogin} className="border-t border-indigo-200/70 pt-3 space-y-2.5">
                        <span className="block text-xs font-semibold text-slate-700">
                            Or set a new password (min. 6 characters)
                        </span>
                        <div className="relative">
                            <input
                                required
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                autoComplete="new-password"
                                className="input pr-20 bg-white"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword((s) => !s)}
                                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                            >
                                {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                {showNewPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={busy || newPassword.length < 6}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#364c83] bg-white py-2 text-xs font-semibold text-[#364c83] transition hover:bg-indigo-50 disabled:opacity-50"
                        >
                            Update Password &amp; Sign In
                        </button>
                    </form>
                </div>
            )}

            <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                Remembered your password?{' '}
                <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-[#364c83] hover:underline"
                >
                    Back to Sign In
                </button>
            </div>
        </div>
    );

    if (isGesPromo) {
        return (
            <div className="mx-auto max-w-md py-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <div className="text-center">
                        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                            {mode === 'register'
                                ? 'Create Account'
                                : mode === 'recover'
                                ? 'Password Recovery'
                                : 'Candidate Sign In'}
                        </h2>
                        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#364c83]">
                            {mode === 'register'
                                ? 'REGISTER TO ACCESS YOUR GES PROMOTION TRIAL EXAM PORTAL'
                                : mode === 'recover'
                                ? 'RECOVER YOUR GES PROMOTION PASSWORD IN THE BROWSER'
                                : 'SIGN IN TO ACCESS YOUR GES PROMOTION TRIAL EXAM PORTAL'}
                        </p>
                    </div>

                    {err && (
                        <div className="mt-5 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700" role="alert">
                            {err}
                        </div>
                    )}

                    {mode === 'recover' ? (
                        renderBrowserRecoveryPanel()
                    ) : (
                        <>
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

                                <div className="block">
                                    <div className="mb-1.5 flex items-center justify-between">
                                        <span className="text-sm font-semibold text-slate-800">
                                            Candidate Password <span className="text-red-500">*</span>
                                        </span>
                                        {mode === 'login' && (
                                            <button
                                                type="button"
                                                onClick={() => switchMode('recover')}
                                                className="text-xs font-semibold text-[#364c83] hover:underline"
                                            >
                                                Forgot password?
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            required
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-4 pr-20 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#364c83] focus:bg-white focus:ring-2 focus:ring-[#364c83]/15"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((s) => !s)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg bg-slate-200/70 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-300/70"
                                        >
                                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                            {showPassword ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>

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
                                            onClick={() => switchMode('login')}
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
                                            onClick={() => switchMode('register')}
                                            className="font-semibold text-[#364c83] hover:underline"
                                        >
                                            Register Account
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
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
                            onClick={() => switchMode('login')}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode('register')}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Register
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode('recover')}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                mode === 'recover' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Recover
                        </button>
                    </div>
                </div>

                <h2 className="mt-4 text-xl font-bold text-slate-900">
                    {mode === 'login'
                        ? 'Sign in to ExamHub'
                        : mode === 'recover'
                        ? 'Password Recovery'
                        : 'Create your ExamHub account'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    {mode === 'login'
                        ? 'Enter your registered email and password to access exams and track your scores.'
                        : mode === 'recover'
                        ? 'Enter your registered email address below to view your recovered password or set a new one directly in the browser.'
                        : 'Register with your details below to start practising exams on ExamHub.'}
                </p>

                {err && (
                    <div className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700" role="alert">
                        {err}
                    </div>
                )}

                {mode === 'recover' ? (
                    renderBrowserRecoveryPanel()
                ) : (
                    <>
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
                                <Field label="Grade / Exam Level">
                                    {initialLevel === 'SHS' ? (
                                        <select
                                            value={String(gradeLevel)}
                                            onChange={(e) => setGradeLevel(parseLevel(e.target.value))}
                                            className="input"
                                        >
                                            {SHS_LEVELS.map((lvl) => (
                                                <option key={lvl} value={lvl}>
                                                    {lvl}
                                                </option>
                                            ))}
                                        </select>
                                    ) : initialLevel ? (
                                        <input
                                            readOnly
                                            value={levelLabel(initialLevel)}
                                            className="input bg-slate-50 font-semibold text-[#364c83]"
                                        />
                                    ) : (
                                        <select
                                            value={String(gradeLevel)}
                                            onChange={(e) => setGradeLevel(parseLevel(e.target.value))}
                                            className="input"
                                        >
                                            {SCHOOL_LEVELS.map((lvl) => (
                                                <option key={lvl} value={String(lvl)}>
                                                    Basic {lvl}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </Field>
                            )}

                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-600">
                                        {mode === 'register' ? 'Password (min. 6 characters)' : 'Password'}
                                    </span>
                                    {mode === 'login' && (
                                        <button
                                            type="button"
                                            onClick={() => switchMode('recover')}
                                            className="text-xs font-semibold text-[#364c83] hover:underline"
                                        >
                                            Forgot password?
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        required
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                        className="input pr-20"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((s) => !s)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                                    >
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>

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
                                        onClick={() => switchMode('register')}
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
                                        onClick={() => switchMode('login')}
                                        className="font-semibold text-[#364c83] hover:underline"
                                    >
                                        Sign in
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
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
}: {
    user: StudentUser;
    token: string;
}) {
    const [stage, setStage] = useState<'select' | 'exam' | 'result'>('select');
    const level: Level = user.accountType === 'ges-promo' ? 'GES-PROMO' : user.gradeLevel;
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState('');
    const [starting, setStarting] = useState<string | null>(null);

    // Number of exam questions limit: 20, 30, 40, 50, 60, 70, 75, or all
    const [questionLimit, setQuestionLimit] = useState<number | 'all'>(20);

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
            let chosenQs = qs;
            if (questionLimit !== 'all' && qs.length > questionLimit) {
                // Shuffle for a fresh, varied practice test
                chosenQs = [...qs].sort(() => Math.random() - 0.5).slice(0, questionLimit);
            }
            setSubject(s);
            setQuestions(chosenQs);
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
                questionIds: questions.map((q) => q.id),
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
        const selectedOption = answers[q.id];
        const isAnswered = selectedOption !== undefined;
        const isCorrectChoice = isAnswered && q.correctIndex !== undefined && selectedOption === q.correctIndex;

        // Calculate live score
        const liveScore = questions.reduce((acc, curr) => {
            const ans = answers[curr.id];
            return ans !== undefined && curr.correctIndex !== undefined && ans === curr.correctIndex ? acc + 1 : acc;
        }, 0);
        const answeredCount = questions.filter((x) => answers[x.id] !== undefined).length;
        const livePercent = answeredCount > 0 ? Math.round((liveScore / answeredCount) * 100) : 0;

        const handleSelectOption = (optIdx: number) => {
            if (isAnswered) return; // Locked once answered to show instant grading
            setAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
        };

        return (
            <div className="mx-auto max-w-2xl">
                {/* Live Exam Header with Real-time Scoring */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-bold text-[#364c83]">
                        <SubjectIcon name={subject.name} size={18} />
                        {subject.name} &middot; {levelLabel(level)}
                    </span>
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-[#364c83]">
                            <Sparkles size={13} />
                            Score: {liveScore} / {answeredCount} ({livePercent}%)
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                            {answeredCount}/{questions.length} answered
                        </span>
                    </div>
                </div>

                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                        className="h-full rounded-full bg-[#364c83] transition-all duration-300"
                        style={{ width: `${((index + 1) / questions.length) * 100}%` }}
                    />
                </div>

                {notice && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

                {/* Question Card */}
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-700">
                                Question {index + 1} of {questions.length}
                            </span>
                            {isAnswered && (
                                <span
                                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${
                                        isCorrectChoice
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-rose-100 text-rose-800'
                                    }`}
                                >
                                    {isCorrectChoice ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                    {isCorrectChoice ? 'Scored: +1 Mark' : 'Scored: 0 Marks'}
                                </span>
                            )}
                        </div>
                        {(q.year || q.category) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {q.year && (
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                        {q.year}
                                    </span>
                                )}
                                {q.category && (
                                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-[#364c83]">
                                        {q.category}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <h2 className="mt-4 text-lg font-semibold leading-relaxed text-slate-900">{q.text}</h2>

                    {/* Answer Options with Instant Feedback */}
                    <div className="mt-5 space-y-2.5">
                        {q.options.map((opt, i) => {
                            const isSelected = selectedOption === i;
                            const isThisCorrect = q.correctIndex === i;

                            let btnStyle = 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800';
                            let badgeStyle = 'bg-slate-100 text-slate-600';

                            if (isAnswered) {
                                if (isThisCorrect) {
                                    btnStyle =
                                        'border-emerald-500 bg-emerald-50 text-emerald-950 font-medium ring-1 ring-emerald-500/30';
                                    badgeStyle = 'bg-emerald-600 text-white';
                                } else if (isSelected && !isThisCorrect) {
                                    btnStyle =
                                        'border-rose-400 bg-rose-50 text-rose-950 font-medium ring-1 ring-rose-400/30';
                                    badgeStyle = 'bg-rose-600 text-white';
                                } else {
                                    btnStyle = 'border-slate-200 bg-slate-50/40 text-slate-400 opacity-60';
                                    badgeStyle = 'bg-slate-100 text-slate-400';
                                }
                            }

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={isAnswered}
                                    onClick={() => handleSelectOption(i)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all ${btnStyle}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${badgeStyle}`}
                                        >
                                            {LETTERS[i]}
                                        </span>
                                        <span className="leading-snug">{opt}</span>
                                    </div>
                                    {isAnswered && isThisCorrect && (
                                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                                            <CheckCircle2 size={16} />
                                            Correct Answer
                                        </span>
                                    )}
                                    {isAnswered && isSelected && !isThisCorrect && (
                                        <span className="flex items-center gap-1 text-xs font-bold text-rose-600">
                                            <XCircle size={16} />
                                            Your Answer
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Instant Explanation & Scoring Card once answered */}
                    {isAnswered && (
                        <div
                            className={`mt-5 rounded-xl border p-4.5 text-xs transition-all ${
                                isCorrectChoice
                                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                                    : 'border-rose-200 bg-rose-50/70 text-slate-900'
                            }`}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                                            isCorrectChoice ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                        }`}
                                    >
                                        {isCorrectChoice ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                        {isCorrectChoice ? 'Scored: +1 Point' : 'Scored: 0 Points'}
                                    </span>
                                    <span className="text-xs font-semibold">
                                        {isCorrectChoice
                                            ? 'Excellent! You answered correctly.'
                                            : `Incorrect. The correct answer was Option ${LETTERS[q.correctIndex ?? 0]}.`}
                                    </span>
                                </div>
                                <span className="font-semibold text-slate-600">
                                    Current Running Score: <strong>{liveScore}</strong> / {answeredCount} ({livePercent}%)
                                </span>
                            </div>

                            <div className="mt-3">
                                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Explanation:
                                </span>
                                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                                    {q.explanation || 'No additional explanation provided for this question.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Clean Navigation (Previous / Next / Finish) without the cluttering numbering buttons */}
                <div className="mt-6 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                        disabled={index === 0}
                        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                        <ChevronLeft size={16} />
                        Previous Question
                    </button>
                    {isLast ? (
                        <button
                            type="button"
                            onClick={submitExam}
                            disabled={submitting}
                            className="flex items-center gap-2 rounded-lg bg-[#364c83] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#1f2d57] disabled:opacity-60"
                        >
                            {submitting && <Loader2 className="animate-spin" size={15} />}
                            Finish &amp; Submit Exam
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                            className="flex items-center gap-1 rounded-lg bg-[#364c83] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#1f2d57]"
                        >
                            Next Question
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
                        {user.name}
                        {user.schoolName ? ` (${user.schoolName})` : ''} &middot; {subject.name} &middot; {levelLabel(level)}
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
    const availableItems =
        level === 'GES-PROMO'
            ? PROMOTION_RANK_ITEMS.filter((r) => !user.promotionRank || r.name === user.promotionRank)
            : subjects;

    return (
        <div className="mx-auto max-w-2xl space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                            {level === 'GES-PROMO'
                                ? user.promotionRank || 'GES Promotion Exams'
                                : `Registered Grade: ${levelLabel(level)}`}
                        </span>
                        <h2 className="mt-1.5 text-xl font-bold text-slate-900">
                            {level === 'GES-PROMO'
                                ? `${user.promotionRank || 'GES Promotion'} Portal`
                                : `${levelLabel(level)} Exams`}
                        </h2>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                            <UserCheck size={14} className="text-slate-400" />
                            Signed in as <strong className="text-slate-700">{user.name}</strong> &middot;{' '}
                            {user.schoolName || levelLabel(level)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Question Count Setting (from 20, 30, 40 ... to 75, or All) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                            Exam Question Settings
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">Set Number of Exam Questions</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Choose how many questions to attempt per exam session (from 20 to 75, or all available questions).
                        </p>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-[#364c83]">
                        {questionLimit === 'all' ? 'All Questions' : `${questionLimit} Questions Set`}
                    </span>
                </div>

                <div className="mt-3.5 flex flex-wrap gap-2">
                    {[20, 30, 40, 50, 60, 70, 75, 'all'].map((limit) => {
                        const active = questionLimit === limit;
                        return (
                            <button
                                key={String(limit)}
                                type="button"
                                onClick={() => setQuestionLimit(limit as number | 'all')}
                                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                                    active
                                        ? 'bg-[#364c83] text-white shadow-sm ring-2 ring-[#364c83]/20'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                                }`}
                            >
                                {limit === 'all' ? 'All Questions' : `${limit} Questions`}
                            </button>
                        );
                    })}
                </div>
            </div>

            {notice && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

            <div>
                <h3 className="text-sm font-semibold text-slate-900">
                    {level === 'GES-PROMO'
                        ? 'Your Registered Promotion Rank Assessment'
                        : `Choose a ${levelLabel(level)} subject to start`}
                </h3>
                <div className={`mt-3 grid gap-3 ${level === 'GES-PROMO' ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
                    {availableItems.map((s) => {
                        const count = counts[`${s.id}|${level}`] || 0;
                        const disabled = count === 0 || starting !== null;
                        const isUserRank = level === 'GES-PROMO' && user.promotionRank === s.name;
                        const questionsToTake = questionLimit === 'all' ? count : Math.min(count, questionLimit);

                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => startExam(s)}
                                disabled={disabled}
                                className={`flex items-center gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-[#364c83] hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:shadow-none ${
                                    isUserRank ? 'border-[#364c83] ring-1 ring-[#364c83]/30' : 'border-slate-200'
                                }`}
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                                    {starting === s.id ? <Loader2 className="animate-spin" size={18} /> : <SubjectIcon name={s.name} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                                        <span>{s.name}</span>
                                        {isUserRank && (
                                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#364c83]">
                                                Registered Rank
                                            </span>
                                        )}
                                    </span>
                                    <span className="block text-xs text-slate-500">
                                        {count === 0
                                            ? 'No questions yet'
                                            : `${questionsToTake} question${questionsToTake === 1 ? '' : 's'} to attempt (Total in bank: ${count})`}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function LevelOptions() {
    return (
        <>
            <optgroup label="Basic levels (Basic 4 – 9)">
                {SCHOOL_LEVELS.map((l) => (
                    <option key={String(l)} value={String(l)}>
                        {levelLabel(l)}
                    </option>
                ))}
            </optgroup>
            <optgroup label="Senior High levels (SHS 1 – 3)">
                {SHS_LEVELS.map((l) => (
                    <option key={l} value={l}>
                        {l}
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

type AdminTab = 'candidates' | 'questions' | 'subjects' | 'results';

function AdminPanel({ code, onLogout }: { code: string; onLogout: () => void }) {
    const [tab, setTab] = useState<AdminTab>('candidates');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [questions, setQuestions] = useState<AdminQ[]>([]);
    const [results, setResults] = useState<ResultRow[]>([]);
    const [candidates, setCandidates] = useState<CandidateRow[]>([]);
    const [candidateStats, setCandidateStats] = useState<CandidatesStats | null>(null);
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

    const loadCandidates = useCallback(async () => {
        const r = await api.post('/api/admin/candidates', { passcode: code });
        setCandidates(r.data.candidates || []);
        setCandidateStats({
            totalCandidates: r.data.totalCandidates || 0,
            totalExams: r.data.totalExams || 0,
            overallAverage: r.data.overallAverage || 0,
            passRate: r.data.passRate || 0,
            distinctionRate: r.data.distinctionRate || 0,
        });
    }, [code]);

    useEffect(() => {
        (async () => {
            try {
                await loadSubjects();
                await Promise.all([loadQuestions(), loadResults(), loadCandidates()]);
            } catch (e) {
                flash(false, errMsg(e, 'Could not load admin data.'));
            }
        })();
    }, [loadSubjects, loadQuestions, loadResults, loadCandidates, flash]);

    const tabs: { id: AdminTab; label: string; icon: any }[] = [
        { id: 'candidates', label: 'Candidates & Monitoring', icon: Users },
        { id: 'questions', label: 'Questions', icon: BookOpen },
        { id: 'subjects', label: 'Subjects', icon: ClipboardCheck },
        { id: 'results', label: 'Exam Results', icon: Trophy },
    ];

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                    {tabs.map((t) => {
                        const Icon = t.icon;
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                                    active
                                        ? 'bg-white text-[#364c83] shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Icon size={14} className={active ? 'text-[#364c83]' : 'text-slate-400'} />
                                <span>{t.label}</span>
                            </button>
                        );
                    })}
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
                {tab === 'candidates' && (
                    <CandidatesAdmin
                        code={code}
                        candidates={candidates}
                        stats={candidateStats}
                        reload={loadCandidates}
                        flash={flash}
                    />
                )}
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
    if (trackCode === 'SHS') {
        return SHS_LEVELS.includes(String(qLevel));
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
    const [year, setYear] = useState('');
    const [category, setCategory] = useState('');
    const [text, setText] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correct, setCorrect] = useState(0);
    const [explanation, setExplanation] = useState('');
    const [saving, setSaving] = useState(false);

    // Filter state inside a subject portal (for Basic 4-9 or SHS 1-3 class levels)
    const [fLevel, setFLevel] = useState<'all' | Level>('all');

    // Edit / Update existing question state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editSubjectId, setEditSubjectId] = useState('');
    const [editLevel, setEditLevel] = useState<Level>(4);
    const [editYear, setEditYear] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editText, setEditText] = useState('');
    const [editOptions, setEditOptions] = useState(['', '', '', '']);
    const [editCorrect, setEditCorrect] = useState(0);
    const [editExplanation, setEditExplanation] = useState('');
    const [updating, setUpdating] = useState(false);

    // Bulk template & file upload state
    const [uploadingBulk, setUploadingBulk] = useState(false);
    const [dragOverBulk, setDragOverBulk] = useState(false);
    const [bulkNotice, setBulkNotice] = useState<{ ok: boolean; msg: string } | null>(null);

    useEffect(() => {
        if (!subjectId && subjects.length > 0) setSubjectId(subjects[0].id);
    }, [subjects, subjectId]);

    const activeTrack = TRACKS.find((t) => t.slug === selectedTrackSlug) || null;
    const isGesPromoPortal = activeTrack?.code === 'GES-PROMO';
    const portalItems = isGesPromoPortal ? PROMOTION_RANK_ITEMS : subjects;
    const itemSingularLabel = isGesPromoPortal ? 'Promotion Rank' : 'Subject';
    const itemPluralLabel = isGesPromoPortal ? 'Promotion Ranks' : 'Subjects';
    const activeSubject = portalItems.find((s) => s.id === selectedSubjectId) || null;

    const openTrackSubjects = (slug: string) => {
        const track = TRACKS.find((t) => t.slug === slug);
        if (!track) return;
        setSelectedTrackSlug(slug);
        setSelectedSubjectId(null);
        setEditingId(null);
        setBulkNotice(null);
        if (track.code === null) {
            setLevel(4);
            setFLevel('all');
        } else if (track.code === 'SHS') {
            setLevel('SHS 1');
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
        setBulkNotice(null);
        if (activeTrack) {
            if (activeTrack.code === null) {
                setLevel(4);
                setFLevel('all');
            } else if (activeTrack.code === 'SHS') {
                setLevel('SHS 1');
                setFLevel('all');
            } else {
                setLevel(activeTrack.code);
                setFLevel(activeTrack.code);
            }
        }
    };

    const downloadBlankTemplate = (format: 'word' | 'csv' | 'json') => {
        if (!activeTrack || !activeSubject) return;
        const safeSubj = activeSubject.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const safeTrack = activeTrack.label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const lvlDisplay = levelLabel(level);

        const triggerDownload = (content: string, mime: string, ext: string) => {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ExamHub_${safeTrack}_${safeSubj}_Template.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        if (isGesPromoPortal) {
            const rankCode = PROMOTION_RANK_CODE_BY_ID[activeSubject.id] || 'AD_II';

            if (format === 'json') {
                const sample = [
                    {
                        year: '2021 December',
                        rank: rankCode,
                        category: 'Educational Law & Policy',
                        question: 'Under Act 1023, which body is legally empowered to license professional teachers in Ghana?',
                        options: [
                            'National Council for Curriculum and Assessment (NaCCA)',
                            'National Teaching Council (NTC)',
                            'National Inspectorate Authority (NaSIA)',
                            'Ghana Education Service Council (GESC)',
                        ],
                        correctAnswer: 'B',
                        explanation: 'Act 1023 established the NTC to regulate and issue teaching licenses in Ghana.',
                    },
                    {
                        year: '2022 February',
                        rank: rankCode,
                        category: 'School Management & Administration',
                        question: `Sample second question for ${activeSubject.name}?`,
                        options: ['First choice', 'Second choice', 'Third choice', 'Fourth choice'],
                        correctAnswer: 'A',
                        explanation: 'Optional explanation for question 2.',
                    },
                ];
                triggerDownload(JSON.stringify(sample, null, 2), 'application/json;charset=utf-8', 'json');
                return;
            }

            if (format === 'csv') {
                const rows = [
                    ['Year', 'Rank', 'Category', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation'],
                    [
                        '2021 December',
                        rankCode,
                        'Educational Law & Policy',
                        'Under Act 1023, which body is legally empowered to license professional teachers in Ghana?',
                        'National Council for Curriculum and Assessment (NaCCA)',
                        'National Teaching Council (NTC)',
                        'National Inspectorate Authority (NaSIA)',
                        'Ghana Education Service Council (GESC)',
                        'B',
                        'Act 1023 established the NTC to regulate and issue teaching licenses in Ghana.',
                    ],
                    [
                        '2022 February',
                        rankCode,
                        'School Management & Administration',
                        `Sample second question for ${activeSubject.name}?`,
                        'First choice',
                        'Second choice',
                        'Third choice',
                        'Fourth choice',
                        'A',
                        'Optional explanation for question 2.',
                    ],
                ];
                const csvText =
                    '\uFEFF' +
                    rows
                        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                        .join('\r\n');
                triggerDownload(csvText, 'text/csv;charset=utf-8', 'csv');
                return;
            }

            // Word (.doc / .txt) template exactly matching user specification
            const wordContent = [
                'Instructions for Administrators:',
                '1. Fill in your questions following the structured blocks below.',
                '2. Separate each question with three dashes: ---',
                '3. Valid Ranks: AD_II (Assistant Director II), AD_I (Assistant Director I), DD (Deputy Director), DIR_II (Director II).',
                '4. Correct choices: A, B, C, or D.',
                '',
                '---',
                'Year: 2021 December',
                `Rank: ${rankCode}`,
                'Category: Educational Law & Policy',
                'Question: Under Act 1023, which body is legally empowered to license professional teachers in Ghana?',
                'A) National Council for Curriculum and Assessment (NaCCA)',
                'B) National Teaching Council (NTC)',
                'C) National Inspectorate Authority (NaSIA)',
                'D) Ghana Education Service Council (GESC)',
                'Correct: B',
                'Explanation: Act 1023 established the NTC to regulate and issue teaching licenses in Ghana.',
                '',
                '---',
                'Year: 2022 February',
                `Rank: ${rankCode}`,
                'Category: School Management & Administration',
                `Question: Sample second question for ${activeSubject.name}?`,
                'A) First choice',
                'B) Second choice',
                'C) Third choice',
                'D) Fourth choice',
                'Correct: A',
                'Explanation: Optional explanation for question 2.',
                '',
            ].join('\r\n');

            triggerDownload(wordContent, 'application/msword;charset=utf-8', 'doc');
            return;
        }

        if (format === 'json') {
            const sample = [
                {
                    question: `Sample ${activeSubject.name} (${lvlDisplay}) Question 1: Replace this with your question text?`,
                    options: ['Option A text', 'Option B text', 'Option C text', 'Option D text'],
                    correctAnswer: 'B',
                    explanation: 'Optional explanation shown to the candidate after submitting the exam.',
                    level: String(level),
                },
                {
                    question: `Sample ${activeSubject.name} (${lvlDisplay}) Question 2: Replace this with your second question?`,
                    options: ['First choice', 'Second choice', 'Third choice', 'Fourth choice'],
                    correctAnswer: 'A',
                    explanation: 'Optional explanation for question 2.',
                    level: String(level),
                },
            ];
            triggerDownload(JSON.stringify(sample, null, 2), 'application/json;charset=utf-8', 'json');
            return;
        }

        if (format === 'csv') {
            const rows = [
                ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation', 'Level'],
                [
                    `Sample ${activeSubject.name} (${lvlDisplay}) Question 1: Replace with your question?`,
                    'Option A text',
                    'Option B text',
                    'Option C text',
                    'Option D text',
                    'B',
                    'Optional explanation for question 1',
                    String(level),
                ],
                [
                    `Sample ${activeSubject.name} (${lvlDisplay}) Question 2: Replace with your second question?`,
                    'First choice',
                    'Second choice',
                    'Third choice',
                    'Fourth choice',
                    'A',
                    'Optional explanation for question 2',
                    String(level),
                ],
            ];
            const csvText =
                '\uFEFF' +
                rows
                    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                    .join('\r\n');
            triggerDownload(csvText, 'text/csv;charset=utf-8', 'csv');
            return;
        }

        // Word (.doc) template with clean --- separators
        const wordContent = [
            `Instructions for Administrators:`,
            `1. Fill in your questions following the structured blocks below.`,
            `2. Separate each question with three dashes: ---`,
            `3. Correct choices: A, B, C, or D.`,
            ``,
            `---`,
            `Question: Sample ${activeSubject.name} (${lvlDisplay}) question — replace this line with your first question?`,
            `A) Option A text`,
            `B) Option B text`,
            `C) Option C text`,
            `D) Option D text`,
            `Correct: B`,
            `Explanation: Optional explanation shown after the exam.`,
            `Level: ${lvlDisplay}`,
            ``,
            `---`,
            `Question: Sample ${activeSubject.name} (${lvlDisplay}) question — replace this line with your second question?`,
            `A) First choice`,
            `B) Second choice`,
            `C) Third choice`,
            `D) Fourth choice`,
            `Correct: A`,
            `Explanation: Optional explanation for question 2.`,
            `Level: ${lvlDisplay}`,
            ``,
        ].join('\r\n');

        triggerDownload(wordContent, 'application/msword;charset=utf-8', 'doc');
    };

    const handleBulkFileUpload = async (file: File | null | undefined) => {
        if (!file || !activeSubject) return;
        setUploadingBulk(true);
        setBulkNotice(null);
        try {
            const fileBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const res = String(reader.result || '');
                    const commaIdx = res.indexOf(',');
                    resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
                };
                reader.onerror = () => reject(new Error('Could not read the selected file.'));
                reader.readAsDataURL(file);
            });

            const res = await api.post('/api/admin/questions/bulk', {
                passcode: code,
                subjectId: activeSubject.id,
                level,
                fileName: file.name,
                fileBase64,
            });
            const count = Number(res.data?.imported || 0);
            await reload();
            const msg = `Successfully imported ${count} question${count === 1 ? '' : 's'} from "${file.name}" into ${activeSubject.name}.`;
            setBulkNotice({ ok: true, msg });
            flash(true, msg);
        } catch (e2) {
            const msg = errMsg(e2, 'Could not import questions from file.');
            setBulkNotice({ ok: false, msg });
            flash(false, msg);
        } finally {
            setUploadingBulk(false);
        }
    };

    const startEditing = (q: AdminQ) => {
        setEditingId(q.id);
        setEditSubjectId(q.subjectId);
        setEditLevel(q.level);
        setEditYear(q.year || '');
        setEditCategory(q.category || '');
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
                year: year.trim() || undefined,
                category: category.trim() || undefined,
                rank: isGesPromoPortal ? (PROMOTION_RANK_CODE_BY_ID[targetSubjectId] || undefined) : undefined,
            });
            setText('');
            setOptions(['', '', '', '']);
            setCorrect(0);
            setExplanation('');
            setYear('');
            setCategory('');
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
                year: editYear.trim() || undefined,
                category: editCategory.trim() || undefined,
                rank: editLevel === 'GES-PROMO' ? (PROMOTION_RANK_CODE_BY_ID[editSubjectId] || undefined) : undefined,
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

    const subjectName = (id: string) =>
        subjects.find((s) => s.id === id)?.name ||
        PROMOTION_RANK_ITEMS.find((r) => r.id === id)?.name ||
        'Unknown';

    /* ---------------- Step 1: Exam Category Cards View ---------------- */
    if (!activeTrack) {
        return (
            <div className="space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-bold text-slate-900">Select an Exam Category</h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Choose an examination category card below to view its subject or promotion rank cards, then open any portal to set and update questions.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TRACKS.map((t) => {
                        const catQuestions = questions.filter((q) => belongsToCategory(q.level, t.code));
                        const badgeText =
                            t.code === null ? 'Basic 4 – Basic 9' : t.code === 'SHS' ? 'SHS 1 – SHS 3' : t.code;
                        const isGesCard = t.code === 'GES-PROMO';
                        const cardCount = isGesCard ? PROMOTION_RANK_ITEMS.length : subjects.length;
                        const cardUnit = isGesCard ? 'promotion rank card' : 'subject card';

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
                                            <strong className="font-semibold text-slate-800">{cardCount}</strong>{' '}
                                            {cardUnit}{cardCount === 1 ? '' : 's'}
                                        </span>
                                        <span>
                                            <strong className="font-semibold text-slate-800">{catQuestions.length}</strong>{' '}
                                            question{catQuestions.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#364c83]">
                                        <span>{isGesCard ? 'View GES Promotion ranks' : `View ${t.label} subjects`}</span>
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
    const isShsPortal = activeTrack.code === 'SHS';
    const isMultiLevelPortal = isBasicPortal || isShsPortal;
    const multiLevelList: Level[] = isBasicPortal ? SCHOOL_LEVELS : SHS_LEVELS;
    const categoryQuestions = questions.filter((q) => belongsToCategory(q.level, activeTrack.code));

    /* ---------------- Step 2: Subject / Promotion Rank Cards View under Selected Exam Category ---------------- */
    if (!activeSubject) {
        const badgeText =
            activeTrack.code === null
                ? 'Basic 4 – Basic 9'
                : activeTrack.code === 'SHS'
                  ? 'SHS 1 – SHS 3'
                  : activeTrack.code;

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
                                {activeTrack.label} &middot; Select a {itemSingularLabel}
                            </span>
                            <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                                {activeTrack.label} {itemPluralLabel} Cards
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Click any {itemSingularLabel.toLowerCase()} card below to open its dedicated {activeTrack.label} portal to set new questions and update existing questions.
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

                {portalItems.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                        No subjects available yet. Add a subject in the <strong>Subjects</strong> tab first.
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {portalItems.map((s) => {
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

    /* ---------------- Step 3: Dedicated Subject / Promotion Rank + Category Portal View ---------------- */
    const subjectCategoryQuestions = categoryQuestions.filter((q) => q.subjectId === activeSubject.id);
    const shown = subjectCategoryQuestions.filter((q) =>
        isMultiLevelPortal ? fLevel === 'all' || q.level === fLevel : true
    );

    return (
        <div className="space-y-6">
            {/* Portal Header & Subject / Rank Switcher */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSubjectId(null);
                                setEditingId(null);
                                setBulkNotice(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#364c83] hover:bg-white hover:text-[#364c83]"
                        >
                            <ArrowLeft size={14} />
                            {activeTrack.label} {itemPluralLabel} Cards
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedTrackSlug(null);
                                setSelectedSubjectId(null);
                                setEditingId(null);
                                setBulkNotice(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                        >
                            All Exam Categories
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {portalItems.map((s) => {
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
                                {activeTrack.label} &middot; Dedicated {itemSingularLabel} Portal
                            </span>
                            <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                                {activeSubject.name} ({activeTrack.label})
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Set new {activeSubject.name} questions, bulk import from templates, and update existing questions for {activeTrack.label}.
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

            {/* Bulk Question Templates & Instant File Upload */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                            <Upload size={12} />
                            Bulk Import
                        </span>
                        <h2 className="mt-1 text-sm font-semibold text-slate-900">
                            Bulk Question Templates &amp; File Upload
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Download a blank template in <strong>Word (.doc)</strong>, <strong>Excel / CSV (.csv)</strong>, or <strong>JSON (.json)</strong>, fill in your {activeSubject.name} questions, and upload the file to import all questions instantly.
                        </p>
                    </div>
                    {isMultiLevelPortal && (
                        <div className="w-full sm:w-48">
                            <Field label={isShsPortal ? 'Default SHS Form for Upload' : 'Default Class Level for Upload'}>
                                <select
                                    value={String(level)}
                                    onChange={(e) => setLevel(parseLevel(e.target.value))}
                                    className="input"
                                >
                                    {multiLevelList.map((l) => (
                                        <option key={String(l)} value={String(l)}>
                                            {levelLabel(l)}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    )}
                </div>

                {/* Step A: Download Blank Templates */}
                <div className="mt-4">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">
                        1. Download a blank template ({activeSubject.name} &middot; {levelLabel(level)})
                    </span>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => downloadBlankTemplate('word')}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left transition hover:border-[#364c83] hover:bg-indigo-50/40"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#364c83] shadow-sm ring-1 ring-slate-200">
                                <FileText size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1 text-xs font-bold text-slate-900">
                                    Word Template
                                    <Download size={12} className="text-[#364c83]" />
                                </span>
                                <span className="block text-[11px] text-slate-500">Download .doc (Word / Text)</span>
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => downloadBlankTemplate('csv')}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left transition hover:border-[#364c83] hover:bg-indigo-50/40"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#364c83] shadow-sm ring-1 ring-slate-200">
                                <FileSpreadsheet size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1 text-xs font-bold text-slate-900">
                                    Excel / CSV Template
                                    <Download size={12} className="text-[#364c83]" />
                                </span>
                                <span className="block text-[11px] text-slate-500">Download .csv (Excel / Calc)</span>
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => downloadBlankTemplate('json')}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-left transition hover:border-[#364c83] hover:bg-indigo-50/40"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#364c83] shadow-sm ring-1 ring-slate-200">
                                <FileCode size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1 text-xs font-bold text-slate-900">
                                    JSON Template
                                    <Download size={12} className="text-[#364c83]" />
                                </span>
                                <span className="block text-[11px] text-slate-500">Download .json (Structured)</span>
                            </span>
                        </button>
                    </div>
                </div>

                {/* Step B: Upload Completed File */}
                <div className="mt-4">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">
                        2. Upload filled file to import all questions instantly
                    </span>
                    <label
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverBulk(true);
                        }}
                        onDragLeave={() => setDragOverBulk(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOverBulk(false);
                            const file = e.dataTransfer?.files?.[0];
                            if (file) handleBulkFileUpload(file);
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                            dragOverBulk
                                ? 'border-[#364c83] bg-indigo-50/60'
                                : 'border-slate-300 bg-slate-50/50 hover:border-[#364c83] hover:bg-indigo-50/20'
                        } ${uploadingBulk ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        <input
                            type="file"
                            accept=".doc,.docx,.txt,.csv,.tsv,.xlsx,.xls,.json"
                            disabled={uploadingBulk}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleBulkFileUpload(file);
                                e.target.value = '';
                            }}
                            className="hidden"
                        />
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-[#364c83]">
                            {uploadingBulk ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                        </span>
                        <span className="mt-2 text-xs font-semibold text-slate-800">
                            {uploadingBulk
                                ? 'Importing questions...'
                                : 'Click to select a file or drag & drop it here'}
                        </span>
                        <span className="mt-1 text-[11px] text-slate-500">
                            Supports Word (<strong>.doc, .docx, .txt</strong>), Excel / CSV (<strong>.csv, .xlsx</strong>), and JSON (<strong>.json</strong>)
                        </span>
                    </label>

                    {bulkNotice && (
                        <div
                            className={`mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium ${
                                bulkNotice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                            }`}
                            role="status"
                        >
                            {bulkNotice.ok ? (
                                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                            ) : (
                                <XCircle size={15} className="shrink-0 text-red-500" />
                            )}
                            <span>{bulkNotice.msg}</span>
                        </div>
                    )}
                </div>

                {/* Step C: Format Reference / Sample Preview */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Structured Format Guidelines (Text / Word &amp; Uploads)</span>
                        <span className="text-[11px] font-normal text-slate-500">Separate each question with <code>---</code></span>
                    </div>
                    <pre className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">
{isGesPromoPortal
    ? `Instructions for Administrators:
1. Fill in your questions following the structured blocks below.
2. Separate each question with three dashes: ---
3. Valid Ranks: AD_II (Assistant Director II), AD_I (Assistant Director I), DD (Deputy Director), DIR_II (Director II).
4. Correct choices: A, B, C, or D.

---
Year: 2021 December
Rank: ${PROMOTION_RANK_CODE_BY_ID[activeSubject.id] || 'AD_II'}
Category: Educational Law & Policy
Question: Under Act 1023, which body is legally empowered to license professional teachers in Ghana?
A) National Council for Curriculum and Assessment (NaCCA)
B) National Teaching Council (NTC)
C) National Inspectorate Authority (NaSIA)
D) Ghana Education Service Council (GESC)
Correct: B
Explanation: Act 1023 established the NTC to regulate and issue teaching licenses in Ghana.`
    : `Instructions for Administrators:
1. Fill in your questions following the structured blocks below.
2. Separate each question with three dashes: ---
3. Correct choices: A, B, C, or D.

---
Question: Sample ${activeSubject.name} (${levelLabel(level)}) question?
A) Option A text
B) Option B text
C) Option C text
D) Option D text
Correct: B
Explanation: Optional explanation shown after the exam.
Level: ${levelLabel(level)}`}
                    </pre>
                </div>
            </section>

            {/* Set / Add a Question Form */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                    Set a new {activeSubject.name} question ({activeTrack.label})
                </h2>
                <form onSubmit={save} className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label={itemSingularLabel}>
                            <input
                                type="text"
                                value={activeSubject.name}
                                disabled
                                className="input cursor-not-allowed bg-slate-50 font-medium text-slate-600"
                            />
                        </Field>
                        {isMultiLevelPortal ? (
                            <Field label={isShsPortal ? 'SHS Form (SHS 1 to 3)' : 'Class Level (Basic 4 to 9)'}>
                                <select
                                    value={String(level)}
                                    onChange={(e) => setLevel(parseLevel(e.target.value))}
                                    className="input"
                                >
                                    {multiLevelList.map((l) => (
                                        <option key={String(l)} value={String(l)}>
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
                    {isGesPromoPortal && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Year / Exam Sitting (e.g. 2021 December)">
                                <input
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    placeholder="e.g. 2021 December"
                                    className="input"
                                />
                            </Field>
                            <Field label="Category / Topic (e.g. Educational Law & Policy)">
                                <input
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="e.g. Educational Law & Policy"
                                    className="input"
                                />
                            </Field>
                        </div>
                    )}
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
                    {isMultiLevelPortal && (
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={String(fLevel)}
                                onChange={(e) => setFLevel(e.target.value === 'all' ? 'all' : parseLevel(e.target.value))}
                                className="input !w-auto"
                            >
                                <option value="all">
                                    {isShsPortal ? 'All SHS 1–3 levels' : 'All Basic 4–9 levels'}
                                </option>
                                {multiLevelList.map((l) => (
                                    <option key={String(l)} value={String(l)}>
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
                        const editItems = editLevel === 'GES-PROMO' ? PROMOTION_RANK_ITEMS : subjects;

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
                                        <Field label={editLevel === 'GES-PROMO' ? 'Promotion Rank' : 'Subject'}>
                                            <select
                                                value={editSubjectId}
                                                onChange={(e) => setEditSubjectId(e.target.value)}
                                                className="input bg-white"
                                            >
                                                {editItems.map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="Level or exam section">
                                            <select
                                                value={String(editLevel)}
                                                onChange={(e) => {
                                                    const nextLevel = parseLevel(e.target.value);
                                                    setEditLevel(nextLevel);
                                                    if (nextLevel === 'GES-PROMO') {
                                                        if (!PROMOTION_RANK_ITEMS.some((r) => r.id === editSubjectId)) {
                                                            setEditSubjectId(PROMOTION_RANK_ITEMS[0].id);
                                                        }
                                                    } else if (subjects.length > 0 && !subjects.some((s) => s.id === editSubjectId)) {
                                                        setEditSubjectId(subjects[0].id);
                                                    }
                                                }}
                                                className="input bg-white"
                                            >
                                                <LevelOptions />
                                            </select>
                                        </Field>
                                    </div>

                                    {editLevel === 'GES-PROMO' && (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <Field label="Year / Exam Sitting (e.g. 2021 December)">
                                                <input
                                                    value={editYear}
                                                    onChange={(e) => setEditYear(e.target.value)}
                                                    placeholder="e.g. 2021 December"
                                                    className="input bg-white"
                                                />
                                            </Field>
                                            <Field label="Category / Topic (e.g. Educational Law & Policy)">
                                                <input
                                                    value={editCategory}
                                                    onChange={(e) => setEditCategory(e.target.value)}
                                                    placeholder="e.g. Educational Law & Policy"
                                                    className="input bg-white"
                                                />
                                            </Field>
                                        </div>
                                    )}

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
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-xs font-medium text-[#364c83]">
                                                {subjectName(q.subjectId)} &middot; {levelLabel(q.level)}
                                            </span>
                                            {q.year && (
                                                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#364c83]">
                                                    {q.year}
                                                </span>
                                            )}
                                            {q.category && (
                                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                                    {q.category}
                                                </span>
                                            )}
                                        </div>
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

/* ------------------------------------------------------------------ */
/* Candidates & Performance Monitoring Dashboard                      */
/* ------------------------------------------------------------------ */

function CandidatesAdmin({
    code: _code,
    candidates,
    stats,
    reload,
    flash,
}: {
    code: string;
    candidates: CandidateRow[];
    stats: CandidatesStats | null;
    reload: () => Promise<void>;
    flash: Flash;
}) {
    const [search, setSearch] = useState('');
    const [trackFilter, setTrackFilter] = useState<'all' | string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Distinction' | 'Pass' | 'Remedial' | 'Pending'>('all');
    const [selectedCandidate, setSelectedCandidate] = useState<CandidateRow | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await reload();
            flash(true, 'Candidate monitoring records refreshed.');
        } catch (e) {
            flash(false, errMsg(e, 'Could not refresh candidates.'));
        } finally {
            setRefreshing(false);
        }
    };

    const gesCount = candidates.filter((c) => c.accountType === 'ges-promo').length;
    const studentCount = candidates.filter((c) => c.accountType !== 'ges-promo').length;

    const filtered = candidates.filter((c) => {
        if (search.trim()) {
            const q = search.toLowerCase();
            const matchName = c.name.toLowerCase().includes(q);
            const matchEmail = c.email.toLowerCase().includes(q);
            const matchSchool = (c.schoolName || '').toLowerCase().includes(q);
            const matchRank = (c.promotionRank || '').toLowerCase().includes(q);
            if (!matchName && !matchEmail && !matchSchool && !matchRank) return false;
        }

        if (trackFilter !== 'all') {
            if (trackFilter === 'ges-promo' && c.accountType !== 'ges-promo') return false;
            if (trackFilter === 'basic' && (typeof c.gradeLevel !== 'number' || c.gradeLevel < 4 || c.gradeLevel > 9)) {
                return false;
            }
            if (trackFilter === 'shs' && !SHS_LEVELS.includes(String(c.gradeLevel))) return false;
            if (trackFilter === 'bece' && c.gradeLevel !== 'BECE') return false;
            if (trackFilter === 'wassce' && c.gradeLevel !== 'WASSCE') return false;
            if (trackFilter === 'gtle' && c.gradeLevel !== 'GTLE') return false;
        }

        if (statusFilter !== 'all' && c.performanceStatus !== statusFilter) {
            return false;
        }

        return true;
    });

    const formatRelativeOrDate = (ts: number | null) => {
        if (!ts) return 'Not scheduled / Pending';
        const diffMs = Date.now() - ts;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 2) return 'Just now';
        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="space-y-6">
            {/* Header & Refresh */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                        <Activity size={12} />
                        Admin Monitoring Hub
                    </span>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">
                        Registered Candidates &amp; Performance Dashboard
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Monitor candidate registrations, examination schedules, real-time scores, and performance status.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                    <RotateCcw size={13} className={refreshing ? 'animate-spin text-[#364c83]' : ''} />
                    Refresh Monitoring
                </button>
            </div>

            {/* KPI Metric Overview Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Total Candidates</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                            <Users size={14} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{stats?.totalCandidates ?? candidates.length}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {gesCount} GES Promo &middot; {studentCount} School/Track
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Exams Taken</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                            <BarChart3 size={14} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{stats?.totalExams ?? 0}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Total completed attempts</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Overall Average</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#364c83]">
                            <TrendingUp size={14} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-[#364c83]">{stats?.overallAverage ?? 0}%</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full bg-[#364c83]"
                            style={{ width: `${Math.min(100, stats?.overallAverage ?? 0)}%` }}
                        />
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Pass Rate</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <CheckCircle2 size={14} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-emerald-700">{stats?.passRate ?? 0}%</p>
                    <p className="mt-1 text-[11px] text-slate-500">Score &ge; 50% threshold</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Distinction Rate</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <Award size={14} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-amber-700">{stats?.distinctionRate ?? 0}%</p>
                    <p className="mt-1 text-[11px] text-slate-500">Score &ge; 75% excellence</p>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search candidate, email, rank, region..."
                            className="input pl-9"
                        />
                    </div>

                    <div>
                        <select
                            value={trackFilter}
                            onChange={(e) => setTrackFilter(e.target.value)}
                            className="input"
                        >
                            <option value="all">All Exam Categories</option>
                            <option value="ges-promo">GES Promotion Candidates</option>
                            <option value="basic">Basic 4 – 9</option>
                            <option value="shs">SHS 1 – 3</option>
                            <option value="bece">BECE</option>
                            <option value="wassce">WASSCE</option>
                            <option value="gtle">GTLE</option>
                        </select>
                    </div>

                    <div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="input"
                        >
                            <option value="all">All Performance Statuses</option>
                            <option value="Distinction">Distinction (≥75%)</option>
                            <option value="Pass">Pass (50–74%)</option>
                            <option value="Remedial">Remedial (&lt;50%)</option>
                            <option value="Pending">Pending (No exams taken yet)</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <span>
                        Showing <strong>{filtered.length}</strong> of <strong>{candidates.length}</strong> candidates
                    </span>
                    {(search || trackFilter !== 'all' || statusFilter !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                setTrackFilter('all');
                                setStatusFilter('all');
                            }}
                            className="font-semibold text-[#364c83] hover:underline"
                        >
                            Clear all filters
                        </button>
                    )}
                </div>
            </div>

            {/* Candidates Monitoring Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                        No registered candidates found matching your search or filters.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                                    <th className="py-3 px-4 font-semibold">Candidate</th>
                                    <th className="py-3 px-3 font-semibold">Level / Promotion Rank</th>
                                    <th className="py-3 px-3 font-semibold">Registered</th>
                                    <th className="py-3 px-3 font-semibold">Exam Schedule &amp; Activity</th>
                                    <th className="py-3 px-3 font-semibold text-center">Exams</th>
                                    <th className="py-3 px-3 font-semibold">Average</th>
                                    <th className="py-3 px-3 font-semibold">Performance</th>
                                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((c) => {
                                    let statusPillClass = 'bg-slate-100 text-slate-700';
                                    if (c.performanceStatus === 'Distinction') {
                                        statusPillClass = 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20';
                                    } else if (c.performanceStatus === 'Pass') {
                                        statusPillClass = 'bg-indigo-50 text-[#364c83] ring-1 ring-[#364c83]/20';
                                    } else if (c.performanceStatus === 'Remedial') {
                                        statusPillClass = 'bg-rose-50 text-rose-800 ring-1 ring-rose-600/20';
                                    }

                                    const isGes = c.accountType === 'ges-promo';
                                    const rankDisplay = isGes
                                        ? `${c.promotionRank || 'GES Promotion'} ${c.region ? `(${c.region})` : ''}`
                                        : `${levelLabel(c.gradeLevel)} ${c.schoolName ? `· ${c.schoolName}` : ''}`;

                                    return (
                                        <tr key={c.id} className="transition hover:bg-slate-50/60">
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-slate-900">{c.name}</div>
                                                <div className="text-xs text-slate-500">{c.email}</div>
                                            </td>

                                            <td className="py-3 px-3">
                                                <span className="block text-xs font-semibold text-slate-800">
                                                    {rankDisplay}
                                                </span>
                                                <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                                                    {isGes ? 'GES Promotion' : 'Student Candidate'}
                                                </span>
                                            </td>

                                            <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} className="text-slate-400" />
                                                    {c.registeredAt
                                                        ? new Date(c.registeredAt).toLocaleDateString('en-GB', {
                                                              day: 'numeric',
                                                              month: 'short',
                                                              year: 'numeric',
                                                          })
                                                        : '—'}
                                                </div>
                                            </td>

                                            <td className="py-3 px-3">
                                                {c.lastExamAt ? (
                                                    <div>
                                                        <span className="flex items-center gap-1 text-xs font-medium text-slate-900">
                                                            <Clock size={12} className="text-[#364c83]" />
                                                            {c.lastSubject || 'Exam Taken'}
                                                        </span>
                                                        <span className="text-[11px] text-slate-500">
                                                            {formatRelativeOrDate(c.lastExamAt)}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                                                        <Clock size={12} />
                                                        Pending / No exams yet
                                                    </span>
                                                )}
                                            </td>

                                            <td className="py-3 px-3 text-center">
                                                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-700">
                                                    {c.examsTaken}
                                                </span>
                                            </td>

                                            <td className="py-3 px-3">
                                                {c.examsTaken > 0 ? (
                                                    <div>
                                                        <span className="text-xs font-bold text-slate-900">
                                                            {c.avgPercent}%
                                                        </span>
                                                        <span className="block text-[10px] text-slate-500">
                                                            Best: {c.bestPercent}%
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>

                                            <td className="py-3 px-3">
                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${statusPillClass}`}
                                                >
                                                    {c.performanceStatus}
                                                </span>
                                            </td>

                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedCandidate(c)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#364c83] transition hover:border-[#364c83] hover:bg-indigo-50"
                                                >
                                                    <span>View History</span>
                                                    <ChevronRight size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Candidate Detailed Exam History Modal */}
            {selectedCandidate && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fadeIn"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Performance history for ${selectedCandidate.name}`}
                >
                    <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                            <div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#364c83]">
                                    Candidate Transcript
                                </span>
                                <h3 className="mt-1 text-lg font-bold text-slate-900">{selectedCandidate.name}</h3>
                                <p className="text-xs text-slate-500">
                                    {selectedCandidate.email} &middot;{' '}
                                    {selectedCandidate.accountType === 'ges-promo'
                                        ? selectedCandidate.promotionRank
                                        : levelLabel(selectedCandidate.gradeLevel)}
                                    {selectedCandidate.region ? ` (${selectedCandidate.region})` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedCandidate(null)}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close dialog"
                            >
                                <XCircle size={18} />
                            </button>
                        </div>

                        {/* Candidate Summary Stats */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg bg-slate-50 p-3 text-center">
                                <span className="block text-xs text-slate-500 font-medium">Exams Taken</span>
                                <span className="text-lg font-bold text-slate-900">{selectedCandidate.examsTaken}</span>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3 text-center">
                                <span className="block text-xs text-slate-500 font-medium">Average Score</span>
                                <span className="text-lg font-bold text-[#364c83]">{selectedCandidate.avgPercent}%</span>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3 text-center">
                                <span className="block text-xs text-slate-500 font-medium">Performance</span>
                                <span
                                    className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                        selectedCandidate.performanceStatus === 'Distinction'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : selectedCandidate.performanceStatus === 'Pass'
                                            ? 'bg-indigo-100 text-[#364c83]'
                                            : selectedCandidate.performanceStatus === 'Remedial'
                                            ? 'bg-rose-100 text-rose-800'
                                            : 'bg-slate-200 text-slate-700'
                                    }`}
                                >
                                    {selectedCandidate.performanceStatus}
                                </span>
                            </div>
                        </div>

                        {/* Recent Exam Attempts List */}
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                Examination Log ({selectedCandidate.recentResults.length})
                            </h4>
                            {selectedCandidate.recentResults.length === 0 ? (
                                <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-4 text-center text-xs text-slate-500">
                                    This candidate has not attempted any exams yet.
                                </p>
                            ) : (
                                <div className="mt-2.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
                                    {selectedCandidate.recentResults.map((r) => {
                                        const isPass = r.percent >= 50;
                                        return (
                                            <div
                                                key={r.id}
                                                className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
                                            >
                                                <div>
                                                    <span className="font-semibold text-slate-900">{r.subjectName}</span>
                                                    <span className="block text-[11px] text-slate-500">
                                                        {new Date(r.createdAt).toLocaleString('en-GB', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}{' '}
                                                        &middot; {levelLabel(r.level)}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <span className="font-bold text-slate-900">
                                                            {r.score} / {r.total}
                                                        </span>
                                                        <span
                                                            className={`block text-[11px] font-bold ${
                                                                isPass ? 'text-emerald-700' : 'text-rose-600'
                                                            }`}
                                                        >
                                                            {r.percent}%
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                                            isPass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                                        }`}
                                                    >
                                                        {isPass ? 'Passed' : 'Failed'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-2 text-right">
                            <button
                                type="button"
                                onClick={() => setSelectedCandidate(null)}
                                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
