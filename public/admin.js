/* DiaaStore Temp Admin Dashboard */
const $ = id => document.getElementById(id);
let token = localStorage.getItem('admin_token') || '';
let aliases = [], allDomainsList = [], serverIP = '';

// ─── Auth ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    $('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    if (token) { verifyAndLoad(); } else { $('loginScreen').style.display = ''; }
});

async function doLogin() {
    const pass = $('passInput').value.trim();
    if (!pass) { toast('Enter password', 'err'); return; }
    $('loginBtn').disabled = true;
    try {
        const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
        if (!r.ok) { toast('Invalid password', 'err'); $('loginBtn').disabled = false; return; }
        const d = await r.json(); token = d.token; localStorage.setItem('admin_token', token); showDashboard();
    } catch { toast('Login failed', 'err'); $('loginBtn').disabled = false; }
}

async function verifyAndLoad() {
    try { const r = await fetch('/api/admin/aliases', { headers: { Authorization: `Bearer ${token}` } }); if (r.status === 401) { logout(); return; } showDashboard(); } catch { logout(); }
}

function showDashboard() {
    $('loginScreen').style.display = 'none'; $('dashboard').style.display = '';
    loadDomains(); loadAliases(); loadLinks(); loadDomainManager();
}

function logout() { token = ''; localStorage.removeItem('admin_token'); $('dashboard').style.display = 'none'; $('loginScreen').style.display = ''; $('passInput').value = ''; }

// ─── Domains ─────────────────────────────────────────────────────────────────
async function loadDomains() {
    try {
        const r = await fetch('/api/domains');
        const d = await r.json();
        allDomainsList = d.domains || [];
        const sel = $('domainSelect'); sel.innerHTML = '';
        allDomainsList.forEach(dom => { const o = document.createElement('option'); o.value = dom; o.textContent = `@${dom}`; sel.appendChild(o); });
    } catch {}
}

async function loadDomainManager() {
    try {
        const r = await fetch('/api/admin/domains', { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        serverIP = d.serverIP || '';
        const env = d.envDomains || [], custom = d.customDomains || [];
        $('totalDomains').textContent = env.length + custom.length;
        let h = '';
        env.forEach((dom, i) => {
            h += `<div class="domain-item" style="animation:fadeUp .2s ease ${i*.03}s both">
                <div class="domain-info"><span class="alias-email">${dom}</span><span class="alias-badge badge-primary">ENV</span></div>
                <div class="alias-actions">
                    <button class="abtn" onclick="showDns('${dom}')" title="DNS Instructions">📋</button>
                </div>
            </div>`;
        });
        custom.forEach((dom, i) => {
            h += `<div class="domain-item" style="animation:fadeUp .2s ease ${(env.length+i)*.03}s both">
                <div class="domain-info"><span class="alias-email">${dom}</span><span class="alias-badge badge-secondary">CUSTOM</span></div>
                <div class="alias-actions">
                    <button class="abtn" onclick="showDns('${dom}')" title="DNS Instructions">📋</button>
                    <button class="abtn abtn-del" onclick="removeDomain('${dom}')" title="Remove">🗑️</button>
                </div>
            </div>`;
        });
        $('domainsList').innerHTML = h || '<div class="empty" style="padding:20px"><p style="color:var(--text-3)">No domains configured</p></div>';
    } catch {}
}

async function addDomain() {
    const dom = $('newDomain').value.trim().toLowerCase();
    if (!dom || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) { toast('Enter a valid domain (e.g. example.com)', 'err'); return; }
    try {
        const r = await fetch('/api/admin/domains', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ domain: dom }) });
        if (r.status === 409) { toast('Domain already exists', 'err'); return; }
        if (r.ok) { toast(`Added: ${dom}`, 'ok'); $('newDomain').value = ''; loadDomains(); loadDomainManager(); showDns(dom); }
        else toast('Failed to add domain', 'err');
    } catch { toast('Failed', 'err'); }
}

