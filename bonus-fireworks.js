const COLORS = ["#5eb3ff", "#3ddc84", "#ffd166", "#ff6b6b", "#c084fc", "#f472b6"];

function resizeCanvas(canvas, ctx) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function burstParticles(particles, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.018,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 2 + Math.random() * 3
    });
  }
}

export function launchBonusFireworks(durationMs = 1600) {
  const canvas = document.createElement("canvas");
  canvas.className = "bonus-fireworks";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  resizeCanvas(canvas, ctx);
  const onResize = () => resizeCanvas(canvas, ctx);
  window.addEventListener("resize", onResize);

  const particles = [];
  const bursts = [
    { at: 0, x: 0.28, y: 0.35 },
    { at: 180, x: 0.72, y: 0.32 },
    { at: 360, x: 0.5, y: 0.22 },
    { at: 520, x: 0.38, y: 0.28 },
    { at: 680, x: 0.62, y: 0.26 }
  ];
  const start = performance.now();
  let raf = 0;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    canvas.remove();
  };

  const tick = (now) => {
    const elapsed = now - start;
    bursts.forEach((burst) => {
      if (!burst.fired && elapsed >= burst.at) {
        burst.fired = true;
        burstParticles(
          particles,
          burst.x * window.innerWidth,
          burst.y * window.innerHeight,
          36 + Math.floor(Math.random() * 18)
        );
      }
    });

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.vx *= 0.985;
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (elapsed < durationMs || particles.length > 0) {
      raf = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  raf = requestAnimationFrame(tick);
  window.setTimeout(cleanup, durationMs + 800);
  return cleanup;
}
