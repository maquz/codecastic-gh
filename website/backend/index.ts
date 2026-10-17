import { router, json, error, db } from './sdk';

async function getInboxCode(): Promise<string | null> {
    const { items } = await db.list('settings', { limit: 5 });
    const doc: any = items.find((i: any) => i.key === 'inbox');
    return doc ? (doc.passcode as string) : null;
}

async function isStaff(code: unknown): Promise<boolean> {
    const saved = await getInboxCode();
    return !!saved && typeof code === 'string' && code === saved;
}

export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

    // Public: contact form
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

    // Staff inbox
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
});
