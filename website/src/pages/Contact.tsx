import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@appdeploy/client';
import { PageHead } from '../ui';

const TOPICS = [
    'Software or website project',
    'Mobile app',
    'IT consultancy or digital transformation',
    'Cloud, security or IT support',
    'Training',
    'Digital marketing',
    'Partnership or consultancy work',
    'ExamHub for my school',
    'ExamHub for teachers (GTLE, GES promotion)',
    'Something else',
];

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

export default function Contact() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [topic, setTopic] = useState(TOPICS[0]);
    const [message, setMessage] = useState('');
    const [errors, setErrors] = useState<Errors>({});
    const [formError, setFormError] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const validate = (): Errors => {
        const e: Errors = {};
        if (!name.trim()) e.name = 'Enter your name.';
        if (!email.trim()) e.email = 'Enter your email address.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address, like name@example.com.';
        if (!message.trim()) e.message = 'Tell us how we can help.';
        return e;
    };

    const submit = async (ev: FormEvent) => {
        ev.preventDefault();
        setFormError('');
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setSending(true);
        try {
            await api.post('/api/contact', {
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                topic,
                message: message.trim(),
            });
            setSent(true);
        } catch (err: any) {
            setFormError(err?.response?.data?.error || 'Your message was not sent. Check your connection and try again.');
        } finally {
            setSending(false);
        }
    };

    const reset = () => {
        setName('');
        setEmail('');
        setPhone('');
        setTopic(TOPICS[0]);
        setMessage('');
        setErrors({});
        setSent(false);
    };

    return (
        <>
            <PageHead
                title="Tell us what you need"
                lead="Send a message about a project, a service or a partnership and the Codecastic GH team will reply."
            />
            <section className="section">
                <div className="wrap contact-grid">
                    <div>
                        {sent ? (
                            <div className="success-box" role="status">
                                <h2>Message sent</h2>
                                <p>Thank you, {name.trim()}. We have your message and will reply to {email.trim()}.</p>
                                <button className="btn btn-navy" onClick={reset}>
                                    Send another message
                                </button>
                            </div>
                        ) : (
                            <form className="form-card" onSubmit={submit} noValidate>
                                {formError && (
                                    <p className="form-error" role="alert">
                                        {formError}
                                    </p>
                                )}
                                <div className="field-row">
                                    <div className="field">
                                        <label htmlFor="c-name">Your name</label>
                                        <input
                                            id="c-name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            autoComplete="name"
                                            aria-invalid={!!errors.name}
                                        />
                                        {errors.name && (
                                            <p className="field-error" role="alert">
                                                {errors.name}
                                            </p>
                                        )}
                                    </div>
                                    <div className="field">
                                        <label htmlFor="c-email">Email address</label>
                                        <input
                                            id="c-email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                            aria-invalid={!!errors.email}
                                        />
                                        {errors.email && (
                                            <p className="field-error" role="alert">
                                                {errors.email}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="field-row">
                                    <div className="field">
                                        <label htmlFor="c-phone">Phone or WhatsApp (optional)</label>
                                        <input
                                            id="c-phone"
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            autoComplete="tel"
                                        />
                                    </div>
                                    <div className="field">
                                        <label htmlFor="c-topic">What is this about?</label>
                                        <select id="c-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                                            {TOPICS.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="field">
                                    <label htmlFor="c-message">Your message</label>
                                    <textarea
                                        id="c-message"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        aria-invalid={!!errors.message}
                                    />
                                    {errors.message && (
                                        <p className="field-error" role="alert">
                                            {errors.message}
                                        </p>
                                    )}
                                </div>
                                <button className="btn btn-navy" type="submit" disabled={sending}>
                                    {sending ? 'Sending...' : 'Send message'}
                                </button>
                            </form>
                        )}
                    </div>

                    <aside>
                        <div className="info-block">
                            <h3>Direct Email Inquiries</h3>
                            <p>
                                You can also email us directly at{' '}
                                <a href="mailto:info@codecasticgh.com" style={{ color: '#364c83', fontWeight: 600 }}>
                                    info@codecasticgh.com
                                </a>
                                . Inquiries are processed and replied to promptly.
                            </p>
                        </div>
                        <div className="info-block">
                            <h3>Where we are</h3>
                            <p>Codecastic GH is registered in Ghana, with branches and operational offices opened as the work requires.</p>
                        </div>
                        <div className="info-block">
                            <h3>Good to include</h3>
                            <p>What you want to achieve, who will use it, and any date you are working towards.</p>
                        </div>
                        <div className="info-block">
                            <h3>Schools and teachers</h3>
                            <p>
                                Want ExamHub set up with your own subjects and questions? Choose “ExamHub for my school”
                                as the topic.
                            </p>
                        </div>
                    </aside>
                </div>
            </section>
        </>
    );
}
