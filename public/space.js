/* ═══ Cosmic Space Background Engine V2 — Ultra Intense ═══ */
(function() {
    const canvas = document.createElement('canvas');
    canvas.id = 'spaceCanvas';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');
    let W, H, stars = [], shooters = [], particles = [], nebulas = [], pulseRings = [];

    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; initStars(); }
    window.addEventListener('resize', resize);

    function initStars() {
        stars = [];
        for (let i = 0; i < 350; i++) {
            stars.push({
                x: Math.random() * W, y: Math.random() * H,
                r: Math.random() * 2.2 + 0.2,
                alpha: Math.random() * 0.8 + 0.2,
                speed: Math.random() * 0.04 + 0.008,
                phase: Math.random() * Math.PI * 2,
                color: ['#fff','#e0e7ff','#a78bfa','#2dd4bf','#f472b6','#60a5fa','#fbbf24','#34d399','#c084fc','#fb7185'][Math.floor(Math.random()*10)],
                drift: (Math.random() - 0.5) * 0.08
            });
        }
    }

    // ── Nebula clouds — vivid & large ──
    nebulas = [
        { x: 0.2, y: 0.15, radius: 0.35, r: 139, g: 92, b: 246, a: 0.18, ps: 0.006, p: 0, vx: 0.12, vy: 0.08 },
        { x: 0.8, y: 0.7, radius: 0.3, r: 236, g: 72, b: 153, a: 0.14, ps: 0.008, p: 1, vx: -0.1, vy: 0.06 },
        { x: 0.5, y: 0.5, radius: 0.4, r: 6, g: 182, b: 212, a: 0.12, ps: 0.005, p: 2, vx: 0.08, vy: -0.1 },
        { x: 0.15, y: 0.8, radius: 0.28, r: 59, g: 130, b: 246, a: 0.1, ps: 0.007, p: 3, vx: 0.15, vy: -0.05 },
        { x: 0.85, y: 0.2, radius: 0.25, r: 251, g: 146, b: 60, a: 0.08, ps: 0.009, p: 4, vx: -0.08, vy: 0.12 },
        { x: 0.5, y: 0.1, radius: 0.32, r: 168, g: 85, b: 247, a: 0.15, ps: 0.004, p: 5, vx: 0.05, vy: 0.1 },
        { x: 0.3, y: 0.6, radius: 0.2, r: 52, g: 211, b: 153, a: 0.07, ps: 0.01, p: 6, vx: -0.12, vy: -0.08 },
    ];

    // ── Floating dust particles ──
    particles = [];
    for (let i = 0; i < 100; i++) {
        particles.push({
            x: Math.random(), y: Math.random(),
            r: Math.random() * 2.5 + 0.3,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.25 - 0.05,
            alpha: Math.random() * 0.6 + 0.1,
            hue: [260, 180, 330, 200, 150, 45][Math.floor(Math.random()*6)],
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: Math.random() * 0.03 + 0.01
        });
    }

    // ── Pulse rings (expanding circles) ──
    function spawnRing() {
        pulseRings.push({
            x: Math.random() * W, y: Math.random() * H,
            radius: 0, maxRadius: Math.random() * 200 + 100,
            speed: Math.random() * 1.5 + 0.5,
            alpha: 0.3,
            hue: [260, 180, 330, 200][Math.floor(Math.random()*4)]
        });
    }
    setInterval(spawnRing, 4000);

    // ── Shooting stars ──
    function spawnShooter() {
        const fromRight = Math.random() > 0.5;
        shooters.push({
            x: fromRight ? W + 20 : Math.random() * W * 0.6,
            y: Math.random() * H * 0.5,
            len: Math.random() * 150 + 80,
            speed: Math.random() * 16 + 8,
            angle: fromRight ? Math.PI * 0.75 + (Math.random()-0.5)*0.3 : Math.PI/4 + (Math.random()-0.5)*0.4,
            alpha: 1, life: 0,
            maxLife: Math.random() * 35 + 25,
            width: Math.random() * 2.5 + 1,
            hue: [250, 180, 330, 45, 150][Math.floor(Math.random()*5)]
        });
    }
    setInterval(spawnShooter, 1800 + Math.random() * 2000);
    spawnShooter(); spawnShooter();

    let t = 0;
    resize();

    function draw() {
        t += 0.016;
        ctx.clearRect(0, 0, W, H);

        // Deep space gradient with color shift
        const hueShift = Math.sin(t * 0.1) * 15;
        const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
        bg.addColorStop(0, `hsl(${270 + hueShift}, 80%, 8%)`);
        bg.addColorStop(0.3, `hsl(${260 + hueShift}, 70%, 4%)`);
        bg.addColorStop(0.7, `hsl(${250 + hueShift}, 85%, 2%)`);
        bg.addColorStop(1, '#010005');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // ── Nebulas with vivid glow ──
        nebulas.forEach(n => {
            n.p += n.ps;
            const nx = (n.x * W + Math.sin(t * n.vx + n.p) * 80);
            const ny = (n.y * H + Math.cos(t * n.vy + n.p) * 60);
            const rad = n.radius * Math.min(W, H) * (0.9 + 0.1 * Math.sin(n.p));
            const a = n.a * (0.6 + 0.4 * Math.sin(n.p * 1.5));

            // Outer glow
            const g1 = ctx.createRadialGradient(nx, ny, 0, nx, ny, rad);
            g1.addColorStop(0, `rgba(${n.r},${n.g},${n.b},${a})`);
            g1.addColorStop(0.3, `rgba(${n.r},${n.g},${n.b},${a * 0.5})`);
            g1.addColorStop(0.6, `rgba(${n.r},${n.g},${n.b},${a * 0.15})`);
            g1.addColorStop(1, 'transparent');
            ctx.fillStyle = g1;
            ctx.fillRect(nx - rad, ny - rad, rad * 2, rad * 2);

            // Inner bright core
            const g2 = ctx.createRadialGradient(nx, ny, 0, nx, ny, rad * 0.3);
            g2.addColorStop(0, `rgba(${Math.min(255,n.r+60)},${Math.min(255,n.g+60)},${Math.min(255,n.b+60)},${a * 0.6})`);
            g2.addColorStop(1, 'transparent');
            ctx.fillStyle = g2;
            ctx.fillRect(nx - rad * 0.3, ny - rad * 0.3, rad * 0.6, rad * 0.6);
        });

        // ── Stars with glow ──
        stars.forEach(s => {
            s.phase += s.speed;
            s.x += s.drift;
            if (s.x < -5) s.x = W + 5;
            if (s.x > W + 5) s.x = -5;
            const a = s.alpha * (0.3 + 0.7 * Math.abs(Math.sin(s.phase)));

            // Glow
            if (s.r > 0.8) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.globalAlpha = a * 0.1;
                ctx.fill();
            }
            // Star
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.globalAlpha = a;
            ctx.fill();

            // Cross sparkle for bright stars
            if (s.r > 1.5 && a > 0.6) {
                ctx.globalAlpha = a * 0.3;
                ctx.strokeStyle = s.color;
                ctx.lineWidth = 0.5;
                const sz = s.r * 6;
                ctx.beginPath(); ctx.moveTo(s.x - sz, s.y); ctx.lineTo(s.x + sz, s.y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(s.x, s.y - sz); ctx.lineTo(s.x, s.y + sz); ctx.stroke();
            }
        });
        ctx.globalAlpha = 1;

        // ── Floating particles ──
        particles.forEach(p => {
            p.pulse += p.pulseSpeed;
            p.x += p.vx / W; p.y += p.vy / H;
            if (p.x < -0.05) p.x = 1.05; if (p.x > 1.05) p.x = -0.05;
            if (p.y < -0.05) p.y = 1.05; if (p.y > 1.05) p.y = -0.05;
            const px = p.x * W, py = p.y * H;
            const a = p.alpha * (0.4 + 0.6 * Math.sin(p.pulse));
            ctx.beginPath();
            ctx.arc(px, py, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue},80%,70%,${a})`;
            ctx.fill();
            // Particle glow
            ctx.beginPath();
            ctx.arc(px, py, p.r * 3, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue},80%,60%,${a * 0.08})`;
            ctx.fill();
        });

        // ── Pulse rings ──
        pulseRings.forEach((r, i) => {
            r.radius += r.speed;
            r.alpha = 0.3 * (1 - r.radius / r.maxRadius);
            if (r.alpha <= 0) { pulseRings.splice(i, 1); return; }
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(${r.hue},70%,60%,${r.alpha})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // ── Shooting stars with trail ──
        shooters.forEach((s, i) => {
            s.life++;
            const progress = s.life / s.maxLife;
            s.x += Math.cos(s.angle) * s.speed;
            s.y += Math.sin(s.angle) * s.speed;
            s.alpha = progress < 0.15 ? progress / 0.15 : Math.max(0, 1 - (progress - 0.15) / 0.85);
            if (s.life > s.maxLife) { shooters.splice(i, 1); return; }

            const tailX = s.x - Math.cos(s.angle) * s.len;
            const tailY = s.y - Math.sin(s.angle) * s.len;
            const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.5, `hsla(${s.hue},90%,70%,${s.alpha * 0.4})`);
            grad.addColorStop(0.85, `hsla(${s.hue},95%,80%,${s.alpha * 0.8})`);
            grad.addColorStop(1, `hsla(${s.hue},100%,95%,${s.alpha})`);
            ctx.beginPath();
            ctx.moveTo(tailX, tailY); ctx.lineTo(s.x, s.y);
            ctx.strokeStyle = grad; ctx.lineWidth = s.width; ctx.stroke();

            // Bright head
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.width * 3, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${s.hue},100%,95%,${s.alpha * 0.4})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.width * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${s.hue},100%,98%,${s.alpha * 0.8})`;
            ctx.fill();
        });

        requestAnimationFrame(draw);
    }
    draw();
})();
