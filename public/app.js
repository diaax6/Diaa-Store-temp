/* DiaaStore TempMail — Client (Multi-Domain) */

let currentAlias = '', currentEmails = [], selectedUid = null;
let arEnabled = true, cdTimer = null, countdown = 15, isLoading = false;

const $ = id => document.getElementById(id);
const emailInput = $('emailInput'), inboxArea = $('inboxArea'), inboxCard = $('inboxCard');
const welcomeCard = $('welcomeCard'), statAlias = $('statAlias'), statCount = $('statCount');
const timerEl = $('timer'), copyBtn = $('copyBtn'), domainSelect = $('domainSelect');

function getDomain() {
    return domainSelect.value;
}

// Fetch available domains from server and populate selector
async function loadDomains() {
    try {
        const r = await fetch('/api/domains');
        const d = await r.json();
        if (d.domains && d.domains.length > 0) {
            domainSelect.innerHTML = '';
            d.domains.forEach(domain => {
                const opt = document.createElement('option');
                opt.value = domain;
                opt.textContent = `@${domain}`;
                domainSelect.appendChild(opt);
            });
        }
    } catch(e) {
        console.log('Could not load domains, using defaults');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadDomains();
    
    emailInput.addEventListener('keydown', e => { if(e.key==='Enter') handleCheck(); });
    
    // Detect alias from URL: /alias, /alias@domain, ?email=alias, or #alias
    let detected = '';
    const urlPath = location.pathname.slice(1); // remove leading /
    const urlParams = new URLSearchParams(location.search);
    const hashVal = location.hash.slice(1);
    
    if (urlPath && !urlPath.includes('.') && urlPath !== 'api') {
        detected = urlPath;
    } else if (urlParams.get('email')) {
        detected = urlParams.get('email');
    } else if (hashVal) {
        detected = hashVal;
    }
    
    if (detected) {
        detected = decodeURIComponent(detected).toLowerCase().trim();
        // Try to detect domain from URL input
        const allDomains = Array.from(domainSelect.options).map(o => o.value);
        for (const d of allDomains) {
            if (detected.endsWith(`@${d}`)) {
                domainSelect.value = d;
                detected = detected.replace(`@${d}`, '');
                break;
            }
        }
        // If still has @, strip the domain part
        if (detected.includes('@')) {
            detected = detected.split('@')[0];
        }
        emailInput.value = detected;
        handleCheck();
    } else {
        emailInput.focus();
    }
});

async function handleCheck() {
    let a = emailInput.value.trim().toLowerCase();
    if(!a) { toast('Enter an alias name or generate one','err'); emailInput.focus(); return; }
    
    const domain = getDomain();
    
    // If user pasted a full email, extract parts
    if(a.includes('@')) {
        const parts = a.split('@');
        const inputDomain = parts[1];
        // Try to match with available domains
        const allDomains = Array.from(domainSelect.options).map(o => o.value);
        if (allDomains.includes(inputDomain)) {
            domainSelect.value = inputDomain;
        } else {
            toast(`Domain @${inputDomain} is not available. Use @${domain}`,'err');
            return;
        }
        a = `${parts[0]}@${inputDomain}`;
    } else {
        a = `${a}@${domain}`;
    }
    
    currentAlias = a;
    emailInput.value = a.split('@')[0];
    history.replaceState(null, '', '/' + encodeURIComponent(currentAlias));
    welcomeCard.style.display = 'none';
    inboxArea.style.display = 'block';
    copyBtn.style.display = 'inline-flex';
    statAlias.textContent = a;
    selectedUid = null;
    await fetchEmails();
    startAR();
}

async function fetchEmails() {
    if(isLoading || !currentAlias) return;
    isLoading = true;
    if(currentEmails.length === 0 && !selectedUid) {
        inboxCard.innerHTML = `<div class="loading"><div class="spin"></div><span class="load-txt">Fetching emails for ${currentAlias}...</span></div>`;
    }
    try {
        const r = await fetch(`/api/emails/${encodeURIComponent(currentAlias)}`);
        if(r.status===429) { toast('Too many requests. Slow down.','err'); isLoading=false; return; }
        if(!r.ok) { const d=await r.json(); throw new Error(d.error||'Fetch failed'); }
        const d = await r.json();
        const prev = currentEmails.length;
        currentEmails = d.emails;
        if(prev>0 && currentEmails.length>prev) {
            const n = currentEmails.length-prev;
            toast(`${n} new email${n>1?'s':''} received!`,'inf');
        }
        statCount.textContent = currentEmails.length;
        if(selectedUid) {
            const e = currentEmails.find(x=>x.uid===selectedUid);
            e ? renderDetail(e) : (selectedUid=null, renderList());
        } else renderList();
    } catch(e) {
        console.error(e);
        if(!currentEmails.length) inboxCard.innerHTML = `<div class="empty"><div class="ico">⚠️</div><h3>Connection Error</h3><p>${esc(e.message)}</p></div>`;
        toast(e.message,'err');
    } finally { isLoading=false; }
}

