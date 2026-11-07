// Offline IndexedDB Engine for Codecastic ExamHub
export type Level = number | string;

export interface OfflineSubject {
    id: string;
    name: string;
}

export interface OfflineQuestion {
    id: string;
    subjectId: string;
    level: Level;
    text: string;
    options: string[];
    correctIndex?: number;
    explanation?: string;
    year?: string | null;
    category?: string | null;
}

export interface OfflinePackMeta {
    id: string;
    track: string;
    level: string;
    label: string;
    subjects: OfflineSubject[];
    questionCount: number;
    downloadedAt: number;
    timers?: Record<string, number>;
}

export interface PendingSyncItem {
    id: string;
    timestamp: number;
    studentName: string;
    studentEmail?: string;
    schoolName?: string;
    schoolCode?: string;
    classSection?: string;
    subjectId: string;
    subjectName: string;
    level: Level;
    score: number;
    total: number;
    percent: number;
    passed: boolean;
    answers: Record<string, number>;
    questionIds: string[];
    details: any[];
    review: any[];
    syncAttempts?: number;
    lastError?: string;
}

const DB_NAME = 'codecastic_examhub_offline';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export function openOfflineDb(): Promise<IDBDatabase> {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB is not supported on this browser'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains('packs')) {
                db.createObjectStore('packs', { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains('questions')) {
                const qStore = db.createObjectStore('questions', { keyPath: 'id' });
                qStore.createIndex('subjectId', 'subjectId', { unique: false });
                qStore.createIndex('level', 'level', { unique: false });
                qStore.createIndex('level_subject', ['level', 'subjectId'], { unique: false });
            }

            if (!db.objectStoreNames.contains('pendingSync')) {
                db.createObjectStore('pendingSync', { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains('offlineResults')) {
                const rStore = db.createObjectStore('offlineResults', { keyPath: 'id' });
                rStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = (event.target as IDBOpenDBRequest).result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
}

// Save downloaded offline question pack into IndexedDB
export async function saveOfflinePack(pack: {
    id?: string;
    track: string;
    level: string;
    label: string;
    subjects: OfflineSubject[];
    questions: OfflineQuestion[];
    timers?: Record<string, number>;
}): Promise<{ questionCount: number }> {
    const db = await openOfflineDb();
    const packId = pack.id || `pack-${pack.track}-${pack.level}`;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['packs', 'questions'], 'readwrite');
        const packStore = tx.objectStore('packs');
        const qStore = tx.objectStore('questions');

        const meta: OfflinePackMeta = {
            id: packId,
            track: pack.track,
            level: String(pack.level),
            label: pack.label,
            subjects: pack.subjects || [],
            questionCount: pack.questions?.length || 0,
            downloadedAt: Date.now(),
            timers: pack.timers,
        };

        packStore.put(meta);

        if (Array.isArray(pack.questions)) {
            for (const q of pack.questions) {
                if (q && q.id) {
                    qStore.put({
                        ...q,
                        level: String(q.level),
                    });
                }
            }
        }

        tx.oncomplete = () => {
            resolve({ questionCount: meta.questionCount });
        };

        tx.onerror = () => {
            reject(tx.error);
        };
    });
}

// Retrieve list of downloaded packs
export async function getOfflinePacks(): Promise<OfflinePackMeta[]> {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('packs', 'readonly');
        const store = tx.objectStore('packs');
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// Check if an offline pack is available for this level/track
export async function getMatchingOfflinePack(level: Level, track?: string): Promise<OfflinePackMeta | null> {
    const packs = await getOfflinePacks();
    const strLevel = String(level).toUpperCase();

    // Check exact level match
    const exact = packs.find((p) => String(p.level).toUpperCase() === strLevel);
    if (exact) return exact;

    // Check track match (e.g. 'basic', 'shs', 'ges-promotion', 'gtle')
    if (track) {
        const byTrack = packs.find((p) => p.track === track);
        if (byTrack) return byTrack;
    }

    // BECE covers Basic 7, 8, 9
    if (['7', '8', '9', 'BECE'].includes(strLevel)) {
        const becePack = packs.find((p) => p.track === 'basic' || p.level === 'BECE' || ['7', '8', '9'].includes(p.level));
        if (becePack) return becePack;
    }

    // WASSCE covers SHS 1, 2, 3
    if (strLevel.startsWith('SHS') || strLevel === 'WASSCE') {
        const shsPack = packs.find((p) => p.track === 'shs' || p.level === 'WASSCE' || p.level.startsWith('SHS'));
        if (shsPack) return shsPack;
    }

    return null;
}

// Get offline subjects for a level from cached packs
export async function getOfflineSubjects(level: Level, track?: string): Promise<OfflineSubject[]> {
    const pack = await getMatchingOfflinePack(level, track);
    if (!pack) return [];
    return pack.subjects || [];
}

// Get offline questions from IndexedDB
export async function getOfflineQuestions(level: Level, subjectId: string, limit?: number): Promise<OfflineQuestion[]> {
    const db = await openOfflineDb();
    const strLevel = String(level).toUpperCase();
    const isJhsOrBece = ['7', '8', '9', 'BECE'].includes(strLevel);
    const isShsOrWassce = ['SHS 1', 'SHS 2', 'SHS 3', 'WASSCE', 'SHS'].includes(strLevel);

    return new Promise((resolve, reject) => {
        const tx = db.transaction('questions', 'readonly');
        const store = tx.objectStore('questions');
        const idx = store.index('subjectId');
        const req = idx.getAll(subjectId);

        req.onsuccess = () => {
            const raw = req.result as OfflineQuestion[];
            const matched = raw.filter((q) => {
                const qLvl = String(q.level).toUpperCase();
                if (qLvl === strLevel) return true;
                if (isJhsOrBece && qLvl === 'BECE') return true;
                if (isShsOrWassce && qLvl === 'WASSCE') return true;
                return false;
            });

            // Shuffle questions for authentic practice
            const shuffled = [...matched].sort(() => Math.random() - 0.5);
            if (limit && limit > 0 && shuffled.length > limit) {
                resolve(shuffled.slice(0, limit));
            } else {
                resolve(shuffled);
            }
        };

        req.onerror = () => reject(req.error);
    });
}

// Delete an offline pack
export async function deleteOfflinePack(packId: string): Promise<void> {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('packs', 'readwrite');
        const store = tx.objectStore('packs');
        const req = store.delete(packId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Queue offline quiz result for background syncing
export async function queueOfflineResult(item: PendingSyncItem): Promise<void> {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['pendingSync', 'offlineResults'], 'readwrite');
        const syncStore = tx.objectStore('pendingSync');
        const resStore = tx.objectStore('offlineResults');

        syncStore.put(item);
        resStore.put(item);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Get all pending sync items
export async function getPendingSyncQueue(): Promise<PendingSyncItem[]> {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readonly');
        const store = tx.objectStore('pendingSync');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// Remove an item from the pending sync queue after successful sync
export async function removePendingSync(id: string): Promise<void> {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readwrite');
        const store = tx.objectStore('pendingSync');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Get all offline results (local history)
export async function getOfflineResults(): Promise<PendingSyncItem[]> {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('offlineResults', 'readonly');
        const store = tx.objectStore('offlineResults');
        const req = store.getAll();
        req.onsuccess = () => {
            const list = req.result || [];
            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            resolve(list);
        };
        req.onerror = () => reject(req.error);
    });
}

// Export school lab results as JSON for USB flash drive transfer
export async function exportLabResultsJson(): Promise<string> {
    const results = await getOfflineResults();
    const payload = {
        exportType: 'codecastic_lab_results',
        version: 1,
        exportedAt: Date.now(),
        totalSubmissions: results.length,
        results,
    };
    return JSON.stringify(payload, null, 2);
}
