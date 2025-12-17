import { RefObject, useEffect } from 'react';

type HeroPointer = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  down: boolean;
};

type Vec3 = { x: number; y: number; z: number };
type Vec2 = { x: number; y: number };

type Face = [number, number, number];

type Mesh = {
  vertices: Vec3[];
  faces: Face[];
};

type Instance = {
  mesh: Mesh;
  position: Vec3;
  rotation: Vec3;
  rotationSpeed: Vec3;
  scale: Vec3;
  isAccent?: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
const len3 = (a: Vec3) => Math.sqrt(dot3(a, a));
const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a);
  if (!l) return { x: 0, y: 0, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

const rotX = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
};

const rotY = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
};

const rotZ = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
};

const transformPoint = (p: Vec3, instance: Instance): Vec3 => {
  const scaled = { x: p.x * instance.scale.x, y: p.y * instance.scale.y, z: p.z * instance.scale.z };
  const r1 = rotX(scaled, instance.rotation.x);
  const r2 = rotY(r1, instance.rotation.y);
  const r3 = rotZ(r2, instance.rotation.z);
  return add3(r3, instance.position);
};

const createBox = (w: number, h: number, d: number): Mesh => {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const vertices: Vec3[] = [
    v3(-x, -y, -z),
    v3(x, -y, -z),
    v3(x, y, -z),
    v3(-x, y, -z),
    v3(-x, -y, z),
    v3(x, -y, z),
    v3(x, y, z),
    v3(-x, y, z)
  ];

  const faces: Face[] = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 6, 5],
    [4, 7, 6],
    [0, 4, 5],
    [0, 5, 1],
    [1, 5, 6],
    [1, 6, 2],
    [2, 6, 7],
    [2, 7, 3],
    [3, 7, 4],
    [3, 4, 0]
  ];

  return { vertices, faces };
};

const createOctahedron = (r: number): Mesh => {
  const vertices: Vec3[] = [v3(0, r, 0), v3(r, 0, 0), v3(0, 0, r), v3(-r, 0, 0), v3(0, 0, -r), v3(0, -r, 0)];
  const faces: Face[] = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [5, 2, 1],
    [5, 3, 2],
    [5, 4, 3],
    [5, 1, 4]
  ];
  return { vertices, faces };
};

