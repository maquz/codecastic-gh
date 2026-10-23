import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler } from './backend/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
    }

    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    let pathname = decodeURIComponent(parsedUrl.pathname);

    let filePath = path.join(DIST_DIR, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(DIST_DIR)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    let stat: fs.Stats | null = null;
    try {
        if (fs.existsSync(filePath)) {
            stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
                stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
            }
        }
    } catch {
        stat = null;
    }

    // SPA fallback: if not found, serve dist/index.html
    if (!stat || !fs.existsSync(filePath)) {
        filePath = path.join(DIST_DIR, 'index.html');
        try {
            stat = fs.statSync(filePath);
        } catch {
            res.statusCode = 404;
            res.end('Application not built yet. Run npm run build.');
            return;
        }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);

    if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    if (req.method === 'HEAD') {
        res.end();
        return;
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/api/')) {
        await handler(req, res, () => serveStatic(req, res));
        return;
    }

    serveStatic(req, res);
});

process.on('uncaughtException', (err) => {
    console.error('[Server Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Server Error] Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
