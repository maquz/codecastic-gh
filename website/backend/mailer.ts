import nodemailer from 'nodemailer';
import fs from 'node:fs';

function getMailerConfig() {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || 'info@codecasticgh.com';
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || '';
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'localhost';
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT) || (pass ? 465 : 25);
    const secure = port === 465;

    return { host, port, secure, user, pass };
}

function createTransporters() {
    const config = getMailerConfig();
    const list: { name: string; transport: nodemailer.Transporter }[] = [];

    // 1. Authenticated SMTP (if SMTP_PASS is provided)
    if (config.pass) {
        list.push({
            name: `Authenticated SMTP (${config.host}:${config.port})`,
            transport: nodemailer.createTransport({
                host: config.host,
                port: config.port,
                secure: config.secure,
                auth: {
                    user: config.user,
                    pass: config.pass,
                },
                tls: {
                    rejectUnauthorized: false,
                },
            }),
        });
    }

    // 2. Local Exim SMTP on localhost:25 (standard cPanel local mail delivery)
    list.push({
        name: 'Local cPanel Exim (localhost:25)',
        transport: nodemailer.createTransport({
            host: '127.0.0.1',
            port: 25,
            secure: false,
            ignoreTLS: true,
            tls: {
                rejectUnauthorized: false,
            },
        }),
    });

    // 3. Local sendmail binary (if available on Linux/cPanel)
    if (fs.existsSync('/usr/sbin/sendmail')) {
        list.push({
            name: 'Local Sendmail (/usr/sbin/sendmail)',
            transport: nodemailer.createTransport({
                sendmail: true,
                newline: 'unix',
                path: '/usr/sbin/sendmail',
            }),
        });
    }

    return list;
}

export async function sendContactNotification({
    name,
    email,
    phone,
    topic,
    message,
}: {
    name: string;
    email: string;
    phone: string;
    topic: string;
    message: string;
}) {
    const config = getMailerConfig();
    const to = process.env.NOTIFY_EMAIL || 'info@codecasticgh.com';
    const transporters = createTransporters();

    const mailOptions = {
        from: `"Codecastic GH Contact" <${config.user}>`,
        to,
        replyTo: `"${name}" <${email}>`,
        subject: `[New Website Inquiry] ${topic} - from ${name}`,
        text: `New contact form submission on Codecastic GH:\n\nSender: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nTopic: ${topic}\n\nMessage:\n${message}\n\n---\nReply directly to this email or sign in to your ExamHub Admin Panel.`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
                <div style="border-bottom: 2px solid #364c83; padding-bottom: 12px; margin-bottom: 16px;">
                    <h2 style="color: #364c83; margin: 0; font-size: 20px;">Codecastic GH - Website Inquiry</h2>
                    <span style="font-size: 12px; color: #64748b;">Delivered to ${to}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px;">
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; width: 100px;"><strong>Sender:</strong></td>
                        <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b;"><strong>Email:</strong></td>
                        <td style="padding: 6px 0;"><a href="mailto:${email}" style="color: #364c83; font-weight: 600;">${email}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b;"><strong>Phone:</strong></td>
                        <td style="padding: 6px 0; color: #0f172a;">${phone || 'Not provided'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b;"><strong>Topic:</strong></td>
                        <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">${topic}</td>
                    </tr>
                </table>
                <div style="background-color: #f8fafc; border-left: 4px solid #364c83; padding: 14px; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #1e293b; margin-bottom: 20px; white-space: pre-wrap;">
${message}
                </div>
                <div style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    <p style="margin: 0;">Hit <strong>Reply</strong> to email this visitor directly, or manage messages in your ExamHub Admin Panel at <a href="https://codecasticgh.com/#/exam-hub" style="color: #364c83;">codecasticgh.com</a>.</p>
                </div>
            </div>
        `,
    };

    let lastError: any = null;
    for (const { name: tName, transport } of transporters) {
        try {
            await transport.sendMail(mailOptions);
            console.log(`[Mailer] Contact notification delivered to ${to} via ${tName}`);
            return true;
        } catch (err: any) {
            console.warn(`[Mailer] Attempt via ${tName} failed:`, err?.message || err);
            lastError = err;
        }
    }

    console.error('[Mailer] All delivery attempts failed. Message is saved safely in database.', lastError?.message || lastError);
    return false;
}

export async function sendDirectReply({
    to,
    toName,
    subject,
    replyMessage,
    originalMessage,
}: {
    to: string;
    toName: string;
    subject: string;
    replyMessage: string;
    originalMessage?: string;
}) {
    const config = getMailerConfig();
    const transporters = createTransporters();

    const mailOptions = {
        from: `"Codecastic GH" <${config.user}>`,
        to,
        replyTo: config.user,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        text: `${replyMessage}\n\n---\nOriginal Message from ${toName}:\n${originalMessage || ''}\n\nCodecastic GH Team\ninfo@codecasticgh.com\nhttps://codecasticgh.com`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
                <div style="border-bottom: 2px solid #364c83; padding-bottom: 12px; margin-bottom: 16px;">
                    <h2 style="color: #364c83; margin: 0; font-size: 18px;">Codecastic GH</h2>
                    <span style="font-size: 12px; color: #64748b;">Official Response &middot; ${config.user}</span>
                </div>
                <div style="font-size: 14px; line-height: 1.6; color: #0f172a; margin-bottom: 20px; white-space: pre-wrap;">
${replyMessage}
                </div>
                ${
                    originalMessage
                        ? `
                    <div style="background-color: #f8fafc; border-left: 3px solid #cbd5e1; padding: 10px 14px; font-size: 12px; color: #64748b; margin-bottom: 20px; white-space: pre-wrap;">
                        <strong style="color: #475569;">Original Inquiry from ${toName}:</strong><br/>
${originalMessage}
                    </div>
                `
                        : ''
                }
                <div style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    <p style="margin: 0;">Codecastic GH &middot; Empowering Education &amp; Digital Solutions &middot; <a href="https://codecasticgh.com" style="color: #364c83;">codecasticgh.com</a></p>
                </div>
            </div>
        `,
    };

    let lastError: any = null;
    for (const { name: tName, transport } of transporters) {
        try {
            await transport.sendMail(mailOptions);
            console.log(`[Mailer] Direct reply sent from ${config.user} to ${to} via ${tName}`);
            return true;
        } catch (err: any) {
            console.warn(`[Mailer] Direct reply attempt via ${tName} failed:`, err?.message || err);
            lastError = err;
        }
    }

    throw new Error(
        lastError?.message ||
            'Could not send reply email. Please ensure SMTP_PASS is configured in cPanel Node.js environment variables.'
    );
}
