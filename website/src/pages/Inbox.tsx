import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@appdeploy/client';
import { PageHead } from '../ui';

type Msg = {
    id: string;
    name: string;
    email: string;
    phone: string;
    topic: string;
    message: string;
    createdAt: number;
};

function errMsg(e: any, fallback: string): string {
    return e?.response?.data?.error || fallback;
}

export default function Inbox() {
    const [status, setStatus] = useState<'loading' | 'setup' | 'login' | 'in'>('loading');
    const [code, setCode] = useState('');
    const [input, setInput] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [messages, setMessages] = useState<Msg[]>([]);

    useEffect(() => {
        api.get('/api/inbox/status')
            .then((r) => setStatus(r.data.configured ? 'login' : 'setup'))
            .catch(() => setErr('Could not reach the server. Refresh the page and try again.'));
    }, []);

    const load = async (passcode: string) => {
        const r = await api.post('/api/inbox/list', { passcode });
        setMessages(r.data.messages);
    };

    const auth = async (e: FormEvent) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        const pass = input.trim();
        try {
            if (status === 'setup') {
                await api.post('/api/inbox/setup', { passcode: pass });
            }
            await load(pass);
            setCode(pass);
            setInput('');
            setStatus('in');
        } catch (e2) {
            setErr(errMsg(e2, 'Could not sign in.'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (m: Msg) => {
        if (!window.confirm(`Delete the message from ${m.name}? This cannot be undone.`)) return;
        try {
            await api.post(`/api/inbox/${m.id}/delete`, { passcode: code });
            await load(code);
        } catch (e2) {
            setErr(errMsg(e2, 'Could not delete the message.'));
        }
    };

    if (status !== 'in') {
        return (
            <>
                <PageHead title="Staff inbox" lead="Messages sent through the contact form appear here for Codecastic GH staff." />
                <section className="section">
                    <div className="wrap">
                        {status === 'loading' ? (
                            <p>{err || 'Loading...'}</p>
                        ) : (
                            <form className="form-card narrow" onSubmit={auth}>
                                <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }}>
                                    {status === 'setup' ? 'Create the inbox passcode' : 'Sign in'}
                                </h2>
                                <p style={{ marginBottom: 18, color: 'var(--muted)' }}>
                                    {status === 'setup'
                                        ? 'No passcode has been set yet. Choose one with at least 4 characters. Keep it private.'
                                        : 'Enter the staff passcode to read messages.'}
                                </p>
                                {err && (
                                    <p className="form-error" role="alert">
                                        {err}
                                    </p>
                                )}
                                <div className="field">
                                    <label htmlFor="i-pass">Passcode</label>
                                    <input
                                        id="i-pass"
                                        type="password"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                    />
                                </div>
                                <button className="btn btn-navy" type="submit" disabled={busy || !input.trim()}>
                                    {status === 'setup' ? 'Create passcode' : 'Open inbox'}
                                </button>
                            </form>
                        )}
                    </div>
                </section>
            </>
        );
    }

    return (
        <>
            <PageHead title="Staff inbox" lead={`${messages.length} message${messages.length === 1 ? '' : 's'} from the contact form.`} />
            <section className="section" style={{ paddingTop: 32 }}>
                <div className="wrap">
                    {err && (
                        <p className="form-error" role="alert">
                            {err}
                        </p>
                    )}
                    {messages.length === 0 && <p>No messages yet. New messages from the contact page will appear here.</p>}
                    {messages.map((m) => (
                        <article className="msg-card" key={m.id}>
                            <div className="msg-top">
                                <div>
                                    <h3 style={{ fontSize: '1.2rem' }}>{m.name}</h3>
                                    <p className="msg-meta">
                                        <a href={`mailto:${m.email}`}>{m.email}</a>
                                        {m.phone ? `, ${m.phone}` : ''}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p className="msg-meta">{new Date(m.createdAt).toLocaleString()}</p>
                                    <button className="link-btn" onClick={() => remove(m)}>
                                        Delete message
                                    </button>
                                </div>
                            </div>
                            <p className="msg-meta" style={{ marginTop: 10 }}>
                                Topic: {m.topic}
                            </p>
                            <p className="msg-body">{m.message}</p>
                        </article>
                    ))}
                </div>
            </section>
        </>
    );
}
