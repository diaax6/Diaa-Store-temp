require('dotenv').config();
const express = require('express');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Config ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const IMAP_HOST = process.env.IMAP_HOST || '127.0.0.1';
const IMAP_PORT = parseInt(process.env.IMAP_PORT) || 993;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'tempmail-secret-key-2026';
const MAILCOW_URL = process.env.MAILCOW_URL || 'https://mail.diaa.store';
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY || '';

// ─── Supabase ───────────────────────────────────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('⚠️  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars!');
}
const supabase = process.env.SUPABASE_URL
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

// ─── Multi-domain IMAP ──────────────────────────────────────────────────────
const domains = [];
for (let i = 1; i <= 10; i++) {
    const domain = process.env[`MAIL_DOMAIN_${i}`];
    const user = process.env[`IMAP_USER_${i}`];
    const pass = process.env[`IMAP_PASS_${i}`];
    if (domain && user && pass) domains.push({ domain, user, pass });
}
if (domains.length === 0 && process.env.MAIL_DOMAIN) {
    domains.push({ domain: process.env.MAIL_DOMAIN, user: process.env.IMAP_USER, pass: process.env.IMAP_PASS });
}
console.log(`📧 Domains: ${domains.map(d => d.domain).join(', ')}`);

function getImapConfig(entry) {
    return {
        host: IMAP_HOST, port: IMAP_PORT, secure: true,
        auth: { user: entry.user, pass: entry.pass },
        tls: { servername: 'mail.diaa.store', rejectUnauthorized: false },
        logger: false,
    };
}

function findDomainEntry(alias) {
    return domains.find(d => d.domain === alias.split('@')[1]) || null;
}

// ─── Admin Auth ─────────────────────────────────────────────────────────────
function generateToken() {
    const payload = JSON.stringify({ role: 'admin', iat: Date.now() });
    const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
    return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyToken(token) {
    try {
        const [b64, sig] = token.split('.');
        const payload = Buffer.from(b64, 'base64url').toString();
        return crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex') === sig;
    } catch { return false; }
}

function adminAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const rateMap = new Map();
function rateLimit(req, res, next) {
    const ip = req.ip, now = Date.now();
    if (!rateMap.has(ip)) { rateMap.set(ip, { count: 1, start: now }); return next(); }
    const e = rateMap.get(ip);
    if (now - e.start > 60000) { e.count = 1; e.start = now; return next(); }
    if (++e.count > 30) return res.status(429).json({ error: 'Too many requests.' });
    next();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', async (req, res) => {
    let password = ADMIN_PASSWORD;
    if (supabase) {
        const { data } = await supabase.from('settings').select('value').eq('key', 'admin_password').single();
        if (data) password = JSON.parse(data.value);
    }
    if (req.body.password !== password) return res.status(401).json({ error: 'Invalid password' });
    res.json({ token: generateToken() });
});

// Helper: get all domains (env + Supabase)
async function getAllDomains() {
    const envDomains = domains.map(d => d.domain);
    if (!supabase) return envDomains;
    const { data } = await supabase.from('settings').select('value').eq('key', 'custom_domains').single();
    const custom = data ? JSON.parse(data.value) : [];
    return [...new Set([...envDomains, ...custom])];
}

app.get('/api/domains', async (req, res) => {
    res.json({ domains: await getAllDomains() });
});

app.get('/api/admin/domains', adminAuth, async (req, res) => {
    const envDomains = domains.map(d => d.domain);
    let customDomains = [];
    if (supabase) {
        const { data } = await supabase.from('settings').select('value').eq('key', 'custom_domains').single();
        customDomains = data ? JSON.parse(data.value) : [];
    }
    res.json({ envDomains, customDomains, serverIP: IMAP_HOST });
});

app.post('/api/admin/domains', adminAuth, async (req, res) => {
    const dom = (req.body.domain || '').toLowerCase().trim();
    const domRegex = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;
    if (!dom || !domRegex.test(dom)) return res.status(400).json({ error: 'Invalid domain' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });
    const { data } = await supabase.from('settings').select('value').eq('key', 'custom_domains').single();
    const list = data ? JSON.parse(data.value) : [];
    if (list.includes(dom) || domains.find(d => d.domain === dom)) return res.status(409).json({ error: 'Domain already exists' });

    // MailCow API automation
    const mc = { domain: 'skipped', mailbox: 'skipped', alias: 'skipped' };
    const mcPass = req.body.mailboxPass || 'TempMail2026!';
    if (MAILCOW_API_KEY) {
        const mch = { 'Content-Type': 'application/json', 'X-API-Key': MAILCOW_API_KEY };
        try {
            const r1 = await fetch(`${MAILCOW_URL}/api/v1/add/domain`, { method: 'POST', headers: mch, body: JSON.stringify({ domain: dom, description: 'TempMail ' + dom, aliases: 400, mailboxes: 10, defquota: 1024, maxquota: 2048, active: 1 }) });
            mc.domain = r1.ok ? 'ok' : 'failed';
            const r2 = await fetch(`${MAILCOW_URL}/api/v1/add/mailbox`, { method: 'POST', headers: mch, body: JSON.stringify({ local_part: 'inbox', domain: dom, name: 'Inbox', password: mcPass, password2: mcPass, quota: 1024, active: 1 }) });
            mc.mailbox = r2.ok ? 'ok' : 'failed';
            const r3 = await fetch(`${MAILCOW_URL}/api/v1/add/alias`, { method: 'POST', headers: mch, body: JSON.stringify({ address: '@' + dom, goto: 'inbox@' + dom, active: 1 }) });
            mc.alias = r3.ok ? 'ok' : 'failed';
        } catch (e) { mc.error = e.message; }
    }
    list.push(dom);
    await supabase.from('settings').upsert({ key: 'custom_domains', value: JSON.stringify(list), updated_at: new Date().toISOString() });
    res.json({ success: true, mailcow: mc });
});