const convexHull = (points: Vec2[]) => {
  if (points.length <= 3) return points;
  const pts = points
    .map((p) => ({ x: p.x, y: p.y }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }

  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
};

export const useHeroLight3D = (
  canvasRef: RefObject<HTMLCanvasElement>,
  hostRef: RefObject<HTMLElement>,
  pointerRef: RefObject<HeroPointer>
) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const pointer = pointerRef.current;
    if (!pointer) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let rect = canvas.getBoundingClientRect();
    let animationId = 0;
    let lastFrame = performance.now();
    let pulseStartedAt = 0;

    const noise = document.createElement('canvas');
    noise.width = 160;
    noise.height = 160;
    const nctx = noise.getContext('2d');
    if (nctx) {
      const img = nctx.createImageData(noise.width, noise.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 210 + Math.floor(Math.random() * 45);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = Math.floor(Math.random() * 18);
      }
      nctx.putImageData(img, 0, 0);
    }

    const scene: { instances: Instance[] } = { instances: [] };

    const buildScene = () => {
      const baseBox = createBox(1, 1, 1);
      const tall = { ...baseBox };
      const foot = { ...baseBox };
      const plate = createBox(2.5, 0.12, 1.7);
      const oct = createOctahedron(0.62);

      scene.instances = [
        // "L" monolith assembled from two boxes
        {
          mesh: tall,
          position: v3(-0.5, -0.05, 0),
          rotation: v3(0.1, -0.25, 0.02),
          rotationSpeed: v3(0.0007, 0.0011, 0.0004),
          scale: v3(0.44, 1.35, 0.44),
          isAccent: true
        },
        {
          mesh: foot,
          position: v3(0.05, -0.72, 0),
          rotation: v3(0.1, -0.25, 0.02),
          rotationSpeed: v3(0.0007, 0.0011, 0.0004),
          scale: v3(1.2, 0.34, 0.44),
          isAccent: true
        },
        // Secondary geometry
        {
          mesh: oct,
          position: v3(1.15, 0.05, -0.6),
          rotation: v3(0.2, 0.55, 0.1),
          rotationSpeed: v3(0.0011, -0.0014, 0.0008),
          scale: v3(0.75, 0.75, 0.75)
        },
        {
          mesh: plate,
          position: v3(-1.05, 0.35, -1.0),
          rotation: v3(-0.25, -0.35, 0.0),
          rotationSpeed: v3(0.0005, 0.0009, 0.0002),
          scale: v3(0.75, 0.75, 0.75)
        },
        {
          mesh: baseBox,
          position: v3(0.95, -0.2, 0.9),
          rotation: v3(0.2, 0.35, 0.85),
          rotationSpeed: v3(-0.00055, 0.00095, -0.00035),
          scale: v3(0.26, 1.05, 0.26)
        },
        {
          mesh: baseBox,
          position: v3(-1.25, -0.15, 0.85),
          rotation: v3(0.75, -0.25, 0.18),
          rotationSpeed: v3(0.00065, -0.0008, 0.00028),
          scale: v3(1.15, 0.12, 0.55)
        }
      ];
    };

    const resize = () => {
      rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildScene();
    };

    const host = hostRef.current ?? canvas;

    const updatePointer = (event: PointerEvent) => {
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointer.targetX = clamp(x, 0, width);
      pointer.targetY = clamp(y, 0, height);
      pointer.active = true;
    };

    const onMove = (e: PointerEvent) => updatePointer(e);
    const onEnter = (e: PointerEvent) => updatePointer(e);
    const onLeave = () => {
      pointer.active = false;
      pointer.down = false;
    };
    const onDown = (e: PointerEvent) => {
      updatePointer(e);
      pointer.down = true;
      pulseStartedAt = performance.now();
    };
    const onUp = () => {
      pointer.down = false;
    };

    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerenter', onEnter, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });
    host.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });

    resize();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', resize);

    // Smooth pointer for nicer light movement
    let px = width * 0.58;
    let py = height * 0.38;
    pointer.x = px;
    pointer.y = py;
    pointer.targetX = px;
    pointer.targetY = py;

    const project = (p: Vec3, camYaw: number, camPitch: number) => {
      const camPos = v3(0, 0.25, 4.2);
      let rel = sub3(p, camPos);
      rel = rotY(rel, camYaw);
      rel = rotX(rel, camPitch);
      const z = -rel.z;
      const f = 1.18;
      const s = f / (f + z);
      const cx = width * 0.5;
      const cy = height * 0.54;
      const scale = s * width * 0.34;
      return { x: cx + rel.x * scale, y: cy - rel.y * scale, z };
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(48, now - lastFrame);
      lastFrame = now;

      const pulseAge = pulseStartedAt ? (now - pulseStartedAt) / 650 : 2;
      const pulse = clamp(1 - pulseAge, 0, 1);
      if (pulseStartedAt && pulseAge > 1.2) pulseStartedAt = 0;

      if (!pointer.active) {
        pointer.targetX = width * 0.58 + Math.sin(now * 0.00022) * width * 0.12;
        pointer.targetY = height * 0.38 + Math.cos(now * 0.00019) * height * 0.10;
      }

      px = lerp(px, pointer.targetX, 0.11);
      py = lerp(py, pointer.targetY, 0.11);
      pointer.x = px;
      pointer.y = py;

      const nx = (px / width - 0.5) * 2;
      const ny = (py / height - 0.5) * 2;

      const camYaw = -nx * 0.18;
      const camPitch = ny * 0.10;

      const lightPos = v3(nx * 2.1, 1.45 + -ny * 0.65, 2.1);

      // Background
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#040713');
      bg.addColorStop(0.55, '#030712');
      bg.addColorStop(1, '#020412');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Subtle vignette
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.38, 0, width * 0.5, height * 0.38, Math.max(width, height) * 0.8);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // Ground glow / bounce
      ctx.globalCompositeOperation = 'lighter';
      const bounce = ctx.createRadialGradient(width * 0.52, height * 0.82, 0, width * 0.52, height * 0.82, Math.min(width, height) * 0.55);
      bounce.addColorStop(0, 'rgba(255,255,255,0.04)');
      bounce.addColorStop(0.6, 'rgba(255,255,255,0.02)');
      bounce.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bounce;
      ctx.fillRect(0, 0, width, height);

      // Light source glint (subtle cyan accent)
      const light2D = project(lightPos, camYaw, camPitch);
      const lightGlow = ctx.createRadialGradient(light2D.x, light2D.y, 0, light2D.x, light2D.y, 240);
      const glowA = (pointer.down ? 0.22 : 0.14) + pulse * 0.12;
      lightGlow.addColorStop(0, `rgba(34,211,238,${glowA})`);
      lightGlow.addColorStop(0.35, `rgba(34,211,238,${glowA * 0.38})`);
      lightGlow.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = lightGlow;
      ctx.beginPath();
      ctx.arc(light2D.x, light2D.y, 240, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Flash wash on pulse
      if (pulse > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const wash = ctx.createRadialGradient(width * 0.52, height * 0.42, 0, width * 0.52, height * 0.42, Math.max(width, height) * 0.7);
        wash.addColorStop(0, `rgba(255,255,255,${pulse * 0.04})`);
        wash.addColorStop(0.45, `rgba(34,211,238,${pulse * 0.05})`);
        wash.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Shadow blobs on ground (plane y = -1.08)
      const groundY = -1.08;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'blur(16px)';
      ctx.fillStyle = `rgba(0,0,0,${0.30 - pulse * 0.06})`;

      for (const inst of scene.instances) {
        const pts: Vec2[] = [];
        for (const v of inst.mesh.vertices) {
          const wv = transformPoint(v, inst);
          const denom = wv.y - lightPos.y;
          if (Math.abs(denom) < 1e-4) continue;
          const k = (groundY - lightPos.y) / denom;
          const sv = add3(lightPos, mul3(sub3(wv, lightPos), k));
          const sp = project(sv, camYaw, camPitch);
          if (sp.z <= 0.1) continue;
          pts.push({ x: sp.x, y: sp.y });
        }
        if (pts.length < 3) continue;
        const hull = convexHull(pts);
        if (hull.length < 3) continue;
        ctx.beginPath();
        hull.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      // Render faces (painter's algorithm)
      const facesToDraw: {
        p: Vec3[];
        s: Vec2[];
        depth: number;
        shade: number;
        rim: number;
        spec: number;
        accent: boolean;
      }[] = [];

      const camPos = v3(0, 0.25, 4.2);
      const lightIntensity = (pointer.down ? 1.2 : 1.0) + pulse * 0.75;

      for (const inst of scene.instances) {
        // update rotation
        inst.rotation = add3(inst.rotation, mul3(inst.rotationSpeed, dt));

        const worldVerts = inst.mesh.vertices.map((v) => transformPoint(v, inst));
        for (const face of inst.mesh.faces) {
          const a = worldVerts[face[0]];
          const b = worldVerts[face[1]];
          const c = worldVerts[face[2]];
          const ab = sub3(b, a);
          const ac = sub3(c, a);
          let n = cross3(ab, ac);
          n = norm3(n);

          const center = mul3(add3(add3(a, b), c), 1 / 3);
          const toLight = norm3(sub3(lightPos, center));
          const toView = norm3(sub3(camPos, center));

          const diff = Math.max(0, dot3(n, toLight)) * lightIntensity;
          const rim = Math.pow(1 - Math.max(0, dot3(n, toView)), 2.2);
          const halfV = norm3(add3(toLight, toView));
          const spec = Math.pow(Math.max(0, dot3(n, halfV)), 40) * (inst.isAccent ? 1.2 : 0.85);

          const pa = project(a, camYaw, camPitch);
          const pb = project(b, camYaw, camPitch);
          const pc = project(c, camYaw, camPitch);
          if (pa.z <= 0.1 || pb.z <= 0.1 || pc.z <= 0.1) continue;

          const depth = (pa.z + pb.z + pc.z) / 3;
          facesToDraw.push({
            p: [a, b, c],
            s: [
              { x: pa.x, y: pa.y },
              { x: pb.x, y: pb.y },
              { x: pc.x, y: pc.y }
            ],
            depth,
            shade: diff,
            rim,
            spec,
            accent: Boolean(inst.isAccent)
          });
        }
      }

      facesToDraw.sort((l, r) => r.depth - l.depth);

      for (const face of facesToDraw) {
        const baseL = 9 + face.shade * 18 + face.rim * 8;
        const lightness = clamp(baseL, 7, 34);
        ctx.beginPath();
        ctx.moveTo(face.s[0].x, face.s[0].y);
        ctx.lineTo(face.s[1].x, face.s[1].y);
        ctx.lineTo(face.s[2].x, face.s[2].y);
        ctx.closePath();

        ctx.fillStyle = `hsl(220 12% ${lightness}%)`;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (face.spec > 0.02 || face.rim > 0.25) {
          ctx.globalCompositeOperation = 'lighter';
          const a = clamp(face.spec * 0.22 + face.rim * 0.06 + pulse * 0.05, 0, face.accent ? 0.22 : 0.14);
          ctx.fillStyle = `rgba(34,211,238,${a})`;
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      // Texture overlay
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.22;
      ctx.drawImage(noise, 0, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    if (prefersReducedMotion) {
      renderFrame(performance.now());
      return () => {
        cancelAnimationFrame(animationId);
        ro?.disconnect();
        window.removeEventListener('resize', resize);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerenter', onEnter);
        host.removeEventListener('pointerleave', onLeave);
        host.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }

    const loop = (now: number) => {
      renderFrame(now);
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [canvasRef, hostRef, pointerRef]);
};
