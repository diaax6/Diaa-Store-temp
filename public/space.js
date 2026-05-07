/* ═══ Cosmic Space Background Engine ═══ */
(function() {
    const canvas = document.createElement('canvas');
    canvas.id = 'spaceCanvas';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');
    let W, H, stars = [], shooters = [], particles = [], nebulas = [];

    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();

    // ── Stars ──
    for (let i = 0; i < 280; i++) {
        stars.push({
            x: Math.random() * W, y: Math.random() * H,
            r: Math.random() * 1.8 + 0.3,
            alpha: Math.random() * 0.7 + 0.3,
            speed: Math.random() * 0.02 + 0.005,
            phase: Math.random() * Math.PI * 2,
            color: ['#fff','#a78bfa','#2dd4bf','#f472b6','#60a5fa','#fbbf24'][Math.floor(Math.random()*6)]
        });
    }

    // ── Nebula clouds ──
    const nebulaColors = [
        { r: 139, g: 92, b: 246, a: 0.12 },   // purple
        { r: 236, g: 72, b: 153, a: 0.08 },    // pink
        { r: 6, g: 182, b: 212, a: 0.1 },      // cyan
        { r: 59, g: 130, b: 246, a: 0.07 },     // blue
        { r: 251, g: 191, b: 36, a: 0.04 },     // golden
    ];
    for (let i = 0; i < 5; i++) {
        const c = nebulaColors[i];
        nebulas.push({
            x: Math.random() * W, y: Math.random() * H,
            radius: Math.random() * 300 + 200,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.2,
            color: c,
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: Math.random() * 0.008 + 0.003,
        });
    }

    // ── Floating particles ──
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * W, y: Math.random() * H,
            r: Math.random() * 2 + 0.5,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.5 + 0.1,
            color: ['rgba(167,139,250,','rgba(45,212,191,','rgba(244,114,182,','rgba(96,165,250,'][Math.floor(Math.random()*4)]
        });
    }

    // ── Shooting stars ──
    function spawnShooter() {
        shooters.push({
            x: Math.random() * W * 0.8, y: Math.random() * H * 0.4,
            len: Math.random() * 120 + 60,
            speed: Math.random() * 12 + 6,
            angle: Math.PI / 4 + (Math.random() - 0.5) * 0.5,
            alpha: 1,
            life: 0,
            maxLife: Math.random() * 40 + 30,
            width: Math.random() * 2 + 1,
            hue: [250, 180, 330, 200][Math.floor(Math.random() * 4)]
        });
    }
    setInterval(spawnShooter, 2500 + Math.random() * 3000);
    spawnShooter();

    let t = 0;
    function draw() {
        t += 0.016;
        ctx.clearRect(0, 0, W, H);

        // Deep space gradient
        const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.7);
        bg.addColorStop(0, '#0c0520');
        bg.addColorStop(0.4, '#06020f');
        bg.addColorStop(1, '#020010');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Nebulas
        nebulas.forEach(n => {
            n.x += n.vx; n.y += n.vy;
            if (n.x < -n.radius) n.x = W + n.radius;
            if (n.x > W + n.radius) n.x = -n.radius;
            if (n.y < -n.radius) n.y = H + n.radius;
            if (n.y > H + n.radius) n.y = -n.radius;
            n.pulse += n.pulseSpeed;
            const a = n.color.a * (0.7 + 0.3 * Math.sin(n.pulse));
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
            grad.addColorStop(0, `rgba(${n.color.r},${n.color.g},${n.color.b},${a})`);
            grad.addColorStop(0.5, `rgba(${n.color.r},${n.color.g},${n.color.b},${a * 0.4})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2);
        });

        // Stars
        stars.forEach(s => {
            s.phase += s.speed;
            const a = s.alpha * (0.5 + 0.5 * Math.sin(s.phase));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.globalAlpha = a;
            ctx.fill();
            // Glow for bigger stars
            if (s.r > 1.2) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.globalAlpha = a * 0.15;
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;

        // Floating particles
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
            if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color + p.alpha + ')';
            ctx.fill();
        });

        // Shooting stars
        shooters.forEach((s, i) => {
            s.life++;
            const progress = s.life / s.maxLife;
            s.x += Math.cos(s.angle) * s.speed;
            s.y += Math.sin(s.angle) * s.speed;
            s.alpha = progress < 0.2 ? progress * 5 : (1 - progress);
            if (s.alpha <= 0) { shooters.splice(i, 1); return; }
            const tailX = s.x - Math.cos(s.angle) * s.len;
            const tailY = s.y - Math.sin(s.angle) * s.len;
            const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.7, `hsla(${s.hue},90%,70%,${s.alpha * 0.6})`);
            grad.addColorStop(1, `hsla(${s.hue},100%,95%,${s.alpha})`);
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(s.x, s.y);
            ctx.strokeStyle = grad;
            ctx.lineWidth = s.width;
            ctx.stroke();
            // Head glow
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.width * 2, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${s.hue},100%,90%,${s.alpha * 0.5})`;
            ctx.fill();
        });

        requestAnimationFrame(draw);
    }
    draw();
})();
