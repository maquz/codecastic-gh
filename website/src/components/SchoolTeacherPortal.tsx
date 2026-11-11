import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/client';
import {
    School,
    UserCheck,
    Users,
    BookOpen,
    Plus,
    Trash2,
    Search,
    RotateCcw,
    Download,
    Upload,
    X,
    CheckCircle2,
    XCircle,
    Sparkles,
    Copy,
    Check,
    Loader2,
    LogOut,
    Eye,
    BarChart3,
    HardDrive,
    Target,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Award,
    Printer,
    Edit3,
    Lock,
    Key,
    FileText,
    Filter,
    Clock,
    ClipboardList,
} from 'lucide-react';
import type { Level } from './ExamHubPortal';

export type PortalUser = {
    id: string;
    name: string;
    email: string;
    role?: 'student' | 'teacher' | 'school_admin' | 'ges-promo' | 'admin' | 'superadmin' | 'editor';
    adminRole?: 'superadmin' | 'admin' | 'editor';
    isSuperAdmin?: boolean;
    accountType?: 'student' | 'teacher' | 'school_admin' | 'ges-promo' | string;
    schoolId?: string;
    schoolName: string;
    schoolCode?: string;
    studentCode?: string;
    classSection?: string;
    assignedSubjects?: string[];
    assignedLevels?: (string | number)[];
    gradeLevel: Level;
    region?: string;
    promotionRank?: string;
    gender?: 'Male' | 'Female' | string;
};

export type SchoolRecord = {
    id: string;
    name: string;
    code: string;
    region?: string;
    town?: string;
    category?: string;
    adminEmail?: string;
};

const GHANA_REGIONS = [
    'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern',
    'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah',
    'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'
];

const STANDARD_SUBJECTS = [
    'Mathematics', 'Computing', 'Science', 'English', 'Social Studies',
    'Career Technology', 'Religious & Moral Education (RME)', 'History', 'ICT'
];

const ALL_POSSIBLE_LEVELS = [
    { id: '4', label: 'Basic 4' },
    { id: '5', label: 'Basic 5' },
    { id: '6', label: 'Basic 6' },
    { id: '7', label: 'Basic 7 (JHS 1 / BECE)' },
    { id: '8', label: 'Basic 8 (JHS 2 / BECE)' },
    { id: '9', label: 'Basic 9 (JHS 3 / BECE)' },
    { id: 'SHS 1', label: 'SHS 1' },
    { id: 'SHS 2', label: 'SHS 2' },
    { id: 'SHS 3', label: 'SHS 3 (WASSCE)' },
];

