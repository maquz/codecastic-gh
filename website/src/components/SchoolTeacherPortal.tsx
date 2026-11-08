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
    GraduationCap,
    Eye,
    BarChart3,
    HardDrive
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
    classSection?: string;
    assignedSubjects?: string[];
    assignedLevels?: (string | number)[];
    gradeLevel: Level;
    region?: string;
    promotionRank?: string;
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
    onSwitchToStudent,
}: {
    user: PortalUser;
    token: string;
    onLogout: () => void;
    onSwitchToStudent: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<{
        myStudentsCount: number;
        totalExams: number;
        overallAvg: number;
        overallPassRate: number;
        classBreakdown: { classLabel: string; examsCount: number; avgPercent: number; passRate: number }[];
        studentRoster: PortalUser[];
        results: any[];
        topMissedQuestions: any[];
    } | null>(null);

    const [activeTab, setActiveTab] = useState<'results' | 'roster' | 'diagnostics'>('results');
    const [classFilter, setClassFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [selectedReview, setSelectedReview] = useState<any | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const res = await api.post('/api/teacher/performance', { token });
            setStats(res.data);
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
                            onClick={onSwitchToStudent}
                            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-[#364c83] hover:bg-indigo-100"
                        >
                            <GraduationCap size={13} />
                            Preview Exams
                        </button>
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
            <div className="flex border-b border-slate-200 gap-6">
                <button
                    type="button"
                    onClick={() => setActiveTab('results')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        activeTab === 'results' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <BookOpen size={16} />
                    Student Test Attempts ({stats?.results?.length || 0})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('roster')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        activeTab === 'roster' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Users size={16} />
                    Class Roster ({stats?.studentRoster?.length || 0})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('diagnostics')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        activeTab === 'diagnostics' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Sparkles size={16} />
                    Curriculum &amp; Question Insights
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
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredResults.map((r, i) => (
                                        <tr key={r.id || i} className="hover:bg-slate-50/60 transition">
                                            <td className="px-4 py-3 font-semibold text-slate-900">
                                                {r.studentName}
                                                <span className="block text-[11px] text-slate-400 font-normal">{r.studentEmail}</span>
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
                                            <td className="px-4 py-3 text-right">
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

            {/* Tab 2: Class Roster */}
            {activeTab === 'roster' && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">Enrolled Students in Your Assigned Classes</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase">
                                <tr>
                                    <th className="px-4 py-2.5">Name</th>
                                    <th className="px-4 py-2.5">Email</th>
                                    <th className="px-4 py-2.5">Grade Level</th>
                                    <th className="px-4 py-2.5">Section</th>
                                    <th className="px-4 py-2.5">Tests Taken</th>
                                    <th className="px-4 py-2.5">Average Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stats?.studentRoster?.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-2.5 font-semibold text-slate-900">{s.name}</td>
                                        <td className="px-4 py-2.5 text-slate-600">{s.email}</td>
                                        <td className="px-4 py-2.5 text-slate-700">{isNumeric(s.gradeLevel) ? `Basic ${s.gradeLevel}` : s.gradeLevel}</td>
                                        <td className="px-4 py-2.5 text-slate-700">{s.classSection || '--'}</td>
                                        <td className="px-4 py-2.5 font-bold text-slate-900">{(s as any).examsTaken ?? '--'}</td>
                                        <td className="px-4 py-2.5 font-bold text-[#364c83]">
                                            {(s as any).avgScore ? `${(s as any).avgScore}%` : '--'}
                                        </td>
                                    </tr>
                                ))}
                                {(!stats?.studentRoster || stats.studentRoster.length === 0) && (
                                    <tr>
                                        <td colSpan={6} className="py-6 text-center text-slate-400">
                                            No students mounted in your assigned classes yet. Ask your School Head to mount students.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab 3: Diagnostics */}
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
    onSwitchToStudent,
}: {
    user: PortalUser;
    token: string;
    onLogout: () => void;
    onSwitchToStudent: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any | null>(null);
    const [teachers, setTeachers] = useState<PortalUser[]>([]);
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [tab, setTab] = useState<'overview' | 'teachers' | 'students' | 'lab'>('overview');
    const [downloadingPack, setDownloadingPack] = useState(false);
    const [importingLab, setImportingLab] = useState(false);

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
    
    // Mount Teacher Form State
    const [tName, setTName] = useState('');
    const [tEmail, setTEmail] = useState('');
    const [tPassword, setTPassword] = useState('');
    const [tSubjs, setTSubjs] = useState<string[]>(['Mathematics']);
    const [tLevels, setTLevels] = useState<string[]>(['7', '8', '9']);
    const [addingTeacher, setAddingTeacher] = useState(false);

    // Mount Student Form State
    const [sName, setSName] = useState('');
    const [sEmail, setSEmail] = useState('');
    const [sLevel, setSLevel] = useState<string>('8');
    const [sSection, setSSection] = useState('');
    const [addingStudent, setAddingStudent] = useState(false);

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

    const handleAddTeacher = async (e: FormEvent) => {
        e.preventDefault();
        setAddingTeacher(true);
        try {
            await api.post('/api/school/teachers/add', {
                token,
                name: tName.trim(),
                email: tEmail.trim(),
                password: tPassword.trim() || 'Teacher2026#',
                assignedSubjects: tSubjs,
                assignedLevels: tLevels,
            });
            setTName('');
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

    const handleAddStudent = async (e: FormEvent) => {
        e.preventDefault();
        setAddingStudent(true);
        try {
            await api.post('/api/school/students/add', {
                token,
                name: sName.trim(),
                email: sEmail.trim(),
                gradeLevel: sLevel,
                classSection: sSection.trim(),
            });
            setSName('');
            setSEmail('');
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

    const handleBulkSubmit = async () => {
        if (!bulkCsvText.trim()) return;
        setBulkLoading(true);
        try {
            const lines = bulkCsvText.trim().split('\n');
            const studentsToPost: any[] = [];
            for (const line of lines) {
                const parts = line.split(',').map((p) => p.trim());
                if (parts.length >= 2) {
                    studentsToPost.push({
                        name: parts[0],
                        email: parts[1],
                        gradeLevel: parts[2] || sLevel,
                        classSection: parts[3] || '',
                        password: parts[4] || 'Student2026#',
                    });
                }
            }
            const res = await api.post('/api/school/students/bulk', {
                token,
                students: studentsToPost,
            });
            setBulkResult({ added: res.data.addedCount, skipped: res.data.skippedCount });
            flash(true, `Imported ${res.data.addedCount} students successfully!`);
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
                            onClick={onSwitchToStudent}
                            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-[#364c83] hover:bg-indigo-100"
                        >
                            <GraduationCap size={13} />
                            Preview Exams
                        </button>
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

                {msg && (
                    <div className={`mt-4 rounded-lg p-2.5 text-xs font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                        {msg.text}
                    </div>
                )}

                {/* Overall KPIs */}
                <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">Total Students</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{stats?.studentCount || students.length}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">Mounted Teachers</span>
                        <div className="text-2xl font-bold text-[#364c83] mt-1">{stats?.teacherCount || teachers.length}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">Exams Completed</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{stats?.totalExams || 0}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <span className="text-xs font-medium text-slate-500 block">School Average</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                            {stats?.overallAvg ? `${stats.overallAvg}%` : '--%'}
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 col-span-2 lg:col-span-1">
                        <span className="text-xs font-medium text-slate-500 block">Pass Rate</span>
                        <div className="text-2xl font-bold text-emerald-700 mt-1">
                            {stats?.overallPassRate ? `${stats.overallPassRate}%` : '--%'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 gap-6">
                <button
                    type="button"
                    onClick={() => setTab('overview')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        tab === 'overview' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <BarChart3 size={16} />
                    Academic Performance Overview
                </button>
                <button
                    type="button"
                    onClick={() => setTab('teachers')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        tab === 'teachers' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <UserCheck size={16} />
                    Mount Teachers ({teachers.length})
                </button>
                <button
                    type="button"
                    onClick={() => setTab('students')}
                    className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                        tab === 'students' ? 'border-[#364c83] text-[#364c83]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Users size={16} />
                    Mount Students ({students.length})
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
                                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#364c83] py-2 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50"
                            >
                                {addingTeacher ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                Mount Teacher
                            </button>
                        </form>
                    </div>

                    {/* Teacher List Table */}
                    <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                        <h3 className="text-sm font-bold text-slate-900 mb-3">Mounted Subject Teachers</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase">
                                    <tr>
                                        <th className="px-4 py-2.5">Name / Email</th>
                                        <th className="px-4 py-2.5">Subjects</th>
                                        <th className="px-4 py-2.5">Classes</th>
                                        <th className="px-4 py-2.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {teachers.map((t) => (
                                        <tr key={t.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                {t.name}
                                                <span className="block text-[11px] font-normal text-slate-400">{t.email}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                                {t.assignedSubjects?.length ? t.assignedSubjects.join(', ') : 'All Subjects'}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                                {t.assignedLevels?.length ? t.assignedLevels.map(l => isNumeric(l) ? `Basic ${l}` : l).join(', ') : 'All Levels'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteTeacher(t.id, t.name)}
                                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                    title="Remove teacher"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {teachers.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-slate-400">
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
                        <span className="text-xs font-bold text-slate-700">
                            Enrolled Students ({students.length})
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowBulkModal(true)}
                                className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-[#364c83] hover:bg-indigo-100"
                            >
                                <Upload size={13} />
                                Bulk Upload Students (CSV / Excel)
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Single Student Add */}
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                            <h3 className="text-sm font-bold text-slate-900 mb-3">Add Single Student</h3>
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
                                    <label className="block font-semibold text-slate-700 mb-1">Student Email</label>
                                    <input
                                        required
                                        type="email"
                                        value={sEmail}
                                        onChange={(e) => setSEmail(e.target.value)}
                                        placeholder="kwame@example.com"
                                        className="input text-xs"
                                    />
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
                                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#364c83] py-2 text-xs font-bold text-white hover:bg-[#1f2d57] disabled:opacity-50"
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
                                            <th className="px-4 py-2.5">Name / Email</th>
                                            <th className="px-4 py-2.5">Level</th>
                                            <th className="px-4 py-2.5">Section</th>
                                            <th className="px-4 py-2.5">Exams Taken</th>
                                            <th className="px-4 py-2.5">Average</th>
                                            <th className="px-4 py-2.5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {students.map((st) => (
                                            <tr key={st.id} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-2.5 font-semibold text-slate-900">
                                                    {st.name}
                                                    <span className="block text-[11px] font-normal text-slate-400">{st.email}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-700">
                                                    {isNumeric(st.gradeLevel) ? `Basic ${st.gradeLevel}` : st.gradeLevel}
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-700">{st.classSection || '--'}</td>
                                                <td className="px-4 py-2.5 font-bold text-slate-900">{(st as any).examsTaken ?? 0}</td>
                                                <td className="px-4 py-2.5 font-bold text-[#364c83]">
                                                    {(st as any).avgScore ? `${(st as any).avgScore}%` : '--'}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteStudent(st.id, st.name)}
                                                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                        title="Delete student"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {students.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="py-8 text-center text-slate-400">
                                                    No students enrolled yet. Add students on the left or use Bulk Upload.
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
                                <strong>Format (one student per line):</strong>
                                <pre className="mt-1 font-mono text-[11px] text-[#364c83] bg-white/80 p-2 rounded border border-indigo-100">
{`Kofi Mensah, kofi@example.com, 8, 8A
Ama Serwaa, ama@example.com, 9, 9B
Yaw Boakye, yaw@example.com, SHS 2, Science 1`}
                                </pre>
                                <span className="text-[10px] text-slate-500 mt-1 block">
                                    Fields: Name, Email, Grade Level (4-9 or SHS 1-3), Class Section (optional), Password (optional)
                                </span>
                            </div>

                            <textarea
                                rows={8}
                                value={bulkCsvText}
                                onChange={(e) => setBulkCsvText(e.target.value)}
                                placeholder="Paste CSV rows here..."
                                className="input font-mono text-xs w-full p-3 leading-relaxed"
                            />

                            {bulkResult && (
                                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-emerald-800 text-xs">
                                    ✓ Provisioned <strong>{bulkResult.added}</strong> students. Skipped: {bulkResult.skipped}.
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
        </div>
    );
}

function isNumeric(val: any): boolean {
    return !isNaN(Number(val)) && !isNaN(parseFloat(val));
}

function chr(index: number): string {
    return String.fromCharCode(65 + index);
}