app.delete('/api/admin/domains/:domain', adminAuth, async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });
    const { data } = await supabase.from('settings').select('value').eq('key', 'custom_domains').single();
    const list = data ? JSON.parse(data.value) : [];
    const filtered = list.filter(d => d !== req.params.domain);
    await supabase.from('settings').upsert({ key: 'custom_domains', value: JSON.stringify(filtered), updated_at: new Date().toISOString() });
    res.json({ success: true });
});

app.get('/api/admin/aliases', adminAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('aliases')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    for (const alias of data) {
        const { count } = await supabase
            .from('emails')
            .select('*', { count: 'exact', head: true })
            .eq('alias_id', alias.id);
        alias.email_count = count || 0;
    }
    res.json({ aliases: data });
});

app.post('/api/admin/generate', adminAuth, async (req, res) => {
    const allDomains = await getAllDomains();
    const domain = req.body.domain || allDomains[0];
    if (!allDomains.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });

    let localPart;
    if (req.body.customName) {
        localPart = req.body.customName.toLowerCase().replace(/[^a-z0-9._-]/g, '').trim();
        if (localPart.length < 2) return res.status(400).json({ error: 'Custom name too short (min 2 chars)' });
        if (localPart.length > 64) return res.status(400).json({ error: 'Custom name too long (max 64 chars)' });
    } else {
        const words = ['alpha','beta','gamma','delta','echo','foxtrot','nova','pixel','cyber','neon','flux','orbit','prism','vortex','zenith','blaze','storm','pulse','spark','drift','shade','frost','ember','surge','wave','bolt','flash','glint','crypt','phantom','nebula','quasar','titan','comet','lunar','solar','vapor','astro','turbo','rapid'];
        localPart = words[Math.floor(Math.random() * words.length)] + crypto.randomInt(1000, 9999);
    }
    const email = localPart + '@' + domain;

    const { data, error } = await supabase
        .from('aliases')
        .insert({ email, domain, is_active: true, note: req.body.note || null })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Exists, try again' });
        return res.status(500).json({ error: error.message });
    }
    res.json({ alias: data });
});

app.delete('/api/admin/aliases/:id', adminAuth, async (req, res) => {
    const { error } = await supabase.from('aliases').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

app.patch('/api/admin/aliases/:id', adminAuth, async (req, res) => {
    const updates = {};
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (req.body.note !== undefined) updates.note = req.body.note;
    const { data, error } = await supabase.from('aliases').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ alias: data });
});

// ─── Settings Endpoints ─────────────────────────────────────────────────────

app.post('/api/admin/password', adminAuth, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });
    await supabase.from('settings').upsert({ key: 'admin_password', value: JSON.stringify(newPassword), updated_at: new Date().toISOString() });
    res.json({ success: true });
});

app.get('/api/settings/links', async (req, res) => {
    if (!supabase) return res.json({ links: [] });
    const { data } = await supabase.from('settings').select('value').eq('key', 'footer_links').single();
    res.json({ links: data ? JSON.parse(data.value) : [] });
});

