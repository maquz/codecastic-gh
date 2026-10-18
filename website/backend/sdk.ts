import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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

export const db = {
    async list(collection: string, options?: { limit?: number }): Promise<{ items: any[] }> {
        const store = getStore();
        const list = store[collection] || [];
        const items = options?.limit ? list.slice(0, options.limit) : [...list];
        return { items };
    },

    async add(collection: string, records: any[]): Promise<string[]> {
        const store = getStore();
        if (!store[collection]) store[collection] = [];
        const ids: string[] = [];
        for (const rec of records) {
            const id = rec.id || crypto.randomUUID();
            store[collection].push({ ...rec, id });
            ids.push(id);
        }
        saveStore(store);
        return ids;
    },

    async update(collection: string, id: string, patch: Record<string, any>): Promise<any | null> {
        const store = getStore();
        if (!store[collection]) return null;
        const idx = store[collection].findIndex((item: any) => item.id === id);
        if (idx === -1) return null;
        store[collection][idx] = { ...store[collection][idx], ...patch, id };
        saveStore(store);
        return store[collection][idx];
    },

    async delete(collection: string, ids: string[]): Promise<void> {
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
