/* TempMail Admin Dashboard */

const $ = id => document.getElementById(id);
let token = localStorage.getItem('admin_token') || '';
let aliases = [];

// ─── Auth ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    $('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    if (token) { verifyAndLoad(); } else { $('loginScreen').style.display = ''; }
});

async function doLogin() {
    const pass = $('passInput').value.trim();
    if (!pass) { toast('Enter password', 'err'); return; }
    const btn = $('loginBtn');
    btn.disabled = true;
    try {
        const r = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
        });
        if (!r.ok) { toast('Invalid password', 'err'); btn.disabled = false; return; }
        const d = await r.json();
        token = d.token;
        localStorage.setItem('admin_token', token);
        showDashboard();
    } catch (e) { toast('Login failed', 'err'); btn.disabled = false; }
}

async function verifyAndLoad() {
    try {
        const r = await fetch('/api/admin/aliases', { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 401) { logout(); return; }
        showDashboard();
    } catch { logout(); }
}

function showDashboard() {
    $('loginScreen').style.display = 'none';
    $('dashboard').style.display = '';
    loadDomains();
    loadAliases();
}

function logout() {
    token = '';
    localStorage.removeItem('admin_token');
    $('dashboard').style.display = 'none';
    $('loginScreen').style.display = '';
    $('passInput').value = '';
}

// ─── Load domains ───────────────────────────────────────────────────────────
async function loadDomains() {
    try {
        const r = await fetch('/api/domains');
        const d = await r.json();
        const sel = $('domainSelect');
        sel.innerHTML = '';
        (d.domains || []).forEach(dom => {
            const opt = document.createElement('option');
            opt.value = dom; opt.textContent = `@${dom}`;
            sel.appendChild(opt);
        });
    } catch {}
}

// ─── Load aliases ───────────────────────────────────────────────────────────
async function loadAliases() {
    try {
        const r = await fetch('/api/admin/aliases', { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 401) { logout(); return; }
        const d = await r.json();
        aliases = d.aliases || [];
        renderAliases();
        updateStats();
    } catch (e) { toast('Failed to load', 'err'); }
}

function updateStats() {
    $('totalAliases').textContent = aliases.length;
    $('activeAliases').textContent = aliases.filter(a => a.is_active).length;
    $('totalMessages').textContent = aliases.reduce((s, a) => s + (a.email_count || 0), 0);
    $('aliasBadge').textContent = aliases.length;
}

function renderAliases() {
    const el = $('aliasesList');
    if (!aliases.length) {
        el.innerHTML = `<div class="empty"><div class="ico">📭</div><h3>No Emails Created</h3><p>Click Generate to create your first temporary email.</p></div>`;
        return;
    }
    let h = '';
    aliases.forEach((a, i) => {
        const domainBadge = a.domain === 'diaa.store' ? 'badge-primary' : 'badge-secondary';
        const statusClass = a.is_active ? 'status-active' : 'status-inactive';
        const statusText = a.is_active ? '🟢 Active' : '🔴 Inactive';
        const clientUrl = `${location.origin}/${a.email}`;
        h += `<div class="alias-item" style="animation:fadeUp .3s ease ${i * .03}s both">
            <div class="alias-main">
                <div class="alias-email-wrap">
                    <span class="alias-email">${esc(a.email)}</span>
                    <span class="alias-badge ${domainBadge}">@${a.domain}</span>
                    <span class="alias-status ${statusClass}">${statusText}</span>
                </div>
                <div class="alias-meta">
                    <span>📬 ${a.email_count || 0} msgs</span>
                    <span>📅 ${fmtDate(a.created_at)}</span>
                    ${a.note ? `<span>📝 ${esc(a.note)}</span>` : ''}
                </div>
            </div>
            <div class="alias-actions">
                <button class="abtn abtn-copy" onclick="copyText('${a.email}')" title="Copy email">📋</button>
                <button class="abtn abtn-link" onclick="copyText('${clientUrl}')" title="Copy client link">🔗</button>
                <button class="abtn abtn-toggle" onclick="toggleAlias('${a.id}',${!a.is_active})" title="${a.is_active ? 'Deactivate' : 'Activate'}">${a.is_active ? '⏸️' : '▶️'}</button>
                <button class="abtn abtn-del" onclick="deleteAlias('${a.id}','${esc(a.email)}')" title="Delete">🗑️</button>
            </div>
        </div>`;
    });
    el.innerHTML = h;
}

// ─── Actions ────────────────────────────────────────────────────────────────
async function generateAlias() {
    const btn = $('genBtn');
    btn.disabled = true;
    try {
        const r = await fetch('/api/admin/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ domain: $('domainSelect').value, note: $('noteInput').value.trim() || null })
        });
        if (r.status === 401) { logout(); return; }
        if (r.status === 409) { toast('Already exists, try again', 'err'); btn.disabled = false; return; }
        const d = await r.json();
        if (d.alias) {
            toast(`Created: ${d.alias.email}`, 'ok');
            $('noteInput').value = '';
            await copyText(d.alias.email);
            loadAliases();
        }
    } catch (e) { toast('Generate failed', 'err'); }
    btn.disabled = false;
}

async function deleteAlias(id, email) {
    if (!confirm(`Delete ${email}?\nThis will remove the email and all cached messages.`)) return;
    try {
        const r = await fetch(`/api/admin/aliases/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (r.ok) { toast(`Deleted: ${email}`, 'ok'); loadAliases(); }
        else toast('Delete failed', 'err');
    } catch { toast('Delete failed', 'err'); }
}

async function toggleAlias(id, active) {
    try {
        const r = await fetch(`/api/admin/aliases/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ is_active: active })
        });
        if (r.ok) { toast(active ? 'Activated' : 'Deactivated', 'ok'); loadAliases(); }
    } catch { toast('Update failed', 'err'); }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast(`Copied: ${text}`, 'ok');
    } catch { toast('Copy failed', 'err'); }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function toast(msg, type = 'inf') {
    const c = $('toasts'), t = document.createElement('div');
    t.className = `toast ${type}`; const icons = { ok: '✅', err: '❌', inf: '💡' };
    t.innerHTML = `<span>${icons[type] || '💡'}</span><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3500);
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(d) {
    return new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