function renderList() {
    if(!currentEmails.length) {
        inboxCard.innerHTML = `<div class="empty"><div class="ico">📭</div><h3>No Emails Yet</h3><p>Emails sent to <b>${esc(currentAlias)}</b> will appear here automatically.</p></div>`;
        return;
    }
    let h = '<div class="email-list">';
    currentEmails.forEach((e,i) => {
        const fn = e.from.name||e.from.address||'?', ini = fn.charAt(0).toUpperCase();
        h += `<div class="email-item" onclick="viewEmail('${e.uid}')" style="animation:fadeUp .3s ease ${i*.04}s both">
            <div class="email-av">${ini}</div>
            <div class="email-body"><div class="email-from">${esc(fn)}</div><div class="email-subj">${esc(e.subject)}</div></div>
            <div class="email-meta"><span class="email-time">${fmtDate(e.date)}</span>${e.hasAttachments?`<span class="email-tag">📎 ${e.attachmentCount}</span>`:''}</div>
        </div>`;
    });
    h += '</div>';
    inboxCard.innerHTML = h;
}

function viewEmail(uid) {
    const e = currentEmails.find(x=>String(x.uid)===String(uid));
    if(!e) return;
    selectedUid = uid;
    renderDetail(e);
}

function renderDetail(e) {
    const fn = e.from.name||e.from.address||'?', fa = e.from.address||'';
    const to = e.to.map(t=>t.address).join(', ');
    let body = '';
    if(e.html) {
        const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#333;padding:16px;margin:0;word-break:break-word}img{max-width:100%;height:auto}a{color:#6366f1}pre{overflow-x:auto}</style></head><body>${e.html}</body></html>`],{type:'text/html'});
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

function goBack() { selectedUid=null; renderList(); }

async function generateRandomAlias() {
    try {
        const domain = getDomain();
        const r = await fetch(`/api/generate?domain=${encodeURIComponent(domain)}`), d = await r.json();
        const aliasParts = d.alias.split('@');
        emailInput.value = aliasParts[0];
        // Set the domain selector to match
        if (aliasParts[1]) {
            domainSelect.value = aliasParts[1];
        }
        toast(`Generated: ${d.alias}`,'ok');
        handleCheck();
    } catch(e) { toast('Failed to generate','err'); }
}

async function copyEmail() {
    const a = currentAlias || `${emailInput.value.trim()}@${getDomain()}`;
    if(!a||a===`@${getDomain()}`) { toast('No email to copy','err'); return; }
    try {
        await navigator.clipboard.writeText(a);
        copyBtn.classList.add('ok');
        $('cpIco').textContent='✅'; $('cpTxt').textContent='Copied!';
        toast(`Copied: ${a}`,'ok');
        setTimeout(()=>{ copyBtn.classList.remove('ok'); $('cpIco').textContent='📋'; $('cpTxt').textContent='Copy Address'; },2000);
    } catch(e) { toast('Copy failed','err'); }
}

function startAR() { stopAR(); if(!arEnabled||!currentAlias) return; countdown=15; timerEl.textContent='15s';
    cdTimer=setInterval(()=>{ countdown--; timerEl.textContent=`${countdown}s`; if(countdown<=0){countdown=15;fetchEmails();} },1000); }
function stopAR() { if(cdTimer){clearInterval(cdTimer);cdTimer=null;} timerEl.textContent='—'; }
function toggleAR() { arEnabled=$('arToggle').checked; arEnabled?startAR():stopAR(); }

async function manualRefresh() {
    if(!currentAlias) { toast('Enter an alias first','err'); return; }
    const btn = $('refreshBtn');
    btn.classList.add('spinning');
    btn.disabled = true;
    await fetchEmails();
    btn.classList.remove('spinning');
    btn.disabled = false;
    if(arEnabled) startAR(); // Reset countdown
}

function toast(msg,type='inf') {
    const c=$('toasts'), t=document.createElement('div');
    t.className=`toast ${type==='ok'?'ok':type==='err'?'err':'inf'}`;
    const icons={ok:'✅',err:'❌',inf:'💡'};
    t.innerHTML=`<span>${icons[type]||'💡'}</span><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),300); },3500);
}

function esc(s) { if(!s) return ''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function fmtDate(d) { const dt=new Date(d),now=new Date(),df=now-dt;
    if(df<6e4) return 'Now'; if(df<36e5) return `${Math.floor(df/6e4)}m`; if(df<864e5) return `${Math.floor(df/36e5)}h`;
    if(df<6048e5) return `${Math.floor(df/864e5)}d`; return dt.toLocaleDateString('en',{month:'short',day:'numeric'}); }
function fmtFull(d) { return new Date(d).toLocaleDateString('en',{weekday:'short',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
