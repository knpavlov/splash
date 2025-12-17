import { RefObject, useEffect } from 'react';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutExpo = (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));
const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

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
    const hostCandidate = hostRef.current ?? canvas?.parentElement;
    const host = hostCandidate instanceof HTMLElement ? hostCandidate : null;
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

    // Scroll hijacking state
    let filmProgress = 0; // 0 to 1
    let targetProgress = 0;
    let isHijacking = true;
    let lastWheelTime = 0;
    const SCROLL_SENSITIVITY = 0.0012; // How much one wheel tick advances the animation
    const SMOOTH_FACTOR = 0.12; // Smoothing for animation interpolation

    const noise = createNoise();

    const resize = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const nextW = canvasRect.width || hostRect.width;
      const nextH = canvasRect.height || hostRect.height;
      width = Math.max(1, Math.floor(nextW));
      height = Math.max(1, Math.floor(nextH));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scheduleRender(true);
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

    const drawFilament = (cx: number, cy: number, r: number, glow: number) => {
      const filH = r * 0.35;
      const filW = r * 0.22;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Main filament coil
      ctx.strokeStyle = `rgba(255, 220, 150, ${0.4 * glow})`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const coils = 5;
      for (let i = 0; i <= coils * 8; i++) {
        const t = i / (coils * 8);
        const x = cx + Math.sin(t * Math.PI * 2 * coils) * filW;
        const y = cy - filH / 2 + t * filH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Inner glow
      const filGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
      filGlow.addColorStop(0, `rgba(255, 230, 180, ${0.35 * glow})`);
      filGlow.addColorStop(0.3, `rgba(255, 200, 100, ${0.15 * glow})`);
      filGlow.addColorStop(1, 'rgba(255, 200, 100, 0)');
      ctx.fillStyle = filGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawLandscape = (horizonY: number, alpha: number, t: number) => {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;

      // Gradient ground
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
      groundGrad.addColorStop(0, 'rgba(10, 15, 30, 0.85)');
      groundGrad.addColorStop(0.3, 'rgba(5, 10, 20, 0.9)');
      groundGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = groundGrad;

      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, horizonY);

      // Animated wave horizon
      const waves = 12;
      for (let i = 0; i <= waves; i += 1) {
        const x = (i / waves) * width;
        const phase = t * Math.PI * 2;
        const a = Math.sin(i * 1.3 + phase * 0.3) * 0.5 + Math.sin(i * 2.2 - phase * 0.2) * 0.5;
        const y = horizonY + a * (height * 0.015) + Math.sin(i * 0.7 + phase * 0.4) * (height * 0.008);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, horizonY);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Horizon glow line
      ctx.strokeStyle = `rgba(255, 180, 100, ${0.15 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);
      ctx.stroke();

      ctx.restore();
    };

    const drawSunRays = (cx: number, cy: number, baseR: number, intensity: number, rotation: number) => {
      if (intensity <= 0) return;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      const rayCount = 24;
      const maxLen = Math.min(width, height) * 0.8;

      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const lenVariation = 0.5 + Math.sin(i * 3.7) * 0.3 + Math.cos(i * 2.3) * 0.2;
        const rayLen = maxLen * lenVariation;
        const rayWidth = 3 + (i % 3) * 2;

        const grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
        grad.addColorStop(0, `rgba(255, 200, 100, ${0.35 * intensity})`);
        grad.addColorStop(0.2, `rgba(255, 150, 50, ${0.2 * intensity})`);
        grad.addColorStop(0.5, `rgba(255, 100, 50, ${0.08 * intensity})`);
        grad.addColorStop(1, 'rgba(255, 100, 50, 0)');

        ctx.strokeStyle = grad;
        ctx.lineWidth = rayWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * baseR, Math.sin(angle) * baseR);
        ctx.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
        ctx.stroke();
      }

      ctx.restore();
    };

    const render = (t: number) => {
      // Apply easing for more dramatic transition
      const tEased = easeInOutCubic(t);

      // Phase breakdowns
      const tSunrise = smoothstep(0, 0.45, t); // Sun rises and brightens
      const tMorph = smoothstep(0.35, 0.85, t); // Sun morphs into bulb
      const tBulb = smoothstep(0.65, 1, t); // Bulb appears fully
      const tTextSwap = smoothstep(0.4, 0.7, t); // Text swap timing

      const warm = 1 - tMorph;
      const cool = tMorph;

      // Background sky with dawn gradient
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      const skyHue = lerp(240, 220, tSunrise);
      const skyLightness = lerp(8, 14, tSunrise * (1 - tBulb * 0.3));
      bg.addColorStop(0, hsl(skyHue, 35, skyLightness * 0.9, 1));
      bg.addColorStop(0.4, hsl(skyHue - 10, 30, skyLightness, 1));
      bg.addColorStop(0.7, hsl(lerp(240, 30, tSunrise * warm), lerp(30, 60, tSunrise * warm), lerp(10, 25, tSunrise * warm), 1));
      bg.addColorStop(1, hsl(220, 40, lerp(6, 8, tEased), 1));

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Horizon position - key element that passes between text lines
      // At t=0, horizon is below center. At t=0.5, horizon is at center (between lines). At t=1, horizon is high.
      const horizonBase = height * 0.68;
      const horizonTarget = height * 0.35;
      const horizonY = lerp(horizonBase, horizonTarget, tEased);

      // Horizon atmospheric glow
      ctx.globalCompositeOperation = 'lighter';
      const horizonGlowHeight = 200 + tSunrise * 100;
      const horizonGlow = ctx.createLinearGradient(0, horizonY - horizonGlowHeight / 2, 0, horizonY + horizonGlowHeight / 2);
      horizonGlow.addColorStop(0, 'rgba(0,0,0,0)');
      horizonGlow.addColorStop(0.3, `rgba(255, 150, 80, ${0.2 * warm * tSunrise})`);
      horizonGlow.addColorStop(0.5, `rgba(255, 200, 150, ${0.25 * tSunrise * warm})`);
      horizonGlow.addColorStop(0.7, `rgba(34, 211, 238, ${0.12 * cool})`);
      horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, horizonY - horizonGlowHeight / 2, width, horizonGlowHeight);
      ctx.globalCompositeOperation = 'source-over';

      // Stars fade out with sunrise
      const starAlpha = (1 - tSunrise) * 0.35;
      if (starAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = starAlpha;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        for (let i = 0; i < 60; i += 1) {
          const x = ((i * 97 + 13) % 251) / 251;
          const y = ((i * 57 + 29) % 197) / 197;
          const sx = x * width;
          const sy = y * height * 0.55;
          const twinkle = 0.5 + Math.sin(t * Math.PI * 4 + i) * 0.5;
          const r = (0.5 + ((i * 13) % 5) * 0.2) * twinkle;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Sun/light source positioning
      const sunX = width * 0.5;
      const sunStartY = horizonBase + 60; // Start below horizon
      const sunPeakY = horizonY - 80; // Rise above horizon
      const bulbCenterY = height * 0.44;

      // Sun rises, then transforms position toward bulb center
      const sunRiseY = lerp(sunStartY, sunPeakY, easeOutExpo(tSunrise));
      const sunFinalY = lerp(sunRiseY, bulbCenterY, smoothstep(0.5, 0.9, t));

      const sunR = lerp(Math.min(width, height) * 0.12, Math.min(width, height) * 0.09, tMorph);
      const bulbR = Math.min(width, height) * 0.16;

      // Sun rays - fade with morph
      const rayIntensity = tSunrise * (1 - tMorph);
      const rayRotation = t * 0.3;
      drawSunRays(sunX, sunFinalY, sunR * 1.2, rayIntensity, rayRotation);

      // Main sun/light glow
      ctx.globalCompositeOperation = 'lighter';
      const glowR = lerp(sunR * 4, bulbR * 3, tMorph);
      const sunGlow = ctx.createRadialGradient(sunX, sunFinalY, 0, sunX, sunFinalY, glowR);
      const glowIntensity = 0.3 + tSunrise * 0.2;
      sunGlow.addColorStop(0, `rgba(255,255,255,${glowIntensity})`);
      sunGlow.addColorStop(0.15, `rgba(255,220,150,${0.35 * warm * tSunrise})`);
      sunGlow.addColorStop(0.3, `rgba(255,150,80,${0.2 * warm * tSunrise})`);
      sunGlow.addColorStop(0.5, `rgba(34,211,238,${0.15 * cool})`);
      sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunFinalY, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Sun disk - shrinks and cools during morph
      const diskR = lerp(sunR, sunR * 0.6, tMorph);
      const sunDisk = ctx.createRadialGradient(sunX, sunFinalY, 0, sunX, sunFinalY, diskR);
      sunDisk.addColorStop(0, `rgba(255,255,255,${0.9 * tSunrise})`);
      sunDisk.addColorStop(0.4, `rgba(255,220,150,${0.7 * warm * tSunrise + 0.2 * cool})`);
      sunDisk.addColorStop(0.7, `rgba(255,150,80,${0.4 * warm})`);
      sunDisk.addColorStop(1, `rgba(34,211,238,${0.3 * cool})`);
      ctx.fillStyle = sunDisk;
      ctx.beginPath();
      ctx.arc(sunX, sunFinalY, diskR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Landscape/ground
      drawLandscape(horizonY, 1 - tBulb, t);

      // Light bulb appears
      if (tMorph > 0.1) {
        const bulbAlpha = smoothstep(0.1, 0.6, tMorph);
        const bulbCx = width * 0.5;
        const bulbCy = bulbCenterY;

        ctx.save();
        ctx.globalAlpha = bulbAlpha;

        // Bulb outer glow
        ctx.globalCompositeOperation = 'lighter';
        const outerGlow = ctx.createRadialGradient(bulbCx, bulbCy, bulbR * 0.3, bulbCx, bulbCy, bulbR * 2.5);
        outerGlow.addColorStop(0, `rgba(255, 240, 200, ${0.15 * tBulb})`);
        outerGlow.addColorStop(0.3, `rgba(34, 211, 238, ${0.08 * tBulb})`);
        outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(bulbCx, bulbCy, bulbR * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Glass bulb outline
        ctx.globalCompositeOperation = 'source-over';
        drawBulb(bulbCx, bulbCy, bulbR);

        // Glass gradient fill (very subtle)
        const glassFill = ctx.createRadialGradient(bulbCx - bulbR * 0.3, bulbCy - bulbR * 0.3, 0, bulbCx, bulbCy, bulbR);
        glassFill.addColorStop(0, 'rgba(255,255,255,0.06)');
        glassFill.addColorStop(0.5, 'rgba(255,255,255,0.02)');
        glassFill.addColorStop(1, 'rgba(255,255,255,0.01)');
        ctx.fillStyle = glassFill;
        ctx.fill();

        // Glass stroke
        const glassStroke = ctx.createLinearGradient(bulbCx - bulbR, bulbCy - bulbR, bulbCx + bulbR, bulbCy + bulbR);
        glassStroke.addColorStop(0, 'rgba(255,255,255,0.25)');
        glassStroke.addColorStop(0.3, 'rgba(255,255,255,0.08)');
        glassStroke.addColorStop(0.7, 'rgba(34,211,238,0.15)');
        glassStroke.addColorStop(1, 'rgba(255,255,255,0.12)');
        ctx.strokeStyle = glassStroke;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Highlight reflection
        ctx.beginPath();
        ctx.ellipse(bulbCx - bulbR * 0.35, bulbCy - bulbR * 0.4, bulbR * 0.15, bulbR * 0.25, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();

        // Base/socket
        ctx.fillStyle = 'rgba(80, 80, 90, 0.8)';
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        const baseY = bulbCy + bulbR * 1.02;
        const baseW = bulbR * 0.5;
        const baseH = bulbR * 0.32;
        roundRectPath(ctx, bulbCx - baseW * 0.5, baseY, baseW, baseH, 6);
        ctx.fill();
        ctx.stroke();

        // Socket ridges
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          const y = baseY + (i / 4) * baseH;
          ctx.beginPath();
          ctx.moveTo(bulbCx - baseW * 0.45, y);
          ctx.lineTo(bulbCx + baseW * 0.45, y);
          ctx.stroke();
        }

        // Filament inside bulb
        if (tBulb > 0.2) {
          const filamentGlow = smoothstep(0.2, 0.8, tBulb);
          drawFilament(bulbCx, bulbCy - bulbR * 0.1, bulbR, filamentGlow);
        }

        ctx.restore();
      }

      // Vignette
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.45, Math.max(width, height) * 0.85);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.7, 'rgba(0,0,0,0.2)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Film grain
      if (noise.ctx) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.18;
        ctx.drawImage(noise.canvas, 0, 0, width, height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      // Update CSS variable for text swap
      host.style.setProperty('--hero-film', tTextSwap.toFixed(4));
    };

    const scheduleRender = (force = false) => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(() => {
        scheduled = false;

        // Smooth interpolation toward target
        filmProgress = lerp(filmProgress, targetProgress, SMOOTH_FACTOR);

        // Clamp and snap to boundaries
        if (filmProgress < 0.001) filmProgress = 0;
        if (filmProgress > 0.999) filmProgress = 1;

        const t = prefersReducedMotion ? 0 : filmProgress;
        if (!force && Math.abs(t - lastT) < 0.0005) {
          // Continue animating if not at target
          if (Math.abs(filmProgress - targetProgress) > 0.001) {
            scheduleRender(false);
          }
          return;
        }
        lastT = t;
        render(t);

        // Continue animating toward target
        if (Math.abs(filmProgress - targetProgress) > 0.001) {
          scheduleRender(false);
        }
      });
    };

    const checkHijackingState = () => {
      const rect = host.getBoundingClientRect();
      const heroInView = rect.top >= -10 && rect.top <= 10;

      // Re-engage hijacking if we're back at the hero and animation isn't complete
      if (heroInView && targetProgress < 1) {
        isHijacking = true;
      }
      // Release hijacking if animation complete and we've scrolled away
      else if (targetProgress >= 1 && rect.top < -50) {
        isHijacking = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      const rect = host.getBoundingClientRect();
      const heroTop = rect.top;

      // Only hijack when hero is at/near top of viewport
      if (!isHijacking || heroTop < -100) {
        return;
      }

      const delta = e.deltaY;
      lastWheelTime = performance.now();

      // Scrolling down (positive delta) - advance animation
      if (delta > 0) {
        if (targetProgress < 1) {
          e.preventDefault();
          targetProgress = clamp(targetProgress + delta * SCROLL_SENSITIVITY, 0, 1);
          scheduleRender(false);
        } else {
          // Animation complete, release control
          isHijacking = false;
        }
      }
      // Scrolling up (negative delta) - reverse animation or allow page scroll
      else if (delta < 0) {
        if (targetProgress > 0 && heroTop >= -10) {
          e.preventDefault();
          targetProgress = clamp(targetProgress + delta * SCROLL_SENSITIVITY, 0, 1);
          scheduleRender(false);
        }
      }
    };

    const onScroll = () => {
      checkHijackingState();

      // If scrolled back to top and animation was complete, re-enable hijacking
      const rect = host.getBoundingClientRect();
      if (rect.top >= 0 && targetProgress >= 1) {
        // User scrolled back to top - could optionally reset animation
        // For now, keep it completed
      }
    };

    // Use capture to ensure we get the event first
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    ro?.observe(host);

    resize();
    scheduleRender(true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      ro?.disconnect();
    };
  }, [canvasRef, hostRef]);
};