async function removeDomain(dom) {
    if (!confirm(`Remove domain ${dom}?\nExisting emails won't be deleted.`)) return;
    try {
        const r = await fetch(`/api/admin/domains/${dom}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) { toast(`Removed: ${dom}`, 'ok'); loadDomains(); loadDomainManager(); } else toast('Failed', 'err');
    } catch { toast('Failed', 'err'); }
}

function showDns(domain) {
    const ip = serverIP || '79.137.74.166';
    const hostname = 'mail.diaa.store';
    $('dnsContent').innerHTML = `
        <div class="dns-section">
            <h3>📧 Domain: <span style="color:#a78bfa">${domain}</span></h3>
            <p class="dns-desc">Follow these steps to set up email for this domain:</p>
        </div>

        <div class="dns-section">
            <h4>1️⃣ DNS Records <span class="dns-hint">(at your domain registrar)</span></h4>
            <table class="dns-table">
                <tr><th>Type</th><th>Name</th><th>Value</th><th>Priority</th></tr>
                <tr><td><span class="dns-type mx">MX</span></td><td>@</td><td class="dns-val" onclick="copyText('${hostname}')">${hostname}</td><td>10</td></tr>
                <tr><td><span class="dns-type a">A</span></td><td>mail</td><td class="dns-val" onclick="copyText('${ip}')">${ip}</td><td>—</td></tr>
                <tr><td><span class="dns-type txt">TXT</span></td><td>@</td><td class="dns-val" onclick="copyText('v=spf1 mx a ip4:${ip} ~all')">v=spf1 mx a ip4:${ip} ~all</td><td>—</td></tr>
                <tr><td><span class="dns-type cname">CNAME</span></td><td>autodiscover</td><td class="dns-val" onclick="copyText('${hostname}')">${hostname}</td><td>—</td></tr>
            </table>
            <p class="dns-tip">💡 Click any value to copy it</p>
        </div>

        <div class="dns-section">
            <h4>2️⃣ MailCow Setup</h4>
            <ol class="dns-steps">
                <li>Open <b>${hostname}</b> admin panel</li>
                <li><b>Configuration → Mail Setup → Domains</b> → Add <code>${domain}</code></li>
                <li><b>Mailboxes</b> → Add <code>inbox@${domain}</code></li>
                <li><b>Aliases</b> → Add <code>@${domain}</code> → <code>inbox@${domain}</code> (catch-all)</li>
            </ol>
        </div>

        <div class="dns-section">
            <h4>3️⃣ MailCow Config <span class="dns-hint">(mailcow.conf)</span></h4>
            <p>Add to <code>ADDITIONAL_SAN</code>:</p>
            <div class="dns-code" onclick="copyText('autodiscover.${domain},mail.${domain}')">autodiscover.${domain},mail.${domain}</div>
            <p style="margin-top:8px;font-size:11px;color:var(--text-3)">Then restart: <code>docker compose down && docker compose up -d</code></p>
        </div>

        <div class="dns-section">
            <h4>4️⃣ Vercel (if using temp.${domain})</h4>
            <ol class="dns-steps">
                <li>Vercel → Project → Settings → Domains → Add <code>temp.${domain}</code></li>
                <li>Add DNS: <span class="dns-type cname" style="font-size:10px">CNAME</span> <code>temp</code> → <code>cname.vercel-dns.com</code></li>
            </ol>
        </div>

        <div class="dns-section">
            <h4>5️⃣ Environment Variables</h4>
            <p>Add to <code>.env</code> / Docker / Vercel:</p>
            <div class="dns-code" onclick="copyText('MAIL_DOMAIN_N=${domain}\\nIMAP_USER_N=inbox@${domain}\\nIMAP_PASS_N=YOUR_PASSWORD')">MAIL_DOMAIN_N=${domain}<br>IMAP_USER_N=inbox@${domain}<br>IMAP_PASS_N=YOUR_PASSWORD</div>
        </div>
    `;
    $('dnsModal').style.display = 'flex';
}
function closeDns() { $('dnsModal').style.display = 'none'; }

// ─── Aliases ─────────────────────────────────────────────────────────────────
async function loadAliases() {
    try {
        const r = await fetch('/api/admin/aliases', { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 401) { logout(); return; }
        const d = await r.json(); aliases = d.aliases || []; renderAliases(); updateStats();
    } catch { toast('Failed to load', 'err'); }
}

function updateStats() {
    $('totalAliases').textContent = aliases.length;
    $('activeAliases').textContent = aliases.filter(a => a.is_active).length;
    $('totalMessages').textContent = aliases.reduce((s, a) => s + (a.email_count || 0), 0);
    $('aliasBadge').textContent = aliases.length;
}

function renderAliases() {
    const el = $('aliasesList');
    if (!aliases.length) { el.innerHTML = `<div class="empty"><div class="ico">📭</div><h3>No Emails Created</h3><p>Click Generate to create your first email.</p></div>`; return; }
    let h = '';
    aliases.forEach((a, i) => {
        const db = a.domain === 'diaa.store' ? 'badge-primary' : 'badge-secondary';
        const sc = a.is_active ? 'status-active' : 'status-inactive';
        const st = a.is_active ? '🟢 Active' : '🔴 Inactive';
        const url = `${location.origin}/${a.email}`;
        h += `<div class="alias-item" style="animation:fadeUp .3s ease ${i*.03}s both">
            <div class="alias-main">
                <div class="alias-email-wrap"><span class="alias-email">${esc(a.email)}</span><span class="alias-badge ${db}">@${a.domain}</span><span class="alias-status ${sc}">${st}</span></div>
                <div class="alias-meta"><span>📬 ${a.email_count||0} msgs</span><span>📅 ${fmtDate(a.created_at)}</span>${a.note?`<span>📝 ${esc(a.note)}</span>`:''}</div>
            </div>
            <div class="alias-actions">
                <button class="abtn abtn-copy" onclick="copyText('${a.email}')" title="Copy">📋</button>
                <button class="abtn abtn-link" onclick="copyText('${url}')" title="Link">🔗</button>
                <button class="abtn abtn-toggle" onclick="toggleAlias('${a.id}',${!a.is_active})" title="${a.is_active?'Deactivate':'Activate'}">${a.is_active?'⏸️':'▶️'}</button>
                <button class="abtn abtn-del" onclick="deleteAlias('${a.id}','${esc(a.email)}')" title="Delete">🗑️</button>
            </div>
        </div>`;
    });
    el.innerHTML = h;
}

// ─── Generate ────────────────────────────────────────────────────────────────
async function generateAlias() {
    const btn = $('genBtn'); btn.disabled = true;
    try {
        const r = await fetch('/api/admin/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ domain: $('domainSelect').value, customName: $('customName').value.trim() || null, note: $('noteInput').value.trim() || null }) });
        if (r.status === 401) { logout(); return; }
        if (r.status === 409) { toast('Already exists', 'err'); btn.disabled = false; return; }
        const d = await r.json();
        if (d.alias) { toast(`Created: ${d.alias.email}`, 'ok'); $('noteInput').value = ''; $('customName').value = ''; await copyText(d.alias.email); loadAliases(); }
        else if (d.error) toast(d.error, 'err');
    } catch { toast('Generate failed', 'err'); }
    btn.disabled = false;
}

async function generateAll() {
    if (!allDomainsList.length) { toast('No domains', 'err'); return; }
    const note = $('noteInput').value.trim() || null;
    let count = 0;
    for (const dom of allDomainsList) {
        try {
            const r = await fetch('/api/admin/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ domain: dom, note }) });
            if (r.ok) count++;
        } catch {}
    }
    toast(`Created ${count} email(s) across ${allDomainsList.length} domains`, 'ok');
    $('noteInput').value = '';
    loadAliases();
}

async function deleteAlias(id, email) {
    if (!confirm(`Delete ${email}?`)) return;
    try { const r = await fetch(`/api/admin/aliases/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { toast(`Deleted`, 'ok'); loadAliases(); } } catch { toast('Failed', 'err'); }
}

async function toggleAlias(id, active) {
    try { const r = await fetch(`/api/admin/aliases/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_active: active }) }); if (r.ok) { toast(active?'Activated':'Deactivated', 'ok'); loadAliases(); } } catch { toast('Failed', 'err'); }
}

// ─── Password ────────────────────────────────────────────────────────────────
async function changePassword() {
    const np = $('newPass').value, cp = $('confirmPass').value;
    if (!np || np.length < 6) { toast('Min 6 characters', 'err'); return; }
    if (np !== cp) { toast('Passwords do not match', 'err'); return; }
    try {
        const r = await fetch('/api/admin/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ newPassword: np }) });
        if (r.ok) { toast('Password changed! Re-login.', 'ok'); $('newPass').value = ''; $('confirmPass').value = ''; setTimeout(logout, 1500); }
        else { const d = await r.json(); toast(d.error, 'err'); }
    } catch { toast('Failed', 'err'); }
}

// ─── Links ───────────────────────────────────────────────────────────────────
let footerLinks = [];
async function loadLinks() {
    try { const r = await fetch('/api/settings/links'); const d = await r.json(); footerLinks = d.links || [];
        if (!footerLinks.length) footerLinks = [{icon:'🔐',name:'2FA Generator',url:'https://2fa.diaastore.cloud'},{icon:'📬',name:'Diaa Store Mails',url:'https://mail.diaa.store'}];
        renderLinks();
    } catch {}
}
function renderLinks() {
    let h = '';
    footerLinks.forEach((l, i) => {
        h += `<div class="link-row" style="animation:fadeUp .2s ease ${i*.03}s both">
            <input class="email-in link-in" value="${esc(l.icon)}" placeholder="🌐" style="width:50px;text-align:center;padding:8px" onchange="footerLinks[${i}].icon=this.value">
            <input class="email-in link-in" value="${esc(l.name)}" placeholder="Name" style="flex:1;padding:8px 12px" onchange="footerLinks[${i}].name=this.value">
            <input class="email-in link-in" value="${esc(l.url)}" placeholder="https://..." style="flex:2;padding:8px 12px" onchange="footerLinks[${i}].url=this.value">
            <button class="abtn abtn-del" onclick="removeLink(${i})">🗑️</button>
        </div>`;
    });
    $('linksEditor').innerHTML = h;
}
function addLink() { footerLinks.push({icon:'🌐',name:'',url:''}); renderLinks(); }
function removeLink(i) { footerLinks.splice(i,1); renderLinks(); }
async function saveLinks() {
    const valid = footerLinks.filter(l=>l.name&&l.url);
    try { const r = await fetch('/api/admin/settings/links', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({links:valid}) });
        if(r.ok){toast('Saved!','ok');footerLinks=valid;renderLinks();}else toast('Failed','err');
    } catch { toast('Failed','err'); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast(`Copied: ${text}`, 'ok'); } catch { toast('Copy failed', 'err'); } }
function toast(msg, type='inf') { const c=$('toasts'),t=document.createElement('div'); t.className=`toast ${type}`; t.innerHTML=`<span>${{ok:'✅',err:'❌',inf:'💡'}[type]||'💡'}</span><span>${esc(msg)}</span>`; c.appendChild(t); setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300)},3500); }
function esc(s) { if(!s)return''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function fmtDate(d) { return new Date(d).toLocaleDateString('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
