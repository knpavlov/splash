import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './LaikaProLandingPage.module.css';
import { Check, ArrowRight, ChevronDown, Mail, Shield, Clock, Zap, Users, BarChart3, Sparkles, Calendar, X } from 'lucide-react';
import { InteractivePlanDemo, DemoTask, INITIAL_TASKS } from './components/InteractivePlanDemo';
import { CapacityHeatmapDemo } from './components/CapacityHeatmapDemo';
import { StageGateDemo } from './components/StageGateDemo';
import { ReportingDemo, DemoView, VIEW_OPTIONS } from './components/ReportingDemo';
import { ImplementationMonitoringDemo } from './components/ImplementationMonitoringDemo';
import { apiRequest, ApiError } from '../../shared/api/httpClient';

type HeroPointer = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  down: boolean;
};

export const LaikaProLandingPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [visibleSections, setVisibleSections] = useState<Record<string, boolean>>({});
  const [activeNav, setActiveNav] = useState('hero');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const pointerRef = useRef<HeroPointer>({ x: 0, y: 0, targetX: 0, targetY: 0, active: false, down: false });
  // Shared state for interactive demos
  const [demoTasks, setDemoTasks] = useState<DemoTask[]>(INITIAL_TASKS);
  const [activeReportingView, setActiveReportingView] = useState<DemoView>('pnl-tree');
  const [pricingSeats, setPricingSeats] = useState(150);
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

  const pricingTiers = [
    { minSeats: 50, maxSeats: 200, monthlyPerSeat: 50 },
    { minSeats: 250, maxSeats: 500, monthlyPerSeat: 45 },
    { minSeats: 550, maxSeats: 1000, monthlyPerSeat: 40 },
    { minSeats: 1050, maxSeats: 2000, monthlyPerSeat: 35 }
  ] as const;

  const annualDiscount = 0.2;
  const activePricingTier = pricingTiers.find((t) => pricingSeats >= t.minSeats && pricingSeats <= t.maxSeats) ?? pricingTiers[0];
  const monthlyPerSeat = activePricingTier.monthlyPerSeat;
  const annualPerSeatMonthly = Math.round(monthlyPerSeat * (1 - annualDiscount));
  const estimatedMonthly = annualPerSeatMonthly * pricingSeats;
  const estimatedAnnual = estimatedMonthly * 12;

  const formatUsd = (value: number) => {
    return `$${value.toLocaleString('en-US')}`;
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
      seats: pricingSeats,
      annualBilling: true,
      annualDiscountPercent: Math.round(annualDiscount * 100),
      pricing: {
        tier: { minSeats: activePricingTier.minSeats, maxSeats: activePricingTier.maxSeats },
        monthlyPerSeat,
        annualPerSeatMonthly
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
    activePricingTier.maxSeats,
    activePricingTier.minSeats,
    annualDiscount,
    annualPerSeatMonthly,
    monthlyPerSeat,
    pricingContactForm.company,
    pricingContactForm.email,
    pricingContactForm.message,
    pricingContactForm.name,
    pricingContactOpen,
    pricingSeats
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
      setScrollY(window.scrollY);
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

  // Hero Canvas Animation - Interactive Aurora Flow Field
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const pointer = pointerRef.current;

    type Particle = {
      x: number;
      y: number;
      px: number;
      py: number;
      vx: number;
      vy: number;
      hue: number;
      w: number;
    };

    type Pulse = { x: number; y: number; startedAt: number; strength: number };
    const pulses: Pulse[] = [];

    const ribbons = Array.from({ length: 3 }, (_, i) => ({
      seed: Math.random() * 10_000,
      phase: Math.random() * Math.PI * 2,
      hue: 200 + i * 70 + Math.random() * 10
    }));

    const particles: Particle[] = [];
    const spawnParticle = (x: number, y: number, burst = false) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = burst ? 2.4 + Math.random() * 2.2 : 0.6 + Math.random() * 1.4;
      const hue = 200 + Math.random() * 120;
      particles.push({
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hue,
        w: 0.8 + Math.random() * 1.8
      });
    };

    let width = 1;
    let height = 1;
    let dpr = 1;
    let canvasRect = canvas.getBoundingClientRect();
    let baseGradient: CanvasGradient | null = null;

    const resize = () => {
      canvasRect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(canvasRect.width));
      height = Math.max(1, Math.floor(canvasRect.height));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, '#050816');
      baseGradient.addColorStop(0.45, '#030712');
      baseGradient.addColorStop(1, '#070a16');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = baseGradient;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      if (!pointer.x && !pointer.y) {
        pointer.x = width * 0.62;
        pointer.y = height * 0.42;
        pointer.targetX = pointer.x;
        pointer.targetY = pointer.y;
      }

      const desired = Math.min(260, Math.max(120, Math.floor((width * height) / 6500)));
      while (particles.length < desired) {
        spawnParticle(Math.random() * width, Math.random() * height);
      }
      if (particles.length > desired) {
        particles.splice(desired);
      }
    };

    const host = (heroRef.current as unknown as HTMLElement | null) ?? canvas;

    const updatePointerTarget = (event: PointerEvent) => {
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
      for (let i = 0; i < 26; i += 1) {
        spawnParticle(pointer.targetX + (Math.random() - 0.5) * 18, pointer.targetY + (Math.random() - 0.5) * 18, true);
      }
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

    const fieldVector = (x: number, y: number, t: number) => {
      const nx = x * 0.0018;
      const ny = y * 0.0018;
      const base =
        Math.sin(nx * 1.9 + t * 0.75) +
        Math.cos(ny * 2.2 - t * 0.62) +
        Math.sin((nx + ny) * 1.1 - t * 0.48) +
        Math.cos((nx - ny) * 1.3 + t * 0.35);

      let angle = base * Math.PI;
      let fx = Math.cos(angle);
      let fy = Math.sin(angle);

      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const dist2 = dx * dx + dy * dy;
      if (pointer.active && dist2 < 420_000) {
        const inv = 1 / Math.sqrt(dist2 + 1);
        const spin = (pointer.down ? 2.0 : 1.25) * (1 / (1 + dist2 / 90_000));
        fx += (-dy * inv) * spin;
        fy += (dx * inv) * spin;
      }

      for (let i = 0; i < pulses.length; i += 1) {
        const p = pulses[i];
        const age = (t - p.startedAt) / 1000;
        if (age > 1.4) continue;
        const radius = 80 + age * 420;
        const pdx = x - p.x;
        const pdy = y - p.y;
        const d = Math.sqrt(pdx * pdx + pdy * pdy);
        const band = Math.max(0, 1 - Math.abs(d - radius) / 120);
        if (band > 0) {
          const inv = 1 / (d + 1);
          const push = (p.strength * band) / (1 + d * 0.01);
          fx += pdx * inv * push;
          fy += pdy * inv * push;
        }
      }

      return { fx, fy };
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#050816');
      gradient.addColorStop(0.5, '#030712');
      gradient.addColorStop(1, '#070a16');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      ribbons.forEach((r, idx) => {
        const g = ctx.createLinearGradient(0, 0, width, 0);
        g.addColorStop(0, `hsla(${r.hue}, 85%, 62%, 0)`);
        g.addColorStop(0.35, `hsla(${r.hue}, 90%, 62%, 0.18)`);
        g.addColorStop(0.65, `hsla(${r.hue + 40}, 92%, 64%, 0.18)`);
        g.addColorStop(1, `hsla(${r.hue + 60}, 85%, 62%, 0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 110 - idx * 18;
        ctx.shadowBlur = 80;
        ctx.shadowColor = `hsla(${r.hue}, 90%, 62%, 0.28)`;
        ctx.beginPath();
        const baseY = height * (0.25 + idx * 0.18);
        for (let x = -80; x <= width + 80; x += 40) {
          const y = baseY + Math.sin(x * 0.006 + r.phase) * (height * 0.05) + Math.cos(x * 0.003 + r.seed) * (height * 0.03);
          if (x === -80) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
    };

    resize();

    if (prefersReducedMotion) {
      drawStatic();
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

    let lastFrame = performance.now();

    const animate = (now: number) => {
      const dt = Math.min(48, now - lastFrame);
      lastFrame = now;

      if (!pointer.active) {
        pointer.targetX = width * 0.62 + Math.sin(now * 0.00035) * width * 0.06;
        pointer.targetY = height * 0.42 + Math.cos(now * 0.0003) * height * 0.05;
      }
      pointer.x += (pointer.targetX - pointer.x) * 0.12;
      pointer.y += (pointer.targetY - pointer.y) * 0.12;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = baseGradient ?? '#030712';
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      const t = now;

      ctx.globalCompositeOperation = 'lighter';
      ribbons.forEach((r, idx) => {
        const baseY = height * (0.22 + idx * 0.2) + Math.sin(t * 0.00025 + r.phase) * height * 0.04;
        const g = ctx.createLinearGradient(0, 0, width, 0);
        g.addColorStop(0, `hsla(${r.hue}, 90%, 62%, 0)`);
        g.addColorStop(0.3, `hsla(${r.hue}, 95%, 64%, 0.14)`);
        g.addColorStop(0.6, `hsla(${r.hue + 50}, 95%, 66%, 0.16)`);
        g.addColorStop(1, `hsla(${r.hue + 80}, 90%, 62%, 0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 120 - idx * 18;
        ctx.shadowBlur = 90;
        ctx.shadowColor = `hsla(${r.hue}, 95%, 62%, 0.22)`;
        ctx.beginPath();
        for (let x = -90; x <= width + 90; x += 38) {
          const y =
            baseY +
            Math.sin(x * 0.006 + t * 0.00055 + r.phase) * (height * 0.055) +
            Math.cos(x * 0.003 + t * 0.00042 + r.seed) * (height * 0.032) +
            Math.sin(x * 0.0015 - t * 0.0006) * (height * 0.018);
          if (x === -90) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      ctx.shadowBlur = 0;
      ctx.lineCap = 'round';
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.px = p.x;
        p.py = p.y;

        const { fx, fy } = fieldVector(p.x, p.y, t);
        p.vx = p.vx * 0.86 + fx * (0.55 + dt * 0.008);
        p.vy = p.vy * 0.86 + fy * (0.55 + dt * 0.008);

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = pointer.down ? 5.2 : 3.8;
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -60) p.x = width + 60;
        if (p.x > width + 60) p.x = -60;
        if (p.y < -60) p.y = height + 60;
        if (p.y > height + 60) p.y = -60;

        const alpha = Math.min(0.22, 0.06 + speed * 0.035);
        ctx.strokeStyle = `hsla(${p.hue + t * 0.01}, 92%, 70%, ${alpha})`;
        ctx.lineWidth = p.w * (0.8 + speed * 0.12);
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const p = pulses[i];
        const age = (t - p.startedAt) / 1000;
        if (age > 1.4) {
          pulses.splice(i, 1);
          continue;
        }
        const radius = 80 + age * 520;
        const alpha = Math.max(0, 1 - age / 1.4);
        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerenter', handlePointerEnter);
      host.removeEventListener('pointerleave', handlePointerLeave);
      host.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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
          style={{ transform: `translateY(${scrollY * 0.4}px)`, opacity: Math.max(0, 1 - scrollY / 600) }}
        >
          <div className={styles.heroBadge}>
            <Zap size={14} />
            Enterprise-Ready Platform
          </div>

          <h1 className={styles.heroTitle}>
            <span
              className={styles.heroTitleLine}
              style={{ transform: `translateX(${scrollY * -0.1}px)` }}
            >
              Transformation
            </span>
            <br />
            <span
              className={styles.heroTitleAccent}
              style={{ transform: `translateX(${scrollY * 0.15}px)` }}
            >
              Streamlined.
            </span>
          </h1>

          <p className={styles.heroSubtitle}>
            The complete platform for managing enterprise transformation initiatives.
            From stage gates to capacity planning - all in one place.
          </p>

          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={() => scrollToSection('contact')}>
              Request Demo
              <ArrowRight size={18} />
            </button>
            <button className={styles.ctaSecondary} onClick={() => scrollToSection('features')}>
              Explore Features
              <ChevronDown size={18} />
            </button>
          </div>

          <div className={styles.heroHint}>
            <span className={styles.heroHintKey}>Try it:</span> move your cursor to bend the flow · click to send a pulse
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
          style={{ opacity: Math.max(0, 1 - scrollY / 200) }}
        >
          <ChevronDown size={24} />
        </div>
      </section>

      {/* Features Anchor */}
      <div id="features" style={{ position: 'relative', top: '-80px' }} />

      {/* Feature 1: Stage Gate Management - Interactive Demo Style */}
      <section id="feature-1" data-animate className={`${styles.featureSection} ${styles.featureSectionDemo}`}>
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
              workflows with ease while maintaining full audit trails and compliance.
            </p>

            <ul className={styles.featureList}>
              <li><Check size={18} /> Customizable stage gate workflows</li>
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
        <div className={styles.interactiveDemoLayout}>
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
                  <span className={styles.dashboardOptionTitle}>{option.title}</span>
                  <ArrowRight size={16} className={styles.dashboardOptionArrow} />
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
        <div className={styles.interactiveDemoLayout}>
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
              <li><Check size={18} /> Visual capacity heatmaps</li>
              <li><Check size={18} /> Drag-and-drop sequencing</li>
              <li><Check size={18} /> Resource conflict detection</li>
              <li><Check size={18} /> What-if scenario planning</li>
            </ul>
          </div>

          {/* Right - Interactive Demo */}
          <div className={`${styles.interactiveDemoWrapper} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
            <InteractivePlanDemo onTasksChange={setDemoTasks} />
          </div>
        </div>

        {/* 3b: Capacity Heatmap Demo */}
        <div className={styles.heatmapDemoSection}>
          <div className={`${styles.heatmapDemoWrapper} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
            <CapacityHeatmapDemo tasks={demoTasks} />
          </div>
        </div>
      </section>

      {/* Feature 4: Implementation Monitoring */}
      <section id="feature-4" data-animate className={`${styles.featureSection} ${styles.featureSectionDemo}`}>
        <div className={styles.interactiveDemoLayout}>
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
          <div className={styles.featuresMarqueeBadge}>
            <Sparkles size={14} />
            And Much More
          </div>
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
            <p className={styles.changelogSubtitle}>We ship new features and improvements every week</p>
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
            One subscription. Pricing is determined by seat count - volume discounts apply automatically.
          </p>
        </div>

        <div className={`${styles.pricingCard} ${visibleSections['pricing'] ? styles.visible : ''}`}>
          <div className={styles.pricingCardHeader}>
            <div className={styles.pricingBadge}>Annual billing</div>
            <h3 className={styles.pricingPlanName}>One plan. Priced by seats.</h3>

            <div className={styles.pricingSeats}>
              <div className={styles.pricingSeatsRow}>
                <div className={styles.pricingSeatsLabel}>Seats</div>
                <div className={styles.pricingSeatsControls}>
                  <button
                    type="button"
                    className={styles.pricingSeatBtn}
                    onClick={() => setPricingSeats((prev) => Math.max(50, prev - 50))}
                    aria-label="Decrease seats"
                  >
                    -50
                  </button>
                  <div className={styles.pricingSeatsValue}>{pricingSeats.toLocaleString('en-US')}</div>
                  <button
                    type="button"
                    className={styles.pricingSeatBtn}
                    onClick={() => setPricingSeats((prev) => Math.min(2000, prev + 50))}
                    aria-label="Increase seats"
                  >
                    +50
                  </button>
                </div>
              </div>

              <input
                className={styles.pricingSeatSlider}
                type="range"
                min={50}
                max={2000}
                step={50}
                value={pricingSeats}
                onChange={(e) => setPricingSeats(Number(e.target.value))}
                aria-label="Seat count"
              />

              <div className={styles.pricingTierNote}>
                Tier: {activePricingTier.minSeats.toLocaleString('en-US')}-{activePricingTier.maxSeats.toLocaleString('en-US')} seats ·{' '}
                {formatUsd(annualPerSeatMonthly)} / seat / month billed annually
              </div>
            </div>

            <div className={styles.pricingPrice}>
              <span className={styles.pricingCurrency}>$</span>
              <span className={styles.pricingAmount}>{annualPerSeatMonthly}</span>
              <span className={styles.pricingPeriod}>/ seat / month</span>
            </div>
            <div className={styles.pricingMeta}>
              <span className={styles.pricingMetaPrimary}>Billed annually · Save {Math.round(annualDiscount * 100)}%</span>
              <span className={styles.pricingMetaSecondary}>
                Equivalent to {formatUsd(monthlyPerSeat)} / seat / month on monthly billing
              </span>
            </div>
            <p className={styles.pricingNote}>
              Estimated total: <strong>{formatUsd(estimatedMonthly)}</strong> / month · {formatUsd(estimatedAnnual)} billed yearly
            </p>
            <p className={styles.pricingNote}>
              Pay by card instantly, or work with Sales for invoicing and procurement.
            </p>
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
            <button className={styles.pricingCtaSecondary} type="button" onClick={() => setPricingContactOpen('sales')}>
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
                    <button
                      type="button"
                      className={styles.modalSeatBtn}
                      onClick={() => setPricingSeats((prev) => Math.max(50, prev - 50))}
                      aria-label="Decrease seats"
                    >
                      -50
                    </button>
                    <span className={styles.modalSeatsValue}>{pricingSeats.toLocaleString('en-US')}</span>
                    <button
                      type="button"
                      className={styles.modalSeatBtn}
                      onClick={() => setPricingSeats((prev) => Math.min(2000, prev + 50))}
                      aria-label="Increase seats"
                    >
                      +50
                    </button>
                  </div>
                </div>
                <div className={styles.modalSummaryRow}>
                  <span className={styles.modalSummaryLabel}>Price</span>
                  <span className={styles.modalSummaryValue}>
                    {formatUsd(annualPerSeatMonthly)} / seat / month · billed annually ({Math.round(annualDiscount * 100)}% off)
                  </span>
                </div>
                <div className={styles.modalSummaryRow}>
                  <span className={styles.modalSummaryLabel}>Estimated</span>
                  <span className={styles.modalSummaryValue}>
                    {formatUsd(estimatedMonthly)} / month · {formatUsd(estimatedAnnual)} / year
                  </span>
                </div>
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
          <div className={styles.contactOrb1} />
          <div className={styles.contactOrb2} />
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
              <span onClick={() => scrollToSection('feature-1')}>Stage Gates</span>
              <span onClick={() => scrollToSection('feature-2')}>Reporting</span>
              <span onClick={() => scrollToSection('feature-3')}>Capacity Planning</span>
              <span onClick={() => scrollToSection('feature-4')}>Execution Monitoring</span>
              <a href="#/laiten/whats-new">Release notes</a>
            </div>
            <div className={styles.footerLinkGroup}>
              <h4>Company</h4>
              <a href="#/laiten/about">About Us</a>
              <a href="#/laiten/careers">Careers</a>
              <span onClick={() => scrollToSection('contact')}>Contact</span>
            </div>
            <div className={styles.footerLinkGroup}>
              <h4>Legal</h4>
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>Security</span>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>&copy; {new Date().getFullYear()} Laiten. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
