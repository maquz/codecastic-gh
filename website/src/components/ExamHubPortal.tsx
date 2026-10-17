import { useEffect, useState, useCallback } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '@appdeploy/client';
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
} from 'lucide-react';

export type Level = number | string;
type Subject = { id: string; name: string };
type ExamQ = { id: string; text: string; options: string[] };
type AdminQ = ExamQ & { subjectId: string; level: Level; correctIndex: number; explanation: string };
type ReviewItem = { id: string; correctIndex: number; chosen: number | null; correct: boolean; explanation: string };
type ResultRow = {
    id: string;
    studentName: string;
    level: Level;
    subjectName: string;
    score: number;
    total: number;
    percent: number;
    createdAt: number;
};

const SCHOOL_LEVELS: Level[] = [4, 5, 6, 7, 8, 9];
const EXAM_TRACKS: { id: string; label: string }[] = [
    { id: 'BECE', label: 'BECE' },
    { id: 'WASSCE', label: 'WASSCE' },
    { id: 'GTLE', label: 'GTLE' },
    { id: 'GES-PROMO', label: 'GES Promotion' },
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

export default function ExamHubPortal({ initialLevel, sectionLabel }: { initialLevel: Level | null; sectionLabel: string }) {
    const [tab, setTab] = useState<Tab>('student');

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-900 shadow-sm">
            <div className="border-b border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                            <GraduationCap size={19} />
                        </div>
                        <div>
                            <div className="text-base font-semibold leading-tight text-slate-900">ExamHub</div>
                            <p className="text-xs leading-tight text-slate-500">{sectionLabel}</p>
                        </div>
                    </div>
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
            <div className="px-4 py-8 sm:px-6">
                {tab === 'student' ? <StudentView key={String(initialLevel ?? 'basic')} initialLevel={initialLevel} /> : <AdminView />}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

function StudentView({ initialLevel }: { initialLevel: Level | null }) {
    const [stage, setStage] = useState<'select' | 'exam' | 'result'>('select');
    const [name, setName] = useState('');
    const [level, setLevel] = useState<Level | null>(initialLevel);
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
        if (!name.trim()) {
            setNotice('Please enter your name before starting an exam.');
            return;
        }
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
                studentName: name.trim(),
                level,
                subjectId: subject.id,
                answers,
            });
            setResult(res.data);
            setStage('result');
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
                    <span className="flex items-center gap-2 font-medium text-indigo-700">
                        <SubjectIcon name={subject.name} size={16} />
                        {subject.name} &middot; {levelLabel(level)}
                    </span>
                    <span className="text-slate-500">
                        {answered}/{questions.length} answered
                    </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                        className="h-full rounded-full bg-indigo-600 transition-all"
                        style={{ width: `${((index + 1) / questions.length) * 100}%` }}
                    />
                </div>

                {notice && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
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
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    <span
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                            selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
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
                                    ? 'bg-indigo-600 text-white'
                                    : answers[x.id] !== undefined
                                    ? 'bg-indigo-100 text-indigo-700'
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
                            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {submitting && <Loader2 className="animate-spin" size={15} />}
                            Submit exam
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                        <Trophy size={22} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">
                        {name.trim()} &middot; {subject.name} &middot; {levelLabel(level)}
                    </p>
                    <p className="mt-1 text-4xl font-bold text-slate-900">
                        {result.score}/{result.total}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-indigo-600">{result.percent}%</p>
                    <p className="mt-2 text-sm text-slate-600">{msg}</p>
                    <button
                        type="button"
                        onClick={backToStart}
                        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
            <h2 className="text-xl font-semibold text-slate-900">
                {isTrackSection && level ? `Start a ${levelLabel(level)} exam` : 'Start an exam'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
                {isTrackSection
                    ? 'Enter your name, then pick a subject below.'
                    : 'Enter your name, choose your school level, then pick a subject.'}
            </p>

            {notice && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}

            <div className="mt-5 space-y-5 rounded-xl border border-slate-200 bg-white p-5">
                <Field label="Your name">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Kofi Mensah"
                        className="input"
                    />
                </Field>

                {!isTrackSection && (
                    <div>
                        <span className="mb-2 block text-xs font-medium text-slate-600">School level</span>
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

            {level !== null && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-900">{levelLabel(level)} subjects</h3>
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
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:shadow-none"
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
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
                    ? 'border-indigo-600 bg-indigo-600 text-white'
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
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
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
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Plus size={15} />
                    Add
                </button>
            </form>
            <div className="mt-4 divide-y divide-slate-100">
                {subjects.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5">
                        <span className="flex items-center gap-2.5 text-sm font-medium text-slate-900">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
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
    const [subjectId, setSubjectId] = useState('');
    const [level, setLevel] = useState<Level>(4);
    const [text, setText] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correct, setCorrect] = useState(0);
    const [explanation, setExplanation] = useState('');
    const [saving, setSaving] = useState(false);

    const [fLevel, setFLevel] = useState<'all' | Level>('all');
    const [fSubject, setFSubject] = useState<'all' | string>('all');

    useEffect(() => {
        if (!subjectId && subjects.length > 0) setSubjectId(subjects[0].id);
    }, [subjects, subjectId]);

    const save = async (e: FormEvent) => {
        e.preventDefault();
        if (!subjectId || !text.trim() || options.some((o) => !o.trim())) {
            flash(false, 'Fill in the question and all four answer options.');
            return;
        }
        setSaving(true);
        try {
            await api.post('/api/admin/questions', {
                passcode: code,
                subjectId,
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

    const remove = async (q: AdminQ) => {
        if (!window.confirm('Delete this question?')) return;
        try {
            await api.post(`/api/admin/questions/${q.id}/delete`, { passcode: code });
            await reload();
            flash(true, 'Question deleted.');
        } catch (e2) {
            flash(false, errMsg(e2, 'Could not delete question.'));
        }
    };

    const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || 'Unknown';
    const shown = questions.filter(
        (q) => (fLevel === 'all' || q.level === fLevel) && (fSubject === 'all' || q.subjectId === fSubject)
    );

    return (
        <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-slate-900">Add a question</h2>
                <form onSubmit={save} className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Subject">
                            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="input">
                                {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Level or exam section">
                            <select value={String(level)} onChange={(e) => setLevel(parseLevel(e.target.value))} className="input">
                                <LevelOptions />
                            </select>
                        </Field>
                    </div>
                    <Field label="Question">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={2}
                            placeholder="Type the question here"
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
                                        className="h-4 w-4 accent-indigo-600"
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
                        disabled={saving || subjects.length === 0}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                        Add question
                    </button>
                </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-slate-900">Question bank ({shown.length})</h2>
                    <div className="flex gap-2">
                        <select
                            value={String(fLevel)}
                            onChange={(e) => setFLevel(e.target.value === 'all' ? 'all' : parseLevel(e.target.value))}
                            className="input !w-auto"
                        >
                            <option value="all">All levels and sections</option>
                            <LevelOptions />
                        </select>
                        <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} className="input !w-auto">
                            <option value="all">All subjects</option>
                            {subjects.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="mt-4 space-y-3">
                    {shown.map((q) => (
                        <div key={q.id} className="rounded-lg border border-slate-200 p-3.5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-medium text-indigo-600">
                                        {subjectName(q.subjectId)} &middot; {levelLabel(q.level)}
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-slate-900">{q.text}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => remove(q)}
                                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    aria-label="Delete question"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                            <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                {q.options.map((o, i) => (
                                    <p
                                        key={i}
                                        className={`rounded px-2 py-1 text-xs ${
                                            i === q.correctIndex ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-slate-500'
                                        }`}
                                    >
                                        {LETTERS[i]}. {o}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))}
                    {shown.length === 0 && <p className="text-sm text-slate-400">No questions match these filters.</p>}
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
