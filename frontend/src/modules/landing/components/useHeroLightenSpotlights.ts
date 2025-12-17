import { RefObject, useEffect } from 'react';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

type Vec2 = { x: number; y: number };

type Noise = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null };
type Poly = { points: Vec2[]; weight: number };

const createNoise = (): Noise => {
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 220;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, ctx: null };
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.floor(Math.random() * 55);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(Math.random() * 16);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, ctx };
};

const createGobo = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Diagonal stripe cutouts + small circular cutouts, monochrome.
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  const stripeW = 14;
  const gap = 18;
  for (let x = -canvas.width; x < canvas.width * 2; x += stripeW + gap) {
    ctx.fillRect(x, -canvas.height, stripeW, canvas.height * 3);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  const dots = 22;
  for (let i = 0; i < dots; i += 1) {
    const px = (i / (dots - 1)) * canvas.width;
    const py = canvas.height * (0.18 + 0.72 * ((i * 37) % dots) / dots);
    const r = 3.2 + ((i * 17) % 7) * 0.55;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
};

const rotate2 = (p: Vec2, a: number): Vec2 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const rectPoly = (center: Vec2, a: number, length: number, thickness: number): Vec2[] => {
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const n = { x: -dir.y, y: dir.x };
  const hl = length / 2;
  const ht = thickness / 2;
  return [
    { x: center.x - dir.x * hl - n.x * ht, y: center.y - dir.y * hl - n.y * ht },
    { x: center.x + dir.x * hl - n.x * ht, y: center.y + dir.y * hl - n.y * ht },
    { x: center.x + dir.x * hl + n.x * ht, y: center.y + dir.y * hl + n.y * ht },
    { x: center.x - dir.x * hl + n.x * ht, y: center.y - dir.y * hl + n.y * ht }
  ];
};

const centroid = (pts: Vec2[]) => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

const conePath = (origin: Vec2, target: Vec2, spread: number, far: number): Vec2[] => {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy;
  const py = ux;

  const farPoint = { x: origin.x + ux * far, y: origin.y + uy * far };
  const w = Math.tan(spread) * far;
  return [
    origin,
    { x: farPoint.x + px * w, y: farPoint.y + py * w },
    { x: farPoint.x - px * w, y: farPoint.y - py * w }
  ];
};

export const useHeroLightenSpotlights = (canvasRef: RefObject<HTMLCanvasElement>, hostRef: RefObject<HTMLElement>) => {
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
    let running = false;
    let visible = true;
    let lastFrameMs = 0;

    const noise = createNoise();
    const goboCanvas = createGobo();
    const goboCtx = goboCanvas.getContext('2d');
    const goboPattern = goboCtx ? ctx.createPattern(goboCanvas, 'repeat') : null;

    const pointer = {
      x: 0.5,
      y: 0.48,
      tx: 0.5,
      ty: 0.48,
      active: false
    };

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
    };

    const setPointerFromEvent = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      pointer.tx = nx;
      pointer.ty = ny;
      pointer.active = true;
    };

    const onPointerMove = (e: PointerEvent) => setPointerFromEvent(e);
    const onPointerEnter = (e: PointerEvent) => setPointerFromEvent(e);
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.tx = 0.5;
      pointer.ty = 0.48;
    };

    const drawPoly = (pts: Vec2[]) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    };

    const drawShadow = (origin: Vec2, poly: Poly, strength: number) => {
      const pts = poly.points;
      const ext: Vec2[] = [];
      const shadowScale = 2.6;
      for (const p of pts) {
        ext.push({ x: p.x + (p.x - origin.x) * shadowScale, y: p.y + (p.y - origin.y) * shadowScale });
      }

      const c0 = centroid(pts);
      const c1 = centroid(ext);
      const grad = ctx.createLinearGradient(c0.x, c0.y, c1.x, c1.y);
      grad.addColorStop(0, `rgba(0,0,0,${0.36 * strength})`);
      grad.addColorStop(0.35, `rgba(0,0,0,${0.22 * strength})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ext[0].x, ext[0].y);
      for (let i = 1; i < ext.length; i += 1) ctx.lineTo(ext[i].x, ext[i].y);
      for (let i = pts.length - 1; i >= 0; i -= 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    };

    const drawSpotlight = (
      origin: Vec2,
      target: Vec2,
      spread: number,
      intensity: number,
      tint: { r: number; g: number; b: number },
      phase: number
    ) => {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const far = Math.min(Math.max(width, height) * 1.05, d * 1.85);

      const cone = conePath(origin, target, spread, far);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      drawPoly(cone);
      ctx.clip();

      // Soft cone energy
      const core = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, far);
      core.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${0.22 * intensity})`);
      core.addColorStop(0.55, `rgba(${tint.r},${tint.g},${tint.b},${0.09 * intensity})`);
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, width, height);

      // Hot spot near the aim point (like a projector focus)
      const focus = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, Math.max(180, Math.min(width, height) * 0.34));
      focus.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${0.22 * intensity})`);
      focus.addColorStop(0.4, `rgba(${tint.r},${tint.g},${tint.b},${0.07 * intensity})`);
      focus.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = focus;
      ctx.fillRect(0, 0, width, height);

      // Gobo pattern (projector cutout) for shadow-play.
      if (goboPattern) {
        ctx.save();
        ctx.globalAlpha = 0.15 * intensity;
        ctx.translate(
          -(((origin.x * 0.12 + phase * 18) % goboCanvas.width) + goboCanvas.width),
          -(((origin.y * 0.18 + phase * 12) % goboCanvas.height) + goboCanvas.height)
        );
        ctx.fillStyle = goboPattern;
        ctx.fillRect(-goboCanvas.width, -goboCanvas.height, width + goboCanvas.width * 2, height + goboCanvas.height * 2);
        ctx.restore();
      }

      ctx.restore();

      // Projector head glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const head = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 90);
      head.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${0.25 * intensity})`);
      head.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const render = (timeSec: number) => {
      const t = prefersReducedMotion ? 0 : timeSec;

      // Pointer smoothing (gentle, to feel premium)
      const relax = pointer.active ? 0.085 : 0.06;
      pointer.x = lerp(pointer.x, pointer.tx, relax);
      pointer.y = lerp(pointer.y, pointer.ty, relax);

      const minDim = Math.min(width, height);
      const center: Vec2 = {
        x: width * (0.5 + (pointer.x - 0.5) * 0.06),
        y: height * (0.46 + (pointer.y - 0.5) * 0.055)
      };

      // Background base
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(center.x, center.y - height * 0.22, 0, center.x, center.y, Math.max(width, height) * 0.95);
      bg.addColorStop(0, 'rgba(7, 12, 28, 1)');
      bg.addColorStop(0.55, 'rgba(3, 7, 18, 1)');
      bg.addColorStop(1, 'rgba(2, 6, 18, 1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Monochrome tunnel geometry (folded planes)
      const depth = 2.35;
      const layers = 26;
      const scale = minDim * 0.66;
      const persp = 1.55;

      const faces: { points: Vec2[]; z: number; shade: number }[] = [];
      const baseSize = 0.96;
      const twist = t * 0.34 + (pointer.x - 0.5) * 0.55;

      const project = (p: { x: number; y: number; z: number }): Vec2 => {
        const denom = 1 + p.z * persp;
        return { x: center.x + (p.x / denom) * scale, y: center.y + (p.y / denom) * scale };
      };

      for (let i = 0; i < layers; i += 1) {
        const z0 = (i / layers) * depth;
        const z1 = ((i + 1) / layers) * depth;
        const a0 = twist + z0 * 1.22;
        const a1 = twist + z1 * 1.22;
        const s0 = baseSize * (1.02 + 0.06 * Math.sin(z0 * 2.2 - t * 0.3));
        const s1 = baseSize * (1.02 + 0.06 * Math.sin(z1 * 2.2 - t * 0.3));

        const corners0 = [
          rotate2({ x: -s0, y: -s0 }, a0),
          rotate2({ x: s0, y: -s0 }, a0),
          rotate2({ x: s0, y: s0 }, a0),
          rotate2({ x: -s0, y: s0 }, a0)
        ];
        const corners1 = [
          rotate2({ x: -s1, y: -s1 }, a1),
          rotate2({ x: s1, y: -s1 }, a1),
          rotate2({ x: s1, y: s1 }, a1),
          rotate2({ x: -s1, y: s1 }, a1)
        ];

        for (let k = 0; k < 4; k += 1) {
          const k2 = (k + 1) % 4;
          const pts = [
            project({ x: corners0[k].x, y: corners0[k].y, z: z0 }),
            project({ x: corners0[k2].x, y: corners0[k2].y, z: z0 }),
            project({ x: corners1[k2].x, y: corners1[k2].y, z: z1 }),
            project({ x: corners1[k].x, y: corners1[k].y, z: z1 })
          ];

          const wallPhase = a0 + k * (Math.PI / 2);
          const baseShade = 0.38 + 0.3 * Math.cos(wallPhase + 0.7);
          const depthFade = 1 - smoothstep(0.0, depth * 0.95, z0);
          faces.push({ points: pts, z: z0, shade: clamp(baseShade * 0.7 + depthFade * 0.35, 0, 1) });
        }
      }

      faces.sort((a, b) => b.z - a.z);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      for (const f of faces) {
        const c = centroid(f.points);
        const dir = { x: c.x - center.x, y: c.y - center.y };
        const dn = Math.max(1, Math.hypot(dir.x, dir.y));
        dir.x /= dn;
        dir.y /= dn;

        const l0 = 7 + f.shade * 7;
        const l1 = 9 + f.shade * 10;
        const grad = ctx.createLinearGradient(c.x - dir.x * 180, c.y - dir.y * 180, c.x + dir.x * 220, c.y + dir.y * 220);
        grad.addColorStop(0, `hsla(220, 18%, ${l1}%, 1)`);
        grad.addColorStop(1, `hsla(220, 18%, ${l0}%, 1)`);

        drawPoly(f.points);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Structural lines (subtle)
      ctx.globalCompositeOperation = 'overlay';
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      const ringCount = 11;
      for (let i = 0; i < ringCount; i += 1) {
        const z = (i / ringCount) * depth;
        const a = twist + z * 1.22;
        const s = baseSize * (1.01 + 0.06 * Math.sin(z * 2.2 - t * 0.3));
        const corners = [
          rotate2({ x: -s, y: -s }, a),
          rotate2({ x: s, y: -s }, a),
          rotate2({ x: s, y: s }, a),
          rotate2({ x: -s, y: s }, a)
        ].map((p) => project({ x: p.x, y: p.y, z }));
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let j = 1; j < corners.length; j += 1) ctx.lineTo(corners[j].x, corners[j].y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // Occluder slats (also used for shadows)
      const occluders: Poly[] = [];
      const barCount = 6;
      for (let i = 0; i < barCount; i += 1) {
        const phase = t * 0.42 + i * 0.93;
        const ang = phase + Math.sin(phase * 0.9) * 0.22;
        const r = minDim * (0.06 + i * 0.028);
        const p: Vec2 = {
          x: center.x + Math.cos(ang) * r,
          y: center.y + Math.sin(ang) * r * 0.66
        };
        const pts = rectPoly(p, ang + Math.PI * 0.55, minDim * (0.18 + i * 0.014), minDim * 0.014);
        occluders.push({ points: pts, weight: 0.85 - i * 0.08 });
      }

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(2, 6, 18, 0.58)';
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (const o of occluders) {
        drawPoly(o.points);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Spotlights (projectors)
      const lightTargetBase: Vec2 = {
        x: center.x + (pointer.x - 0.5) * minDim * 0.08,
        y: center.y + minDim * 0.12 + (pointer.y - 0.5) * minDim * 0.06
      };

      const lights = [
        {
          origin: {
            x: width * (0.11 + 0.02 * Math.sin(t * 0.7)),
            y: height * (0.065 + 0.02 * Math.cos(t * 0.55))
          },
          target: {
            x: lightTargetBase.x - minDim * 0.12,
            y: lightTargetBase.y + minDim * 0.02
          },
          spread: 0.18,
          intensity: 0.95,
          tint: { r: 230, g: 252, b: 255 }
        },
        {
          origin: {
            x: width * (0.89 + 0.02 * Math.cos(t * 0.62)),
            y: height * (0.07 + 0.018 * Math.sin(t * 0.6))
          },
          target: {
            x: lightTargetBase.x + minDim * 0.12,
            y: lightTargetBase.y
          },
          spread: 0.19,
          intensity: 0.82,
          tint: { r: 245, g: 236, b: 255 }
        },
        {
          origin: {
            x: width * (0.5 + (pointer.x - 0.5) * 0.12),
            y: height * 0.045
          },
          target: {
            x: lightTargetBase.x,
            y: lightTargetBase.y - minDim * 0.04
          },
          spread: 0.14,
          intensity: 0.75,
          tint: { r: 255, g: 255, b: 255 }
        }
      ];

      // Shadows (multiply to carve patterns into the light)
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (const l of lights) {
        for (const o of occluders) {
          drawShadow(l.origin, o, l.intensity * o.weight);
        }
      }
      ctx.restore();

      // Light cones
      for (const l of lights) {
        drawSpotlight(l.origin, l.target, l.spread, l.intensity, l.tint, t);
      }

      // Vignette + grain (keeps it cinematic but minimal)
      const vignette = ctx.createRadialGradient(center.x, center.y - height * 0.1, 0, center.x, center.y, Math.max(width, height) * 0.88);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.72, 'rgba(0,0,0,0.16)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      if (noise.ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.16;
        ctx.drawImage(noise.canvas, 0, 0, width, height);
        ctx.restore();
      }
    };

    const tick = (ms: number) => {
      if (!running) return;
      if (ms - lastFrameMs < 1000 / 48) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastFrameMs = ms;
      const sec = ms / 1000;
      render(sec);
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || prefersReducedMotion || !visible) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              visible = entries.some((e) => e.isIntersecting);
              if (!visible) stop();
              else start();
            },
            { threshold: 0.05 }
          )
        : null;

    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    ro?.observe(host);
    io?.observe(host);

    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerenter', onPointerEnter, { passive: true });
    host.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('resize', resize);

    resize();
    render(performance.now() / 1000);
    if (!prefersReducedMotion) start();

    return () => {
      stop();
      ro?.disconnect();
      io?.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerenter', onPointerEnter);
      host.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef, hostRef]);
};
