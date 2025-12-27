import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import styles from './LaikaProLandingPage.module.css';
import { Check, ArrowRight, ArrowLeft, ChevronDown, Mail, Shield, Clock, Users, BarChart3, Calendar, X } from 'lucide-react';
import { InteractivePlanDemo, DemoTask, INITIAL_TASKS } from './components/InteractivePlanDemo';
import { CapacityHeatmapDemo } from './components/CapacityHeatmapDemo';
import { StageGateDemo } from './components/StageGateDemo';
import { ReportingDemo, DemoView, VIEW_OPTIONS } from './components/ReportingDemo';
import { ImplementationMonitoringDemo } from './components/ImplementationMonitoringDemo';
// Alternative hero (spotlights + mono geometry) kept for easy rollback:
// import { useHeroLightenSpotlights } from './components/useHeroLightenSpotlights';
import { apiRequest, ApiError } from '../../shared/api/httpClient';

/* ---------------------------------------------------------------------------
   PREVIOUS HERO (2D rays) pointer state - kept here for easy rollback.
type HeroPointer = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  down: boolean;
};
--------------------------------------------------------------------------- */

type HeroPointer = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  down: boolean;
};

const MIN_SEATS = 5;
const MAX_SEATS = 1000;
const annualDiscount = 0.2;
const pricingTiers = [
  { id: 'tier-1', rangeLabel: '1-20', seats: 20, monthlyPerSeat: 69 },
  { id: 'tier-2', rangeLabel: '21-50', seats: 30, monthlyPerSeat: 59 },
  { id: 'tier-3', rangeLabel: '51-100', seats: 50, monthlyPerSeat: 49 },
  { id: 'tier-4', rangeLabel: '101-200', seats: 100, monthlyPerSeat: 39 },
  { id: 'tier-5', rangeLabel: '201+', seats: Number.POSITIVE_INFINITY, monthlyPerSeat: 29 }
] as const;

