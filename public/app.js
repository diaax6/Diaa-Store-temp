/* DiaaStore TempMail — Client (Check Only) */

let currentAlias = '', currentEmails = [], selectedUid = null;
let arEnabled = true, cdTimer = null, countdown = 15, isLoading = false;

const $ = id => document.getElementById(id);
const emailInput = $('emailInput'), inboxArea = $('inboxArea'), inboxCard = $('inboxCard');
const welcomeCard = $('welcomeCard'), statAlias = $('statAlias'), statCount = $('statCount');
const timerEl = $('timer'), copyBtn = $('copyBtn');

document.addEventListener('DOMContentLoaded', () => {
    emailInput.addEventListener('keydown', e => { if(e.key==='Enter') handleCheck(); });
    loadFooterLinks();

    // Detect alias from URL path or hash
    let detected = '';
    const urlPath = decodeURIComponent(location.pathname.slice(1));
    const hashVal = decodeURIComponent(location.hash.slice(1));

    if (urlPath && urlPath.includes('@')) {
        detected = urlPath;
    } else if (hashVal && hashVal.includes('@')) {
        detected = hashVal;
    }

    if (detected) {
        detected = detected.toLowerCase().trim();
        emailInput.value = detected;
        handleCheck();
    } else {
        emailInput.focus();
    }
});

async function handleCheck() {
    let a = emailInput.value.trim().toLowerCase();
    if (!a) { toast('Enter an email address', 'err'); emailInput.focus(); return; }
    if (!a.includes('@')) { toast('Enter the full email with @domain', 'err'); return; }

    currentAlias = a;
    emailInput.value = a;
    history.replaceState(null, '', '/' + a);
    welcomeCard.style.display = 'none';
    inboxArea.style.display = 'block';
    copyBtn.style.display = 'inline-flex';
    statAlias.textContent = a;
    selectedUid = null;
    await fetchEmails();
    startAR();
}

async function fetchEmails() {
    if (isLoading || !currentAlias) return;
    isLoading = true;
    if (currentEmails.length === 0 && !selectedUid) {
        inboxCard.innerHTML = `<div class="loading"><div class="spin"></div><span class="load-txt">Fetching emails for ${esc(currentAlias)}...</span></div>`;
    }
    try {
        const r = await fetch(`/api/emails/${encodeURIComponent(currentAlias)}`);
        if (r.status === 429) { toast('Too many requests. Slow down.', 'err'); isLoading = false; return; }
        if (r.status === 404) {
            inboxCard.innerHTML = `<div class="empty"><div class="ico">🚫</div><h3>Email Not Registered</h3><p>This email address is not in our system.<br>Please contact the admin to get a valid email.</p></div>`;
            stopAR();
            isLoading = false;
            return;
        }
        if (r.status === 403) {
            inboxCard.innerHTML = `<div class="empty"><div class="ico">🔒</div><h3>Email Deactivated</h3><p>This email has been deactivated by the admin.</p></div>`;
            stopAR();
            isLoading = false;
            return;
        }
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Fetch failed'); }
        const d = await r.json();
        const prev = currentEmails.length;
        currentEmails = d.emails;
        if (prev > 0 && currentEmails.length > prev) {
            toast(`${currentEmails.length - prev} new email(s) received!`, 'inf');
        }
        statCount.textContent = currentEmails.length;
        if (selectedUid) {
            const e = currentEmails.find(x => x.uid === selectedUid);
            e ? renderDetail(e) : (selectedUid = null, renderList());
        } else renderList();
    } catch (e) {
        console.error(e);
        if (!currentEmails.length) inboxCard.innerHTML = `<div class="empty"><div class="ico">⚠️</div><h3>Error</h3><p>${esc(e.message)}</p></div>`;
        toast(e.message, 'err');
    } finally { isLoading = false; }
}

function renderList() {
    if (!currentEmails.length) {
        inboxCard.innerHTML = `<div class="empty"><div class="ico">📭</div><h3>No Emails Yet</h3><p>Emails sent to <b>${esc(currentAlias)}</b> will appear here automatically.</p></div>`;
        return;
    }
    let h = '<div class="email-list">';
    currentEmails.forEach((e, i) => {
        const fn = e.from.name || e.from.address || '?', ini = fn.charAt(0).toUpperCase();
        h += `<div class="email-item" onclick="viewEmail('${e.uid}')" style="animation:fadeUp .3s ease ${i * .04}s both">
            <div class="email-av">${ini}</div>
            <div class="email-body"><div class="email-from">${esc(fn)}</div><div class="email-subj">${esc(e.subject)}</div></div>
            <div class="email-meta"><span class="email-time">${fmtDate(e.date)}</span>${e.hasAttachments ? `<span class="email-tag">📎 ${e.attachmentCount}</span>` : ''}</div>
        </div>`;
    });
    inboxCard.innerHTML = h + '</div>';
}

