import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Auto-load .env file if present in working directory
function loadEnvFile() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            for (const line of content.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let val = trimmed.slice(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        }
    } catch {
        // ignore
    }
}
loadEnvFile();

type Store = Record<string, any[]>;
let memoryStore: Store | null = null;

function getStore(): Store {
    if (memoryStore) return memoryStore;
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            memoryStore = JSON.parse(raw) as Store;
            return memoryStore;
        }
    } catch {
        // Ignore parse errors and start fresh
    }
    memoryStore = {};
    return memoryStore;
}

function saveStore(store: Store): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// -------------------------------------------------------------
// MariaDB / MySQL Enterprise Database Engine
// -------------------------------------------------------------
let pool: any = null;
let mariaDbReady = false;
let initPromise: Promise<void> | null = null;

function getDbConfig() {
    const host = process.env.DB_HOST || process.env.MYSQL_HOST;
    const user = process.env.DB_USER || process.env.MYSQL_USER;
    const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
    const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
    const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306;

    if (host && user && database) {
        return { host, user, password, database, port };
    }
    return null;
}

async function initMariaDb(): Promise<boolean> {
    if (mariaDbReady) return true;
    const config = getDbConfig();
    if (!config) return false;

    try {
        const mysql = await import('mysql2/promise');
        if (!pool) {
            pool = mysql.createPool({
                host: config.host,
                user: config.user,
                password: config.password,
                database: config.database,
                port: config.port,
                waitForConnections: true,
                connectionLimit: 15,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
            });
        }

        // Initialize table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_records (
                collection VARCHAR(64) NOT NULL,
                id VARCHAR(128) NOT NULL,
                data LONGTEXT NOT NULL,
                created_at BIGINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (collection, id),
                INDEX idx_created (collection, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Check if migration from db.json is needed
        const [rows]: any = await pool.query('SELECT COUNT(*) as count FROM app_records');
        if (Number(rows[0]?.count || 0) === 0 && fs.existsSync(DB_FILE)) {
            console.log('[MariaDB] Table is empty. Migrating all records from data/db.json into MariaDB...');
            const store = getStore();
            for (const [coll, items] of Object.entries(store)) {
                if (Array.isArray(items) && items.length > 0) {
                    for (const rec of items) {
                        const id = rec.id || crypto.randomUUID();
                        const createdAt = Number(rec.createdAt) || 0;
                        await pool.query(
                            'INSERT INTO app_records (collection, id, data, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), created_at = VALUES(created_at)',
                            [coll, id, JSON.stringify(rec), createdAt]
                        );
                    }
                }
            }
            console.log('[MariaDB] Migration from db.json to MariaDB completed successfully.');
        }

        mariaDbReady = true;
        console.log(`[MariaDB] Connected to enterprise database: ${config.database}@${config.host}`);
        return true;
    } catch (e: any) {
        console.warn('[MariaDB] Notice: Could not connect to MariaDB:', e?.message || e);
        console.warn('[MariaDB] Using local JSON database (data/db.json).');
        mariaDbReady = false;
        return false;
    }
}

async function ensureDb() {
    if (initPromise) return initPromise;
    initPromise = initMariaDb().then(() => {});
    return initPromise;
}

export const db = {
    async isMariaDbActive(): Promise<boolean> {
        await ensureDb();
        return mariaDbReady;
    },

    async list(collection: string, options?: { limit?: number }): Promise<{ items: any[] }> {
        await ensureDb();
        if (mariaDbReady && pool) {
            try {
                const limit = options?.limit || 5000;
                const [rows]: any = await pool.query(
                    'SELECT data FROM app_records WHERE collection = ? ORDER BY created_at DESC, id ASC LIMIT ?',
                    [collection, limit]
                );
                const items = rows.map((r: any) => JSON.parse(r.data));
                return { items };
            } catch (e) {
                console.error('[MariaDB Query Error]:', e);
            }
        }

        const store = getStore();
        const list = store[collection] || [];
        const items = options?.limit ? list.slice(0, options.limit) : [...list];
        return { items };
    },

    async add(collection: string, records: any[]): Promise<string[]> {
        await ensureDb();
        const ids: string[] = [];

        if (mariaDbReady && pool) {
            try {
                for (const rec of records) {
                    const id = rec.id || crypto.randomUUID();
                    const createdAt = Number(rec.createdAt) || Date.now();
                    const fullRec = { ...rec, id };
                    await pool.query(
                        'INSERT INTO app_records (collection, id, data, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), created_at = VALUES(created_at)',
                        [collection, id, JSON.stringify(fullRec), createdAt]
                    );
                    ids.push(id);
                }
                return ids;
            } catch (e) {
                console.error('[MariaDB Add Error]:', e);
            }
        }

        const store = getStore();
        if (!store[collection]) store[collection] = [];
        for (const rec of records) {
            const id = rec.id || crypto.randomUUID();
            store[collection].push({ ...rec, id });
            ids.push(id);
        }
        saveStore(store);
        return ids;
    },

    async update(collection: string, id: string, patch: Record<string, any>): Promise<any | null> {
        await ensureDb();

        if (mariaDbReady && pool) {
            try {
                const [rows]: any = await pool.query(
                    'SELECT data FROM app_records WHERE collection = ? AND id = ?',
                    [collection, id]
                );
                if (!rows || rows.length === 0) return null;
                const current = JSON.parse(rows[0].data);
                const updated = { ...current, ...patch, id };
                await pool.query(
                    'UPDATE app_records SET data = ? WHERE collection = ? AND id = ?',
                    [JSON.stringify(updated), collection, id]
                );
                return updated;
            } catch (e) {
                console.error('[MariaDB Update Error]:', e);
            }
        }

        const store = getStore();
        if (!store[collection]) return null;
        const idx = store[collection].findIndex((item: any) => item.id === id);
        if (idx === -1) return null;
        store[collection][idx] = { ...store[collection][idx], ...patch, id };
        saveStore(store);
        return store[collection][idx];
    },

    async delete(collection: string, ids: string[]): Promise<void> {
        await ensureDb();

        if (mariaDbReady && pool) {
            try {
                if (ids.length === 0) return;
                const placeholders = ids.map(() => '?').join(',');
                await pool.query(
                    `DELETE FROM app_records WHERE collection = ? AND id IN (${placeholders})`,
                    [collection, ...ids]
                );
                return;
            } catch (e) {
                console.error('[MariaDB Delete Error]:', e);
            }
        }

        const store = getStore();
        if (!store[collection]) return;
        const idSet = new Set(ids);
        store[collection] = store[collection].filter((item: any) => !idSet.has(item.id));
        saveStore(store);
    },
};

export interface RouteResponse {
    status: number;
    body: unknown;
}

export function json(data: unknown, status = 200): RouteResponse {
    return { status, body: data };
}

export function error(message: string, status = 400): RouteResponse {
    return { status, body: { error: message } };
}

export interface RouteContext {
    params: Record<string, string>;
    body: unknown;
    query: Record<string, string>;
}

type RouteHandler = (ctx: RouteContext) => Promise<RouteResponse> | RouteResponse;

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
    const pParts = pattern.split('/').filter(Boolean);
    const uParts = pathname.split('/').filter(Boolean);
    if (pParts.length !== uParts.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < pParts.length; i++) {
        const p = pParts[i];
        const u = uParts[i];
        if (p.startsWith(':')) {
            params[p.slice(1)] = decodeURIComponent(u);
        } else if (p !== u) {
            return null;
        }
    }
    return params;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    if (req.method === 'GET' || req.method === 'HEAD') return {};
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => {
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}

export function router(routes: Record<string, RouteHandler[]>) {
    const compiled = Object.entries(routes).map(([key, handlers]) => {
        const [method, ...pathRest] = key.trim().split(/\s+/);
        return {
            method: method.toUpperCase(),
            pattern: pathRest.join(' '),
            handlers,
        };
    });

    return async (req: IncomingMessage, res: ServerResponse, next?: () => void) => {
        const urlStr = req.url || '/';
        if (!urlStr.startsWith('/api/')) {
            if (next) return next();
            return;
        }

        const parsedUrl = new URL(urlStr, 'http://localhost');
        const method = (req.method || 'GET').toUpperCase();

        for (const route of compiled) {
            if (route.method !== method) continue;
            const params = matchPattern(route.pattern, parsedUrl.pathname);
            if (!params) continue;

            try {
                const body = await readJsonBody(req);
                const query: Record<string, string> = {};
                parsedUrl.searchParams.forEach((v, k) => {
                    query[k] = v;
                });

                let lastResult: RouteResponse = { status: 200, body: {} };
                for (const fn of route.handlers) {
                    lastResult = await fn({ params, body, query });
                }

                res.statusCode = lastResult.status;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify(lastResult.body));
                return;
            } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
                return;
            }
        }

        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Not found' }));
    };
}