app.post('/api/admin/settings/links', adminAuth, async (req, res) => {
    const { links } = req.body;
    if (!Array.isArray(links)) return res.status(400).json({ error: 'Invalid links' });
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });
    await supabase.from('settings').upsert({ key: 'footer_links', value: JSON.stringify(links), updated_at: new Date().toISOString() });
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/emails/:alias', rateLimit, async (req, res) => {
    const alias = req.params.alias.toLowerCase().trim();

    const { data: aliasRow } = await supabase
        .from('aliases')
        .select('id, email, is_active')
        .eq('email', alias)
        .single();

    if (!aliasRow) return res.status(404).json({ error: 'This email is not registered. Contact admin.' });
    if (!aliasRow.is_active) return res.status(403).json({ error: 'This email has been deactivated.' });

    const { data: cached } = await supabase
        .from('emails')
        .select('*')
        .eq('alias_id', aliasRow.id)
        .order('date', { ascending: false });

    const lastFetch = cached?.[0]?.fetched_at;
    const isFresh = lastFetch && (Date.now() - new Date(lastFetch).getTime() < 120000);

    if (isFresh) {
        return res.json({ alias, count: cached.length, emails: cached.map(formatCached), cached: true });
    }

    const domainEntry = findDomainEntry(alias);
    if (!domainEntry) {
        return res.json({ alias, count: cached?.length || 0, emails: (cached || []).map(formatCached) });
    }

    let client;
    try {
        client = new ImapFlow(getImapConfig(domainEntry));
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const emails = [];
            let uids = [];
            try { uids = await client.search({ to: alias }, { uid: true }); } catch {}

            if (uids.length > 0) {
                for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
                    try { const p = await simpleParser(msg.source); emails.push(buildEmail(msg.uid, p)); } catch {}
                }
            } else {
                const status = await client.status('INBOX', { messages: true });
                const total = status.messages || 0;
                if (total > 0) {
                    for await (const msg of client.fetch(`${Math.max(1, total - 199)}:*`, { source: true, uid: true })) {
                        try {
                            const p = await simpleParser(msg.source);
                            const to = (p.to?.value || []).map(a => a.address?.toLowerCase());
                            const cc = (p.cc?.value || []).map(a => a.address?.toLowerCase());
                            const dt = (p.headers?.get('delivered-to') || '').toString().toLowerCase();
                            if (to.includes(alias) || cc.includes(alias) || dt.includes(alias))
                                emails.push(buildEmail(msg.uid, p));
                        } catch {}
                    }
                }
            }

            await supabase.from('emails').delete().eq('alias_id', aliasRow.id);
            if (emails.length > 0) {
                await supabase.from('emails').insert(emails.map(e => ({
                    alias_id: aliasRow.id, uid: e.uid, subject: e.subject,
                    from_name: e.from.name, from_address: e.from.address,
                    to_addresses: e.to, date: e.date,
                    text_body: e.text, html_body: e.html,
                    has_attachments: e.hasAttachments, attachment_count: e.attachmentCount,
                    fetched_at: new Date().toISOString(),
                })));
            }

            emails.sort((a, b) => new Date(b.date) - new Date(a.date));
            res.json({ alias, count: emails.length, emails });
        } finally { lock.release(); }
    } catch (err) {
        console.error('IMAP error:', err.message);
        if (cached?.length) return res.json({ alias, count: cached.length, emails: cached.map(formatCached), cached: true });
        res.status(500).json({ error: 'Failed to fetch emails. Try again.' });
    } finally {
        if (client) try { await client.logout(); } catch {}
    }
});

function formatCached(e) {
    return {
        uid: e.uid, subject: e.subject,
        from: { name: e.from_name, address: e.from_address },
        to: e.to_addresses || [], date: e.date,
        text: e.text_body || '', html: e.html_body || '',
        hasAttachments: e.has_attachments, attachmentCount: e.attachment_count,
    };
}

function buildEmail(uid, p) {
    return {
        uid, subject: p.subject || '(No Subject)',
        from: p.from?.value?.[0] || { name: 'Unknown', address: 'unknown' },
        to: p.to?.value || [], date: p.date || new Date(),
        text: p.text || '', html: p.html || '',
        hasAttachments: (p.attachments?.length || 0) > 0,
        attachmentCount: p.attachments?.length || 0,
    };
}

// ─── Cleanup (48h, Docker only) ─────────────────────────────────────────────
async function cleanupOldEmails() {
    for (const entry of domains) {
        let client;
        try {
            client = new ImapFlow(getImapConfig(entry));
            await client.connect();
            const lock = await client.getMailboxLock('INBOX');
            try {
                const cutoff = new Date(Date.now() - 48 * 3600000);
                const old = await client.search({ before: cutoff }, { uid: true });
                if (old.length) { await client.messageDelete(old, { uid: true }); console.log(`🗑️ [${entry.domain}] Deleted ${old.length}`); }
            } finally { lock.release(); }
        } catch (err) { console.error(`Cleanup [${entry.domain}]:`, err.message); }
        finally { if (client) try { await client.logout(); } catch {} }
    }
    const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
    await supabase.from('emails').delete().lt('date', cutoff);
}

if (!process.env.VERCEL) {
    setInterval(cleanupOldEmails, 30 * 60000);
    cleanupOldEmails();
}

// ─── Page Routing ───────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Start ──────────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n  🚀 TempMail V2 at http://localhost:${PORT}`);
        console.log(`  🛡️  Admin: http://localhost:${PORT}/admin`);
        console.log(`  🌐 Domains: ${domains.map(d => d.domain).join(', ')}\n`);
    });
}

module.exports = app;