export const LaikaProLandingPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const [visibleSections, setVisibleSections] = useState<Record<string, boolean>>({});
  const [activeNav, setActiveNav] = useState('hero');
  const [scrollProgress, setScrollProgress] = useState(0);
  // PREVIOUS HERO (2D rays) pointer ref - kept for easy rollback.
  const pointerRef = useRef<HeroPointer>({ x: 0, y: 0, targetX: 0, targetY: 0, active: false, down: false });
  // Shared state for interactive demos
  const [demoTasks, setDemoTasks] = useState<DemoTask[]>(INITIAL_TASKS);
  const [activeReportingView, setActiveReportingView] = useState<DemoView>('pnl-tree');
  const [pricingSeats, setPricingSeats] = useState(150);
  const [pricingBilling, setPricingBilling] = useState<'monthly' | 'annual'>('annual');
  const [pricingContactOpen, setPricingContactOpen] = useState<null | 'sales' | 'card'>(null);
  const [pricingContactStatus, setPricingContactStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [pricingContactError, setPricingContactError] = useState<string>('');
  const [pricingContactId, setPricingContactId] = useState<string>('');
  const [pricingContactForm, setPricingContactForm] = useState<{
    name: string;
    email: string;
    company: string;
    message: string;
  }>({
    name: '',
    email: '',
    company: '',
    message: ''
  });

  const normalizedSeats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, pricingSeats));
  const isAnnualBilling = pricingBilling === 'annual';
  const pricingBreakdown = useMemo(() => {
    let remaining = normalizedSeats;
    return pricingTiers.map((tier) => {
      const tierSeats = tier.seats === Number.POSITIVE_INFINITY ? remaining : Math.min(remaining, tier.seats);
      remaining = Math.max(0, remaining - tierSeats);
      const discountedMonthlyPerSeat = Number((tier.monthlyPerSeat * (1 - annualDiscount)).toFixed(2));
      return { ...tier, tierSeats, discountedMonthlyPerSeat };
    });
  }, [normalizedSeats, annualDiscount]);

  const totalMonthlyBase = pricingBreakdown.reduce(
    (sum, tier) => sum + tier.tierSeats * tier.monthlyPerSeat,
    0
  );
  const totalMonthlyDiscounted = pricingBreakdown.reduce(
    (sum, tier) => sum + tier.tierSeats * tier.discountedMonthlyPerSeat,
    0
  );
  const totalMonthly = isAnnualBilling ? totalMonthlyDiscounted : totalMonthlyBase;
  const totalAnnual = totalMonthly * 12;
  const effectiveMonthlyPerSeat = normalizedSeats ? totalMonthly / normalizedSeats : 0;
  const effectiveMonthlyPerSeatBase = normalizedSeats ? totalMonthlyBase / normalizedSeats : 0;

  const formatUsd = (value: number, options: Intl.NumberFormatOptions = {}) => {
    return `$${value.toLocaleString('en-US', options)}`;
  };

  useEffect(() => {
    if (!pricingContactOpen) {
      setPricingContactStatus('idle');
      setPricingContactError('');
      setPricingContactId('');
      return;
    }

    setPricingContactStatus('idle');
    setPricingContactError('');
    setPricingContactId('');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPricingContactOpen(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pricingContactOpen]);

  const submitPricingContact = useCallback(async () => {
    setPricingContactStatus('submitting');
    setPricingContactError('');
    setPricingContactId('');

    const payload = {
      intent: pricingContactOpen ?? 'sales',
      seats: normalizedSeats,
      annualBilling: isAnnualBilling,
      annualDiscountPercent: isAnnualBilling ? Math.round(annualDiscount * 100) : 0,
      pricing: {
        billing: pricingBilling,
        effectiveMonthlyPerSeat,
        effectiveMonthlyPerSeatBase,
        totalMonthly,
        totalAnnual,
        tiers: pricingBreakdown.map((tier) => ({
          range: tier.rangeLabel,
          monthlyPerSeat: tier.monthlyPerSeat,
          discountedMonthlyPerSeat: tier.discountedMonthlyPerSeat,
          seats: tier.tierSeats
        }))
      },
      contact: {
        name: pricingContactForm.name.trim(),
        email: pricingContactForm.email.trim(),
        company: pricingContactForm.company.trim(),
        message: pricingContactForm.message.trim()
      },
      page: { path: window.location.hash || window.location.pathname || '/' }
    };

    try {
      const result = await apiRequest<{ id: string }>('/landing/inquiries', {
        method: 'POST',
        body: payload
      });
      setPricingContactId(result.id);
      setPricingContactStatus('success');
    } catch (error) {
      if (error instanceof ApiError) {
        setPricingContactError(error.message || 'Failed to submit.');
      } else if (error instanceof Error) {
        setPricingContactError(error.message || 'Failed to submit.');
      } else {
        setPricingContactError('Failed to submit.');
      }
      setPricingContactStatus('error');
    }
  }, [
    annualDiscount,
    effectiveMonthlyPerSeat,
    effectiveMonthlyPerSeatBase,
    isAnnualBilling,
    pricingContactForm.company,
    pricingContactForm.email,
    pricingContactForm.message,
    pricingContactForm.name,
    pricingContactOpen,
    pricingBilling,
    pricingBreakdown,
    normalizedSeats,
    totalAnnual,
    totalMonthly
  ]);

  // Intersection Observer for animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => ({ ...prev, [entry.target.id]: true }));
            if (entry.target.id) setActiveNav(entry.target.id);
          }
        });
      },
      { threshold: 0.3 }
    );

    const sections = document.querySelectorAll('[data-animate]');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Scroll progress indicator and parallax
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / scrollHeight) * 100;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Parallax effect for screenshots
  useEffect(() => {
    const handleParallax = () => {
      const elements = document.querySelectorAll('[data-parallax]');
      elements.forEach((el) => {
        const element = el as HTMLElement;
        const speed = parseFloat(element.dataset.parallax || '0.5');
        const rect = element.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const windowCenter = window.innerHeight / 2;
        const offset = (centerY - windowCenter) * speed;
        element.style.transform = `translateY(${offset}px)`;
      });
    };

    window.addEventListener('scroll', handleParallax, { passive: true });
    handleParallax(); // Initial call
    return () => window.removeEventListener('scroll', handleParallax);
  }, []);

  // Alternative hero (spotlights + mono geometry) kept for easy rollback:
  // useHeroLightenSpotlights(canvasRef, heroRef);

  // ---------------------------------------------------------------------------
  // PREVIOUS HERO (2D light rays / occluders) - preserved for easy rollback.
  // ---------------------------------------------------------------------------
  // Hero Canvas Animation - Light rays through geometric occluders ("Laiten" = light)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const lightCanvas = document.createElement('canvas');
    const lightCtx = lightCanvas.getContext('2d');
    if (!lightCtx) return;

    let animationId = 0;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const pointer = pointerRef.current;

    type Point = { x: number; y: number };
    type Segment = { a: Point; b: Point; kind: 'occluder' | 'frame' };

    type Pulse = { x: number; y: number; startedAt: number; strength: number };
    const pulses: Pulse[] = [];

    type Occluder = { points: Point[]; fill: string; stroke: string; glow?: string };
    let occluders: Occluder[] = [];
    let segments: Segment[] = [];

    let width = 1;
    let height = 1;
    let dpr = 1;
    let canvasRect = canvas.getBoundingClientRect();
    let baseGradient: CanvasGradient | null = null;
    let maxDist = 1;
    let rayCount = 0;
    let rayCos: number[] = [];
    let raySin: number[] = [];
    let rayPoints: Point[] = [];

    const addPolySegments = (poly: Point[], kind: Segment['kind']) => {
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        segments.push({ a, b, kind });
      }
    };

    const buildOccluders = () => {
      const p = (nx: number, ny: number): Point => ({ x: nx * width, y: ny * height });

      const prism1: Point[] = [
        p(0.64, 0.30),
        p(0.90, 0.44),
        p(0.76, 0.62),
        p(0.56, 0.48)
      ];

      const prism2: Point[] = [
        p(0.10, 0.56),
        p(0.32, 0.50),
        p(0.28, 0.72),
        p(0.06, 0.68)
      ];

      const shardA: Point[] = [p(0.16, 0.28), p(0.30, 0.22), p(0.36, 0.32), p(0.22, 0.38)];
      const shardB: Point[] = [p(0.72, 0.72), p(0.90, 0.68), p(0.86, 0.82), p(0.68, 0.84)];

      const slat1: Point[] = [p(0.10, 0.78), p(0.40, 0.66), p(0.42, 0.70), p(0.12, 0.82)];
      const slat2: Point[] = [p(0.58, 0.14), p(0.96, 0.26), p(0.94, 0.32), p(0.56, 0.20)];

      occluders = [
        { points: prism1, fill: 'rgba(2, 6, 23, 0.50)', stroke: 'rgba(255, 255, 255, 0.05)', glow: 'rgba(139, 92, 246, 0.10)' },
        { points: prism2, fill: 'rgba(2, 6, 23, 0.46)', stroke: 'rgba(255, 255, 255, 0.05)', glow: 'rgba(236, 72, 153, 0.08)' },
        { points: shardA, fill: 'rgba(2, 6, 23, 0.40)', stroke: 'rgba(255, 255, 255, 0.04)' },
        { points: shardB, fill: 'rgba(2, 6, 23, 0.40)', stroke: 'rgba(255, 255, 255, 0.04)' },
        { points: slat1, fill: 'rgba(2, 6, 23, 0.34)', stroke: 'rgba(255, 255, 255, 0.032)' },
        { points: slat2, fill: 'rgba(2, 6, 23, 0.34)', stroke: 'rgba(255, 255, 255, 0.032)' }
      ];

      segments = [];
      // Canvas frame stops rays cleanly.
      const frame: Point[] = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
      addPolySegments(frame, 'frame');
      occluders.forEach((o) => addPolySegments(o.points, 'occluder'));
    };

    const updateRayCache = () => {
      // Reduced ray count for better performance (was 420-560)
      const target = width < 720 ? 180 : 280;
      rayCount = Math.max(120, Math.round(target));
      const step = (Math.PI * 2) / rayCount;
      rayCos = new Array(rayCount);
      raySin = new Array(rayCount);
      rayPoints = new Array(rayCount);
      for (let i = 0; i < rayCount; i += 1) {
        const angle = i * step;
        rayCos[i] = Math.cos(angle);
        raySin[i] = Math.sin(angle);
        rayPoints[i] = { x: 0, y: 0 };
      }
    };

    const resize = () => {
      canvasRect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(canvasRect.width));
      height = Math.max(1, Math.floor(canvasRect.height));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      lightCanvas.width = canvas.width;
      lightCanvas.height = canvas.height;
      lightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, '#050816');
      baseGradient.addColorStop(0.45, '#030712');
      baseGradient.addColorStop(1, '#070a16');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = baseGradient;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      maxDist = Math.sqrt(width * width + height * height);
      buildOccluders();
      updateRayCache();
      refreshTitleMetrics();

      if (!pointer.x && !pointer.y) {
        let initX = width * 0.27;
        let initY = height * 0.34;
        if (titleCenter) {
          initX = Math.max(0, Math.min(width, titleCenter.x - width * 0.18));
          initY = Math.max(0, Math.min(height, titleCenter.y - height * 0.22));
        }

        pointer.x = initX;
        pointer.y = initY;
        pointer.targetX = pointer.x;
        pointer.targetY = pointer.y;
      }
    };

    const host = (heroRef.current as unknown as HTMLElement | null) ?? canvas;
    const titleEl = heroTitleRef.current;

    let titleLines: string[] = [];
    let titleFont = '800 72px Inter, system-ui, -apple-system, sans-serif';
    let titleLetterSpacingPx = 0;
    let titleLineHeightPx = 72;
    let titleRect: { x: number; y: number; w: number; h: number } | null = null;
    let titleCenter: Point | null = null;
    type TitleLineLayout = { text: string; chars: string[]; offsets: number[] };
    let titleLayouts: TitleLineLayout[] = [];

    const parseCssPx = (raw: string, base = 16) => {
      const v = raw.trim();
      if (!v) return 0;
      if (v.endsWith('px')) return Number.parseFloat(v);
      if (v.endsWith('em')) return Number.parseFloat(v) * base;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };

    const refreshTitleMetrics = () => {
      if (!titleEl) return;
      const style = window.getComputedStyle(titleEl);
      const fontSize = parseCssPx(style.fontSize, 16) || 72;
      const fontWeight = style.fontWeight || '800';
      const fontFamily = style.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
      titleFont = `${fontWeight} ${fontSize}px ${fontFamily}`;
      titleLetterSpacingPx = parseCssPx(style.letterSpacing, fontSize);
      const lhRaw = style.lineHeight;
      titleLineHeightPx = lhRaw === 'normal' ? fontSize * 1.05 : parseCssPx(lhRaw, fontSize) || fontSize * 1.05;
      const text = (titleEl.innerText || '').trim();
      titleLines = text ? text.split('\n').map((s) => s.trim()).filter(Boolean) : [];
      titleLayouts = [];
      if (titleLines.length) {
        ctx.save();
        ctx.font = titleFont;
        titleLayouts = titleLines.map((line) => {
          const chars = Array.from(line);
          const widths = chars.map((ch) => ctx.measureText(ch).width);
          const total = widths.reduce((sum, w) => sum + w, 0) + titleLetterSpacingPx * (chars.length - 1);
          let cursorX = -total / 2;
          const offsets = widths.map((w) => {
            const offset = cursorX + w / 2;
            cursorX += w + titleLetterSpacingPx;
            return offset;
          });
          return { text: line, chars, offsets };
        });
        ctx.restore();
      }
      canvasRect = canvas.getBoundingClientRect();
      const rect = titleEl.getBoundingClientRect();
      titleRect = { x: rect.left - canvasRect.left, y: rect.top - canvasRect.top, w: rect.width, h: rect.height };
      titleCenter = { x: titleRect.x + titleRect.w / 2, y: titleRect.y + titleRect.h / 2 };
    };

    const getTitleCenterInCanvas = (): Point | null => titleCenter;

    const drawTitleLine = (
      drawCtx: CanvasRenderingContext2D,
      layout: TitleLineLayout,
      x: number,
      y: number
    ) => {
      if (!titleLetterSpacingPx) {
        drawCtx.fillText(layout.text, x, y);
        return;
      }
      for (let i = 0; i < layout.chars.length; i += 1) {
        drawCtx.fillText(layout.chars[i], x + layout.offsets[i], y);
      }
    };

    type TitleShadowMode = 'multiply' | 'destination-out';

    const drawTitleShadow = (
      drawCtx: CanvasRenderingContext2D,
      origin: Point,
      opts: { mode: TitleShadowMode; strength: number; bloom: boolean }
    ) => {
      if (!titleEl) return;
      if (!titleLayouts.length || !titleRect) refreshTitleMetrics();
      if (!titleLayouts.length || !titleRect) return;

      const { x, y, w, h } = titleRect;
      const cx = x + w / 2;

      const minDim = Math.min(width, height);
      const lenBase = opts.mode === 'destination-out' ? minDim * 0.82 : minDim * 0.44;
      const baseSteps = width < 720 ? (opts.mode === 'destination-out' ? 22 : 18) : opts.mode === 'destination-out' ? 34 : 26;
      // Extra sampling for smoother title shadows; slightly gentler on small screens to keep costs down.
      const steps = Math.round(baseSteps * (width < 720 ? 1.2 : 1.3));
      const strength = Math.max(0, Math.min(1.35, opts.strength));

      const lineHeight = Math.max(1, titleLineHeightPx);
      const textBlockH = (titleLayouts.length - 1) * lineHeight;
      const startY = y + h / 2 - textBlockH / 2;

      const lineData = titleLayouts.map((layout, index) => {
        const lineY = startY + index * lineHeight;
        const dx = cx - origin.x;
        const dy = lineY - origin.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const dirX = dx / dist;
        const dirY = dy / dist;
        const len = Math.max(minDim * 0.12, Math.min(lenBase, dist * (opts.mode === 'destination-out' ? 0.95 : 0.58)));
        return { layout, lineY, dirX, dirY, len };
      });

      drawCtx.save();
      drawCtx.font = titleFont;
      drawCtx.textAlign = 'center';
      drawCtx.textBaseline = 'middle';

      if (opts.bloom) {
        // Subtle "lit edge" bloom on the side facing the light source.
        drawCtx.save();
        drawCtx.globalCompositeOperation = 'screen';
        drawCtx.filter = 'blur(14px)';
        drawCtx.globalAlpha = 0.085 * strength;
        drawCtx.fillStyle = 'rgba(255,255,255,1)';
        lineData.forEach((line) => {
          const hx = -line.dirX * Math.min(22, line.len * 0.12);
          const hy = -line.dirY * Math.min(22, line.len * 0.12);
          drawTitleLine(drawCtx, line.layout, cx + hx, line.lineY + hy);
        });
        drawCtx.restore();
      }

      drawCtx.globalCompositeOperation = opts.mode;

      // Soft penumbra
      drawCtx.save();
      drawCtx.filter = opts.mode === 'destination-out' ? 'blur(22px)' : 'blur(18px)';
      drawCtx.globalAlpha = (opts.mode === 'destination-out' ? 0.68 : 0.14) * strength;
      drawCtx.fillStyle = 'rgba(0,0,0,1)';
      lineData.forEach((line) => {
        const px = line.dirX * (line.len * 0.56);
        const py = line.dirY * (line.len * 0.56);
        drawTitleLine(drawCtx, line.layout, cx + px, line.lineY + py);
      });
      drawCtx.restore();

      // Crisp extrusion (stronger for light cutout so the shadow reads instantly)
      drawCtx.filter = 'none';
      drawCtx.fillStyle = 'rgba(0,0,0,1)';
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const falloff = (1 - t) * (1 - t);
        drawCtx.globalAlpha = (opts.mode === 'destination-out' ? 0.22 : 0.18) * falloff * strength;
        lineData.forEach((line) => {
          const ox = line.dirX * (line.len * t);
          const oy = line.dirY * (line.len * t);
          drawTitleLine(drawCtx, line.layout, cx + ox, line.lineY + oy);
        });
      }

      drawCtx.restore();
    };

    const updatePointerTarget = (event: PointerEvent) => {
      canvasRect = canvas.getBoundingClientRect();
      const x = event.clientX - canvasRect.left;
      const y = event.clientY - canvasRect.top;
      pointer.targetX = Math.max(0, Math.min(width, x));
      pointer.targetY = Math.max(0, Math.min(height, y));
      pointer.active = true;
    };

    const handlePointerMove = (event: PointerEvent) => updatePointerTarget(event);
    const handlePointerEnter = (event: PointerEvent) => updatePointerTarget(event);
    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.down = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      updatePointerTarget(event);
      pointer.down = true;
      pulses.push({ x: pointer.targetX, y: pointer.targetY, startedAt: performance.now(), strength: 1 });
    };
    const handlePointerUp = () => {
      pointer.down = false;
    };

    host.addEventListener('pointermove', handlePointerMove, { passive: true });
    host.addEventListener('pointerenter', handlePointerEnter, { passive: true });
    host.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    host.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('pointercancel', handlePointerUp, { passive: true });

    const intersectRaySegment = (origin: Point, dirX: number, dirY: number, seg: Segment) => {
      const r_px = origin.x;
      const r_py = origin.y;
      const r_dx = dirX;
      const r_dy = dirY;

      const s_px = seg.a.x;
      const s_py = seg.a.y;
      const s_dx = seg.b.x - seg.a.x;
      const s_dy = seg.b.y - seg.a.y;

      const denom = r_dx * s_dy - r_dy * s_dx;
      if (Math.abs(denom) < 1e-6) return null;

      const t = ((s_px - r_px) * s_dy - (s_py - r_py) * s_dx) / denom;
      const u = ((s_px - r_px) * r_dy - (s_py - r_py) * r_dx) / denom;

      if (t < 0 || u < 0 || u > 1) return null;
      return { t, x: r_px + t * r_dx, y: r_py + t * r_dy };
    };

    const castRay = (origin: Point, dirX: number, dirY: number) => {
      let bestT = Infinity;
      let hit: Point = { x: origin.x + dirX * maxDist, y: origin.y + dirY * maxDist };

      for (let i = 0; i < segments.length; i += 1) {
        const res = intersectRaySegment(origin, dirX, dirY, segments[i]);
        if (!res) continue;
        if (res.t < bestT) {
          bestT = res.t;
          hit = { x: res.x, y: res.y };
        }
      }

      return hit;
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = baseGradient ?? '#030712';
      ctx.fillRect(0, 0, width, height);

      const origin = { x: width * 0.27, y: height * 0.34 };

      // OPTIMIZATION: Do ray casting once for static render
      const localRayCount = rayCount || 280;
      const step = (Math.PI * 2) / localRayCount;
      const points: Point[] = [];
      for (let i = 0; i < localRayCount; i += 1) {
        const a = i * step;
        points.push(castRay(origin, Math.cos(a), Math.sin(a)));
      }

      const drawBeams = (hue: number, alpha: number) => {
        const grad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, maxDist * 0.9);
        grad.addColorStop(0, `hsla(${hue}, 100%, 72%, ${alpha})`);
        grad.addColorStop(0.18, `hsla(${hue + 30}, 100%, 66%, ${alpha * 0.55})`);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        for (let i = 0; i < points.length; i += 1) {
          const p1 = points[i];
          const p2 = points[(i + 1) % points.length];
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.closePath();
          ctx.fill();
        }
      };

      ctx.globalCompositeOperation = 'lighter';
      drawBeams(195, 0.12);
      drawBeams(255, 0.11);
      drawBeams(325, 0.09);

      ctx.globalCompositeOperation = 'source-over';
      occluders.forEach((o) => {
        ctx.beginPath();
        o.points.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = o.fill;
        ctx.fill();
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    };

    resize();

    if (prefersReducedMotion) {
      drawStatic();
      const staticOrigin = { x: width * 0.27, y: height * 0.34 };
      // Cut the light with the title shape, then add a subtle readable shadow.
      drawTitleShadow(ctx, staticOrigin, { mode: 'destination-out', strength: 1, bloom: false });
      drawTitleShadow(ctx, staticOrigin, { mode: 'multiply', strength: 0.6, bloom: true });
      return () => {
        host.removeEventListener('pointermove', handlePointerMove);
        host.removeEventListener('pointerenter', handlePointerEnter);
        host.removeEventListener('pointerleave', handlePointerLeave);
        host.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };
    }

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', resize);
    const titleRo = 'ResizeObserver' in window && titleEl ? new ResizeObserver(() => refreshTitleMetrics()) : null;
    if (titleEl && titleRo) {
      titleRo.observe(titleEl);
    }
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => refreshTitleMetrics());
    }

    let lastFrame = performance.now();
    let isAnimating = false;
    let isHeroVisible = true;

    const animate = (now: number) => {
      if (!isAnimating) {
        return;
      }
      const dt = now - lastFrame;
      // Reduced from 48 FPS to 30 FPS for better performance
      if (dt < 1000 / 30) {
        animationId = requestAnimationFrame(animate);
        return;
      }
      lastFrame = now;

      if (!pointer.active) {
        const titleCenter = getTitleCenterInCanvas();
        if (titleCenter) {
          pointer.targetX = Math.max(
            0,
            Math.min(width, titleCenter.x - width * 0.18 + Math.sin(now * 0.00024) * width * 0.14)
          );
          pointer.targetY = Math.max(
            0,
            Math.min(height, titleCenter.y - height * 0.22 + Math.cos(now * 0.00021) * height * 0.12)
          );
        } else {
          pointer.targetX = width * 0.23 + Math.sin(now * 0.00024) * width * 0.18;
          pointer.targetY = height * 0.33 + Math.cos(now * 0.00021) * height * 0.14;
        }
      }
      pointer.x += (pointer.targetX - pointer.x) * 0.12;
      pointer.y += (pointer.targetY - pointer.y) * 0.12;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = baseGradient ?? '#030712';
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      const origin = { x: pointer.x, y: pointer.y };
      const pulseBoost = pulses.reduce((sum, p) => {
        const age = (now - p.startedAt) / 1000;
        if (age < 0 || age > 1.25) return sum;
        return sum + (1 - age / 1.25) * p.strength;
      }, 0);

      const intensity = (pointer.down ? 0.26 : 0.18) + pulseBoost * 0.06;
      const sparkle = Math.min(1, 0.45 + pulseBoost * 0.35);

      // OPTIMIZATION: Do ray casting once instead of 3 times (was inside drawChannel)
      if (rayCount >= 3) {
        for (let i = 0; i < rayCount; i += 1) {
          const hit = castRay(origin, rayCos[i], raySin[i]);
          rayPoints[i].x = hit.x;
          rayPoints[i].y = hit.y;
        }
      }

      // Now drawChannel just renders using pre-computed rayPoints
      const drawChannel = (hue: number, alpha: number, lineEvery: number) => {
        if (rayCount < 3) {
          return;
        }
        const grad = lightCtx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, maxDist * 0.95);
        grad.addColorStop(0, `hsla(${hue}, 100%, 74%, ${alpha})`);
        grad.addColorStop(0.22, `hsla(${hue + 30}, 100%, 66%, ${alpha * 0.55})`);
        grad.addColorStop(1, 'transparent');

        lightCtx.fillStyle = grad;
        for (let i = 0; i < rayCount; i += 1) {
          const p1 = rayPoints[i];
          const p2 = rayPoints[(i + 1) % rayCount];
          lightCtx.beginPath();
          lightCtx.moveTo(origin.x, origin.y);
          lightCtx.lineTo(p1.x, p1.y);
          lightCtx.lineTo(p2.x, p2.y);
          lightCtx.closePath();
          lightCtx.fill();
        }

        lightCtx.lineCap = 'round';
        lightCtx.strokeStyle = `hsla(${hue}, 100%, 72%, ${Math.min(0.085, alpha * 0.55)})`;
        lightCtx.lineWidth = 1;
        for (let i = 0; i < rayCount; i += lineEvery) {
          const pt = rayPoints[i];
          lightCtx.beginPath();
          lightCtx.moveTo(origin.x, origin.y);
          lightCtx.lineTo(pt.x, pt.y);
          lightCtx.stroke();
        }

        lightCtx.fillStyle = `hsla(${hue + 25}, 100%, 70%, ${0.06 * sparkle})`;
        for (let i = 0; i < rayCount; i += 18) {
          const pt = rayPoints[i];
          lightCtx.beginPath();
          lightCtx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
          lightCtx.fill();
        }
      };

      // Render the light into an offscreen layer so we can subtract the title silhouette cleanly.
      lightCtx.globalCompositeOperation = 'source-over';
      lightCtx.clearRect(0, 0, width, height);
      lightCtx.globalCompositeOperation = 'lighter';

      // Soft spotlight core
      const spot = lightCtx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, Math.min(maxDist * 0.18, 320));
      spot.addColorStop(0, `rgba(255, 255, 255, ${0.10 + pulseBoost * 0.04})`);
      spot.addColorStop(1, 'transparent');
      lightCtx.fillStyle = spot;
      lightCtx.beginPath();
      lightCtx.arc(origin.x, origin.y, Math.min(maxDist * 0.18, 320), 0, Math.PI * 2);
      lightCtx.fill();

      // Chromatic dispersion (using shared ray casting results)
      drawChannel(195, intensity * 0.62, 10);
      drawChannel(255, intensity * 0.58, 12);
      drawChannel(325, intensity * 0.50, 14);

      // Light ripple rings
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const p = pulses[i];
        const age = (now - p.startedAt) / 1000;
        if (age > 1.25) {
          pulses.splice(i, 1);
          continue;
        }
        const radius = 50 + age * 680;
        const a = Math.max(0, 1 - age / 1.25);
        lightCtx.strokeStyle = `rgba(34, 211, 238, ${a * 0.14})`;
        lightCtx.lineWidth = 1.5;
        lightCtx.beginPath();
        lightCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        lightCtx.stroke();
      }

      // Title becomes the main occluder: subtract its projected shadow from the light layer.
      drawTitleShadow(lightCtx, origin, { mode: 'destination-out', strength: 1, bloom: false });

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(lightCanvas, 0, 0, width, height);
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';

      // Occluders: silhouettes + subtle edge highlights.
      occluders.forEach((o) => {
        ctx.beginPath();
        o.points.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();

        ctx.fillStyle = o.fill;
        ctx.fill();

        if (o.glow) {
          ctx.shadowBlur = 24;
          ctx.shadowColor = o.glow;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // Add a subtle surface shadow to anchor the illusion behind the DOM headline.
      drawTitleShadow(ctx, origin, { mode: 'multiply', strength: 0.52, bloom: true });

      animationId = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (isAnimating) return;
      isAnimating = true;
      lastFrame = performance.now();
      animationId = requestAnimationFrame(animate);
    };

    const stopAnimation = () => {
      if (!isAnimating) return;
      isAnimating = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAnimation();
        return;
      }
      if (isHeroVisible) {
        startAnimation();
      }
    };

    const heroObserver =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([entry]) => {
              isHeroVisible = Boolean(entry?.isIntersecting);
              if (!isHeroVisible || document.hidden) {
                stopAnimation();
              } else {
                startAnimation();
              }
            },
            { rootMargin: '200px 0px', threshold: 0.15 }
          )
        : null;
    heroObserver?.observe(host);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    startAnimation();

    return () => {
      stopAnimation();
      heroObserver?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ro?.disconnect();
      titleRo?.disconnect();
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerenter', handlePointerEnter);
      host.removeEventListener('pointerleave', handlePointerLeave);
      host.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);
  // ---------------------------------------------------------------------------

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const scrollToAnchor = () => {
      const parts = window.location.hash.split('#');
      const anchor = parts.length >= 3 ? decodeURIComponent(parts[2] || '').trim() : '';
      if (!anchor) {
        return;
      }

      requestAnimationFrame(() => scrollToSection(anchor));
    };

    scrollToAnchor();
    window.addEventListener('hashchange', scrollToAnchor);
    return () => window.removeEventListener('hashchange', scrollToAnchor);
  }, [scrollToSection]);

  const handleDemoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email');
    alert(`Thank you! We'll send demo access to ${email}`);
  };

  return (
    <div className={styles.container}>
      {/* Progress Bar */}
      <div className={styles.progressBar} style={{ width: `${scrollProgress}%` }} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>L</span>
          Laiten
        </div>
        <nav className={styles.navLinks}>
          <span
            onClick={() => scrollToSection('hero')}
            className={`${styles.navLink} ${activeNav === 'hero' ? styles.navLinkActive : ''}`}
          >
            Intro
          </span>
            <span
              onClick={() => scrollToSection('features')}
              className={`${styles.navLink} ${activeNav === 'feature-1' || activeNav === 'feature-2' || activeNav === 'feature-3' || activeNav === 'feature-4' ? styles.navLinkActive : ''}`}
            >
              Features
            </span>
          <span
            onClick={() => scrollToSection('pricing')}
            className={`${styles.navLink} ${activeNav === 'pricing' ? styles.navLinkActive : ''}`}
          >
            Pricing
          </span>
          <span
            onClick={() => scrollToSection('contact')}
            className={`${styles.navLink} ${activeNav === 'contact' ? styles.navLinkActive : ''}`}
          >
            Contact
          </span>
          <a href="#/laiten/about" className={styles.navLink}>
            About
          </a>
          <a href="#/laiten/careers" className={styles.navLink}>
            Careers
          </a>
        </nav>
        <button className={styles.loginButton} onClick={() => window.location.hash = ''}>
          Log in
          <ArrowRight size={16} />
        </button>
      </header>

      {/* Hero Section with Parallax */}
      <section id="hero" data-animate ref={heroRef} className={styles.hero}>
        <canvas ref={canvasRef} className={styles.canvasBackground} aria-hidden="true" />

        <div
          className={styles.heroContent}
        >
          <h1 ref={heroTitleRef} className={styles.heroTitle} aria-label="Transformation - Lightened.">
            <span className={styles.heroTitleLine}>
              Transformation <span className={styles.heroTitleDash}>-</span>
            </span>
            <br />
            <span className={styles.heroTitleAccent}>Lightened</span>
          </h1>

          <p className={styles.heroSubtitle}>
            The end-to-end platform for steering enterprise transformation.
            Clear stage gates, fast reporting, and execution insight in one place.
          </p>

          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={() => scrollToSection('contact')}>
              Request Demo
              <ArrowRight size={18} />
            </button>
          </div>

          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>99.9%</span>
              <span className={styles.heroStatLabel}>Uptime SLA</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>SOC2</span>
              <span className={styles.heroStatLabel}>Compliant</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>SSO</span>
              <span className={styles.heroStatLabel}>Enterprise Ready</span>
            </div>
          </div>
        </div>

        <div
          className={styles.scrollIndicator}
          onClick={() => scrollToSection('features')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              scrollToSection('features');
            }
          }}
          role="button"
          tabIndex={0}
        >
          <ChevronDown size={22} />
        </div>
      </section>

      {/* Features Anchor */}
      <div id="features" style={{ position: 'relative', top: '-80px' }} />

      {/* Feature 1: Stage Gate Management - Interactive Demo Style */}
      <section id="feature-1" data-animate className={`${styles.featureSection} ${styles.featureSectionDemo} ${styles.featureSectionLift}`}>
        <div className={styles.interactiveDemoLayout}>
          {/* Left - Content */}
          <div className={`${styles.demoContent} ${visibleSections['feature-1'] ? styles.visible : ''}`}>
            <div className={styles.featureNumber}>01</div>
            <div className={styles.featureLabel}>Governance</div>
            <h2 className={styles.featureTitle}>
              End-to-End<br />Stage Gate Management
            </h2>
            <p className={styles.featureDescription}>
              Comprehensive governance from ideation to delivery. Navigate complex approval
              workflows with ease while maintaining full audit trails and compliance. Capture every
              initiative detail in a single, intuitive workspace so financial projections,
              implementation plans, KPIs, risk matrices, and attachments stay visible for stage gate approvals.
            </p>

            <ul className={styles.featureList}>
              <li><Check size={18} /> Customizable stage gate workflows</li>
              <li><Check size={18} /> Unified data entry for projections, plans, KPIs, risk matrices, and attachments</li>
              <li><Check size={18} /> Built-in approval routing</li>
              <li><Check size={18} /> Context-aware comments & collaboration</li>
              <li><Check size={18} /> Complete audit trail</li>
            </ul>
          </div>

          {/* Right - Interactive Demo */}
          <div className={`${styles.interactiveDemoWrapper} ${visibleSections['feature-1'] ? styles.visible : ''}`}>
            <StageGateDemo />
          </div>
        </div>
      </section>

      {/* Feature 2: Reporting - Interactive Demo Style */}
      <section id="feature-2" data-animate className={`${styles.featureSection} ${styles.featureSectionDemo}`}>
        <div className={`${styles.interactiveDemoLayout} ${styles.interactiveDemoLayoutReverse} ${styles.interactiveDemoLayoutTop}`}>
          {/* Left - Content with Dashboard Selector */}
          <div className={`${styles.demoContent} ${visibleSections['feature-2'] ? styles.visible : ''}`}>
            <div className={styles.featureNumber}>02</div>
            <div className={styles.featureLabel}>Insights</div>
            <h2 className={styles.featureTitle}>
              Transparent &<br />Insightful Reporting
            </h2>
            <p className={styles.featureDescription}>
              Cut through the noise with crystal-clear reporting. Track P&L impact by
              line item, monitor stage-gate pipelines, and make data-driven decisions
              with confidence.
            </p>

            {/* Dashboard selector */}
            <div className={styles.dashboardSelector}>
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.dashboardOption} ${activeReportingView === option.id ? styles.active : ''}`}
                  onClick={() => setActiveReportingView(option.id)}
                >
                  <ArrowLeft size={16} className={styles.dashboardOptionArrow} />
                  <span className={styles.dashboardOptionTitle}>{option.title}</span>
                </button>
              ))}
              <p className={styles.dashboardSelectorHint}>...and nearly 10 other dynamic dashboards</p>
            </div>
          </div>

          {/* Right - Interactive Demo */}
          <div className={`${styles.interactiveDemoWrapper} ${visibleSections['feature-2'] ? styles.visible : ''}`}>
            <ReportingDemo activeView={activeReportingView} />
          </div>
        </div>
      </section>

      {/* Feature 3: Capacity Planning - Interactive Demo Style */}
      <section id="feature-3" data-animate className={`${styles.featureSection} ${styles.featureSectionDemo}`}>
        {/* 3a: Implementation Plan Demo */}
        <div className={`${styles.interactiveDemoLayout} ${styles.interactiveDemoLayoutTop}`}>
          {/* Left - Content */}
          <div className={`${styles.demoContent} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
            <div className={styles.featureNumber}>03</div>
            <div className={styles.featureLabel}>Planning</div>
            <h2 className={styles.featureTitle}>
              Smart Capacity<br />Planning & Sequencing
            </h2>
            <p className={styles.featureDescription}>
              Balance resources and sequence initiatives for maximum impact. Our intelligent
              planning engine helps you avoid burnout while ensuring critical initiatives
              land on time.
            </p>

            <ul className={styles.featureList}>
              <li><Check size={18} /> Build implementation plans fast and assign accountable owners</li>
              <li><Check size={18} /> Drag-and-drop cross-initiative sequencing</li>
              <li><Check size={18} /> Visual capacity heatmaps</li>
              <li><Check size={18} /> Resource conflict detection</li>
              <li><Check size={18} /> Compare actual vs original plans to track schedule drift</li>
            </ul>
          </div>

          {/* Right - Interactive Demo */}
          <div className={`${styles.interactiveDemoWrapper} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
            <div className={styles.planDemoStack}>
              <div className={styles.planDemoControls}>
                <button
                  className={styles.planResetBtn}
                  type="button"
                  onClick={() => setDemoTasks(INITIAL_TASKS)}
                >
                  Reset Plan
                </button>
              </div>
              <InteractivePlanDemo onTasksChange={setDemoTasks} />
            </div>
          </div>
        </div>

        <div className={styles.planSyncRow}>
          <div className={styles.planSyncIndicator}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 1-9 9m0 0a9 9 0 0 1-9-9m9 9V3m0 0L8 8m4-5 4 5" />
            </svg>
            <span>Synced with Implementation Plan above</span>
          </div>
        </div>

        {/* 3b: Capacity Heatmap Demo */}
        <div className={styles.heatmapDemoSection}>
          <div className={styles.heatmapDemoSpacer} aria-hidden="true" />
          <div className={`${styles.heatmapDemoWrapper} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
            <CapacityHeatmapDemo tasks={demoTasks} />
          </div>
        </div>
      </section>

      {/* Feature 4: Implementation Monitoring */}
      <section id="feature-4" data-animate className={`${styles.featureSection} ${styles.featureSectionDemo}`}>
        <div className={`${styles.interactiveDemoLayout} ${styles.interactiveDemoLayoutReverse}`}>
          {/* Left - Content */}
          <div className={`${styles.demoContent} ${visibleSections['feature-4'] ? styles.visible : ''}`}>
            <div className={styles.featureNumber}>04</div>
            <div className={styles.featureLabel}>Execution</div>
            <h2 className={styles.featureTitle}>
              Effortless<br />Delivery Monitoring
            </h2>
            <p className={styles.featureDescription}>
              Turn routine weekly status reports into an always-fresh delivery signal. Capture updates per task,
              adjust dates and progress in seconds, and instantly see what's at risk in Deadline radar.
            </p>

            <ul className={styles.featureList}>
              <li><Check size={18} /> Structured weekly status reports</li>
              <li><Check size={18} /> One-click submit to keep stakeholders aligned</li>
              <li><Check size={18} /> Deadline radar auto-highlights overdue & due-soon work</li>
              <li><Check size={18} /> Filters by workstream, owner, and status buckets</li>
            </ul>
          </div>

          {/* Right - Interactive Demo */}
          <div className={`${styles.interactiveDemoWrapper} ${visibleSections['feature-4'] ? styles.visible : ''}`}>
            <ImplementationMonitoringDemo />
          </div>
        </div>
      </section>

      {/* Features Marquee Section */}
      <section id="features-marquee" data-animate className={styles.featuresMarqueeSection}>
        <div className={styles.featuresMarqueeHeader}>
          <h2 className={styles.featuresMarqueeTitle}>
            Everything You Need to Transform
          </h2>
          <p className={styles.featuresMarqueeSubtitle}>
            A comprehensive toolkit built for enterprise transformation teams
          </p>
        </div>

        <div className={styles.marqueeContainer}>
          {/* Row 1 - Left to Right */}
          <div className={styles.marqueeRow}>
            <div className={styles.marqueeTrack}>
              {[
                "Multi-stage gate process management",
                "Role-based access control",
                "Hierarchical budget structures",
                "Participant directory management",
                "Initiative lifecycle tracking",
                "Monthly cash flow planning",
                "Approval workflow automation",
                "Financial modeling tools",
                "Bulk Excel data import",
                "Deadline radar dashboard",
                "Multi-stage gate process management",
                "Role-based access control",
                "Hierarchical budget structures",
                "Participant directory management",
                "Initiative lifecycle tracking",
                "Monthly cash flow planning",
                "Approval workflow automation",
                "Financial modeling tools",
                "Bulk Excel data import",
                "Deadline radar dashboard",
              ].map((feature, idx) => (
                <div key={idx} className={styles.marqueeItem}>
                  <Check size={14} className={styles.marqueeItemIcon} />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Row 2 - Right to Left */}
          <div className={`${styles.marqueeRow} ${styles.marqueeRowReverse}`}>
            <div className={`${styles.marqueeTrack} ${styles.marqueeTrackReverse}`}>
              {[
                "Enterprise SSO integration",
                "Custom KPI definitions",
                "Benefits realization tracking",
                "Threaded comment discussions",
                "Document attachment support",
                "Activity change logging",
                "Real-time collaboration",
                "Stage submission workflows",
                "Resource conflict detection",
                "Organizational hierarchy view",
                "Enterprise SSO integration",
                "Custom KPI definitions",
                "Benefits realization tracking",
                "Threaded comment discussions",
                "Document attachment support",
                "Activity change logging",
                "Real-time collaboration",
                "Stage submission workflows",
                "Resource conflict detection",
                "Organizational hierarchy view",
              ].map((feature, idx) => (
                <div key={idx} className={styles.marqueeItem}>
                  <Check size={14} className={styles.marqueeItemIcon} />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Row 3 - Left to Right (slower) */}
          <div className={styles.marqueeRow}>
            <div className={`${styles.marqueeTrack} ${styles.marqueeTrackSlow}`}>
              {[
                "Approval decision audit trails",
                "Recurring vs one-off costs separation",
                "User invitation system",
                "Account activation workflows",
                "Workstream configuration",
                "Portfolio plan dashboards",
                "Financial ratio analysis",
                "Budget vs actuals comparison",
                "Fiscal year period settings",
                "Automated data snapshots",
                "Approval decision audit trails",
                "Recurring vs one-off costs separation",
                "User invitation system",
                "Account activation workflows",
                "Workstream configuration",
                "Portfolio plan dashboards",
                "Financial ratio analysis",
                "Budget vs actuals comparison",
                "Fiscal year period settings",
                "Automated data snapshots",
              ].map((feature, idx) => (
                <div key={idx} className={styles.marqueeItem}>
                  <Check size={14} className={styles.marqueeItemIcon} />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Changelog Section */}
      <section id="changelog" data-animate className={styles.changelogSection}>
        <div className={`${styles.changelogContent} ${visibleSections['changelog'] ? styles.visible : ''}`}>
          <div className={styles.changelogHeader}>
            <h2 className={styles.changelogTitle}>Changelog</h2>
            <p className={styles.changelogSubtitle}>We ship new features and improvements at least every month</p>
          </div>

          <div className={styles.changelogGrid}>
            <div className={styles.changelogCard}>
              <div className={styles.changelogCardHeader}>
                <span className={styles.changelogVersion}>2.4</span>
                <span className={styles.changelogDate}>Dec 10, 2025</span>
              </div>
              <h3 className={styles.changelogCardTitle}>
                Enhanced Security & Two-Factor Authentication
              </h3>
              <p className={styles.changelogCardDescription}>
                Added TOTP-based 2FA, passkey support, and improved session management for enterprise security compliance.
              </p>
            </div>

            <div className={styles.changelogCard}>
              <div className={styles.changelogCardHeader}>
                <span className={styles.changelogVersion}>2.3</span>
                <span className={styles.changelogDate}>Nov 21, 2025</span>
              </div>
              <h3 className={styles.changelogCardTitle}>
                Advanced Activity Logging & Audit Trail
              </h3>
              <p className={styles.changelogCardDescription}>
                Comprehensive action logging for compliance, with searchable audit trails and exportable activity reports.
              </p>
            </div>

            <div className={styles.changelogCard}>
              <div className={styles.changelogCardHeader}>
                <span className={styles.changelogVersion}>2.2</span>
                <span className={styles.changelogDate}>Oct 29, 2025</span>
              </div>
              <h3 className={styles.changelogCardTitle}>
                Daily Data Snapshots & Historical Comparison
              </h3>
              <p className={styles.changelogCardDescription}>
                Automated daily snapshots of all project data, enabling point-in-time comparisons and change tracking.
              </p>
            </div>

            <div className={styles.changelogCard}>
              <div className={styles.changelogCardHeader}>
                <span className={styles.changelogVersion}>2.1</span>
                <span className={styles.changelogDate}>Sep 29, 2025</span>
              </div>
              <h3 className={styles.changelogCardTitle}>
                Improved Comments & Collaboration System
              </h3>
              <p className={styles.changelogCardDescription}>
                Threaded discussions, @mentions, email notifications, and inline commenting across all initiative content.
              </p>
            </div>
          </div>

          <a href="#/laiten/whats-new" className={styles.changelogLink}>
            See what's new in Laiten <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" data-animate className={styles.pricingSection}>
        <div className={styles.pricingHeader}>
          <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
          <p className={styles.sectionSubtitle}>
            One subscription. Pricing is tiered by seat ranges - volume discounts apply automatically.
          </p>
        </div>

        <div className={`${styles.pricingCard} ${visibleSections['pricing'] ? styles.visible : ''}`}>
          <div className={styles.pricingCardHeader}>
          <h3 className={styles.pricingPlanName}>One plan. Priced by seats.</h3>

          <div className={styles.pricingTable}>
            <div className={styles.pricingTableHeader}>
              <span>Price per seat / month</span>
              <span>Number of licenses</span>
            </div>
            {pricingTiers.map((tier) => {
              const discountedPerSeat = Number((tier.monthlyPerSeat * (1 - annualDiscount)).toFixed(2));
              const displayPrice = isAnnualBilling ? discountedPerSeat : tier.monthlyPerSeat;
              const priceOptions = displayPrice % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {};

              return (
                <div className={styles.pricingTableRow} key={tier.id}>
                  <div className={styles.pricingTablePrice}>
                    {isAnnualBilling && (
                      <span className={styles.pricingTablePriceOld}>{formatUsd(tier.monthlyPerSeat)}</span>
                    )}
                    <span className={styles.pricingTablePriceNew}>{formatUsd(displayPrice, priceOptions)}</span>
                  </div>
                  <div className={styles.pricingTableRange}>{tier.rangeLabel}</div>
                </div>
              );
            })}
          </div>

          <div className={styles.pricingSeats}>
            <div className={styles.pricingSeatsRow}>
              <div className={styles.pricingSeatsLabel}>Seats</div>
              <div className={styles.pricingSeatsControls}>
                <div className={styles.pricingSeatsValue}>{normalizedSeats.toLocaleString("en-US")}</div>
              </div>
            </div>

            <input
              className={styles.pricingSeatSlider}
              type="range"
              min={MIN_SEATS}
              max={MAX_SEATS}
              step={1}
              value={normalizedSeats}
              onChange={(e) => setPricingSeats(Math.max(MIN_SEATS, Math.min(MAX_SEATS, Number(e.target.value))))}
              aria-label="Seat count"
            />

            <div className={styles.pricingSeatsHint}>
              Slider shows up to 1,000. For more seats, contact the sales team.
            </div>

            <div className={styles.pricingBilling}>
              <span className={styles.pricingBillingLabel}>Billing</span>
              <div className={styles.pricingBillingToggle}>
                <button
                  type="button"
                  className={`${styles.pricingBillingOption} ${!isAnnualBilling ? styles.pricingBillingActive : ''}`}
                  onClick={() => setPricingBilling("monthly")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={`${styles.pricingBillingOption} ${isAnnualBilling ? styles.pricingBillingActive : ''}`}
                  onClick={() => setPricingBilling("annual")}
                >
                  Annual
                  <span className={styles.pricingBillingSave}>Save {Math.round(annualDiscount * 100)}%</span>
                </button>
              </div>
            </div>
          </div>

          <div className={styles.pricingPrice}>
            {isAnnualBilling && (
              <span className={styles.pricingAmountStrike}>
                {formatUsd(effectiveMonthlyPerSeatBase, {
                  minimumFractionDigits: effectiveMonthlyPerSeatBase % 1 ? 2 : 0,
                  maximumFractionDigits: 2
                })}
              </span>
            )}
            <span className={styles.pricingAmount}>
              {formatUsd(effectiveMonthlyPerSeat, {
                minimumFractionDigits: effectiveMonthlyPerSeat % 1 ? 2 : 0,
                maximumFractionDigits: 2
              })}
            </span>
            <span className={styles.pricingPeriod}>/ seat / month (effective average)</span>
          </div>
          <div className={styles.pricingMeta}>
            <span className={styles.pricingMetaPrimary}>
              {isAnnualBilling
                ? "Annual billing applies a 20% discount to list prices."
                : "Monthly billing selected. Switch to annual to save 20%."}
            </span>
          </div>

          <p className={styles.pricingNote}>
            Pay by card instantly, or work with Sales for invoicing and procurement.
          </p>
          <div className={styles.pricingTierNote}>
            Minimum purchase is 5 seats. Each price applies only to the next block of seats beyond the previous tier.
          </div>
        </div>

        <div className={styles.pricingFeatures}>
            <div className={styles.pricingFeatureGroup}>
              <h4>Platform Features</h4>
              <div className={styles.pricingFeature}>
                <Check size={18} className={styles.pricingCheck} />
                <span>All Stage Gate Features</span>
              </div>
              <div className={styles.pricingFeature}>
                <Check size={18} className={styles.pricingCheck} />
                <span>Advanced Reporting & Analytics</span>
              </div>
              <div className={styles.pricingFeature}>
                <Check size={18} className={styles.pricingCheck} />
                <span>Capacity Planning Suite</span>
              </div>
              <div className={styles.pricingFeature}>
                <Check size={18} className={styles.pricingCheck} />
                <span>Unlimited Initiatives</span>
              </div>
            </div>

            <div className={styles.pricingFeatureGroup}>
              <h4>Security & Compliance</h4>
              <div className={styles.pricingFeature}>
                <Shield size={18} className={styles.pricingCheck} />
                <span>SOC2 Type II Compliant</span>
              </div>
              <div className={styles.pricingFeature}>
                <Shield size={18} className={styles.pricingCheck} />
                <span>Enterprise SSO (SAML/OIDC)</span>
              </div>
              <div className={styles.pricingFeature}>
                <Shield size={18} className={styles.pricingCheck} />
                <span>Data Encryption at Rest & Transit</span>
              </div>
            </div>

            <div className={styles.pricingFeatureGroup}>
              <h4>Support & SLA</h4>
              <div className={styles.pricingFeature}>
                <Clock size={18} className={styles.pricingCheck} />
                <span>99.9% Uptime SLA</span>
              </div>
              <div className={styles.pricingFeature}>
                <Users size={18} className={styles.pricingCheck} />
                <span>Dedicated Customer Success Manager</span>
              </div>
              <div className={styles.pricingFeature}>
                <BarChart3 size={18} className={styles.pricingCheck} />
                <span>Regular Backups & Disaster Recovery</span>
              </div>
            </div>
          </div>

          <div className={styles.pricingCtaRow}>
            <button className={styles.pricingCtaPrimary} type="button" onClick={() => setPricingContactOpen('card')}>
              Pay by card
              <ArrowRight size={18} />
            </button>
            <button className={styles.pricingCtaPrimary} type="button" onClick={() => setPricingContactOpen('sales')}>
              Contact Sales
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

      </section>

      {pricingContactOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={pricingContactOpen === 'sales' ? 'Contact sales form' : 'Card checkout form'}
          onMouseDown={() => setPricingContactOpen(null)}
        >
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>{pricingContactOpen === 'sales' ? 'Contact Sales' : 'Pay by card'}</h3>
                <p className={styles.modalSubtitle}>
                  {pricingContactOpen === 'sales'
                    ? 'Share your details and we will reach out with a quote and procurement options.'
                    : 'In this demo we will collect your request and send a secure checkout link.'}
                </p>
              </div>
              <button className={styles.modalClose} type="button" onClick={() => setPricingContactOpen(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
                          <div className={styles.modalSummary}>
              <div className={styles.modalSummaryRow}>
                <span className={styles.modalSummaryLabel}>Seats</span>
                <div className={styles.modalSeatsControls}>
                  <span className={styles.modalSeatsValue}>{normalizedSeats.toLocaleString("en-US")}</span>
                </div>
              </div>
              <input
                className={styles.modalSeatSlider}
                type="range"
                min={MIN_SEATS}
                max={MAX_SEATS}
                step={1}
                value={normalizedSeats}
                onChange={(e) => setPricingSeats(Math.max(MIN_SEATS, Math.min(MAX_SEATS, Number(e.target.value))))}
                aria-label="Seat count"
              />
              <div className={styles.modalSummaryRow}>
                <span className={styles.modalSummaryLabel}>Billing</span>
                <span className={styles.modalSummaryValue}>
                  {isAnnualBilling ? `Annual (${Math.round(annualDiscount * 100)}% off)` : "Monthly"}
                </span>
              </div>
              <div className={styles.modalSummaryRow}>
                <span className={styles.modalSummaryLabel}>Effective price</span>
                <span className={styles.modalSummaryValue}>
                  {formatUsd(effectiveMonthlyPerSeat, {
                    minimumFractionDigits: effectiveMonthlyPerSeat % 1 ? 2 : 0,
                    maximumFractionDigits: 2
                  })} / seat / month
                </span>
              </div>
              <div className={styles.modalSummaryRow}>
                <span className={styles.modalSummaryLabel}>Total</span>
                <span className={styles.modalSummaryValue}>
                  {formatUsd(totalMonthly)} / month / {formatUsd(totalAnnual)} / year
                </span>
              </div>
              <div className={styles.modalSummaryFootnote}>Minimum purchase: 5 seats.</div>
            </div>

              <form
                className={styles.modalForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPricingContact();
                }}
              >
                <div className={styles.modalGrid}>
                  <label className={styles.modalField}>
                    <span className={styles.modalLabel}>Full name</span>
                    <input
                      className={styles.modalInput}
                      value={pricingContactForm.name}
                      onChange={(e) => setPricingContactForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Jane Doe"
                      required
                    />
                  </label>

                  <label className={styles.modalField}>
                    <span className={styles.modalLabel}>Work email</span>
                    <input
                      className={styles.modalInput}
                      value={pricingContactForm.email}
                      onChange={(e) => setPricingContactForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="jane@company.com"
                      type="email"
                      required
                    />
                  </label>

                  {pricingContactOpen === 'sales' && (
                    <label className={styles.modalField}>
                      <span className={styles.modalLabel}>Company</span>
                      <input
                        className={styles.modalInput}
                        value={pricingContactForm.company}
                        onChange={(e) => setPricingContactForm((prev) => ({ ...prev, company: e.target.value }))}
                        placeholder="Company, Inc."
                        required
                      />
                    </label>
                  )}

                  <label className={`${styles.modalField} ${styles.modalFieldFull}`}>
                    <span className={styles.modalLabel}>
                      {pricingContactOpen === 'sales' ? 'Notes for Sales' : 'Notes'}
                    </span>
                    <textarea
                      className={styles.modalTextarea}
                      value={pricingContactForm.message}
                      onChange={(e) => setPricingContactForm((prev) => ({ ...prev, message: e.target.value }))}
                      placeholder={
                        pricingContactOpen === 'sales'
                          ? 'Preferred procurement flow, SSO requirements, timelines, etc.'
                          : 'Anything we should know before sending a checkout link?'
                      }
                      rows={3}
                    />
                  </label>
                </div>

                {pricingContactStatus === 'error' && <div className={styles.modalError}>{pricingContactError}</div>}
                {pricingContactStatus === 'success' && (
                  <div className={styles.modalSuccess}>
                    Submitted successfully. Reference id: <span className={styles.modalCode}>{pricingContactId}</span>
                  </div>
                )}

                <div className={styles.modalActions}>
                  <button
                    className={styles.modalSubmit}
                    type="submit"
                    disabled={pricingContactStatus === 'submitting' || pricingContactStatus === 'success'}
                  >
                    {pricingContactStatus === 'submitting'
                      ? 'Submitting...'
                      : pricingContactOpen === 'sales'
                        ? 'Submit to Sales'
                        : 'Request checkout link'}
                    <ArrowRight size={18} />
                  </button>
                  <button className={styles.modalCancel} type="button" onClick={() => setPricingContactOpen(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Contact Section */}
      <section id="contact" data-animate className={styles.contactSection}>
        <div className={styles.contactBackground}>
          {/* Light source glow */}
          <div className={styles.contactLightSource} />
          {/* Geometric occluders with shadows */}
          <div className={styles.contactPrism1} />
          <div className={styles.contactPrism2} />
          <div className={styles.contactShard1} />
          <div className={styles.contactShard2} />
          {/* Light rays */}
          <div className={styles.contactRays} />
        </div>

        <div className={`${styles.contactContent} ${visibleSections['contact'] ? styles.visible : ''}`}>
          <h2 className={styles.contactTitle}>Ready to Transform?</h2>
          <p className={styles.contactSubtitle}>
            Get in touch with our team for a personalized demo<br />
            or create a free trial account to explore on your own.
          </p>

          <form className={styles.contactForm} onSubmit={handleDemoSubmit}>
            <div className={styles.contactInputGroup}>
              <Mail size={20} className={styles.contactInputIcon} />
              <input
                type="email"
                name="email"
                placeholder="Enter your work email"
                className={styles.contactInput}
                required
              />
            </div>
            <button type="submit" className={styles.contactSubmit}>
              Get Demo Access
              <ArrowRight size={18} />
            </button>
          </form>

          <div className={styles.contactAlternative}>
            <span>Or schedule a call with our team</span>
            <a href="mailto:hello@laiten.com" className={styles.contactLink}>
              hello@laiten.com
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>L</span>
              Laiten
            </div>
            <p>Enterprise transformation management, streamlined.</p>
          </div>

          <div className={styles.footerLinks}>
            <div className={styles.footerLinkGroup}>
              <h4>Product</h4>
              <a href="#/laiten#hero">Intro</a>
              <a href="#/laiten#features">Features</a>
              <a href="#/laiten#pricing">Pricing</a>
              <a href="#/laiten/contact">Contact</a>
            </div>
            <div className={styles.footerLinkGroup}>
              <h4>Company</h4>
              <a href="#/laiten/about">About Us</a>
              <a href="#/laiten/careers">Careers</a>
              <a href="#/laiten/whats-new">Release notes</a>
            </div>
            <div className={styles.footerLinkGroup}>
              <h4>Legal</h4>
              <a href="#/laiten/privacy">Privacy Policy</a>
              <a href="#/laiten/terms">Terms of Service</a>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>&copy; 2026 Laiten. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};



