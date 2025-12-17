import { RefObject, useEffect } from 'react';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h} ${s}% ${l}% / ${a})`;

type Noise = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null };

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
};

const createNoise = (): Noise => {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, ctx: null };
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.floor(Math.random() * 55);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(Math.random() * 18);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, ctx };
};

export const useHeroScrollFilm = (canvasRef: RefObject<HTMLCanvasElement>, hostRef: RefObject<HTMLElement>) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let scheduled = false;
    let lastT = -1;

    const noise = createNoise();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scheduleRender(true);
    };

    const computeT = () => {
      const rect = host.getBoundingClientRect();
      const vh = Math.max(1, window.innerHeight || 1);
      const travel = Math.max(1, Math.min(rect.height, vh) * 0.9);
      const t = clamp((-rect.top) / travel, 0, 1);
      return prefersReducedMotion ? 0 : t;
    };

    const drawBulb = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r * 0.1);
      ctx.bezierCurveTo(cx - r * 1.05, cy - r * 0.35, cx - r * 0.65, cy - r * 1.05, cx, cy - r * 1.05);
      ctx.bezierCurveTo(cx + r * 0.65, cy - r * 1.05, cx + r * 1.05, cy - r * 0.35, cx + r * 0.7, cy + r * 0.1);
      ctx.bezierCurveTo(cx + r * 0.55, cy + r * 0.75, cx + r * 0.25, cy + r * 0.95, cx + r * 0.18, cy + r * 1.05);
      ctx.lineTo(cx - r * 0.18, cy + r * 1.05);
      ctx.bezierCurveTo(cx - r * 0.25, cy + r * 0.95, cx - r * 0.55, cy + r * 0.75, cx - r * 0.7, cy + r * 0.1);
      ctx.closePath();
    };

    const drawLandscape = (horizonY: number, alpha: number) => {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, horizonY);

      const waves = 8;
      for (let i = 0; i <= waves; i += 1) {
        const x = (i / waves) * width;
        const a = Math.sin(i * 1.3) * 0.5 + Math.sin(i * 2.2) * 0.5;
        const y = horizonY + a * (height * 0.02) + Math.sin(i * 0.7) * (height * 0.012);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, horizonY);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);
      ctx.stroke();
      ctx.restore();
    };

    const render = (t: number) => {
      // Timeline
      const tSun = smoothstep(0, 0.58, t);
      const tBulb = smoothstep(0.52, 1, t);
      const warm = 1 - tBulb;
      const cool = tBulb;

      // Background sky (subtle, restrained)
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, hsl(228, 42, lerp(10, 12, warm), 1));
      bg.addColorStop(0.5, hsl(224, 30, lerp(8, 10, warm), 1));
      bg.addColorStop(1, hsl(220, 45, lerp(6, 7, warm), 1));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Soft horizon glow (between text lines)
      const horizonY = height * 0.525;
      ctx.globalCompositeOperation = 'lighter';
      const horizonGlow = ctx.createLinearGradient(0, horizonY - 80, 0, horizonY + 120);
      horizonGlow.addColorStop(0, 'rgba(0,0,0,0)');
      horizonGlow.addColorStop(0.45, `rgba(245,158,11,${0.08 * warm})`);
      horizonGlow.addColorStop(0.7, `rgba(34,211,238,${0.06 * cool})`);
      horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, horizonY - 140, width, 320);
      ctx.globalCompositeOperation = 'source-over';

      // Stars, fade out quickly
      const starA = (1 - tSun) * 0.18;
      if (starA > 0.002) {
        ctx.save();
        ctx.globalAlpha = starA;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 42; i += 1) {
          const x = ((i * 97) % 251) / 251;
          const y = ((i * 57) % 197) / 197;
          const sx = x * width;
          const sy = y * height * 0.5;
          const r = 0.6 + ((i * 13) % 5) * 0.15;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Sunrise -> bulb positions
      const sunriseX = width * 0.5;
      const sunriseY = lerp(horizonY + 160, horizonY - 120, tSun);
      const bulbCx = width * 0.5;
      const bulbCy = height * 0.44;
      const sunX = lerp(sunriseX, bulbCx, tBulb);
      const sunY = lerp(sunriseY, bulbCy + height * 0.02, tBulb);
      const sunR = lerp(Math.min(width, height) * 0.15, Math.min(width, height) * 0.085, tBulb);

      // Sun core + bloom
      ctx.globalCompositeOperation = 'lighter';
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3.2);
      sunGlow.addColorStop(0, `rgba(255,255,255,${0.11 + tSun * 0.05})`);
      sunGlow.addColorStop(0.18, `rgba(245,158,11,${0.16 * warm})`);
      sunGlow.addColorStop(0.45, `rgba(34,211,238,${0.13 * cool})`);
      sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Sun disk (more "physical" than pure bloom)
      const sunDisk = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
      sunDisk.addColorStop(0, `rgba(255,255,255,${0.36 + 0.14 * (1 - tBulb)})`);
      sunDisk.addColorStop(0.55, `rgba(245,158,11,${0.22 * warm + 0.08 * cool})`);
      sunDisk.addColorStop(1, `rgba(34,211,238,${0.16 * cool})`);
      ctx.fillStyle = sunDisk;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // Rays (stronger early, cleaner later)
      const rayA = lerp(0.19, 0.06, tBulb) * lerp(1, 0.15, tBulb);
      const rayCount = 56;
      const rayLen = Math.min(width, height) * lerp(0.72, 0.5, tBulb);
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.lineCap = 'round';
      for (let i = 0; i < rayCount; i += 1) {
        const a = (i / rayCount) * Math.PI * 2;
        const wobble = Math.sin(i * 1.9) * 0.08;
        const len = rayLen * (0.55 + 0.45 * Math.sin(i * 2.7) * 0.5 + 0.25);
        const w = 1 + (i % 6) * 0.12;
        const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        g.addColorStop(0, `rgba(245,158,11,${rayA * warm})`);
        g.addColorStop(0.35, `rgba(34,211,238,${rayA * 0.7 * cool})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a + wobble) * (sunR * 0.55), Math.sin(a + wobble) * (sunR * 0.55));
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      // Landscape fades into "idea" phase
      drawLandscape(horizonY, 1 - tBulb);

      // Bulb appears (glass + highlights)
      const bulbR = Math.min(width, height) * 0.18;
      if (tBulb > 0.001) {
        ctx.save();
        ctx.globalAlpha = tBulb;
        ctx.globalCompositeOperation = 'lighter';

        // Outer glass highlight
        drawBulb(bulbCx, bulbCy, bulbR);
        const glassStroke = ctx.createLinearGradient(bulbCx - bulbR, bulbCy - bulbR, bulbCx + bulbR, bulbCy + bulbR);
        glassStroke.addColorStop(0, 'rgba(255,255,255,0.08)');
        glassStroke.addColorStop(0.35, 'rgba(255,255,255,0.03)');
        glassStroke.addColorStop(0.65, 'rgba(34,211,238,0.07)');
        glassStroke.addColorStop(1, 'rgba(255,255,255,0.06)');
        ctx.strokeStyle = glassStroke;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Inner rim
        drawBulb(bulbCx, bulbCy, bulbR * 0.92);
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Base / socket
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        const baseY = bulbCy + bulbR * 1.05;
        const baseW = bulbR * 0.48;
        const baseH = bulbR * 0.28;
        roundRectPath(ctx, bulbCx - baseW * 0.5, baseY + bulbR * 0.05, baseW, baseH, 10);
        ctx.fill();
        ctx.stroke();

        // Filament line (sunrise horizon becomes "idea" filament)
        const filamentY = lerp(horizonY, bulbCy + bulbR * 0.15, tBulb);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(34,211,238,${0.10 * tBulb})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(bulbCx - bulbR * 0.28, filamentY);
        ctx.quadraticCurveTo(bulbCx, filamentY - bulbR * 0.06, bulbCx + bulbR * 0.28, filamentY);
        ctx.stroke();

        // Clip sun inside bulb for continuity
        drawBulb(bulbCx, bulbCy, bulbR * 0.98);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const innerGlow = ctx.createRadialGradient(bulbCx, bulbCy, 0, bulbCx, bulbCy, bulbR * 1.6);
        innerGlow.addColorStop(0, `rgba(34,211,238,${0.10 * tBulb})`);
        innerGlow.addColorStop(0.4, `rgba(245,158,11,${0.06 * warm * tBulb})`);
        innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = innerGlow;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      // Vignette for focus
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.4, Math.max(width, height) * 0.9);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Grain
      if (noise.ctx) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.22;
        ctx.drawImage(noise.canvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    const scheduleRender = (force = false) => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(() => {
        scheduled = false;
        const t = computeT();
        if (!force && Math.abs(t - lastT) < 0.001) return;
        lastT = t;
        host.style.setProperty('--hero-film', t.toFixed(4));
        render(t);
      });
    };

    const onScroll = () => scheduleRender(false);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    ro?.observe(host);

    resize();
    scheduleRender(true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      ro?.disconnect();
    };
  }, [canvasRef, hostRef]);
};