function downloadCsv(filename: string, rows: (string | number)[][]) {
    const csvContent =
        'data:text/csv;charset=utf-8,' +
        rows.map((r) => r.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* ------------------------------------------------------------------ */
/* 1. School & Teacher Auth Modal (Sign In / Register School)          */
/* ------------------------------------------------------------------ */

export function SchoolAuthModal({
    isOpen,
    onClose,
    onAuthenticated,
}: {
    isOpen: boolean;
    onClose: () => void;
    onAuthenticated: (user: PortalUser, token: string) => void;
}) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // School Registration fields
    const [schoolName, setSchoolName] = useState('');
    const [schoolCode, setSchoolCode] = useState('');
    const [region, setRegion] = useState('Greater Accra');
    const [town, setTown] = useState('');
    const [category, setCategory] = useState<'Basic' | 'SHS' | 'Combined'>('Combined');
    const [adminName, setAdminName] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    if (!isOpen) return null;

    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        setErr('');
        setLoading(true);
        try {
            const res = await api.post('/api/school/login', { email: email.trim(), password });
            onAuthenticated(res.data.user, res.data.token);
            onClose();
        } catch (e2: any) {
            setErr(e2?.response?.data?.error || 'Failed to sign in. Please check credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: FormEvent) => {
        e.preventDefault();
        setErr('');
        setLoading(true);
        try {
            const res = await api.post('/api/school/register', {
                schoolName: schoolName.trim(),
                schoolCode: schoolCode.trim(),
                region,
                town: town.trim(),
                category,
                adminName: adminName.trim(),
                adminEmail: email.trim(),
                adminPassword: password,
            });
            onAuthenticated(res.data.user, res.data.token);
            onClose();
        } catch (e2: any) {
            setErr(e2?.response?.data?.error || 'Failed to register school.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                            <School size={22} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Schools &amp; Teachers Portal</h3>
                            <p className="text-xs text-slate-500">Sign in as Subject Teacher or Mount your School</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="mt-4 flex rounded-lg bg-slate-100 p-1">
                    <button
                        type="button"
                        onClick={() => { setMode('login'); setErr(''); }}
                        className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                            mode === 'login' ? 'bg-white text-[#364c83] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Sign In (Teacher / Head)
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('register'); setErr(''); }}
                        className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                            mode === 'register' ? 'bg-white text-[#364c83] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Mount New School
                    </button>
                </div>

                {err && (
                    <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                        {err}
                    </div>
                )}

                {mode === 'login' ? (
                    <form onSubmit={handleLogin} className="mt-5 space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="teacher@school.edu.gh or head@school.edu.gh"
                                className="input text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                            <input
                                required
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="input text-sm"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#364c83] py-2.5 text-sm font-bold text-white hover:bg-[#1f2d57] transition disabled:opacity-60 shadow-xs"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                            Sign In to Portal
                        </button>
                        <p className="text-[11px] text-center text-slate-500 pt-1">
                            Are you a student? Please use the standard <button type="button" onClick={onClose} className="text-[#364c83] font-semibold underline">Student Sign In</button> on the main screen.
                        </p>
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">School Full Name</label>
                            <input
                                required
                                value={schoolName}
                                onChange={(e) => setSchoolName(e.target.value)}
                                placeholder="e.g. Achimota Basic & JHS"
                                className="input text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    School Join Code
                                </label>
                                <input
                                    value={schoolCode}
                                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                                    placeholder="e.g. ACHI-26 (or auto)"
                                    className="input text-sm font-mono uppercase"
                                />
                                <span className="text-[10px] text-slate-400">Used by students to link</span>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">School Level</label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as any)}
                                    className="input text-sm font-medium"
                                >
                                    <option value="Basic">Basic School (4-9 / BECE)</option>
                                    <option value="SHS">Senior High School (SHS 1-3)</option>
                                    <option value="Combined">Combined (Basic &amp; SHS)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Region</label>
                                <select
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    className="input text-sm"
                                >
                                    {GHANA_REGIONS.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Town / City</label>
                                <input
                                    value={town}
                                    onChange={(e) => setTown(e.target.value)}
                                    placeholder="e.g. Cape Coast, Kumasi, Accra"
                                    className="input text-sm"
                                />
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <span className="text-xs font-bold text-slate-800 block mb-2">School Administrator Account</span>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Head / Admin Name</label>
                                    <input
                                        required
                                        value={adminName}
                                        onChange={(e) => setAdminName(e.target.value)}
                                        placeholder="e.g. Mrs. Elizabeth Mensah (Headmistress)"
                                        className="input text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email</label>
                                    <input
                                        required
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="head@achimota.edu.gh"
                                        className="input text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Password (min. 6 chars)</label>
                                    <input
                                        required
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="input text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#364c83] py-2.5 text-sm font-bold text-white hover:bg-[#1f2d57] transition disabled:opacity-60 shadow-xs"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <School size={16} />}
                            Mount School &amp; Open Portal
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 2. Subject Teacher Performance Dashboard                            */
/* ------------------------------------------------------------------ */

export function TeacherPortalView({
    user,
    token,
    onLogout,
    onSwitchToStudent: _onSwitchToStudent,
    activeTab: externalTab,
    onTabChange: externalTabChange,
}: {
    user: PortalUser;
    token: string;
    onLogout: () => void;
    onSwitchToStudent?: () => void;
    activeTab?: 'results' | 'roster' | 'strengths-weaknesses' | 'diagnostics' | 'assigned-quizzes';
    onTabChange?: (tab: 'results' | 'roster' | 'strengths-weaknesses' | 'diagnostics' | 'assigned-quizzes') => void;
}) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<{
        myStudentsCount: number;
        totalExams: number;
        overallAvg: number;
        overallPassRate: number;
        classBreakdown: { classLabel: string; examsCount: number; avgPercent: number; passRate: number }[];
        studentRoster: (PortalUser & {
            examsTaken?: number;
            avgScore?: number;
            passRate?: number;
            strengths?: string[];
            weaknesses?: string[];
            recentResults?: any[];
        })[];
        competencyDiagnostics?: {
            topic: string;
            accuracy: number;
            totalQuestions: number;
            correctCount: number;
            status: 'strength' | 'weakness' | 'moderate';
        }[];
        results: any[];
        topMissedQuestions: any[];
    } | null>(null);

    const [assignments, setAssignments] = useState<any[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
    const [assigning, setAssigning] = useState<boolean>(false);
    const [assignSuccessMsg, setAssignSuccessMsg] = useState<string>('');

    // Assign modal state
    const [quizTitle, setQuizTitle] = useState<string>('');
    const [quizSubject, setQuizSubject] = useState<string>('');
    const [quizLevel, setQuizLevel] = useState<string>('');
    const [quizQuestionCount, setQuizQuestionCount] = useState<number>(10);
    const [quizTimerSeconds, setQuizTimerSeconds] = useState<number>(60);
    const [quizMode, setQuizMode] = useState<'random' | 'manual'>('random');
    const [selectedManualQIds, setSelectedManualQIds] = useState<string[]>([]);
    const [poolQuestions, setPoolQuestions] = useState<any[]>([]);
    const [loadingPool, setLoadingPool] = useState<boolean>(false);
    const [poolSearch, setPoolSearch] = useState<string>('');
    const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);

    const [internalTab, setInternalTab] = useState<'results' | 'roster' | 'strengths-weaknesses' | 'diagnostics' | 'assigned-quizzes'>('results');
    const activeTab = externalTab !== undefined ? externalTab : internalTab;
    const setActiveTab = (t: 'results' | 'roster' | 'strengths-weaknesses' | 'diagnostics' | 'assigned-quizzes') => {
        setInternalTab(t);
        if (externalTabChange) externalTabChange(t);
    };
    const [classFilter, setClassFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [selectedReview, setSelectedReview] = useState<any | null>(null);
    const [selectedStudentDiagnostic, setSelectedStudentDiagnostic] = useState<any | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [res, asgnRes] = await Promise.all([
                api.post('/api/teacher/performance', { token }),
                api.post('/api/teacher/quiz/list', { token }).catch(() => ({ data: { assignments: [] } }))
            ]);
            setStats(res.data);
            if (asgnRes.data?.assignments) {
                setAssignments(asgnRes.data.assignments);
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const toggleStudent = (id: string) => {
        setSelectedStudentIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const selectAllStudents = () => {
        if (!stats?.studentRoster) return;
        const allIds = stats.studentRoster.map((s) => s.id);
        setSelectedStudentIds(allIds);
    };

    const selectRemedialStudents = () => {
        if (!stats?.studentRoster) return;
        const remIds = stats.studentRoster
            .filter((s) => (s.avgScore !== undefined && s.avgScore < 50) || (s.weaknesses && s.weaknesses.length > 0))
            .map((s) => s.id);
        if (remIds.length === 0) {
            alert('No remedial students (< 50% or flagged weaknesses) found in roster.');
            return;
        }
        setSelectedStudentIds(remIds);
    };

    const selectSectionStudents = (sec: string) => {
        if (!stats?.studentRoster) return;
        const secIds = stats.studentRoster
            .filter((s) => (s.classSection || '').toLowerCase() === sec.toLowerCase())
            .map((s) => s.id);
        setSelectedStudentIds(secIds);
    };

    const clearSelectedStudents = () => {
        setSelectedStudentIds([]);
    };

    const handleOpenAssignModal = () => {
        if (selectedStudentIds.length === 0) {
            alert('Please select at least one student from the roster.');
            return;
        }
        const defaultSub = user.assignedSubjects?.[0] || 'Computing';
        const firstSelected = stats?.studentRoster?.find((s) => selectedStudentIds.includes(s.id));
        const defaultLvl = firstSelected ? (isNumeric(firstSelected.gradeLevel) ? `Basic ${firstSelected.gradeLevel}` : firstSelected.gradeLevel) : (user.assignedLevels?.[0] ? `Basic ${user.assignedLevels[0]}` : 'Basic 8');

        setQuizTitle(`${defaultSub} Practice Quiz`);
        setQuizSubject(defaultSub);
        setQuizLevel(String(defaultLvl));
        setQuizQuestionCount(10);
        setQuizTimerSeconds(60);
        setQuizMode('random');
        setSelectedManualQIds([]);
        setPoolSearch('');
        setShowAssignModal(true);
    };

    const fetchPoolQuestions = async (sub: string, lvl: string) => {
        if (!sub) return;
        setLoadingPool(true);
        try {
            const res = await api.get(`/api/teacher/questions/pool?subject=${encodeURIComponent(sub)}&level=${encodeURIComponent(lvl)}`);
            setPoolQuestions(res.data?.questions || []);
        } catch {
            setPoolQuestions([]);
        } finally {
            setLoadingPool(false);
        }
    };

    const handleCreateAssignment = async () => {
        if (!quizTitle.trim()) {
            alert('Please enter a quiz title.');
            return;
        }
        if (!quizSubject.trim()) {
            alert('Please select a subject.');
            return;
        }
        if (selectedStudentIds.length === 0) {
            alert('Please select at least one student.');
            return;
        }
        if (quizMode === 'manual' && selectedManualQIds.length === 0) {
            alert('Please select questions from the pool or switch to random selection.');
            return;
        }
        setAssigning(true);
        try {
            const payload: any = {
                token,
                title: quizTitle.trim(),
                subjectName: quizSubject.trim(),
                gradeLevel: quizLevel.trim() || 'Basic 8',
                studentIds: selectedStudentIds,
                questionCount: quizMode === 'manual' ? selectedManualQIds.length : quizQuestionCount,
                timerSeconds: quizTimerSeconds || 60,
            };
            if (quizMode === 'manual' && selectedManualQIds.length > 0) {
                payload.questionIds = selectedManualQIds;
            }
            const res = await api.post('/api/teacher/quiz/create', payload);
            if (res.data?.ok) {
                setShowAssignModal(false);
                setSelectedStudentIds([]);
                setSelectedManualQIds([]);
                setAssignSuccessMsg(`Successfully assigned "${quizTitle}" to ${selectedStudentIds.length} student(s)!`);
                setTimeout(() => setAssignSuccessMsg(''), 5000);
                loadData();
                setActiveTab('assigned-quizzes');
            }
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to create quiz assignment');
        } finally {
            setAssigning(false);
        }
    };

    const handleDeleteAssignment = async (asgnId: string) => {
        if (!window.confirm('Are you sure you want to recall/delete this assigned quiz?')) return;
        try {
            await api.post('/api/teacher/quiz/delete', { token, assignmentId: asgnId });
            loadData();
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Failed to delete assignment');
        }
    };

    const handleExportGradebook = () => {
        if (!stats || !stats.results.length) return;
        const rows: (string | number)[][] = [
            ['Student Name', 'Student Email', 'Class / Form', 'Subject', 'Score', 'Total Questions', 'Percentage (%)', 'Status', 'Date Taken']
        ];
        stats.results.forEach((r) => {
            rows.push([
                r.studentName,
                r.studentEmail,
                r.classSection || r.level,
                r.subjectName,
                r.score,
                r.total,
                r.percent,
                r.passed ? 'PASSED' : 'FAILED',
                r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''
            ]);
        });
        downloadCsv(`${user.name.replace(/\s+/g, '_')}_Gradebook.csv`, rows);
    };

    const [importingLab, setImportingLab] = useState(false);
    const handleImportTeacherLabFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                setImportingLab(true);
                const parsed = JSON.parse(evt.target?.result as string);
                const results = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [];
                if (results.length === 0) {
                    alert('No test attempts found in file.');
                    return;
                }
                const res = await api.post('/api/school/lab/import', {
                    token,
                    schoolId: user.schoolId,
                    schoolName: user.schoolName,
                    results,
                });
                alert(`Successfully imported ${res.data.importedCount} test results into your class gradebook!`);
                loadData();
            } catch {
                alert('Failed to import lab results. Ensure it is a valid .codecastic-results.json file.');
            } finally {
                setImportingLab(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const filteredResults = useMemo(() => {
        if (!stats?.results) return [];
        let list = stats.results;
        if (classFilter !== 'all') {
            list = list.filter((r) => {
                const cKey = isNumeric(r.level) ? `Basic ${r.level}` : String(r.level);
                return cKey.includes(classFilter) || (r.classSection && r.classSection.includes(classFilter));
            });
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((r) => r.studentName.toLowerCase().includes(q) || (r.studentEmail && r.studentEmail.toLowerCase().includes(q)));
        }
        return list;
    }, [stats?.results, classFilter, search]);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-32 text-slate-400">
                <Loader2 className="animate-spin text-[#364c83]" size={22} />
                <span>Loading your Teacher Performance Portal...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                            <UserCheck size={26} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg sm:text-xl font-bold text-slate-900">{user.name}</h1>
                                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-[#364c83]">
                                    Subject Teacher
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {user.schoolName || 'Partner School'} &middot;{' '}
                                <strong>Subjects:</strong> {user.assignedSubjects?.length ? user.assignedSubjects.join(', ') : 'All School Subjects'} &middot;{' '}
                                <strong>Classes:</strong> {user.assignedLevels?.length ? user.assignedLevels.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') : 'All Levels'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                        >
                            <RotateCcw size={12} className={refreshing ? 'animate-spin text-[#364c83]' : ''} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={handleExportGradebook}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-2xs"
                        >
                            <Download size={12} />
                            Export Gradebook (CSV)
                        </button>
                        <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer">
                            <Upload size={12} className={importingLab ? 'animate-spin text-[#364c83]' : ''} />
                            <span>{importingLab ? 'Importing...' : 'Import Lab Results (USB)'}</span>
                            <input
                                type="file"
                                accept=".json,.codecastic-results.json"
                                className="hidden"
                                onChange={handleImportTeacherLabFile}
                                disabled={importingLab}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={onLogout}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700"
                        >
                            <LogOut size={12} />
                            Sign Out
                        </button>
                    </div>
                </div>

                {/* Key KPIs */}
                <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">My Students</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{stats?.myStudentsCount || 0}</div>
                        <span className="text-[11px] text-slate-400">Enrolled in assigned classes</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">Tests Completed</span>
                        <div className="text-2xl font-bold text-[#364c83] mt-1">{stats?.totalExams || 0}</div>
                        <span className="text-[11px] text-slate-400">In my subject(s)</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">Class Average</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                            {stats?.overallAvg ? `${stats.overallAvg}%` : '--%'}
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-[#364c83] rounded-full" style={{ width: `${stats?.overallAvg || 0}%` }} />
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">Pass Rate (≥ 50%)</span>
                        <div className="text-2xl font-bold text-emerald-700 mt-1">
                            {stats?.overallPassRate ? `${stats.overallPassRate}%` : '--%'}
                        </div>
                        <span className="text-[11px] text-emerald-600 font-medium">Standard WAEC benchmark</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 gap-2 sm:gap-6 overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setActiveTab('results')}
                    className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'results' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <BookOpen size={16} />
                    Test Attempts ({stats?.results?.length || 0})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('strengths-weaknesses')}
                    className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'strengths-weaknesses' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Target size={16} />
                    Strengths &amp; Weaknesses (Intervention Hub)
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('roster')}
                    className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'roster' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Users size={16} />
                    Class Roster ({stats?.studentRoster?.length || 0})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('diagnostics')}
                    className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'diagnostics' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Sparkles size={16} />
                    Common Question Misconceptions
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('assigned-quizzes')}
                    className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'assigned-quizzes' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <ClipboardList size={16} />
                    Assigned Quizzes ({assignments.length})
                </button>
            </div>

            {/* Tab 1: Student Test Attempts */}
            {activeTab === 'results' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 min-w-[200px] max-w-md">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by student name..."
                                className="input pl-8 py-1.5 text-xs w-full"
                            />
                        </div>

                        {stats?.classBreakdown && stats.classBreakdown.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-slate-500 font-semibold">Class Filter:</span>
                                <button
                                    type="button"
                                    onClick={() => setClassFilter('all')}
                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                                        classFilter === 'all' ? 'bg-[#364c83] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    All
                                </button>
                                {stats.classBreakdown.map((cb) => (
                                    <button
                                        key={cb.classLabel}
                                        type="button"
                                        onClick={() => setClassFilter(cb.classLabel)}
                                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                                            classFilter === cb.classLabel ? 'bg-[#364c83] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {cb.classLabel} ({cb.avgPercent}%)
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-bold uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Student Name</th>
                                        <th className="px-4 py-3">Class / Form</th>
                                        <th className="px-4 py-3">Subject</th>
                                        <th className="px-4 py-3">Score</th>
                                        <th className="px-4 py-3">Percent</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredResults.map((r, i) => (
                                        <tr key={r.id || i} className="hover:bg-slate-50/60 transition">
                                            <td className="px-4 py-3 font-semibold text-slate-900">
                                                {r.studentName}
                                                {r.studentEmail && !r.studentEmail.endsWith('@student.codecasticgh.com') && (
                                                    <span className="block text-[11px] text-slate-400 font-normal">{r.studentEmail}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">
                                                {r.classSection ? `${isNumeric(r.level) ? `Basic ${r.level}` : r.level} (${r.classSection})` : isNumeric(r.level) ? `Basic ${r.level}` : r.level}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-800">{r.subjectName}</td>
                                            <td className="px-4 py-3 font-bold text-slate-900">
                                                {r.score} / {r.total}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block font-bold ${r.percent >= 50 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    {r.percent}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                                    r.passed ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                                                }`}>
                                                    {r.passed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                                    {r.passed ? 'Pass' : 'Fail'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">
                                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Recent'}
                                            </td>
                                            <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const matched = stats?.studentRoster?.find((s) => s.id === r.userId || s.name === r.studentName);
                                                        setSelectedStudentDiagnostic(matched || {
                                                            id: r.userId || '',
                                                            name: r.studentName,
                                                            email: r.studentEmail || '',
                                                            gradeLevel: r.level,
                                                            classSection: r.classSection || '',
                                                            schoolName: user.schoolName,
                                                            examsTaken: 1,
                                                            avgScore: r.percent,
                                                            passRate: r.percent >= 50 ? 100 : 0,
                                                            strengths: r.percent >= 70 ? [`${r.subjectName} (${r.percent}%)`] : [],
                                                            weaknesses: r.percent < 50 ? [`${r.subjectName} (${r.percent}%)`] : [],
                                                            recentResults: [r]
                                                        });
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                    title="View strengths and weaknesses for this student"
                                                >
                                                    <Target size={12} className="text-[#364c83]" />
                                                    Diagnostic
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedReview(r)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-bold text-[#364c83] hover:bg-indigo-100"
                                                >
                                                    <Eye size={12} />
                                                    Review Answers
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredResults.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="py-8 text-center text-slate-400">
                                                No test attempts recorded yet in this subject/class filter.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Strengths & Weaknesses (Intervention Hub) */}
            {activeTab === 'strengths-weaknesses' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Target className="text-[#364c83]" size={18} />
                                    Student Competency Diagnostics &amp; Intervention Hub
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Real-time tracking of curriculum topics and individual student mastery against national standards (≥ 70% Mastery, &lt; 50% Remediation Alert).
                                </p>
                            </div>
                        </div>

                        {/* High-level topic cards: Strengths vs Weaknesses */}
                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Class Strengths */}
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                                        <Award size={15} className="text-emerald-700" />
                                        Class Strengths (≥ 70% Accuracy)
                                    </span>
                                    <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                        Mastery Achieved
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mb-3">
                                    Topics where your students demonstrate solid conceptual understanding and problem-solving readiness.
                                </p>
                                <div className="space-y-2">
                                    {stats?.competencyDiagnostics?.filter((c) => c.status === 'strength').map((c) => (
                                        <div key={c.topic} className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-emerald-100 shadow-2xs">
                                            <span className="text-xs font-bold text-slate-800">{c.topic}</span>
                                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                                {c.accuracy}% ({c.correctCount}/{c.totalQuestions})
                                            </span>
                                        </div>
                                    ))}
                                    {(!stats?.competencyDiagnostics || stats.competencyDiagnostics.filter((c) => c.status === 'strength').length === 0) && (
                                        <p className="text-xs text-slate-400 italic py-2">
                                            No topics reached 70% mastery yet. Encourage students to attempt more targeted practice.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Priority Weaknesses & Remediation */}
                            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-rose-900 uppercase tracking-wider">
                                        <AlertTriangle size={15} className="text-rose-700" />
                                        Intervention Areas (&lt; 50% Accuracy)
                                    </span>
                                    <span className="rounded-full bg-rose-200/70 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                        Action Required
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mb-3">
                                    Topics requiring teacher-led revision, practical demonstrations, or concept clarification before the next assessment.
                                </p>
                                <div className="space-y-2">
                                    {stats?.competencyDiagnostics?.filter((c) => c.status === 'weakness').map((c) => (
                                        <div key={c.topic} className="rounded-lg bg-white p-2.5 border border-rose-100 shadow-2xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-800">{c.topic}</span>
                                                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                                                    {c.accuracy}% ({c.correctCount}/{c.totalQuestions})
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                💡 <strong>Teacher Tip:</strong> Reteach foundational definitions and conduct step-by-step worked examples.
                                            </p>
                                        </div>
                                    ))}
                                    {(!stats?.competencyDiagnostics || stats.competencyDiagnostics.filter((c) => c.status === 'weakness').length === 0) && (
                                        <p className="text-xs text-slate-400 italic py-2">
                                            Great news! No topics have fallen below 50% accuracy across your student cohort.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Complete Topics Breakdown Table */}
                        <div className="mt-6">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                Topic Competency Diagnostic Table
                            </h3>
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-2.5">Topic / Sub-Strand</th>
                                            <th className="px-4 py-2.5">Class Accuracy</th>
                                            <th className="px-4 py-2.5">Questions Tested</th>
                                            <th className="px-4 py-2.5">Correct Answers</th>
                                            <th className="px-4 py-2.5 text-right">Pedagogical Recommendation</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {stats?.competencyDiagnostics?.map((c) => (
                                            <tr key={c.topic} className="hover:bg-slate-50/70">
                                                <td className="px-4 py-2.5 font-bold text-slate-900">{c.topic}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${
                                                                    c.accuracy >= 70 ? 'bg-emerald-600' : c.accuracy < 50 ? 'bg-rose-600' : 'bg-amber-500'
                                                                }`}
                                                                style={{ width: `${c.accuracy}%` }}
                                                            />
                                                        </div>
                                                        <span className="font-bold text-slate-800">{c.accuracy}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-600">{c.totalQuestions}</td>
                                                <td className="px-4 py-2.5 text-slate-600">{c.correctCount}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                        c.accuracy >= 70
                                                            ? 'bg-emerald-50 text-emerald-800'
                                                            : c.accuracy < 50
                                                            ? 'bg-rose-50 text-rose-800'
                                                            : 'bg-amber-50 text-amber-800'
                                                    }`}>
                                                        {c.accuracy >= 70
                                                            ? 'Ready for Extension'
                                                            : c.accuracy < 50
                                                            ? 'Immediate Lesson Remediation'
                                                            : 'Reinforce Key Concepts'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!stats?.competencyDiagnostics || stats.competencyDiagnostics.length === 0) && (
                                            <tr>
                                                <td colSpan={5} className="py-6 text-center text-slate-400">
                                                    No topic diagnostics recorded yet. As students take quizzes, accuracy will populate here.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Student Performance Matrix */}
                        <div className="mt-8">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                Individual Student Action List (Click any student for detailed diagnostic)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Ready for Extension */}
                                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
                                        <TrendingUp size={14} />
                                        High Achievers (≥ 70% Avg)
                                    </span>
                                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                        {stats?.studentRoster?.filter((s) => (s.avgScore || 0) >= 70).map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setSelectedStudentDiagnostic(s)}
                                                className="w-full text-left p-2 rounded-lg bg-white border border-slate-200/80 hover:border-emerald-300 transition text-xs flex items-center justify-between shadow-2xs"
                                            >
                                                <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                                                <span className="font-bold text-emerald-700">{s.avgScore}%</span>
                                            </button>
                                        ))}
                                        {(!stats?.studentRoster || stats.studentRoster.filter((s) => (s.avgScore || 0) >= 70).length === 0) && (
                                            <p className="text-[11px] text-slate-400 py-2">No students currently in this tier.</p>
                                        )}
                                    </div>
                                </div>

                                {/* On Track */}
                                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                                    <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-2">
                                        <Target size={14} />
                                        On Track (50% - 69% Avg)
                                    </span>
                                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                        {stats?.studentRoster?.filter((s) => (s.avgScore || 0) >= 50 && (s.avgScore || 0) < 70).map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setSelectedStudentDiagnostic(s)}
                                                className="w-full text-left p-2 rounded-lg bg-white border border-slate-200/80 hover:border-amber-300 transition text-xs flex items-center justify-between shadow-2xs"
                                            >
                                                <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                                                <span className="font-bold text-amber-700">{s.avgScore}%</span>
                                            </button>
                                        ))}
                                        {(!stats?.studentRoster || stats.studentRoster.filter((s) => (s.avgScore || 0) >= 50 && (s.avgScore || 0) < 70).length === 0) && (
                                            <p className="text-[11px] text-slate-400 py-2">No students currently in this tier.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Priority Intervention */}
                                <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5">
                                    <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5 mb-2">
                                        <TrendingDown size={14} />
                                        Priority Support Needed (&lt; 50% Avg)
                                    </span>
                                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                        {stats?.studentRoster?.filter((s) => (s.examsTaken || 0) > 0 && (s.avgScore || 0) < 50).map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setSelectedStudentDiagnostic(s)}
                                                className="w-full text-left p-2 rounded-lg bg-white border border-rose-200 hover:border-rose-400 transition text-xs flex items-center justify-between shadow-2xs"
                                            >
                                                <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                                                <span className="font-bold text-rose-700">{s.avgScore}%</span>
                                            </button>
                                        ))}
                                        {(!stats?.studentRoster || stats.studentRoster.filter((s) => (s.examsTaken || 0) > 0 && (s.avgScore || 0) < 50).length === 0) && (
                                            <p className="text-[11px] text-slate-400 py-2">No students needing urgent intervention.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 3: Class Roster */}
            {activeTab === 'roster' && (
                <div className="space-y-4">
                    {assignSuccessMsg && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs">
                            <span className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                {assignSuccessMsg}
                            </span>
                            <button
                                type="button"
                                onClick={() => setAssignSuccessMsg('')}
                                className="text-emerald-700 hover:text-emerald-900"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">Enrolled Students in Your Assigned Classes</h3>
                                <p className="text-xs text-slate-500">
                                    Select students or student groups below to administer a targeted quiz, or click "Diagnostic Profile" for individual analysis.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleOpenAssignModal}
                                disabled={selectedStudentIds.length === 0}
                                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                                    selectedStudentIds.length > 0
                                        ? 'bg-[#364c83] text-white hover:bg-[#1f2d57] cursor-pointer'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                }`}
                                title={selectedStudentIds.length === 0 ? 'Select students using the checkboxes below first' : 'Assign quiz to chosen students'}
                            >
                                <ClipboardList size={15} />
                                <span>Assign Quiz to Selected ({selectedStudentIds.length})</span>
                            </button>
                        </div>

                        {/* Group Selection Toolbar */}
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[#364c83] flex items-center gap-1.5 mr-1">
                                    <Filter size={13} />
                                    Quick Select:
                                </span>
                                <button
                                    type="button"
                                    onClick={selectAllStudents}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-[#364c83] shadow-2xs"
                                >
                                    Select All ({stats?.studentRoster?.length || 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={selectRemedialStudents}
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-100 shadow-2xs"
                                    title="Select students with score < 50% or diagnosed weaknesses"
                                >
                                    Remedial Group (&lt; 50%)
                                </button>

                                {Array.from(new Set((stats?.studentRoster || []).map((s) => s.classSection).filter(Boolean))).map((sec) => (
                                    <button
                                        key={sec}
                                        type="button"
                                        onClick={() => selectSectionStudents(String(sec))}
                                        className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#364c83] hover:bg-indigo-50 shadow-2xs"
                                    >
                                        Section {sec}
                                    </button>
                                ))}

                                {selectedStudentIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearSelectedStudents}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 shadow-2xs"
                                    >
                                        Clear Selection
                                    </button>
                                )}
                            </div>

                            <span className="text-xs font-semibold text-slate-600">
                                <strong className="text-[#364c83]">{selectedStudentIds.length}</strong> of {stats?.studentRoster?.length || 0} students selected
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase">
                                    <tr>
                                        <th className="px-3 py-2.5 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(stats?.studentRoster?.length && selectedStudentIds.length === stats.studentRoster.length)}
                                                onChange={(e) => (e.target.checked ? selectAllStudents() : clearSelectedStudents())}
                                                className="rounded border-slate-300 text-[#364c83] focus:ring-[#364c83] cursor-pointer"
                                                title="Select / Deselect All"
                                            />
                                        </th>
                                        <th className="px-4 py-2.5">Student Name &amp; ID</th>
                                        <th className="px-4 py-2.5">Grade Level</th>
                                        <th className="px-4 py-2.5">Section</th>
                                        <th className="px-4 py-2.5">Tests Taken</th>
                                        <th className="px-4 py-2.5">Average Score</th>
                                        <th className="px-4 py-2.5">Strengths (≥ 70%)</th>
                                        <th className="px-4 py-2.5">Weaknesses (&lt; 50%)</th>
                                        <th className="px-4 py-2.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats?.studentRoster?.map((s) => {
                                        const isSelected = selectedStudentIds.includes(s.id);
                                        return (
                                            <tr key={s.id} className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                                                <td className="px-3 py-2.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleStudent(s.id)}
                                                        className="rounded border-slate-300 text-[#364c83] focus:ring-[#364c83] cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span className="font-semibold text-slate-900 block">{s.name}</span>
                                                    <span className="text-[11px] font-mono text-slate-500 font-normal">
                                                        ID: {s.studentCode || s.id?.slice(0, 8)?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-700">{isNumeric(s.gradeLevel) ? `Basic ${s.gradeLevel}` : s.gradeLevel}</td>
                                                <td className="px-4 py-2.5 text-slate-700">{s.classSection || '--'}</td>
                                                <td className="px-4 py-2.5 font-bold text-slate-900">{s.examsTaken ?? '--'}</td>
                                                <td className="px-4 py-2.5 font-bold text-[#364c83]">
                                                    {s.avgScore ? `${s.avgScore}%` : '--'}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {s.strengths && s.strengths.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {s.strengths.map((str, idx) => (
                                                                <span key={idx} className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-medium">
                                                                    {str}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 text-[11px]">--</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {s.weaknesses && s.weaknesses.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {s.weaknesses.map((wk, idx) => (
                                                                <span key={idx} className="rounded bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 text-[10px] font-medium">
                                                                    {wk}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 text-[11px]">None identified</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedStudentDiagnostic(s)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs font-bold text-[#364c83] hover:bg-indigo-100 shadow-2xs whitespace-nowrap cursor-pointer"
                                                    >
                                                        <Target size={12} />
                                                        Diagnostic Profile
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(!stats?.studentRoster || stats.studentRoster.length === 0) && (
                                        <tr>
                                            <td colSpan={9} className="py-6 text-center text-slate-400">
                                                No students mounted in your assigned classes yet. Ask your School Head to mount students.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 4: Diagnostics */}
            {activeTab === 'diagnostics' && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <h3 className="text-sm font-bold text-slate-900">Most Challenging Questions for Your Students</h3>
                        <p className="text-xs text-slate-500 mt-0.5 mb-4">
                            These questions had the highest failure rates among your students. Use this to target your next lesson revision!
                        </p>
                        <div className="space-y-3">
                            {stats?.topMissedQuestions?.map((q, i) => (
                                <div key={q.questionId || i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                                    <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-1">
                                        <span>Topic Question #{i + 1}</span>
                                        <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[11px]">
                                            Missed by {q.missCount} student{q.missCount === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <p className="text-xs font-medium text-slate-800">{q.text}</p>
                                    {q.explanation && (
                                        <p className="mt-2 text-[11px] text-slate-600 bg-white/70 rounded-md p-2 border border-amber-100">
                                            <strong>Curriculum Guidance:</strong> {q.explanation}
                                        </p>
                                    )}
                                </div>
                            ))}
                            {(!stats?.topMissedQuestions || stats.topMissedQuestions.length === 0) && (
                                <p className="py-8 text-center text-slate-400 text-xs">
                                    No diagnostics data yet. Once your students take quizzes, common misconceptions will be highlighted here.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 5: Assigned Quizzes */}
            {activeTab === 'assigned-quizzes' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">Assigned Quizzes Management</h3>
                            <p className="text-xs text-slate-500">
                                Monitor completion progress, student scores, and track who has completed or pending assignments.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (selectedStudentIds.length === 0) {
                                    selectAllStudents();
                                }
                                handleOpenAssignModal();
                            }}
                            className="flex items-center gap-1.5 rounded-xl bg-[#364c83] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1f2d57] transition cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>Create New Quiz Assignment</span>
                        </button>
                    </div>

                    <div className="space-y-3">
                        {assignments.map((asgn) => {
                            const completed = asgn.completedCount || 0;
                            const total = asgn.totalAssigned || (asgn.assignedStudentIds ? asgn.assignedStudentIds.length : 0);
                            const pctComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
                            const isExpanded = expandedAssignmentId === asgn.id;

                            return (
                                <div key={asgn.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="text-sm font-bold text-slate-900">{asgn.title}</h4>
                                                <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-[#364c83]">
                                                    {asgn.subjectName} &middot; {asgn.gradeLevel}
                                                </span>
                                                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                                                    <Clock size={11} />
                                                    {asgn.timerSeconds || 60}s / Q
                                                </span>
                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                    {asgn.questionCount || (asgn.questionIds ? asgn.questionIds.length : 0)} Questions
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Assigned on {new Date(asgn.createdAt).toLocaleDateString()} to {total} student{total === 1 ? '' : 's'}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedAssignmentId(isExpanded ? null : asgn.id)}
                                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
                                            >
                                                <Users size={13} />
                                                <span>{isExpanded ? 'Hide Submissions' : `View Submissions (${completed}/${total})`}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteAssignment(asgn.id)}
                                                className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                                                title="Recall / Delete Quiz Assignment"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                                            <span className="font-semibold">Completion Progress</span>
                                            <span className="font-bold text-[#364c83]">
                                                {completed} of {total} completed ({pctComplete}%)
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className="h-full bg-linear-to-r from-[#364c83] to-emerald-600 rounded-full transition-all duration-300"
                                                style={{ width: `${pctComplete}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Collapsible Student Completion Table */}
                                    {isExpanded && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                                                    <tr>
                                                        <th className="px-3 py-2">Student Name</th>
                                                        <th className="px-3 py-2">Section</th>
                                                        <th className="px-3 py-2">Status</th>
                                                        <th className="px-3 py-2">Score</th>
                                                        <th className="px-3 py-2">Percentage</th>
                                                        <th className="px-3 py-2 text-right">Completion Date</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {asgn.studentStatuses?.map((st: any) => {
                                                        const isDone = st.status === 'Completed';
                                                        return (
                                                            <tr key={st.studentId} className="hover:bg-slate-50/60">
                                                                <td className="px-3 py-2 font-semibold text-slate-900">{st.studentName}</td>
                                                                <td className="px-3 py-2 text-slate-600">{st.classSection || '--'}</td>
                                                                <td className="px-3 py-2">
                                                                    <span
                                                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                            isDone
                                                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                                        }`}
                                                                    >
                                                                        {isDone ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                                                                        {st.status}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 font-bold text-slate-800">
                                                                    {isDone ? `${st.score}/${st.total}` : '--'}
                                                                </td>
                                                                <td className="px-3 py-2 font-bold text-[#364c83]">
                                                                    {isDone ? `${st.percent}%` : '--'}
                                                                </td>
                                                                <td className="px-3 py-2 text-right text-slate-500">
                                                                    {st.completedAt ? new Date(st.completedAt).toLocaleString() : 'Pending'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {assignments.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-[#364c83] mb-3">
                                    <ClipboardList size={26} />
                                </div>
                                <h4 className="text-base font-bold text-slate-900">No Quizzes Assigned Yet</h4>
                                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                                    Go to the "Class Roster" tab, select students (or click "Select Remedial"), and click "Assign Quiz" to administer focused tests from the question pool.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('roster')}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#364c83] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1f2d57] transition cursor-pointer"
                                >
                                    <Users size={14} />
                                    <span>Go to Class Roster &amp; Select Students</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: Assign Quiz to Selected Students */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#364c83] text-white">
                                    <ClipboardList size={22} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Assign Quiz from Question Pool</h3>
                                    <p className="text-xs text-slate-500">
                                        Assigning to <strong>{selectedStudentIds.length}</strong> selected student{selectedStudentIds.length === 1 ? '' : 's'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Selected Students Chips Preview */}
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <span className="text-[11px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wide">
                                Target Students ({selectedStudentIds.length}):
                            </span>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {selectedStudentIds.map((sid) => {
                                    const st = stats?.studentRoster?.find((s) => s.id === sid);
                                    return (
                                        <span
                                            key={sid}
                                            className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-2xs"
                                        >
                                            {st ? st.name : sid}
                                            <button
                                                type="button"
                                                onClick={() => toggleStudent(sid)}
                                                className="text-slate-400 hover:text-rose-600 ml-0.5"
                                            >
                                                &times;
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Assignment Configuration Form */}
                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Quiz Title <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={quizTitle}
                                    onChange={(e) => setQuizTitle(e.target.value)}
                                    placeholder="e.g. Computing Term Revision Quiz"
                                    className="input w-full text-xs font-medium"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Subject <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={quizSubject}
                                        onChange={(e) => {
                                            const sub = e.target.value;
                                            setQuizSubject(sub);
                                            if (quizMode === 'manual') fetchPoolQuestions(sub, quizLevel);
                                        }}
                                        className="input w-full text-xs font-semibold"
                                    >
                                        {user.assignedSubjects && user.assignedSubjects.length > 0 ? (
                                            user.assignedSubjects.map((sub) => (
                                                <option key={sub} value={sub}>
                                                    {sub}
                                                </option>
                                            ))
                                        ) : (
                                            <>
                                                <option value="Computing">Computing</option>
                                                <option value="Information and Communications Technology (ICT)">
                                                    Information and Communications Technology (ICT)
                                                </option>
                                                <option value="Mathematics">Mathematics</option>
                                                <option value="English Language">English Language</option>
                                                <option value="Integrated Science">Integrated Science</option>
                                                <option value="Social Studies">Social Studies</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Target Grade Level <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={quizLevel}
                                        onChange={(e) => {
                                            const lvl = e.target.value;
                                            setQuizLevel(lvl);
                                            if (quizMode === 'manual') fetchPoolQuestions(quizSubject, lvl);
                                        }}
                                        className="input w-full text-xs font-semibold"
                                    >
                                        <option value="Basic 7">Basic 7</option>
                                        <option value="Basic 8">Basic 8</option>
                                        <option value="Basic 9">Basic 9</option>
                                        <option value="BECE">BECE</option>
                                        <option value="SHS 1">SHS 1</option>
                                        <option value="SHS 2">SHS 2</option>
                                        <option value="SHS 3">SHS 3</option>
                                        <option value="WASSCE">WASSCE</option>
                                        <option value="Basic 4">Basic 4</option>
                                        <option value="Basic 5">Basic 5</option>
                                        <option value="Basic 6">Basic 6</option>
                                    </select>
                                </div>
                            </div>

                            {/* Required Quiz Number / Question Volume */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    Number of Exam Questions to Administer:
                                </label>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                    {[10, 15, 20, 25, 30, 40, 50].map((num) => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setQuizQuestionCount(num)}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
                                                quizQuestionCount === num
                                                    ? 'bg-[#364c83] text-white shadow-xs'
                                                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            {num} Questions
                                        </button>
                                    ))}
                                    <div className="flex items-center gap-1 ml-1">
                                        <span className="text-xs text-slate-500 font-semibold">Custom:</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={quizQuestionCount}
                                            onChange={(e) => setQuizQuestionCount(Math.max(1, Number(e.target.value) || 10))}
                                            className="w-16 input py-1 px-2 text-xs text-center font-bold"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Default 60-second Timer Setup */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Clock size={14} className="text-[#364c83]" />
                                        Question Timer Pace (Enforced Default 60 Seconds):
                                    </label>
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        {quizTimerSeconds === 60 ? 'Standard 60s Default' : `${quizTimerSeconds}s Custom Pace`}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                    {[30, 45, 60, 90, 120].map((sec) => (
                                        <button
                                            key={sec}
                                            type="button"
                                            onClick={() => setQuizTimerSeconds(sec)}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
                                                quizTimerSeconds === sec
                                                    ? 'bg-emerald-700 text-white shadow-xs'
                                                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            {sec}s {sec === 60 ? '(Default)' : ''}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Students cannot change or bypass this timer during examination.
                                </p>
                            </div>

                            {/* Question Pool Selection Mode */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    Question Pool Selection Method:
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setQuizMode('random')}
                                        className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                                            quizMode === 'random'
                                                ? 'border-[#364c83] bg-indigo-50/50 shadow-2xs'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="font-bold text-xs text-slate-900 block">
                                            🎲 Automatic Random Draw
                                        </span>
                                        <span className="text-[11px] text-slate-500 mt-0.5 block">
                                            Automatically pulls {quizQuestionCount} questions from the pool for {quizSubject}.
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQuizMode('manual');
                                            fetchPoolQuestions(quizSubject, quizLevel);
                                        }}
                                        className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                                            quizMode === 'manual'
                                                ? 'border-[#364c83] bg-indigo-50/50 shadow-2xs'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="font-bold text-xs text-slate-900 block">
                                            📋 Browse &amp; Select Questions
                                        </span>
                                        <span className="text-[11px] text-slate-500 mt-0.5 block">
                                            Hand-pick exact questions from the pool ({selectedManualQIds.length} chosen).
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Manual Question Picker from Pool */}
                            {quizMode === 'manual' && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-800">
                                            Pool Questions for {quizSubject} ({poolQuestions.length} Available):
                                        </span>
                                        <span className="text-xs font-bold text-[#364c83]">
                                            {selectedManualQIds.length} questions chosen
                                        </span>
                                    </div>

                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={poolSearch}
                                            onChange={(e) => setPoolSearch(e.target.value)}
                                            placeholder="Search question pool text or topic..."
                                            className="input pl-8 py-1.5 text-xs w-full bg-white"
                                        />
                                    </div>

                                    {loadingPool ? (
                                        <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs">
                                            <Loader2 size={16} className="animate-spin text-[#364c83]" />
                                            Loading questions from pool...
                                        </div>
                                    ) : (
                                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                            {poolQuestions
                                                .filter((q) => !poolSearch || q.text.toLowerCase().includes(poolSearch.toLowerCase()) || (q.category && q.category.toLowerCase().includes(poolSearch.toLowerCase())))
                                                .map((q, idx) => {
                                                    const isChosen = selectedManualQIds.includes(q.id);
                                                    return (
                                                        <div
                                                            key={q.id}
                                                            onClick={() => {
                                                                setSelectedManualQIds((prev) =>
                                                                    prev.includes(q.id) ? prev.filter((x) => x !== q.id) : [...prev, q.id]
                                                                );
                                                            }}
                                                            className={`rounded-lg border p-2.5 text-xs transition cursor-pointer ${
                                                                isChosen
                                                                    ? 'border-[#364c83] bg-indigo-50/70 text-slate-900 font-medium'
                                                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChosen}
                                                                    readOnly
                                                                    className="mt-0.5 rounded border-slate-300 text-[#364c83] focus:ring-[#364c83]"
                                                                />
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mb-0.5">
                                                                        <span>#{idx + 1}</span>
                                                                        {q.category && <span className="text-[#364c83]">{q.category}</span>}
                                                                        {q.year && <span>WAEC {q.year}</span>}
                                                                    </div>
                                                                    <p className="line-clamp-2">{q.text}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            {poolQuestions.length === 0 && (
                                                <p className="text-center py-6 text-slate-400 text-xs">
                                                    No pool questions found for {quizSubject} ({quizLevel}).
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShowAssignModal(false)}
                                disabled={assigning}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateAssignment}
                                disabled={assigning}
                                className="flex items-center gap-2 rounded-xl bg-[#364c83] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#1f2d57] transition cursor-pointer"
                            >
                                {assigning && <Loader2 size={14} className="animate-spin text-white" />}
                                <span>{assigning ? 'Assigning...' : `Assign Quiz to ${selectedStudentIds.length} Student(s)`}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Student Diagnostic Profile Modal */}
            {selectedStudentDiagnostic && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                                    <Target size={24} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        {selectedStudentDiagnostic.name}
                                    </h3>
                                    <p className="text-xs text-slate-500 font-mono">
                                        ID: <strong>{selectedStudentDiagnostic.studentCode || selectedStudentDiagnostic.id?.slice(0, 8)?.toUpperCase()}</strong> &middot;{' '}
                                        Class: <strong>{isNumeric(selectedStudentDiagnostic.gradeLevel) ? `Basic ${selectedStudentDiagnostic.gradeLevel}` : selectedStudentDiagnostic.gradeLevel} {selectedStudentDiagnostic.classSection ? `(${selectedStudentDiagnostic.classSection})` : ''}</strong>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedStudentDiagnostic(null)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Summary Score Cards */}
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                                <span className="text-[11px] text-slate-500 font-medium block">Tests Taken</span>
                                <span className="text-xl font-bold text-slate-900 mt-0.5 block">
                                    {selectedStudentDiagnostic.examsTaken || 0}
                                </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                                <span className="text-[11px] text-slate-500 font-medium block">Average Score</span>
                                <span className="text-xl font-bold text-[#364c83] mt-0.5 block">
                                    {selectedStudentDiagnostic.avgScore ? `${selectedStudentDiagnostic.avgScore}%` : '--%'}
                                </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                                <span className="text-[11px] text-slate-500 font-medium block">Pass Rate</span>
                                <span className="text-xl font-bold text-emerald-700 mt-0.5 block">
                                    {selectedStudentDiagnostic.passRate ? `${selectedStudentDiagnostic.passRate}%` : '--%'}
                                </span>
                            </div>
                        </div>

                        {/* Strengths & Weaknesses Section */}
                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Strengths */}
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2">
                                    <Award size={14} className="text-emerald-700" />
                                    Strengths (Mastered ≥ 70%)
                                </span>
                                {selectedStudentDiagnostic.strengths && selectedStudentDiagnostic.strengths.length > 0 ? (
                                    <ul className="space-y-1.5">
                                        {selectedStudentDiagnostic.strengths.map((str: string, i: number) => (
                                            <li key={i} className="flex items-center gap-1.5 text-xs text-slate-800 bg-white p-2 rounded-lg border border-emerald-100 shadow-2xs">
                                                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                                <span className="font-semibold">{str}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-slate-500 italic py-2">
                                        No strong subjects recorded yet. More test attempts will reveal mastery areas.
                                    </p>
                                )}
                            </div>

                            {/* Weaknesses */}
                            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                                <span className="flex items-center gap-1.5 text-xs font-bold text-rose-900 uppercase tracking-wider mb-2">
                                    <AlertTriangle size={14} className="text-rose-700" />
                                    Weaknesses (Needs Support &lt; 50%)
                                </span>
                                {selectedStudentDiagnostic.weaknesses && selectedStudentDiagnostic.weaknesses.length > 0 ? (
                                    <ul className="space-y-1.5">
                                        {selectedStudentDiagnostic.weaknesses.map((wk: string, i: number) => (
                                            <li key={i} className="flex items-center gap-1.5 text-xs text-slate-800 bg-white p-2 rounded-lg border border-rose-100 shadow-2xs">
                                                <XCircle size={13} className="text-rose-600 shrink-0" />
                                                <span className="font-semibold">{wk}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-slate-500 italic py-2">
                                        No critical weaknesses detected (&lt; 50%). Student is performing well!
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Pedagogical Guidance for the Teacher */}
                        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs">
                            <span className="font-bold text-[#364c83] block mb-1">
                                👨‍🏫 Teacher Intervention &amp; Action Plan:
                            </span>
                            <p className="text-slate-700 leading-relaxed">
                                {selectedStudentDiagnostic.weaknesses && selectedStudentDiagnostic.weaknesses.length > 0
                                    ? `This student will benefit from targeted remediation in ${selectedStudentDiagnostic.weaknesses.join(', ')}. Review past quiz items with the student using the built-in AI Tutor for step-by-step explanations.`
                                    : (selectedStudentDiagnostic.avgScore || 0) >= 70
                                    ? 'Student is excelling across current assessments. Challenge them with higher-order thinking past questions and peer-tutoring leadership roles.'
                                    : 'Student shows average comprehension. Provide regular practice quizzes and encourage using the AI Tutor for post-quiz review.'}
                            </p>
                        </div>

                        {/* Recent Test Attempts */}
                        {selectedStudentDiagnostic.recentResults && selectedStudentDiagnostic.recentResults.length > 0 && (
                            <div className="mt-5">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                                    Recent Test History
                                </span>
                                <div className="space-y-2">
                                    {selectedStudentDiagnostic.recentResults.map((r: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
                                            <div>
                                                <span className="font-bold text-slate-900">{r.subjectName}</span>
                                                <span className="text-slate-500 block text-[11px]">
                                                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Recent'} &middot; Score: {r.score}/{r.total}
                                                </span>
                                            </div>
                                            <span className={`font-bold px-2 py-0.5 rounded ${r.percent >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                {r.percent}% {r.passed ? '✓' : '✗'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Detailed Question Review Modal */}
            {selectedReview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">
                                    {selectedReview.studentName}'s Test Review
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {selectedReview.subjectName} &middot; Score: <strong>{selectedReview.score}/{selectedReview.total} ({selectedReview.percent}%)</strong>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedReview(null)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-4 space-y-4">
                            {selectedReview.details?.map((item: any, i: number) => {
                                const isCor = item.isCorrect || item.correct;
                                const chosen = item.selected !== null && item.selected !== undefined ? item.selected : item.chosen;
                                return (
                                    <div key={item.id || i} className={`rounded-xl border p-4 text-xs ${isCor ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'}`}>
                                        <div className="flex items-center justify-between font-bold mb-1.5">
                                            <span className="text-slate-700">Question {i + 1}</span>
                                            <span className={`inline-flex items-center gap-1 font-bold ${isCor ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                {isCor ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                                {isCor ? 'Correct (+1)' : 'Wrong (0)'}
                                            </span>
                                        </div>
                                        <p className="font-semibold text-slate-900 mb-2.5">{item.text}</p>
                                        <div className="space-y-1 mb-2">
                                            {item.options?.map((opt: string, optIdx: number) => {
                                                const isStudentChoice = chosen === optIdx;
                                                const isTheCorrectOne = item.correctIndex === optIdx;
                                                let style = 'text-slate-600 bg-white/60';
                                                if (isTheCorrectOne) style = 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300';
                                                else if (isStudentChoice && !isTheCorrectOne) style = 'bg-rose-100 text-rose-900 font-bold border border-rose-300 line-through';
                                                return (
                                                    <div key={optIdx} className={`px-2.5 py-1 rounded text-[11px] ${style}`}>
                                                        {chr(optIdx)}) {opt} {isStudentChoice ? '(Student Choice)' : ''} {isTheCorrectOne ? '✓' : ''}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {item.explanation && (
                                            <p className="text-[11px] text-slate-600 bg-white/80 p-2 rounded border border-slate-100">
                                                <strong>Explanation:</strong> {item.explanation}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 3. School Administrator Dashboard (Mount Teachers & Students)       */
/* ------------------------------------------------------------------ */

export function SchoolAdminPortalView({
    user,
    token,
    onLogout,
    onSwitchToStudent: _onSwitchToStudent,
    activeTab: externalTab,
    onTabChange: externalTabChange,
}: {
    user: PortalUser;
    token: string;
    onLogout: () => void;
    onSwitchToStudent?: () => void;
    activeTab?: 'overview' | 'teachers' | 'students' | 'analysis' | 'profile' | 'lab';
    onTabChange?: (tab: 'overview' | 'teachers' | 'students' | 'analysis' | 'profile' | 'lab') => void;
}) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any | null>(null);
    const [teachers, setTeachers] = useState<PortalUser[]>([]);
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [internalTab, setInternalTab] = useState<'overview' | 'teachers' | 'students' | 'analysis' | 'profile' | 'lab'>('overview');
    const tab = externalTab !== undefined ? externalTab : internalTab;
    const setTab = (t: 'overview' | 'teachers' | 'students' | 'analysis' | 'profile' | 'lab') => {
        setInternalTab(t);
        if (externalTabChange) externalTabChange(t);
    };
    const [downloadingPack, setDownloadingPack] = useState(false);
    const [importingLab, setImportingLab] = useState(false);

    // Responsive Card Drilldown Detail Modal
    const [selectedCardDetail, setSelectedCardDetail] = useState<'students' | 'teachers' | 'exams' | 'average' | 'passrate' | null>(null);

    // Print Roster Modal
    const [showPrintRosterModal, setShowPrintRosterModal] = useState<boolean>(false);
    const [printRosterLevel, setPrintRosterLevel] = useState<string>('all');
    const [printRosterType, setPrintRosterType] = useState<'all' | 'students' | 'teachers'>('all');

    // Print Result Analysis Modal
    const [showResultAnalysisModal, setShowResultAnalysisModal] = useState<boolean>(false);
    const [analysisLevel, setAnalysisLevel] = useState<string>('all');
    const [analysisSubject, setAnalysisSubject] = useState<string>('all');

    // Mount Teacher Form State
    const [tName, setTName] = useState('');
    const [tGender, setTGender] = useState<'Male' | 'Female'>('Male');
    const [tEmail, setTEmail] = useState('');
    const [tPassword, setTPassword] = useState('');
    const [tSubjs, setTSubjs] = useState<string[]>(['Mathematics']);
    const [tLevels, setTLevels] = useState<string[]>(['7', '8', '9']);
    const [addingTeacher, setAddingTeacher] = useState(false);

    // Mount Student Form State (No email needed — authenticated via School Code)
    const [sName, setSName] = useState('');
    const [sGender, setSGender] = useState<'Male' | 'Female'>('Male');
    const [sId, setSId] = useState('');
    const [sLevel, setSLevel] = useState<string>('8');
    const [sSection, setSSection] = useState('');
    const [addingStudent, setAddingStudent] = useState(false);

    // Edit Student State (Schools Portal Only)
    const [editingStudent, setEditingStudent] = useState<PortalUser | null>(null);
    const [editSName, setEditSName] = useState('');
    const [editSGender, setEditSGender] = useState<'Male' | 'Female'>('Male');
    const [editSLevel, setEditSLevel] = useState<string>('8');
    const [editSSection, setEditSSection] = useState('');
    const [editSCode, setEditSCode] = useState('');
    const [editSPassword, setEditSPassword] = useState('');
    const [savingStudentEdit, setSavingStudentEdit] = useState(false);

    // Edit Teacher State (Schools Portal Only)
    const [editingTeacher, setEditingTeacher] = useState<PortalUser | null>(null);
    const [editTName, setEditTName] = useState('');
    const [editTGender, setEditTGender] = useState<'Male' | 'Female'>('Male');
    const [editTEmail, setEditTEmail] = useState('');
    const [editTSubjs, setEditTSubjs] = useState<string[]>([]);
    const [editTLevels, setEditTLevels] = useState<string[]>([]);
    const [editTPassword, setEditTPassword] = useState('');
    const [savingTeacherEdit, setSavingTeacherEdit] = useState(false);

    // Change Password State (in Profile Tab)
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [changingPw, setChangingPw] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // Manage Roster State (in Profile Tab)
    const [manageRosterTab, setManageRosterTab] = useState<'students' | 'teachers'>('students');
    const [manageRosterSearch, setManageRosterSearch] = useState('');

    // Bulk Student Modal
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkCsvText, setBulkCsvText] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ added: number; skipped: number } | null>(null);

    const [copiedCode, setCopiedCode] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const flash = (ok: boolean, text: string) => {
        setMsg({ ok, text });
        setTimeout(() => setMsg(null), 3500);
    };

    const loadAll = useCallback(async () => {
        try {
            const [pRes, tRes, sRes] = await Promise.all([
                api.post('/api/school/performance', { token }),
                api.post('/api/school/teachers', { token }),
                api.post('/api/school/students', { token })
            ]);
            setStats(pRes.data);
            setTeachers(tRes.data.teachers || []);
            setStudents(sRes.data.students || []);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const handleCopyCode = () => {
        if (user.schoolCode) {
            navigator.clipboard.writeText(user.schoolCode);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2000);
        }
    };

    const handleDownloadPack = async () => {
        setDownloadingPack(true);
        try {
            const res = await api.get('/api/offline/pack');
            if (res.data?.ok) {
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(user.schoolName || 'ExamHub').replace(/\s+/g, '_')}_Question_Pack.json`;
                a.click();
                URL.revokeObjectURL(url);
                flash(true, `Downloaded question pack (${res.data.totalQuestions} questions) for offline lab testing!`);
            }
        } catch {
            flash(false, 'Could not download question pack. Check network connection.');
        } finally {
            setDownloadingPack(false);
        }
    };

    const handleImportLabFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                setImportingLab(true);
                const parsed = JSON.parse(evt.target?.result as string);
                const results = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [];
                if (results.length === 0) {
                    flash(false, 'No valid test attempts found in this file.');
                    return;
                }
                const res = await api.post('/api/school/lab/import', {
                    token,
                    schoolId: user.schoolId,
                    schoolName: user.schoolName,
                    results,
                });
                flash(true, `Successfully imported ${res.data.importedCount} student test results from USB!`);
                loadAll();
            } catch {
                flash(false, 'Failed to import lab results. Ensure file is a valid .codecastic-results.json file.');
            } finally {
                setImportingLab(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const downloadCsvTemplate = () => {
        const csvContent =
            "Student Full Name,Gender,Grade Level,Class Section,Student ID\n" +
            "Kwame Osei,Male,Basic 8,8A,STU-001\n" +
            "Abena Mensah,Female,Basic 9,9B,STU-002\n" +
            "Kofi Appiah,Male,SHS 2,Science 1,STU-003\n" +
            "Ama Serwaa,Female,Basic 7,Gold,STU-004\n";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'codecastic_students_bulk_upload_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadStudentsCsv = () => {
        if (students.length === 0) {
            flash(false, 'No enrolled students to export yet.');
            return;
        }
        const headers = ["Student Name", "Gender", "Student ID / Code", "School Code", "Grade Level", "Class Section", "Exams Taken", "Average Score (%)"];
        const rows = students.map((st) => [
            `"${(st.name || '').replace(/"/g, '""')}"`,
            `"${(st.gender || 'Not Specified').replace(/"/g, '""')}"`,
            `"${((st as any).studentCode || st.id?.slice(0, 8)?.toUpperCase() || '').replace(/"/g, '""')}"`,
            `"${(user.schoolCode || '').replace(/"/g, '""')}"`,
            `"${isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}"`,
            `"${(st.classSection || '').replace(/"/g, '""')}"`,
            (st as any).examsTaken ?? 0,
            (st as any).avgScore ? `${(st as any).avgScore}%` : '--',
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeSchool = (user.schoolName || 'school').toLowerCase().replace(/[^a-z0-9]/g, '_');
        link.setAttribute('download', `${safeSchool}_enrolled_students.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadTeachersCsv = () => {
        if (teachers.length === 0) {
            flash(false, 'No mounted teachers to export yet.');
            return;
        }
        const headers = ["Teacher Name", "Gender", "Email", "Assigned Subject(s)", "Assigned Classes", "School Code"];
        const rows = teachers.map((t) => [
            `"${(t.name || '').replace(/"/g, '""')}"`,
            `"${(t.gender || 'Not Specified').replace(/"/g, '""')}"`,
            `"${(t.email || '').replace(/"/g, '""')}"`,
            `"${(t.assignedSubjects?.length ? t.assignedSubjects.join(', ') : 'All Subjects').replace(/"/g, '""')}"`,
            `"${(t.assignedLevels?.length ? t.assignedLevels.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') : 'All Classes').replace(/"/g, '""')}"`,
            `"${(user.schoolCode || '').replace(/"/g, '""')}"`,
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeSchool = (user.schoolName || 'school').toLowerCase().replace(/[^a-z0-9]/g, '_');
        link.setAttribute('download', `${safeSchool}_mounted_teachers.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadAnalysisCsv = (filteredStudents: PortalUser[], lvlLabel: string) => {
        if (filteredStudents.length === 0) {
            flash(false, 'No student results in this level to export.');
            return;
        }
        const headers = ["Student ID", "Student Name", "Gender", "Class Level", "Class Section", "Exams Taken", "Average Score (%)", "Status"];
        const rows = filteredStudents.map((st: any) => {
            const avg = st.avgScore || 0;
            const status = st.examsTaken > 0 ? (avg >= 50 ? 'Passed' : 'Needs Support') : 'Pending';
            return [
                `"${(st.studentCode || st.id?.slice(0, 8)?.toUpperCase() || '').replace(/"/g, '""')}"`,
                `"${(st.name || '').replace(/"/g, '""')}"`,
                `"${(st.gender || 'Not Specified').replace(/"/g, '""')}"`,
                `"${isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}"`,
                `"${(st.classSection || '').replace(/"/g, '""')}"`,
                st.examsTaken ?? 0,
                st.avgScore ? `${st.avgScore}%` : '--',
                `"${status}"`
            ];
        });
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeSchool = (user.schoolName || 'school').toLowerCase().replace(/[^a-z0-9]/g, '_');
        link.setAttribute('download', `${safeSchool}_result_analysis_${lvlLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleBulkFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = String(evt.target?.result || '');
            setBulkCsvText(text);
        };
        reader.readAsText(file);
    };

    const handleAddTeacher = async (e: FormEvent) => {
        e.preventDefault();
        setAddingTeacher(true);
        try {
            await api.post('/api/school/teachers/add', {
                token,
                name: tName.trim(),
                gender: tGender,
                email: tEmail.trim(),
                password: tPassword.trim() || 'Teacher2026#',
                assignedSubjects: tSubjs,
                assignedLevels: tLevels,
            });
            setTName('');
            setTGender('Male');
            setTEmail('');
            setTPassword('');
            flash(true, 'Teacher successfully mounted to school!');
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Could not mount teacher.');
        } finally {
            setAddingTeacher(false);
        }
    };

    const handleDeleteTeacher = async (teacherId: string, name: string) => {
        if (!confirm(`Remove teacher "${name}" from your school?`)) return;
        try {
            await api.post('/api/school/teachers/delete', { token, teacherId });
            flash(true, `Teacher "${name}" removed.`);
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Could not delete teacher.');
        }
    };

    const startEditingTeacher = (t: PortalUser) => {
        setEditingTeacher(t);
        setEditTName(t.name || '');
        setEditTGender((t.gender === 'Female' ? 'Female' : 'Male'));
        setEditTEmail(t.email || '');
        setEditTSubjs(Array.isArray(t.assignedSubjects) ? t.assignedSubjects : ['Mathematics']);
        setEditTLevels(Array.isArray(t.assignedLevels) ? t.assignedLevels.map(String) : ['7', '8', '9']);
        setEditTPassword('');
    };

    const handleUpdateTeacher = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingTeacher) return;
        setSavingTeacherEdit(true);
        try {
            await api.post('/api/school/teachers/update', {
                token,
                teacherId: editingTeacher.id,
                name: editTName.trim(),
                gender: editTGender,
                email: editTEmail.trim(),
                assignedSubjects: editTSubjs,
                assignedLevels: editTLevels,
                newPassword: editTPassword.trim() || undefined,
            });
            flash(true, `Teacher "${editTName.trim()}" updated successfully!`);
            setEditingTeacher(null);
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Could not update teacher.');
        } finally {
            setSavingTeacherEdit(false);
        }
    };

    const handleAddStudent = async (e: FormEvent) => {
        e.preventDefault();
        setAddingStudent(true);
        try {
            await api.post('/api/school/students/add', {
                token,
                name: sName.trim(),
                gender: sGender,
                studentCode: sId.trim(),
                gradeLevel: sLevel,
                classSection: sSection.trim(),
            });
            setSName('');
            setSGender('Male');
            setSId('');
            setSSection('');
            flash(true, 'Student enrolled successfully!');
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Could not enroll student.');
        } finally {
            setAddingStudent(false);
        }
    };

    const handleDeleteStudent = async (studentId: string, name: string) => {
        if (!confirm(`Delete student "${name}"?`)) return;
        try {
            await api.post('/api/school/students/delete', { token, studentId });
            flash(true, `Student "${name}" deleted.`);
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Could not delete student.');
        }
    };

    const startEditingStudent = (st: PortalUser) => {
        setEditingStudent(st);
        setEditSName(st.name || '');
        setEditSGender((st.gender === 'Female' ? 'Female' : 'Male'));
        setEditSLevel(String(st.gradeLevel || '8'));
        setEditSSection(st.classSection || '');
        setEditSCode(st.studentCode || '');
        setEditSPassword('');
    };

    const handleUpdateStudent = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingStudent) return;
        setSavingStudentEdit(true);
        try {
            await api.post('/api/school/students/update', {
                token,
                studentId: editingStudent.id,
                name: editSName.trim(),
                gender: editSGender,
                gradeLevel: editSLevel,
                classSection: editSSection.trim(),
                studentCode: editSCode.trim(),
                newPassword: editSPassword.trim() || undefined,
            });
            flash(true, `Student "${editSName.trim()}" updated successfully!`);
            setEditingStudent(null);
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Could not update student.');
        } finally {
            setSavingStudentEdit(false);
        }
    };

    const handleChangePassword = async (e: FormEvent) => {
        e.preventDefault();
        if (newPw !== confirmPw) {
            setPwMsg({ ok: false, text: 'New passwords do not match.' });
            return;
        }
        if (newPw.length < 6) {
            setPwMsg({ ok: false, text: 'New password must be at least 6 characters.' });
            return;
        }
        setChangingPw(true);
        setPwMsg(null);
        try {
            await api.post('/api/user/change-password', {
                token,
                oldPassword: oldPw,
                newPassword: newPw,
            });
            setPwMsg({ ok: true, text: 'Password successfully updated!' });
            setOldPw('');
            setNewPw('');
            setConfirmPw('');
            flash(true, 'Admin password changed successfully!');
        } catch (e2: any) {
            setPwMsg({ ok: false, text: e2?.response?.data?.error || 'Could not change password.' });
        } finally {
            setChangingPw(false);
        }
    };

    const handleBulkSubmit = async () => {
        if (!bulkCsvText.trim()) return;
        setBulkLoading(true);
        try {
            const lines = bulkCsvText.trim().split('\n');
            const studentsToPost: any[] = [];
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;
                // Skip header row if present
                if (/^(student\s*name|name|full\s*name)/i.test(line)) continue;

                // Split by comma or tab (handles copy-paste from Excel / Google Sheets)
                const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map((p) => p.trim());
                if (parts.length >= 1 && parts[0]) {
                    const name = parts[0];
                    let grade: any = sLevel;
                    let section = '';
                    let studentCode = '';
                    let gender = 'Male';

                    for (let pIdx = 1; pIdx < parts.length; pIdx++) {
                        const p = parts[pIdx];
                        if (/^(male|female|m|f)$/i.test(p)) {
                            gender = /^f/i.test(p) ? 'Female' : 'Male';
                        } else if (p.includes('@')) {
                            // ignore legacy email
                        } else {
                            const parsedLvl = normalizeLevelStr(p, null);
                            if (parsedLvl !== null) {
                                grade = parsedLvl;
                            } else if (/^[A-Z0-9]+-[0-9]+$/i.test(p) || /^STU-/i.test(p)) {
                                studentCode = p;
                            } else if (!section) {
                                section = p;
                            } else if (!studentCode) {
                                studentCode = p;
                            }
                        }
                    }

                    studentsToPost.push({
                        name,
                        gender,
                        gradeLevel: grade,
                        classSection: section,
                        studentCode,
                        password: 'Student2026#',
                    });
                }
            }

            if (studentsToPost.length === 0) {
                flash(false, 'No valid student rows found. Please check your CSV format.');
                return;
            }

            const res = await api.post('/api/school/students/bulk', {
                token,
                students: studentsToPost,
            });
            setBulkResult({ added: res.data.addedCount, skipped: res.data.skippedCount });
            flash(true, `Mounted ${res.data.addedCount} students to your school successfully!`);
            loadAll();
        } catch (e2: any) {
            flash(false, e2?.response?.data?.error || 'Failed bulk import.');
        } finally {
            setBulkLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-32 text-slate-400">
                <Loader2 className="animate-spin text-[#364c83]" size={22} />
                <span>Loading School Administration Portal...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                            <School size={26} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg sm:text-xl font-bold text-slate-900">{user.schoolName}</h1>
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                    School Admin
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                                <span>Head: <strong>{user.name}</strong></span>
                                <span>&middot;</span>
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                                    Join Code: {user.schoolCode || 'N/A'}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopyCode}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#364c83] hover:underline"
                                    title="Copy Join Code for students and teachers"
                                >
                                    {copiedCode ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                    {copiedCode ? 'Copied' : 'Copy Code'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setShowPrintRosterModal(true)}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
                            title="Print registered students and teachers list per level"
                        >
                            <Printer size={13} className="text-[#364c83]" />
                            Print Roster
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowResultAnalysisModal(true)}
                            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-[#364c83] hover:bg-indigo-100 transition shadow-2xs cursor-pointer"
                            title="Print academic result analysis report per level"
                        >
                            <FileText size={13} />
                            Print Result Analysis
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('profile')}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-2xs ${
                                tab === 'profile'
                                    ? 'border-[#364c83] bg-[#364c83] text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title="View School Profile, Change Password & Manage Roster"
                        >
                            <School size={13} className={tab === 'profile' ? 'text-white' : 'text-[#364c83]'} />
                            Profile &amp; Settings
                        </button>
                        <button
                            type="button"
                            onClick={onLogout}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        >
                            <LogOut size={12} />
                            Sign Out
                        </button>
                    </div>
                </div>

                {msg && (
                    <div className={`mt-4 rounded-lg p-2.5 text-xs font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                        {msg.text}
                    </div>
                )}

                {/* Overall KPIs (Responsive & Clickable to Reveal Details) */}
                <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <button
                        type="button"
                        onClick={() => setSelectedCardDetail('students')}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#364c83] hover:shadow-md cursor-pointer group ring-1 ring-slate-100"
                        title="Click to reveal student breakdown by level and gender"
                    >
                        <div className="flex items-center justify-between text-slate-500">
                            <span className="text-xs font-semibold block">Total Students</span>
                            <Users size={14} className="text-slate-400 group-hover:text-[#364c83]" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{stats?.studentCount || students.length}</div>
                        <span className="text-[10px] text-[#364c83] font-medium mt-1 inline-flex items-center gap-0.5 group-hover:underline">
                            Click for details &rarr;
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedCardDetail('teachers')}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#364c83] hover:shadow-md cursor-pointer group ring-1 ring-slate-100"
                        title="Click to reveal mounted teachers details"
                    >
                        <div className="flex items-center justify-between text-slate-500">
                            <span className="text-xs font-semibold block">Mounted Teachers</span>
                            <UserCheck size={14} className="text-slate-400 group-hover:text-[#364c83]" />
                        </div>
                        <div className="text-2xl font-bold text-[#364c83] mt-1">{stats?.teacherCount || teachers.length}</div>
                        <span className="text-[10px] text-[#364c83] font-medium mt-1 inline-flex items-center gap-0.5 group-hover:underline">
                            Click for details &rarr;
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedCardDetail('exams')}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#364c83] hover:shadow-md cursor-pointer group ring-1 ring-slate-100"
                        title="Click to reveal quizzes completed details"
                    >
                        <div className="flex items-center justify-between text-slate-500">
                            <span className="text-xs font-semibold block">Exams Completed</span>
                            <BookOpen size={14} className="text-slate-400 group-hover:text-[#364c83]" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{stats?.totalExams || 0}</div>
                        <span className="text-[10px] text-[#364c83] font-medium mt-1 inline-flex items-center gap-0.5 group-hover:underline">
                            Click for details &rarr;
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedCardDetail('average')}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#364c83] hover:shadow-md cursor-pointer group ring-1 ring-slate-100"
                        title="Click to reveal school average and subject breakdown"
                    >
                        <div className="flex items-center justify-between text-slate-500">
                            <span className="text-xs font-semibold block">School Average</span>
                            <TrendingUp size={14} className="text-slate-400 group-hover:text-[#364c83]" />
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                            {stats?.overallAvg ? `${stats.overallAvg}%` : '--%'}
                        </div>
                        <span className="text-[10px] text-[#364c83] font-medium mt-1 inline-flex items-center gap-0.5 group-hover:underline">
                            Click for details &rarr;
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedCardDetail('passrate')}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#364c83] hover:shadow-md cursor-pointer group ring-1 ring-slate-100 col-span-2 lg:col-span-1"
                        title="Click to reveal pass/fail analysis and gender metrics"
                    >
                        <div className="flex items-center justify-between text-slate-500">
                            <span className="text-xs font-semibold block">Pass Rate</span>
                            <Award size={14} className="text-slate-400 group-hover:text-emerald-600" />
                        </div>
                        <div className="text-2xl font-bold text-emerald-700 mt-1">
                            {stats?.overallPassRate ? `${stats.overallPassRate}%` : '--%'}
                        </div>
                        <span className="text-[10px] text-emerald-700 font-medium mt-1 inline-flex items-center gap-0.5 group-hover:underline">
                            Click for details &rarr;
                        </span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 gap-6 overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setTab('overview')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        tab === 'overview' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <BarChart3 size={16} />
                    Academic Performance Overview
                </button>
                <button
                    type="button"
                    onClick={() => setTab('teachers')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        tab === 'teachers' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <UserCheck size={16} />
                    Mount Teachers ({teachers.length})
                </button>
                <button
                    type="button"
                    onClick={() => setTab('students')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        tab === 'students' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Users size={16} />
                    Mount Students ({students.length})
                </button>
                <button
                    type="button"
                    onClick={() => setTab('analysis')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        tab === 'analysis' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Printer size={16} />
                    Result Analysis &amp; Printouts
                </button>
                <button
                    type="button"
                    onClick={() => setTab('profile')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                        tab === 'profile' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <School size={16} />
                    Profile &amp; Roster Management
                </button>
                <button
                    type="button"
                    onClick={() => setTab('lab')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        tab === 'lab' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <HardDrive size={16} />
                    Offline Lab & USB Hub
                </button>
            </div>

            {/* Tab 1: Overview */}
            {tab === 'overview' && (
                <div className="space-y-6">
                    {/* Subject Breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <h3 className="text-sm font-bold text-slate-900 mb-3">Performance by Subject</h3>
                            <div className="space-y-3">
                                {stats?.subjectBreakdown?.map((sb: any) => (
                                    <div key={sb.subjectName} className="flex items-center justify-between text-xs">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <span className="font-semibold text-slate-800 block truncate">{sb.subjectName}</span>
                                            <span className="text-[11px] text-slate-400">{sb.examsCount} quizzes taken</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-[#364c83] block">{sb.avgPercent}% avg</span>
                                            <span className="text-[10px] text-emerald-600">{sb.passRate}% pass</span>
                                        </div>
                                    </div>
                                ))}
                                {(!stats?.subjectBreakdown || stats.subjectBreakdown.length === 0) && (
                                    <p className="text-xs text-slate-400 py-4 text-center">No subject test data recorded yet.</p>
                                )}
                            </div>
                        </div>

                        {/* Level Breakdown */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <h3 className="text-sm font-bold text-slate-900 mb-3">Performance by Class Level</h3>
                            <div className="space-y-3">
                                {stats?.levelBreakdown?.map((lb: any) => (
                                    <div key={lb.levelLabel} className="flex items-center justify-between text-xs">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <span className="font-semibold text-slate-800 block truncate">{lb.levelLabel}</span>
                                            <span className="text-[11px] text-slate-400">{lb.examsCount} quizzes</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-[#364c83] block">{lb.avgPercent}% avg</span>
                                            <span className="text-[10px] text-emerald-600">{lb.passRate}% pass</span>
                                        </div>
                                    </div>
                                ))}
                                {(!stats?.levelBreakdown || stats.levelBreakdown.length === 0) && (
                                    <p className="text-xs text-slate-400 py-4 text-center">No class level test data recorded yet.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Gender Performance & Participation Analysis */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <Users className="text-[#364c83]" size={16} />
                                    Gender Performance &amp; Participation Analysis
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Comparative academic breakdown between male and female students across examinations.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPrintRosterModal(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                                >
                                    <Printer size={12} className="text-[#364c83]" />
                                    Print Roster
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowResultAnalysisModal(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-[#364c83] hover:bg-indigo-100 transition shadow-2xs"
                                >
                                    <FileText size={12} />
                                    Print Result Analysis
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            {/* Boys Enrollment */}
                            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5">
                                <span className="text-[11px] font-bold text-sky-900 uppercase tracking-wider block">
                                    Boys Enrolled
                                </span>
                                <div className="text-xl font-bold text-sky-950 mt-1">
                                    {stats?.genderBreakdown?.maleCount ?? students.filter(s => (s.gender || '').toLowerCase() === 'male').length}
                                </div>
                                <span className="text-[11px] text-sky-700 mt-0.5 block">
                                    {stats?.genderBreakdown?.maleExams ?? 0} tests taken
                                </span>
                            </div>

                            {/* Girls Enrollment */}
                            <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-3.5">
                                <span className="text-[11px] font-bold text-pink-900 uppercase tracking-wider block">
                                    Girls Enrolled
                                </span>
                                <div className="text-xl font-bold text-pink-950 mt-1">
                                    {stats?.genderBreakdown?.femaleCount ?? students.filter(s => (s.gender || '').toLowerCase() === 'female').length}
                                </div>
                                <span className="text-[11px] text-pink-700 mt-0.5 block">
                                    {stats?.genderBreakdown?.femaleExams ?? 0} tests taken
                                </span>
                            </div>

                            {/* Boys Average Score */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                                    Boys Average Score
                                </span>
                                <div className="text-xl font-bold text-[#364c83] mt-1">
                                    {stats?.genderBreakdown?.maleAvg ? `${stats.genderBreakdown.maleAvg}%` : '--%'}
                                </div>
                                <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">
                                    {stats?.genderBreakdown?.malePassRate ? `${stats.genderBreakdown.malePassRate}% Pass Rate` : '--'}
                                </span>
                            </div>

                            {/* Girls Average Score */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                                    Girls Average Score
                                </span>
                                <div className="text-xl font-bold text-pink-700 mt-1">
                                    {stats?.genderBreakdown?.femaleAvg ? `${stats.genderBreakdown.femaleAvg}%` : '--%'}
                                </div>
                                <span className="text-[11px] text-emerald-700 font-semibold mt-0.5 block">
                                    {stats?.genderBreakdown?.femalePassRate ? `${stats.genderBreakdown.femalePassRate}% Pass Rate` : '--'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Mount Teachers */}
            {tab === 'teachers' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Add Teacher Form */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <h3 className="text-sm font-bold text-slate-900 mb-3">Mount a Subject Teacher</h3>
                        <form onSubmit={handleAddTeacher} className="space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Teacher Full Name</label>
                                <input
                                    required
                                    value={tName}
                                    onChange={(e) => setTName(e.target.value)}
                                    placeholder="e.g. Mr. Samuel Mensah"
                                    className="input text-xs"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Gender</label>
                                <select
                                    value={tGender}
                                    onChange={(e) => setTGender(e.target.value as 'Male' | 'Female')}
                                    className="input text-xs"
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    value={tEmail}
                                    onChange={(e) => setTEmail(e.target.value)}
                                    placeholder="smensah@school.edu.gh"
                                    className="input text-xs"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Assigned Subject(s)</label>
                                <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1 bg-slate-50/50">
                                    {STANDARD_SUBJECTS.map((sub) => {
                                        const checked = tSubjs.includes(sub);
                                        return (
                                            <label key={sub} className="flex items-center gap-1.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setTSubjs([...tSubjs, sub]);
                                                        else setTSubjs(tSubjs.filter(s => s !== sub));
                                                    }}
                                                    className="rounded border-slate-300 text-[#364c83]"
                                                />
                                                <span className="text-[11px] text-slate-700">{sub}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Assigned Classes</label>
                                <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1 bg-slate-50/50">
                                    {ALL_POSSIBLE_LEVELS.map((lvl) => {
                                        const checked = tLevels.includes(lvl.id);
                                        return (
                                            <label key={lvl.id} className="flex items-center gap-1.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setTLevels([...tLevels, lvl.id]);
                                                        else setTLevels(tLevels.filter(l => l !== lvl.id));
                                                    }}
                                                    className="rounded border-slate-300 text-[#364c83]"
                                                />
                                                <span className="text-[11px] text-slate-700">{lvl.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Temporary Password</label>
                                <input
                                    value={tPassword}
                                    onChange={(e) => setTPassword(e.target.value)}
                                    placeholder="Teacher2026# (or leave empty)"
                                    className="input text-xs"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={addingTeacher}
                                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#364c83] py-2 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50 cursor-pointer"
                            >
                                {addingTeacher ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                Mount Teacher
                            </button>
                        </form>
                    </div>

                    {/* Teacher List Table */}
                    <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h3 className="text-sm font-bold text-slate-900">Mounted Subject Teachers</h3>
                            <button
                                type="button"
                                onClick={downloadTeachersCsv}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                            >
                                <Download size={12} />
                                Export Teachers (CSV)
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase">
                                    <tr>
                                        <th className="px-4 py-2.5">Name / Email</th>
                                        <th className="px-4 py-2.5">Gender</th>
                                        <th className="px-4 py-2.5">Subjects</th>
                                        <th className="px-4 py-2.5">Classes</th>
                                        <th className="px-4 py-2.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {teachers.map((t) => (
                                        <tr key={t.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                {t.name}
                                                <span className="block text-[11px] font-normal text-slate-400">{t.email}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                    t.gender === 'Female' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700'
                                                }`}>
                                                    {t.gender || 'Male'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                                {t.assignedSubjects?.length ? t.assignedSubjects.join(', ') : 'All Subjects'}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                                {t.assignedLevels?.length ? t.assignedLevels.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') : 'All Levels'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => startEditingTeacher(t)}
                                                    className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-[#364c83] cursor-pointer"
                                                    title="Edit teacher details"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteTeacher(t.id, t.name)}
                                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                                                    title="Remove teacher"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {teachers.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-slate-400">
                                                No teachers mounted yet. Add your subject teachers on the left.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 3: Mount Students */}
            {tab === 'students' && (
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-700">
                                Enrolled Students ({students.length})
                            </span>
                            <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-[#364c83]">
                                School Join Code: <span className="font-mono font-bold">{user.schoolCode || 'N/A'}</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={downloadCsvTemplate}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                                title="Download sample CSV format template for student roster"
                            >
                                <Download size={13} className="text-slate-500" />
                                CSV Template
                            </button>
                            <button
                                type="button"
                                onClick={downloadStudentsCsv}
                                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                                title="Download enrolled students list in CSV format"
                            >
                                <Download size={13} />
                                Export Students (CSV)
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowBulkModal(true)}
                                className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-[#364c83] hover:bg-indigo-100 transition shadow-2xs"
                            >
                                <Upload size={13} />
                                Bulk Upload Students (CSV)
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Single Student Add */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <h3 className="text-sm font-bold text-slate-900 mb-1">Add Single Student</h3>
                            <p className="text-[11px] text-slate-500 mb-3">
                                No email required. Students join using your School Code <strong className="font-mono text-[#364c83]">{user.schoolCode}</strong>.
                            </p>
                            <form onSubmit={handleAddStudent} className="space-y-3 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Student Full Name</label>
                                    <input
                                        required
                                        value={sName}
                                        onChange={(e) => setSName(e.target.value)}
                                        placeholder="e.g. Kwame Osei"
                                        className="input text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Gender</label>
                                    <select
                                        value={sGender}
                                        onChange={(e) => setSGender(e.target.value as 'Male' | 'Female')}
                                        className="input text-xs"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Student ID (Auto-Generated from School Code)</label>
                                    <input
                                        value={sId}
                                        onChange={(e) => setSId(e.target.value)}
                                        placeholder={`e.g. ${user.schoolCode || 'SCH'}-${String(students.length + 1).padStart(3, '0')}`}
                                        className="input text-xs font-mono"
                                    />
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                                        Auto-generated from your school code and sequence (e.g. {user.schoolCode || 'SCH'}-{String(students.length + 1).padStart(3, '0')}). Leave blank to generate automatically.
                                    </span>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Grade / Exam Level</label>
                                    <select
                                        value={sLevel}
                                        onChange={(e) => setSLevel(e.target.value)}
                                        className="input text-xs"
                                    >
                                        {ALL_POSSIBLE_LEVELS.map((lvl) => (
                                            <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Class Section (Optional)</label>
                                    <input
                                        value={sSection}
                                        onChange={(e) => setSSection(e.target.value)}
                                        placeholder="e.g. 8A, Green, Science 1"
                                        className="input text-xs"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={addingStudent}
                                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#364c83] py-2 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50 cursor-pointer"
                                >
                                    {addingStudent ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                    Add Student
                                </button>
                            </form>
                        </div>

                        {/* Students Table */}
                        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase">
                                        <tr>
                                            <th className="px-4 py-2.5">Student Name / ID</th>
                                            <th className="px-4 py-2.5">Gender</th>
                                            <th className="px-4 py-2.5">Level</th>
                                            <th className="px-4 py-2.5">Section</th>
                                            <th className="px-4 py-2.5">Exams Taken</th>
                                            <th className="px-4 py-2.5">Average</th>
                                            <th className="px-4 py-2.5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {students.map((st) => (
                                            <tr key={st.id} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                    {st.name}
                                                    <span className="block text-[11px] font-mono text-slate-500 font-normal">
                                                        ID: {(st as any).studentCode || st.id?.slice(0, 8)?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                        st.gender === 'Female' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700'
                                                    }`}>
                                                        {st.gender || 'Male'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-700">
                                                    {isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-700">{st.classSection || '--'}</td>
                                                <td className="px-4 py-2.5 font-bold text-slate-900">{(st as any).examsTaken ?? 0}</td>
                                                <td className="px-4 py-2.5 font-bold text-[#364c83]">
                                                    {(st as any).avgScore ? `${(st as any).avgScore}%` : '--'}
                                                </td>
                                                <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditingStudent(st)}
                                                        className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-[#364c83] cursor-pointer"
                                                        title="Edit student details"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteStudent(st.id, st.name)}
                                                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                                                        title="Delete student"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {students.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="py-8 text-center text-slate-400">
                                                    No students enrolled yet. Add students on the left, use Bulk Upload, or download the CSV template to prepare your list.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Result Analysis & Printouts */}
            {tab === 'analysis' && (() => {
                const filteredByLevel = students.filter((s) => {
                    if (analysisLevel === 'all') return true;
                    return String(s.gradeLevel) === String(analysisLevel);
                });
                const enrolledCount = filteredByLevel.length;
                const boysCount = filteredByLevel.filter(s => (s.gender || '').toLowerCase() === 'male').length;
                const girlsCount = filteredByLevel.filter(s => (s.gender || '').toLowerCase() === 'female').length;
                const studentsWithTests = filteredByLevel.filter((s: any) => (s.examsTaken || 0) > 0);
                const avgScore = studentsWithTests.length > 0
                    ? Math.round(studentsWithTests.reduce((acc: number, curr: any) => acc + (curr.avgScore || 0), 0) / studentsWithTests.length)
                    : 0;
                const passingCount = studentsWithTests.filter((s: any) => (s.avgScore || 0) >= 50).length;
                const passRate = studentsWithTests.length > 0 ? Math.round((passingCount / studentsWithTests.length) * 100) : 0;
                const selectedLvlLabel = ALL_POSSIBLE_LEVELS.find(l => l.id === analysisLevel)?.label || 'All Academic Levels';

                return (
                    <div className="space-y-6">
                        {/* Filter Bar */}
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <Filter size={14} className="text-[#364c83]" />
                                    <span>Filter Level:</span>
                                </div>
                                <select
                                    value={analysisLevel}
                                    onChange={(e) => setAnalysisLevel(e.target.value)}
                                    className="input text-xs py-1.5 w-auto"
                                >
                                    <option value="all">All School Levels (Basic 4 - SHS 3)</option>
                                    {ALL_POSSIBLE_LEVELS.map((lvl) => (
                                        <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <span>Subject:</span>
                                </div>
                                <select
                                    value={analysisSubject}
                                    onChange={(e) => setAnalysisSubject(e.target.value)}
                                    className="input text-xs py-1.5 w-auto"
                                >
                                    <option value="all">All Academic Subjects</option>
                                    {STANDARD_SUBJECTS.map((sub) => (
                                        <option key={sub} value={sub}>{sub}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => downloadAnalysisCsv(filteredByLevel, selectedLvlLabel)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
                                    title="Export level analysis results as CSV spreadsheet"
                                >
                                    <Download size={13} className="text-[#364c83]" />
                                    Export Analysis (CSV)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowResultAnalysisModal(true)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#364c83] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1f2d57] shadow-2xs transition cursor-pointer"
                                    title="Open official printable result analysis sheet"
                                >
                                    <Printer size={13} />
                                    Print Result Analysis
                                </button>
                            </div>
                        </div>

                        {/* Analysis Stat Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Enrolled ({selectedLvlLabel})
                                </span>
                                <div className="text-2xl font-bold text-slate-900 mt-1">{enrolledCount}</div>
                                <span className="text-[10px] text-slate-400 mt-0.5 block">{boysCount} Boys &middot; {girlsCount} Girls</span>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Assessed Candidates
                                </span>
                                <div className="text-2xl font-bold text-[#364c83] mt-1">{studentsWithTests.length}</div>
                                <span className="text-[10px] text-slate-400 mt-0.5 block">
                                    {enrolledCount > 0 ? `${Math.round((studentsWithTests.length / enrolledCount) * 100)}% participation` : '0%'}
                                </span>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Average Score
                                </span>
                                <div className="text-2xl font-bold text-slate-900 mt-1">{avgScore > 0 ? `${avgScore}%` : '--'}</div>
                                <span className="text-[10px] text-slate-400 mt-0.5 block">Overall Level Mean</span>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Pass Rate (≥ 50%)
                                </span>
                                <div className="text-2xl font-bold text-emerald-700 mt-1">{passRate > 0 ? `${passRate}%` : '--'}</div>
                                <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">{passingCount} Passed</span>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs col-span-2 md:col-span-1">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Gender Performance
                                </span>
                                <div className="mt-1 text-xs space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-sky-700">Boys Avg:</span>
                                        <span className="font-bold text-slate-800">{stats?.genderBreakdown?.maleAvg ? `${stats.genderBreakdown.maleAvg}%` : '--'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-pink-700">Girls Avg:</span>
                                        <span className="font-bold text-slate-800">{stats?.genderBreakdown?.femaleAvg ? `${stats.genderBreakdown.femaleAvg}%` : '--'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Student Result Analysis Table */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">
                                        Student Academic Performance Roster &middot; {selectedLvlLabel}
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Showing {filteredByLevel.length} registered students in this academic level.
                                    </p>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3">Rank / Student</th>
                                            <th className="px-4 py-3">Gender</th>
                                            <th className="px-4 py-3">Class Level</th>
                                            <th className="px-4 py-3">Section</th>
                                            <th className="px-4 py-3 text-center">Quizzes Taken</th>
                                            <th className="px-4 py-3 text-center">Average Score</th>
                                            <th className="px-4 py-3 text-right">Academic Standing</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredByLevel
                                            .slice()
                                            .sort((a: any, b: any) => (b.avgScore || 0) - (a.avgScore || 0))
                                            .map((st: any, idx: number) => {
                                                const avg = st.avgScore || 0;
                                                const hasTaken = (st.examsTaken || 0) > 0;
                                                const isPass = avg >= 50;
                                                return (
                                                    <tr key={st.id} className="hover:bg-slate-50/60 transition">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                                                                    #{idx + 1}
                                                                </span>
                                                                <div>
                                                                    <span className="font-bold text-slate-900 block">{st.name}</span>
                                                                    <span className="text-[11px] font-mono text-slate-400">
                                                                        ID: {st.studentCode || st.id?.slice(0, 8)?.toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                st.gender === 'Female' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700'
                                                            }`}>
                                                                {st.gender || 'Male'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-700">
                                                            {isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-700">{st.classSection || '--'}</td>
                                                        <td className="px-4 py-3 text-center font-bold text-slate-900">
                                                            {st.examsTaken ?? 0}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {hasTaken ? (
                                                                <span className={`font-bold ${avg >= 70 ? 'text-emerald-700' : avg >= 50 ? 'text-blue-700' : 'text-rose-700'}`}>
                                                                    {avg}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 font-normal">Pending</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {!hasTaken ? (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                                                    Awaiting Test
                                                                </span>
                                                            ) : isPass ? (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                                                    <CheckCircle2 size={11} />
                                                                    Passed
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                                                                    <XCircle size={11} />
                                                                    Needs Support
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        {filteredByLevel.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="py-8 text-center text-slate-400">
                                                    No students found in {selectedLvlLabel}. Enroll students or change your level filter above.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tab: Profile & Settings & School Roster Management */}
            {tab === 'profile' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* School Information Card */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                                    <School size={22} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">{user.schoolName}</h3>
                                    <p className="text-xs text-slate-500">Official Institutional Account</p>
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-100 divide-y divide-slate-100 text-xs overflow-hidden">
                                <div className="p-2.5 flex items-center justify-between bg-slate-50/50">
                                    <span className="text-slate-500">School Join Code</span>
                                    <div className="flex items-center gap-1">
                                        <code className="font-mono font-bold text-[#364c83] bg-white px-2 py-0.5 rounded border border-indigo-100">
                                            {user.schoolCode || 'N/A'}
                                        </code>
                                        <button
                                            type="button"
                                            onClick={handleCopyCode}
                                            className="p-1 rounded text-slate-400 hover:text-[#364c83]"
                                            title="Copy Code"
                                        >
                                            <Copy size={12} />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-2.5 flex items-center justify-between">
                                    <span className="text-slate-500">School Admin</span>
                                    <span className="font-semibold text-slate-800">{user.name}</span>
                                </div>
                                <div className="p-2.5 flex items-center justify-between">
                                    <span className="text-slate-500">Admin Email</span>
                                    <span className="font-semibold text-slate-800">{user.email || 'N/A'}</span>
                                </div>
                                <div className="p-2.5 flex items-center justify-between">
                                    <span className="text-slate-500">Account Type</span>
                                    <span className="font-semibold text-[#364c83]">Partner School Portal</span>
                                </div>
                                <div className="p-2.5 flex items-center justify-between">
                                    <span className="text-slate-500">Total Enrolled</span>
                                    <span className="font-semibold text-slate-800">{students.length} Students &middot; {teachers.length} Teachers</span>
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPrintRosterModal(true)}
                                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                                >
                                    <Printer size={13} className="text-[#364c83]" />
                                    Print Registered Roster
                                </button>
                            </div>
                        </div>

                        {/* Change Password Card */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <div className="flex items-center gap-2 mb-3">
                                <Lock size={16} className="text-[#364c83]" />
                                <h3 className="text-sm font-bold text-slate-900">Change Administrator Password</h3>
                            </div>
                            <p className="text-xs text-slate-500 mb-4">
                                Update the password used to sign into your school's administration portal.
                            </p>

                            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Current Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={oldPw}
                                        onChange={(e) => setOldPw(e.target.value)}
                                        placeholder="Enter your current password"
                                        className="input text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">New Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={newPw}
                                        onChange={(e) => setNewPw(e.target.value)}
                                        placeholder="Enter new password (min. 6 characters)"
                                        className="input text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={confirmPw}
                                        onChange={(e) => setConfirmPw(e.target.value)}
                                        placeholder="Repeat new password"
                                        className="input text-xs"
                                    />
                                </div>

                                {pwMsg && (
                                    <div className={`p-2 rounded text-xs font-semibold ${pwMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                                        {pwMsg.text}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={changingPw}
                                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#364c83] py-2 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50 transition cursor-pointer"
                                >
                                    {changingPw ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
                                    Update Password
                                </button>
                            </form>
                        </div>

                        {/* Quick Data Exports Card */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                            <h3 className="text-sm font-bold text-slate-900">Institutional Data Exports</h3>
                            <p className="text-xs text-slate-500">
                                Download school records and bulk rosters for offline archival or report generation.
                            </p>

                            <div className="space-y-2 pt-2">
                                <button
                                    type="button"
                                    onClick={downloadStudentsCsv}
                                    className="w-full flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition text-left"
                                >
                                    <span className="flex items-center gap-2">
                                        <Users size={14} className="text-[#364c83]" />
                                        Export All Enrolled Students (CSV)
                                    </span>
                                    <Download size={13} className="text-slate-400" />
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadTeachersCsv}
                                    className="w-full flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition text-left"
                                >
                                    <span className="flex items-center gap-2">
                                        <UserCheck size={14} className="text-[#364c83]" />
                                        Export All Mounted Teachers (CSV)
                                    </span>
                                    <Download size={13} className="text-slate-400" />
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadCsvTemplate}
                                    className="w-full flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition text-left"
                                >
                                    <span className="flex items-center gap-2">
                                        <FileText size={14} className="text-slate-400" />
                                        Download CSV Roster Template
                                    </span>
                                    <Download size={13} className="text-slate-400" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* School Roster Management (Schools Portal Only) */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <Edit3 size={16} className="text-[#364c83]" />
                                    School Roster Management &amp; Details
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Directly view, edit credentials, or delete teachers and students enrolled under your school.
                                </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
                                    <button
                                        type="button"
                                        onClick={() => setManageRosterTab('students')}
                                        className={`px-3 py-1 rounded-md transition ${
                                            manageRosterTab === 'students' ? 'bg-white text-[#364c83] font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Students ({students.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setManageRosterTab('teachers')}
                                        className={`px-3 py-1 rounded-md transition ${
                                            manageRosterTab === 'teachers' ? 'bg-white text-[#364c83] font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Teachers ({teachers.length})
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={manageRosterSearch}
                                    onChange={(e) => setManageRosterSearch(e.target.value)}
                                    placeholder="Search by name, ID or level..."
                                    className="input text-xs py-1.5 w-48 sm:w-60"
                                />
                            </div>
                        </div>

                        {manageRosterTab === 'students' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-2.5">Student Name / ID</th>
                                            <th className="px-4 py-2.5">Gender</th>
                                            <th className="px-4 py-2.5">Level</th>
                                            <th className="px-4 py-2.5">Section</th>
                                            <th className="px-4 py-2.5">Exams</th>
                                            <th className="px-4 py-2.5">Avg (%)</th>
                                            <th className="px-4 py-2.5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {students
                                            .filter((s) => {
                                                if (!manageRosterSearch.trim()) return true;
                                                const q = manageRosterSearch.toLowerCase();
                                                return s.name.toLowerCase().includes(q) ||
                                                    ((s as any).studentCode && (s as any).studentCode.toLowerCase().includes(q)) ||
                                                    String(s.gradeLevel).toLowerCase().includes(q);
                                            })
                                            .map((st) => (
                                                <tr key={st.id} className="hover:bg-slate-50/60 transition">
                                                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                        {st.name}
                                                        <span className="block text-[11px] font-mono text-slate-400 font-normal">
                                                            ID: {(st as any).studentCode || st.id?.slice(0, 8)?.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                            st.gender === 'Female' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700'
                                                        }`}>
                                                            {st.gender || 'Male'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-700">
                                                        {isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-700">{st.classSection || '--'}</td>
                                                    <td className="px-4 py-2.5 font-bold text-slate-900">{(st as any).examsTaken ?? 0}</td>
                                                    <td className="px-4 py-2.5 font-bold text-[#364c83]">
                                                        {(st as any).avgScore ? `${(st as any).avgScore}%` : '--'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditingStudent(st)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                                                            title="Edit Student Information"
                                                        >
                                                            <Edit3 size={11} className="text-[#364c83]" />
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteStudent(st.id, st.name)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer shadow-2xs"
                                                            title="Delete Student from School"
                                                        >
                                                            <Trash2 size={11} />
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        {students.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="py-8 text-center text-slate-400">
                                                    No registered students found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-2.5">Teacher Name</th>
                                            <th className="px-4 py-2.5">Gender</th>
                                            <th className="px-4 py-2.5">Email</th>
                                            <th className="px-4 py-2.5">Subjects</th>
                                            <th className="px-4 py-2.5">Assigned Classes</th>
                                            <th className="px-4 py-2.5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {teachers
                                            .filter((t) => {
                                                if (!manageRosterSearch.trim()) return true;
                                                const q = manageRosterSearch.toLowerCase();
                                                return t.name.toLowerCase().includes(q) ||
                                                    (t.email && t.email.toLowerCase().includes(q));
                                            })
                                            .map((t) => (
                                                <tr key={t.id} className="hover:bg-slate-50/60 transition">
                                                    <td className="px-4 py-2.5 font-semibold text-slate-900">{t.name}</td>
                                                    <td className="px-4 py-2.5">
                                                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                            t.gender === 'Female' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700'
                                                        }`}>
                                                            {t.gender || 'Male'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px]">{t.email}</td>
                                                    <td className="px-4 py-2.5 text-slate-700">
                                                        {t.assignedSubjects?.length ? t.assignedSubjects.join(', ') : 'All Subjects'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-700">
                                                        {t.assignedLevels?.length ? t.assignedLevels.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') : 'All Levels'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditingTeacher(t)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                                                            title="Edit Teacher Information"
                                                        >
                                                            <Edit3 size={11} className="text-[#364c83]" />
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteTeacher(t.id, t.name)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer shadow-2xs"
                                                            title="Delete Teacher from School"
                                                        >
                                                            <Trash2 size={11} />
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        {teachers.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-slate-400">
                                                    No mounted teachers found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tab 4: Offline Lab & USB Hub */}
            {tab === 'lab' && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-[#364c83]">
                                <HardDrive size={22} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">School ICT Computer Lab Offline Testing Hub</h3>
                                <p className="text-xs text-slate-500">
                                    Equip your school's computer lab to administer BECE and WASSCE mock examinations completely offline without active internet.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Action 1 */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
                                <div>
                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[#364c83] text-white font-bold text-xs mb-2">
                                        1
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-900">Standalone Lab Runner</h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                        A single self-contained HTML test environment. Opens directly in Google Chrome, Microsoft Edge, or Firefox on any desktop PC without installing any software.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-200/80">
                                    <a
                                        href="/lab-runner.html"
                                        download="codecastic-lab-runner.html"
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#364c83] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#2a3c68] shadow-2xs transition"
                                    >
                                        <Download size={14} />
                                        Download lab-runner.html
                                    </a>
                                </div>
                            </div>

                            {/* Action 2 */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
                                <div>
                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[#364c83] text-white font-bold text-xs mb-2">
                                        2
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-900">Offline Question Pack</h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                        Exports the latest national curriculum questions, subjects, options, and explanations into an encrypted JSON pack ready for your USB drive.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-200/80">
                                    <button
                                        type="button"
                                        onClick={handleDownloadPack}
                                        disabled={downloadingPack}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs disabled:opacity-50 transition"
                                    >
                                        {downloadingPack ? <Loader2 size={14} className="animate-spin text-[#364c83]" /> : <Download size={14} />}
                                        {downloadingPack ? 'Generating Pack...' : 'Download Question Pack (.json)'}
                                    </button>
                                </div>
                            </div>

                            {/* Action 3 */}
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col justify-between">
                                <div>
                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 text-white font-bold text-xs mb-2">
                                        3
                                    </span>
                                    <h4 className="text-sm font-bold text-slate-900">Import Lab Results (USB)</h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                        After students complete their mock exams in the ICT lab, upload their exported results file here to populate the school performance charts and teacher records.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-emerald-200/80">
                                    <label className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs cursor-pointer transition">
                                        {importingLab ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        <span>{importingLab ? 'Importing Attempts...' : 'Upload Results from USB'}</span>
                                        <input
                                            type="file"
                                            accept=".json,.codecastic-results.json"
                                            className="hidden"
                                            onChange={handleImportLabFile}
                                            disabled={importingLab}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Step-by-step instructions card */}
                        <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
                            <h4 className="text-xs font-bold text-[#364c83] uppercase tracking-wider mb-3">
                                5-Step ICT Laboratory Exam Procedure
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs text-slate-700">
                                <div className="rounded-lg bg-white/90 p-3 border border-indigo-100">
                                    <span className="font-bold text-[#364c83] block mb-1">Step 1: Save to USB</span>
                                    Download <code>lab-runner.html</code> and the Question Pack <code>.json</code> onto any USB flash drive.
                                </div>
                                <div className="rounded-lg bg-white/90 p-3 border border-indigo-100">
                                    <span className="font-bold text-[#364c83] block mb-1">Step 2: Open in Lab</span>
                                    Plug the USB into lab computers and double-click <code>codecastic-lab-runner.html</code> in the web browser.
                                </div>
                                <div className="rounded-lg bg-white/90 p-3 border border-indigo-100">
                                    <span className="font-bold text-[#364c83] block mb-1">Step 3: Load Questions</span>
                                    Click "Load Question Pack (.json)" once on the computer. All subjects and questions load instantly.
                                </div>
                                <div className="rounded-lg bg-white/90 p-3 border border-indigo-100">
                                    <span className="font-bold text-[#364c83] block mb-1">Step 4: Take Exams</span>
                                    Students enter their name & class section, select their subject, and complete the timed examination.
                                </div>
                                <div className="rounded-lg bg-white/90 p-3 border border-indigo-100">
                                    <span className="font-bold text-[#364c83] block mb-1">Step 5: Export & Upload</span>
                                    Click "Export Results to USB" on the lab PCs. Bring the USB back to this portal and click "Upload Results from USB".
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showBulkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Bulk Mount Students (CSV Format)</h3>
                                <p className="text-xs text-slate-500">Paste your class roster below to provision accounts instantly.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setShowBulkModal(false); setBulkResult(null); }}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-4 text-xs space-y-3">
                            <div className="rounded-lg bg-indigo-50/70 border border-indigo-200 p-3 text-slate-700">
                                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                                    <strong>Format (one student per line):</strong>
                                    <button
                                        type="button"
                                        onClick={downloadCsvTemplate}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#364c83] hover:underline"
                                    >
                                        <Download size={12} />
                                        Download CSV Template
                                    </button>
                                </div>
                                <pre className="mt-1 font-mono text-[11px] text-[#364c83] bg-white/80 p-2 rounded border border-indigo-100">
{`Kwame Osei, Basic 8, 8A
Abena Mensah, Basic 9, 9B
Yaw Boakye, SHS 2, Science 1`}
                                </pre>
                                <span className="text-[10px] text-slate-500 mt-1 block">
                                    Columns: <strong>Student Full Name, Grade Level (Basic 4-9 or SHS 1-3), Class Section (optional), Student ID (optional)</strong>. Student IDs are automatically generated from your school code and registration sequence (e.g. {user.schoolCode || 'SCH'}-001, {user.schoolCode || 'SCH'}-002) if left blank. No emails needed — students join using school code <span className="font-mono font-bold text-[#364c83]">{user.schoolCode}</span>.
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-xs">
                                <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition">
                                    <Upload size={13} className="text-slate-500" />
                                    <span>Upload CSV / Excel File</span>
                                    <input
                                        type="file"
                                        accept=".csv,.tsv,.txt"
                                        onChange={handleBulkFileUpload}
                                        className="hidden"
                                    />
                                </label>
                                <span className="text-[11px] text-slate-400">or paste directly below</span>
                            </div>

                            <textarea
                                rows={8}
                                value={bulkCsvText}
                                onChange={(e) => setBulkCsvText(e.target.value)}
                                placeholder={`Kwame Osei, Basic 8, 8A, STU-001\nAbena Mensah, Basic 9, 9B, STU-002\nYaw Boakye, SHS 2, Science 1, STU-003`}
                                className="input font-mono text-xs w-full p-3 leading-relaxed"
                            />

                            {bulkResult && (
                                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-emerald-800 text-xs">
                                    ✓ Mounted <strong>{bulkResult.added}</strong> students. Skipped: {bulkResult.skipped}.
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowBulkModal(false); setBulkResult(null); }}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBulkSubmit}
                                    disabled={bulkLoading || !bulkCsvText.trim()}
                                    className="flex items-center gap-1.5 rounded-lg bg-[#364c83] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50"
                                >
                                    {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                    Mount Students Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Responsive Stat Card Drilldown Details */}
            {selectedCardDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    {selectedCardDetail === 'students' && <Users className="text-[#364c83]" size={18} />}
                                    {selectedCardDetail === 'teachers' && <UserCheck className="text-[#364c83]" size={18} />}
                                    {selectedCardDetail === 'exams' && <BookOpen className="text-[#364c83]" size={18} />}
                                    {selectedCardDetail === 'average' && <TrendingUp className="text-[#364c83]" size={18} />}
                                    {selectedCardDetail === 'passrate' && <Award className="text-emerald-700" size={18} />}
                                    {selectedCardDetail === 'students' && 'Enrolled Students Drilldown & Breakdown'}
                                    {selectedCardDetail === 'teachers' && 'Mounted Teachers Roster & Coverage'}
                                    {selectedCardDetail === 'exams' && 'Completed Examinations & Activity Metrics'}
                                    {selectedCardDetail === 'average' && 'School Academic Average & Performance Distribution'}
                                    {selectedCardDetail === 'passrate' && 'Pass Rate & Gender Competency Breakdown'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Comprehensive breakdown for {user.schoolName}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedCardDetail(null)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-4 space-y-4 text-xs">
                            {/* 1. Students Detail */}
                            {selectedCardDetail === 'students' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Enrolled</span>
                                            <span className="text-xl font-bold text-slate-900 mt-0.5 block">{students.length}</span>
                                        </div>
                                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-sky-800 block">Male Students</span>
                                            <span className="text-xl font-bold text-sky-950 mt-0.5 block">
                                                {students.filter(s => (s.gender || '').toLowerCase() === 'male').length}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-pink-800 block">Female Students</span>
                                            <span className="text-xl font-bold text-pink-950 mt-0.5 block">
                                                {students.filter(s => (s.gender || '').toLowerCase() === 'female').length}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-bold text-slate-800 mb-2">Enrollment Distribution by Level:</h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {ALL_POSSIBLE_LEVELS.map((lvl) => {
                                                const count = students.filter(s => String(s.gradeLevel) === String(lvl.id)).length;
                                                return (
                                                    <div key={lvl.id} className="rounded-lg border border-slate-200 p-2.5 flex items-center justify-between bg-white">
                                                        <span className="font-semibold text-slate-700">{lvl.label}</span>
                                                        <span className="font-bold text-[#364c83] bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                                                            {count}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 2. Teachers Detail */}
                            {selectedCardDetail === 'teachers' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Mounted Teachers</span>
                                            <span className="text-xl font-bold text-[#364c83] mt-0.5 block">{teachers.length}</span>
                                        </div>
                                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-sky-800 block">Male Teachers</span>
                                            <span className="text-xl font-bold text-sky-950 mt-0.5 block">
                                                {teachers.filter(t => (t.gender || '').toLowerCase() === 'male').length}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-pink-800 block">Female Teachers</span>
                                            <span className="text-xl font-bold text-pink-950 mt-0.5 block">
                                                {teachers.filter(t => (t.gender || '').toLowerCase() === 'female').length}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-slate-600">
                                                <tr>
                                                    <th className="p-2.5">Name</th>
                                                    <th className="p-2.5">Gender</th>
                                                    <th className="p-2.5">Assigned Subject(s)</th>
                                                    <th className="p-2.5">Classes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {teachers.map(t => (
                                                    <tr key={t.id} className="hover:bg-slate-50/50">
                                                        <td className="p-2.5 font-semibold text-slate-900">{t.name}</td>
                                                        <td className="p-2.5">{t.gender || 'Male'}</td>
                                                        <td className="p-2.5 text-slate-600">
                                                            {t.assignedSubjects?.length ? t.assignedSubjects.join(', ') : 'All Subjects'}
                                                        </td>
                                                        <td className="p-2.5 text-slate-600">
                                                            {t.assignedLevels?.length ? t.assignedLevels.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') : 'All Levels'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* 3. Exams Detail */}
                            {selectedCardDetail === 'exams' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Quizzes</span>
                                            <span className="text-xl font-bold text-slate-900 mt-0.5 block">{stats?.totalExams || 0}</span>
                                        </div>
                                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-sky-800 block">Boys Attempts</span>
                                            <span className="text-xl font-bold text-sky-950 mt-0.5 block">{stats?.genderBreakdown?.maleExams || 0}</span>
                                        </div>
                                        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-pink-800 block">Girls Attempts</span>
                                            <span className="text-xl font-bold text-pink-950 mt-0.5 block">{stats?.genderBreakdown?.femaleExams || 0}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-bold text-slate-800 mb-2">Subject Activity Volume:</h4>
                                        <div className="space-y-1.5">
                                            {stats?.subjectBreakdown?.map((sb: any) => (
                                                <div key={sb.subjectName} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/50">
                                                    <span className="font-semibold text-slate-700">{sb.subjectName}</span>
                                                    <span className="font-mono font-bold text-[#364c83]">{sb.examsCount} attempts</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 4. Average Detail */}
                            {selectedCardDetail === 'average' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 block">School Average</span>
                                            <span className="text-xl font-bold text-[#364c83] mt-0.5 block">
                                                {stats?.overallAvg ? `${stats.overallAvg}%` : '--%'}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-sky-800 block">Boys Average</span>
                                            <span className="text-xl font-bold text-sky-950 mt-0.5 block">
                                                {stats?.genderBreakdown?.maleAvg ? `${stats.genderBreakdown.maleAvg}%` : '--%'}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-pink-800 block">Girls Average</span>
                                            <span className="text-xl font-bold text-pink-950 mt-0.5 block">
                                                {stats?.genderBreakdown?.femaleAvg ? `${stats.genderBreakdown.femaleAvg}%` : '--%'}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-bold text-slate-800 mb-2">Subject Scores Overview:</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {stats?.subjectBreakdown?.map((sb: any) => (
                                                <div key={sb.subjectName} className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                                                    <span className="font-semibold text-slate-700">{sb.subjectName}</span>
                                                    <span className="font-bold text-slate-900">{sb.avgPercent}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 5. Pass Rate Detail */}
                            {selectedCardDetail === 'passrate' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Overall Pass Rate</span>
                                            <span className="text-xl font-bold text-emerald-900 mt-0.5 block">
                                                {stats?.overallPassRate ? `${stats.overallPassRate}%` : '--%'}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-sky-800 block">Boys Pass Rate</span>
                                            <span className="text-xl font-bold text-sky-950 mt-0.5 block">
                                                {stats?.genderBreakdown?.malePassRate ? `${stats.genderBreakdown.malePassRate}%` : '--%'}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-pink-200 bg-pink-50/70 p-3 text-center">
                                            <span className="text-[10px] uppercase font-bold text-pink-800 block">Girls Pass Rate</span>
                                            <span className="text-xl font-bold text-pink-950 mt-0.5 block">
                                                {stats?.genderBreakdown?.femalePassRate ? `${stats.genderBreakdown.femalePassRate}%` : '--%'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                                        <h4 className="font-bold text-slate-800 mb-1">Academic Pass Benchmark Policy</h4>
                                        <p className="text-slate-600 leading-relaxed">
                                            A student achieves passing status by attaining an exam score of <strong>50% or higher</strong> on national curriculum standardized assessments. Students scoring below 50% are automatically flagged for targeted teacher diagnostic intervention.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setSelectedCardDetail(null)}
                                    className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                                >
                                    Close Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Official Printable Roster Per Level */}
            {showPrintRosterModal && (() => {
                const filteredStudents = students.filter(s => {
                    if (printRosterLevel === 'all') return true;
                    return String(s.gradeLevel) === String(printRosterLevel);
                });
                const filteredTeachers = teachers.filter(t => {
                    if (printRosterLevel === 'all') return true;
                    if (!t.assignedLevels || t.assignedLevels.length === 0) return true;
                    return t.assignedLevels.map(String).includes(String(printRosterLevel));
                });
                const lvlLabel = ALL_POSSIBLE_LEVELS.find(l => l.id === printRosterLevel)?.label || 'All School Levels (Basic 4 - SHS 3)';
                const boysCount = filteredStudents.filter(s => (s.gender || '').toLowerCase() === 'male').length;
                const girlsCount = filteredStudents.filter(s => (s.gender || '').toLowerCase() === 'female').length;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
                        <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
                            {/* Controls Bar (Hidden during print) */}
                            <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Printer className="text-[#364c83]" size={18} />
                                        Print Registered Roster per Level
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Select class level below to filter your official printable roster.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        <span>Level:</span>
                                        <select
                                            value={printRosterLevel}
                                            onChange={(e) => setPrintRosterLevel(e.target.value)}
                                            className="input text-xs py-1 w-auto"
                                        >
                                            <option value="all">All School Levels</option>
                                            {ALL_POSSIBLE_LEVELS.map(lvl => (
                                                <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        <span>Include:</span>
                                        <select
                                            value={printRosterType}
                                            onChange={(e) => setPrintRosterType(e.target.value as 'all' | 'students' | 'teachers')}
                                            className="input text-xs py-1 w-auto"
                                        >
                                            <option value="all">Students &amp; Teachers</option>
                                            <option value="students">Students Only</option>
                                            <option value="teachers">Teachers Only</option>
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => window.print()}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#364c83] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1f2d57] shadow-sm cursor-pointer"
                                    >
                                        <Printer size={13} />
                                        Print Now (A4 / PDF)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowPrintRosterModal(false)}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Printable Report Sheet Area */}
                            <div className="printable-report-area bg-white text-slate-900 p-2 sm:p-4 font-sans">
                                {/* School Header Banner */}
                                <div className="border-b-2 border-slate-900 pb-4 mb-4 text-center">
                                    <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-slate-900">
                                        {user.schoolName || 'CODECASTIC PARTNER SCHOOL'}
                                    </h1>
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mt-0.5">
                                        OFFICIAL REGISTERED CANDIDATE &amp; TEACHER ROSTER &middot; ACADEMIC YEAR 2025/2026
                                    </p>
                                    <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs text-slate-700">
                                        <span><strong>School Code:</strong> {user.schoolCode || 'N/A'}</span>
                                        <span>&middot;</span>
                                        <span><strong>Selected Level:</strong> {lvlLabel}</span>
                                        <span>&middot;</span>
                                        <span><strong>Date Generated:</strong> {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                </div>

                                {/* Summary Statistics */}
                                <div className="grid grid-cols-4 gap-2 mb-4 text-center text-xs">
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[10px]">Total Registered</span>
                                        <span className="text-base font-black text-slate-900">{filteredStudents.length} Students</span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[10px]">Boys</span>
                                        <span className="text-base font-black text-slate-900">{boysCount}</span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[10px]">Girls</span>
                                        <span className="text-base font-black text-slate-900">{girlsCount}</span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[10px]">Subject Teachers</span>
                                        <span className="text-base font-black text-slate-900">{filteredTeachers.length}</span>
                                    </div>
                                </div>

                                {/* Teachers Section */}
                                {(printRosterType === 'all' || printRosterType === 'teachers') && filteredTeachers.length > 0 && (
                                    <div className="mb-6">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-2 border-b border-slate-300 pb-1">
                                            1. Mounted Subject Teachers ({filteredTeachers.length})
                                        </h3>
                                        <table className="w-full text-left text-xs border border-slate-300">
                                            <thead className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px]">
                                                <tr>
                                                    <th className="p-2 border-r border-slate-300">#</th>
                                                    <th className="p-2 border-r border-slate-300">Teacher Full Name</th>
                                                    <th className="p-2 border-r border-slate-300">Gender</th>
                                                    <th className="p-2 border-r border-slate-300">Assigned Subject(s)</th>
                                                    <th className="p-2">Assigned Classes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {filteredTeachers.map((t, idx) => (
                                                    <tr key={t.id}>
                                                        <td className="p-2 border-r border-slate-300 font-mono text-[11px]">{idx + 1}</td>
                                                        <td className="p-2 border-r border-slate-300 font-bold text-slate-900">{t.name}</td>
                                                        <td className="p-2 border-r border-slate-300">{t.gender || 'Male'}</td>
                                                        <td className="p-2 border-r border-slate-300">{t.assignedSubjects?.join(', ') || 'All Subjects'}</td>
                                                        <td className="p-2">{t.assignedLevels?.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') || 'All Levels'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Students Section */}
                                {(printRosterType === 'all' || printRosterType === 'students') && (
                                    <div className="mb-6">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-2 border-b border-slate-300 pb-1">
                                            2. Registered Student Candidates ({filteredStudents.length})
                                        </h3>
                                        <table className="w-full text-left text-xs border border-slate-300">
                                            <thead className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px]">
                                                <tr>
                                                    <th className="p-2 border-r border-slate-300">#</th>
                                                    <th className="p-2 border-r border-slate-300">Student ID</th>
                                                    <th className="p-2 border-r border-slate-300">Candidate Full Name</th>
                                                    <th className="p-2 border-r border-slate-300">Gender</th>
                                                    <th className="p-2 border-r border-slate-300">Grade Level</th>
                                                    <th className="p-2">Class Section</th>
                                                </tr>
                                            </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {filteredStudents.map((st, idx) => (
                                                <tr key={st.id}>
                                                    <td className="p-2 border-r border-slate-300 font-mono text-[11px]">{idx + 1}</td>
                                                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-slate-800">
                                                        {(st as any).studentCode || st.id?.slice(0, 8)?.toUpperCase()}
                                                    </td>
                                                    <td className="p-2 border-r border-slate-300 font-semibold text-slate-900">{st.name}</td>
                                                    <td className="p-2 border-r border-slate-300">{st.gender || 'Male'}</td>
                                                    <td className="p-2 border-r border-slate-300">
                                                        {isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}
                                                    </td>
                                                    <td className="p-2">{st.classSection || '--'}</td>
                                                </tr>
                                            ))}
                                            {filteredStudents.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="p-6 text-center text-slate-400">
                                                        No students registered for this level.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                )}

                                {/* Official Signatures */}
                                <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between text-xs text-slate-700">
                                    <div className="w-64 border-t border-slate-800 pt-1 text-center">
                                        <p className="font-bold text-slate-900">Headmaster / Principal Signature</p>
                                        <p className="text-[10px] text-slate-500">Official School Stamp &amp; Date</p>
                                    </div>
                                    <div className="w-64 border-t border-slate-800 pt-1 text-center">
                                        <p className="font-bold text-slate-900">Codecastic Exam Coordinator</p>
                                        <p className="text-[10px] text-slate-500">Verification &amp; Records</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal: Official Printable Result Analysis Per Level */}
            {showResultAnalysisModal && (() => {
                const filteredStudents = students.filter(s => {
                    if (analysisLevel === 'all') return true;
                    return String(s.gradeLevel) === String(analysisLevel);
                });
                const enrolledCount = filteredStudents.length;
                const boysCount = filteredStudents.filter(s => (s.gender || '').toLowerCase() === 'male').length;
                const girlsCount = filteredStudents.filter(s => (s.gender || '').toLowerCase() === 'female').length;
                const studentsWithTests = filteredStudents.filter((s: any) => (s.examsTaken || 0) > 0);
                const avgScore = studentsWithTests.length > 0
                    ? Math.round(studentsWithTests.reduce((acc: number, curr: any) => acc + (curr.avgScore || 0), 0) / studentsWithTests.length)
                    : 0;
                const passingCount = studentsWithTests.filter((s: any) => (s.avgScore || 0) >= 50).length;
                const passRate = studentsWithTests.length > 0 ? Math.round((passingCount / studentsWithTests.length) * 100) : 0;
                const lvlLabel = ALL_POSSIBLE_LEVELS.find(l => l.id === analysisLevel)?.label || 'All School Levels (Basic 4 - SHS 3)';

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
                        <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
                            {/* Controls Bar (Hidden during print) */}
                            <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Printer className="text-[#364c83]" size={18} />
                                        Print Result Analysis per Level
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Select academic level to generate official performance analysis printout.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        <span>Level:</span>
                                        <select
                                            value={analysisLevel}
                                            onChange={(e) => setAnalysisLevel(e.target.value)}
                                            className="input text-xs py-1 w-auto"
                                        >
                                            <option value="all">All School Levels</option>
                                            {ALL_POSSIBLE_LEVELS.map(lvl => (
                                                <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => window.print()}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#364c83] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#1f2d57] shadow-sm cursor-pointer"
                                    >
                                        <Printer size={13} />
                                        Print Now (A4 / PDF)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowResultAnalysisModal(false)}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Printable Report Sheet Area */}
                            <div className="printable-report-area bg-white text-slate-900 p-2 sm:p-4 font-sans">
                                {/* School Header Banner */}
                                <div className="border-b-2 border-slate-900 pb-4 mb-4 text-center">
                                    <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-slate-900">
                                        {user.schoolName || 'CODECASTIC PARTNER SCHOOL'}
                                    </h1>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#364c83] mt-0.5">
                                        OFFICIAL ACADEMIC RESULT &amp; PERFORMANCE ANALYSIS REPORT
                                    </p>
                                    <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs text-slate-700">
                                        <span><strong>School Code:</strong> {user.schoolCode || 'N/A'}</span>
                                        <span>&middot;</span>
                                        <span><strong>Level:</strong> {lvlLabel}</span>
                                        <span>&middot;</span>
                                        <span><strong>Term / Academic Year:</strong> 2025/2026</span>
                                        <span>&middot;</span>
                                        <span><strong>Date Issued:</strong> {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                </div>

                                {/* Executive Summary Performance Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4 text-center text-xs">
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[9px]">Enrolled Students</span>
                                        <span className="text-base font-black text-slate-900">{enrolledCount}</span>
                                        <span className="text-[10px] text-slate-500 block">{boysCount} Boys &middot; {girlsCount} Girls</span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[9px]">Assessed Candidates</span>
                                        <span className="text-base font-black text-slate-900">{studentsWithTests.length}</span>
                                        <span className="text-[10px] text-slate-500 block">
                                            {enrolledCount > 0 ? `${Math.round((studentsWithTests.length / enrolledCount) * 100)}% Participation` : '0%'}
                                        </span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[9px]">Overall Average</span>
                                        <span className="text-base font-black text-[#364c83]">{avgScore > 0 ? `${avgScore}%` : '--'}</span>
                                        <span className="text-[10px] text-slate-500 block">Level Mean Score</span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50">
                                        <span className="block font-bold text-slate-600 uppercase text-[9px]">Overall Pass Rate</span>
                                        <span className="text-base font-black text-emerald-800">{passRate > 0 ? `${passRate}%` : '--'}</span>
                                        <span className="text-[10px] text-emerald-700 block">{passingCount} Passed (≥ 50%)</span>
                                    </div>
                                    <div className="border border-slate-300 p-2 rounded bg-slate-50 col-span-2 sm:col-span-1">
                                        <span className="block font-bold text-slate-600 uppercase text-[9px]">Gender Breakdown</span>
                                        <span className="text-[11px] font-bold text-slate-800 block mt-0.5">
                                            Boys: {stats?.genderBreakdown?.maleAvg ? `${stats.genderBreakdown.maleAvg}%` : '--'}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-800 block">
                                            Girls: {stats?.genderBreakdown?.femaleAvg ? `${stats.genderBreakdown.femaleAvg}%` : '--'}
                                        </span>
                                    </div>
                                </div>

                                {/* Detailed Candidates Performance Table */}
                                <div className="mb-6">
                                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-2 border-b border-slate-300 pb-1">
                                        Candidate Score Roster &amp; Academic Status
                                    </h3>
                                    <table className="w-full text-left text-xs border border-slate-300">
                                        <thead className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px]">
                                            <tr>
                                                <th className="p-2 border-r border-slate-300 text-center">Rank</th>
                                                <th className="p-2 border-r border-slate-300">Student ID</th>
                                                <th className="p-2 border-r border-slate-300">Candidate Full Name</th>
                                                <th className="p-2 border-r border-slate-300">Gender</th>
                                                <th className="p-2 border-r border-slate-300">Class Section</th>
                                                <th className="p-2 border-r border-slate-300 text-center">Quizzes Taken</th>
                                                <th className="p-2 border-r border-slate-300 text-center">Average Score (%)</th>
                                                <th className="p-2 text-center">Academic Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {filteredStudents
                                                .slice()
                                                .sort((a: any, b: any) => (b.avgScore || 0) - (a.avgScore || 0))
                                                .map((st: any, idx: number) => {
                                                    const avg = st.avgScore || 0;
                                                    const hasTaken = (st.examsTaken || 0) > 0;
                                                    const isPass = avg >= 50;
                                                    return (
                                                        <tr key={st.id}>
                                                            <td className="p-2 border-r border-slate-300 text-center font-bold">#{idx + 1}</td>
                                                            <td className="p-2 border-r border-slate-300 font-mono font-bold text-slate-800">
                                                                {st.studentCode || st.id?.slice(0, 8)?.toUpperCase()}
                                                            </td>
                                                            <td className="p-2 border-r border-slate-300 font-bold text-slate-900">{st.name}</td>
                                                            <td className="p-2 border-r border-slate-300">{st.gender || 'Male'}</td>
                                                            <td className="p-2 border-r border-slate-300">{st.classSection || '--'}</td>
                                                            <td className="p-2 border-r border-slate-300 text-center font-bold">{st.examsTaken ?? 0}</td>
                                                            <td className="p-2 border-r border-slate-300 text-center font-bold">
                                                                {hasTaken ? `${avg}%` : '--'}
                                                            </td>
                                                            <td className="p-2 text-center font-bold text-[11px]">
                                                                {!hasTaken ? (
                                                                    <span className="text-slate-500">PENDING</span>
                                                                ) : isPass ? (
                                                                    <span className="text-emerald-700">PASSED</span>
                                                                ) : (
                                                                    <span className="text-rose-700">REMEDIAL</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            {filteredStudents.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="p-6 text-center text-slate-400">
                                                        No test attempts recorded in this level yet.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Official Signatures & Remarks */}
                                <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between text-xs text-slate-700">
                                    <div className="w-64 border-t border-slate-800 pt-1 text-center">
                                        <p className="font-bold text-slate-900">Academic Committee Chair / HOD</p>
                                        <p className="text-[10px] text-slate-500">Signature &amp; Date</p>
                                    </div>
                                    <div className="w-64 border-t border-slate-800 pt-1 text-center">
                                        <p className="font-bold text-slate-900">Headmaster / Principal</p>
                                        <p className="text-[10px] text-slate-500">Official Stamp &amp; Date</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal: Edit Student (Schools Portal Only) */}
            {editingStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Edit3 className="text-[#364c83]" size={16} />
                                    Edit Student Information
                                </h3>
                                <p className="text-xs text-slate-500">Modify enrolled student record and credentials</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingStudent(null)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateStudent} className="mt-4 space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Student Full Name</label>
                                <input
                                    required
                                    value={editSName}
                                    onChange={(e) => setEditSName(e.target.value)}
                                    className="input text-xs"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Gender</label>
                                <select
                                    value={editSGender}
                                    onChange={(e) => setEditSGender(e.target.value as 'Male' | 'Female')}
                                    className="input text-xs"
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Student ID / Code</label>
                                <input
                                    value={editSCode}
                                    onChange={(e) => setEditSCode(e.target.value)}
                                    placeholder="e.g. SCH-001"
                                    className="input text-xs font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Grade / Exam Level</label>
                                <select
                                    value={editSLevel}
                                    onChange={(e) => setEditSLevel(e.target.value)}
                                    className="input text-xs"
                                >
                                    {ALL_POSSIBLE_LEVELS.map((lvl) => (
                                        <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Class Section</label>
                                <input
                                    value={editSSection}
                                    onChange={(e) => setEditSSection(e.target.value)}
                                    placeholder="e.g. 8A, Science 1"
                                    className="input text-xs"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Reset Password (Optional)</label>
                                <input
                                    value={editSPassword}
                                    onChange={(e) => setEditSPassword(e.target.value)}
                                    placeholder="Leave blank to keep existing password"
                                    className="input text-xs"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setEditingStudent(null)}
                                    className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingStudentEdit}
                                    className="flex items-center gap-1.5 rounded-lg bg-[#364c83] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50 cursor-pointer"
                                >
                                    {savingStudentEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Edit Teacher (Schools Portal Only) */}
            {editingTeacher && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Edit3 className="text-[#364c83]" size={16} />
                                    Edit Teacher Information
                                </h3>
                                <p className="text-xs text-slate-500">Modify subject teacher assignments and credentials</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingTeacher(null)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateTeacher} className="mt-4 space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Teacher Full Name</label>
                                <input
                                    required
                                    value={editTName}
                                    onChange={(e) => setEditTName(e.target.value)}
                                    className="input text-xs"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Gender</label>
                                <select
                                    value={editTGender}
                                    onChange={(e) => setEditTGender(e.target.value as 'Male' | 'Female')}
                                    className="input text-xs"
                                >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    value={editTEmail}
                                    onChange={(e) => setEditTEmail(e.target.value)}
                                    className="input text-xs"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Assigned Subject(s)</label>
                                <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1 bg-slate-50/50">
                                    {STANDARD_SUBJECTS.map((sub) => {
                                        const checked = editTSubjs.includes(sub);
                                        return (
                                            <label key={sub} className="flex items-center gap-1.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setEditTSubjs([...editTSubjs, sub]);
                                                        else setEditTSubjs(editTSubjs.filter(s => s !== sub));
                                                    }}
                                                    className="rounded border-slate-300 text-[#364c83]"
                                                />
                                                <span className="text-[11px] text-slate-700">{sub}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Assigned Classes</label>
                                <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1 bg-slate-50/50">
                                    {ALL_POSSIBLE_LEVELS.map((lvl) => {
                                        const checked = editTLevels.includes(lvl.id);
                                        return (
                                            <label key={lvl.id} className="flex items-center gap-1.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setEditTLevels([...editTLevels, lvl.id]);
                                                        else setEditTLevels(editTLevels.filter(l => l !== lvl.id));
                                                    }}
                                                    className="rounded border-slate-300 text-[#364c83]"
                                                />
                                                <span className="text-[11px] text-slate-700">{lvl.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Reset Password (Optional)</label>
                                <input
                                    value={editTPassword}
                                    onChange={(e) => setEditTPassword(e.target.value)}
                                    placeholder="Leave blank to keep existing password"
                                    className="input text-xs"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setEditingTeacher(null)}
                                    className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingTeacherEdit}
                                    className="flex items-center gap-1.5 rounded-lg bg-[#364c83] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50 cursor-pointer"
                                >
                                    {savingTeacherEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Print Stylesheet */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    .printable-report-area, .printable-report-area * {
                        visibility: visible !important;
                    }
                    .printable-report-area {
                        position: fixed !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 15mm !important;
                        background: white !important;
                        box-shadow: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            ` }} />
        </div>
    );
}

function isNumeric(val: any): boolean {
    return !isNaN(Number(val)) && !isNaN(parseFloat(val));
}

function chr(index: number): string {
    return String.fromCharCode(65 + index);
}

function normalizeLevelStr(val: any, fallback: any = 8): any {
    const s = String(val || '').trim().toLowerCase();
    if (!s) return fallback;
    if (s.includes('shs 1') || s === 'shs1') return 'SHS 1';
    if (s.includes('shs 2') || s === 'shs2') return 'SHS 2';
    if (s.includes('shs 3') || s === 'shs3' || s.includes('wassce')) return 'SHS 3';
    const num = parseInt(s.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num >= 4 && num <= 9) return num;
    return fallback;
}

