require('dotenv').config();
const express = require('express');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || 'diaastore.cloud';

// IMAP config
const imapConfig = {
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASS,
    },
    tls: {
        servername: 'mail.diaastore.cloud',
        rejectUnauthorized: false,
    },
    logger: false,
};

// ─── Rate limiting ──────────────────────────────────────────────────────────
const rateMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30;

function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    if (!rateMap.has(ip)) {
        rateMap.set(ip, { count: 1, start: now });
        return next();
    }
    const entry = rateMap.get(ip);
    if (now - entry.start > RATE_LIMIT_WINDOW) {
        entry.count = 1;
        entry.start = now;
        return next();
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
}

// ─── Generate random alias ─────────────────────────────────────────────────
app.get('/api/generate', (req, res) => {
    const words = [
        'alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'nova', 'pixel',
        'cyber', 'neon', 'flux', 'orbit', 'prism', 'vortex', 'zenith', 'blaze',
        'storm', 'pulse', 'spark', 'drift', 'shade', 'frost', 'ember', 'surge',
        'wave', 'bolt', 'flash', 'glint', 'crypt', 'phantom', 'nebula', 'quasar',
        'titan', 'comet', 'lunar', 'solar', 'vapor', 'astro', 'turbo', 'rapid',
    ];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = crypto.randomInt(1000, 9999);
    const alias = `${word}${num}@${MAIL_DOMAIN}`;
    res.json({ alias });
});

// ─── Fetch emails for alias via IMAP ────────────────────────────────────────
app.get('/api/emails/:alias', rateLimit, async (req, res) => {
    const alias = req.params.alias.toLowerCase().trim();

    if (!alias.includes('@') || !alias.endsWith(`@${MAIL_DOMAIN}`)) {
        return res.status(400).json({ error: `Invalid alias. Must end with @${MAIL_DOMAIN}` });
    }

    let client;
    try {
        client = new ImapFlow(imapConfig);
        await client.connect();

        const lock = await client.getMailboxLock('INBOX');
        try {
            const emails = [];

            // Use IMAP SEARCH to find messages TO the alias
            let uids = [];
            try {
                uids = await client.search({ to: alias }, { uid: true });
                console.log(`SEARCH found ${uids.length} messages for ${alias}`);
            } catch (searchErr) {
                console.log('IMAP SEARCH failed, falling back:', searchErr.message);
            }

            if (uids.length > 0) {
                // Fetch only matching messages
                const messages = client.fetch(uids, {
                    source: true,
                    uid: true,
                }, { uid: true });

                for await (const msg of messages) {
                    try {
                        const parsed = await simpleParser(msg.source);
                        emails.push(buildEmail(msg.uid, parsed));
                    } catch (parseErr) {
                        console.error('Parse error:', parseErr.message);
                    }
                }
            } else {
                // Fallback: scan recent messages manually
                const status = await client.status('INBOX', { messages: true });
                const total = status.messages || 0;
                console.log(`Fallback: scanning ${Math.min(total, 200)} of ${total} messages`);

                if (total > 0) {
                    const startSeq = Math.max(1, total - 199);
                    const messages = client.fetch(`${startSeq}:*`, {
                        source: true,
                        uid: true,
                    });

                    for await (const msg of messages) {
                        try {
                            const parsed = await simpleParser(msg.source);
                            const toAddrs = (parsed.to?.value || []).map(a => a.address?.toLowerCase());
                            const ccAddrs = (parsed.cc?.value || []).map(a => a.address?.toLowerCase());
                            const deliveredTo = (parsed.headers?.get('delivered-to') || '').toString().toLowerCase();

                            if (toAddrs.includes(alias) || ccAddrs.includes(alias) || deliveredTo.includes(alias)) {
                                emails.push(buildEmail(msg.uid, parsed));
                            }
                        } catch (parseErr) {
                            console.error('Parse error:', parseErr.message);
                        }
                    }
                }
            }

            emails.sort((a, b) => new Date(b.date) - new Date(a.date));
            res.json({ alias, count: emails.length, emails });
        } finally {
            lock.release();
        }
    } catch (err) {
        console.error('IMAP error:', err.message);
        res.status(500).json({ error: 'Failed to fetch emails. Please try again.' });
    } finally {
        if (client) {
            try { await client.logout(); } catch (_) {}
        }
    }
});

function buildEmail(uid, parsed) {
    return {
        uid,
        subject: parsed.subject || '(No Subject)',
        from: parsed.from?.value?.[0] || { name: 'Unknown', address: 'unknown' },
        to: parsed.to?.value || [],
        date: parsed.date || new Date(),
        text: parsed.text || '',
        html: parsed.html || '',
        hasAttachments: (parsed.attachments?.length || 0) > 0,
        attachmentCount: parsed.attachments?.length || 0,
    };
}

// ─── Auto-cleanup: delete emails older than 48 hours ────────────────────────
async function cleanupOldEmails() {
    let client;
    try {
        client = new ImapFlow(imapConfig);
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
            const oldUids = await client.search({ before: cutoff }, { uid: true });
            if (oldUids.length > 0) {
                await client.messageDelete(oldUids, { uid: true });
                console.log(`🗑️  Deleted ${oldUids.length} emails older than 48h`);
            }
        } finally {
            lock.release();
        }
    } catch (err) {
        console.error('Cleanup error:', err.message);
    } finally {
        if (client) { try { await client.logout(); } catch (_) {} }
    }
}

// Run cleanup every 30 minutes
if (!process.env.VERCEL) {
    setInterval(cleanupOldEmails, 30 * 60 * 1000);
    cleanupOldEmails(); // Run on startup
}

// ─── SPA fallback ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ──────────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n  🚀 DiaaStore TempMail running at http://localhost:${PORT}`);
        console.log(`  📧 IMAP: ${imapConfig.host}:${imapConfig.port}`);
        console.log(`  👤 User: ${imapConfig.auth.user}\n`);
    });
}

module.exports = app;