function viewEmail(uid) {
    const e = currentEmails.find(x => String(x.uid) === String(uid));
    if (!e) return;
    selectedUid = uid;
    renderDetail(e);
}

function renderDetail(e) {
    const fn = e.from.name || e.from.address || '?', fa = e.from.address || '';
    const to = (e.to || []).map(t => t.address || t).join(', ');
    let body = '';
    if (e.html) {
        const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#333;padding:16px;margin:0;word-break:break-word}img{max-width:100%;height:auto}a{color:#6366f1}pre{overflow-x:auto}</style></head><body>${e.html}</body></html>`], { type: 'text/html' });
        body = `<iframe class="email-frame" src="${URL.createObjectURL(blob)}" sandbox="allow-same-origin" frameborder="0" onload="this.style.height=this.contentWindow.document.body.scrollHeight+32+'px'"></iframe>`;
    } else body = `<div class="email-plain">${esc(e.text)}</div>`;
    inboxCard.innerHTML = `<div class="detail">
        <div class="detail-top">
            <div class="detail-info">
                <h1 class="detail-subj">${esc(e.subject)}</h1>
                <div class="detail-meta">
                    <div class="m-item"><span class="m-lbl">From:</span> ${esc(fn)} &lt;${esc(fa)}&gt;</div>
                    <div class="m-item"><span class="m-lbl">To:</span> ${esc(to)}</div>
                    <div class="m-item"><span class="m-lbl">Date:</span> ${fmtFull(e.date)}</div>
                </div>
            </div>
            <button class="btn btn-back" onclick="goBack()">← Back</button>
        </div>
        ${body}
    </div>`;
}

function goBack() { selectedUid = null; renderList(); }

async function copyEmail() {
    if (!currentAlias) { toast('No email to copy', 'err'); return; }
    try {
        await navigator.clipboard.writeText(currentAlias);
        $('cpIco').textContent = '✅'; $('cpTxt').textContent = 'Copied!';
        toast(`Copied: ${currentAlias}`, 'ok');
        setTimeout(() => { $('cpIco').textContent = '📋'; $('cpTxt').textContent = 'Copy Address'; }, 2000);
    } catch { toast('Copy failed', 'err'); }
}

function startAR() { stopAR(); if (!arEnabled || !currentAlias) return; countdown = 15; timerEl.textContent = '15s';
    cdTimer = setInterval(() => { countdown--; timerEl.textContent = `${countdown}s`; if (countdown <= 0) { countdown = 15; fetchEmails(); } }, 1000); }
function stopAR() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } timerEl.textContent = '—'; }
function toggleAR() { arEnabled = $('arToggle').checked; arEnabled ? startAR() : stopAR(); }

async function manualRefresh() {
    if (!currentAlias) return;
    const btn = $('refreshBtn'); btn.classList.add('spinning'); btn.disabled = true;
    await fetchEmails();
    btn.classList.remove('spinning'); btn.disabled = false;
    if (arEnabled) startAR();
}

function toast(msg, type = 'inf') {
    const c = $('toasts'), t = document.createElement('div');
    t.className = `toast ${type}`; const icons = { ok: '✅', err: '❌', inf: '💡' };
    t.innerHTML = `<span>${icons[type] || '💡'}</span><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3500);
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(d) { const dt = new Date(d), now = new Date(), df = now - dt;
    if (df < 6e4) return 'Now'; if (df < 36e5) return `${Math.floor(df / 6e4)}m`; if (df < 864e5) return `${Math.floor(df / 36e5)}h`;
    if (df < 6048e5) return `${Math.floor(df / 864e5)}d`; return dt.toLocaleDateString('en', { month: 'short', day: 'numeric' }); }
function fmtFull(d) { return new Date(d).toLocaleDateString('en', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

async function loadFooterLinks() {
    const el = $('footerLinks');
    if (!el) return;
    let links = [
        { icon: '🔐', name: '2FA Generator', url: 'https://2fa.diaastore.cloud' },
        { icon: '📬', name: 'Diaa Store Mails', url: 'https://mail.diaa.store' }
    ];
    try {
        const r = await fetch('/api/settings/links');
        const d = await r.json();
        if (d.links && d.links.length > 0) links = d.links;
    } catch {}
    el.innerHTML = links.map(l => {
        const domain = l.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `<a href="${esc(l.url)}" target="_blank" class="service-card">
            <span class="svc-icon">${l.icon}</span>
            <div class="svc-info"><span class="svc-name">${esc(l.name)}</span><span class="svc-url">${esc(domain)}</span></div>
            <svg class="svc-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
        </a>`;
    }).join('');
}
