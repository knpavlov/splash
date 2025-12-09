import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './LaikaProLandingPage.module.css';
import { Check, ArrowRight, ChevronDown, Mail, Shield, Clock, Zap, Users, BarChart3, Image } from 'lucide-react';

// Screenshot placeholders - replace with actual paths when available
const screenshot1 = '';
const screenshot2 = '';
const screenshot3 = '';

interface GlowOrb {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  size: number;
  color: string;
  speed: number;
}

export const LaikaProLandingPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [visibleSections, setVisibleSections] = useState<Record<string, boolean>>({});
  const [activeNav, setActiveNav] = useState('hero');
  const [scrollProgress, setScrollProgress] = useState(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const orbsRef = useRef<GlowOrb[]>([]);

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

  // Scroll progress indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / scrollHeight) * 100;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Epic Canvas Animation - Flowing Gradient Mesh with Orbs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Initialize glowing orbs
    const colors = [
      'rgba(139, 92, 246, 0.6)',   // Violet
      'rgba(59, 130, 246, 0.5)',   // Blue
      'rgba(236, 72, 153, 0.4)',   // Pink
      'rgba(34, 211, 238, 0.4)',   // Cyan
      'rgba(168, 85, 247, 0.5)',   // Purple
    ];

    orbsRef.current = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      targetX: Math.random() * width,
      targetY: Math.random() * height,
      size: 200 + Math.random() * 300,
      color: colors[i % colors.length],
      speed: 0.002 + Math.random() * 0.003
    }));

    // Particle system for sparkles
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
    }

    const particles: Particle[] = [];
    const maxParticles = 80;

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };

      // Spawn particles near mouse
      if (particles.length < maxParticles && Math.random() > 0.7) {
        particles.push({
          x: e.clientX + (Math.random() - 0.5) * 40,
          y: e.clientY + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2 - 1,
          life: 1,
          maxLife: 60 + Math.random() * 60,
          size: 1 + Math.random() * 2
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.fillStyle = 'rgba(3, 7, 18, 1)';
      ctx.fillRect(0, 0, width, height);

      // Draw flowing gradient orbs
      orbsRef.current.forEach((orb) => {
        // Move orb towards target with smooth interpolation
        orb.x += (orb.targetX - orb.x) * orb.speed;
        orb.y += (orb.targetY - orb.y) * orb.speed;

        // Mouse influence
        const dx = mouseRef.current.x - orb.x;
        const dy = mouseRef.current.y - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 400) {
          orb.x += dx * 0.01;
          orb.y += dy * 0.01;
        }

        // Update target periodically
        if (Math.random() < 0.002) {
          orb.targetX = Math.random() * width;
          orb.targetY = Math.random() * height;
        }

        // Draw gradient orb
        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.size
        );
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(0.5, orb.color.replace(/[\d.]+\)$/, '0.2)'));
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw and update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // gravity
        p.life++;

        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw grid lines with gradient
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 60;

      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
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
          LaikaPro
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
            className={`${styles.navLink} ${activeNav === 'feature-1' || activeNav === 'feature-2' || activeNav === 'feature-3' ? styles.navLinkActive : ''}`}
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
        </nav>
        <button className={styles.loginButton} onClick={() => window.location.hash = ''}>
          Log in
          <ArrowRight size={16} />
        </button>
      </header>

      {/* Hero Section */}
      <section id="hero" data-animate ref={heroRef} className={styles.hero}>
        <canvas ref={canvasRef} className={styles.canvasBackground} />

        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <Zap size={14} />
            Enterprise-Ready Platform
          </div>

          <h1 className={styles.heroTitle}>
            Transformation<br />
            <span className={styles.heroTitleAccent}>Streamlined.</span>
          </h1>

          <p className={styles.heroSubtitle}>
            The complete platform for managing enterprise transformation initiatives.
            From stage gates to capacity planning — all in one place.
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

          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>50+</span>
              <span className={styles.heroStatLabel}>Enterprise Clients</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>99.9%</span>
              <span className={styles.heroStatLabel}>Uptime SLA</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>SOC2</span>
              <span className={styles.heroStatLabel}>Compliant</span>
            </div>
          </div>
        </div>

        <div className={styles.scrollIndicator} onClick={() => scrollToSection('features')}>
          <ChevronDown size={24} />
        </div>
      </section>

      {/* Features Anchor */}
      <div id="features" style={{ position: 'relative', top: '-80px' }} />

      {/* Feature 1: Stage Gate Management */}
      <section id="feature-1" data-animate className={styles.featureSection}>
        <div className={styles.featureContainer}>
          <div className={`${styles.featureContent} ${visibleSections['feature-1'] ? styles.visible : ''}`}>
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

            <blockquote className={styles.featureQuote}>
              <p>"The clarity we gained in just two weeks was unprecedented. LaikaPro transformed how we manage our transformation portfolio."</p>
              <cite>— Sarah Chen, VP Digital Transformation, Fortune 500</cite>
            </blockquote>
          </div>

          <div className={`${styles.featureVisuals} ${visibleSections['feature-1'] ? styles.visible : ''}`}>
            <div className={styles.screenshotMain}>
              {screenshot1 ? (
                <img src={screenshot1} alt="Stage Gate Management" className={styles.screenshot} />
              ) : (
                <div className={styles.screenshotPlaceholderLarge}>
                  <Image size={48} />
                  <span>Stage Gate Interface</span>
                  <span className={styles.placeholderHint}>Screenshot placeholder</span>
                </div>
              )}
              <div className={styles.screenshotGlow} />
            </div>
            <div className={styles.screenshotSecondary}>
              <div className={styles.screenshotPlaceholder}>
                <span>Approval Flow</span>
              </div>
              <div className={styles.screenshotPlaceholder}>
                <span>Comments View</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 2: Reporting */}
      <section id="feature-2" data-animate className={`${styles.featureSection} ${styles.featureSectionAlt}`}>
        <div className={`${styles.featureContainer} ${styles.featureContainerReversed}`}>
          <div className={`${styles.featureContent} ${visibleSections['feature-2'] ? styles.visible : ''}`}>
            <div className={styles.featureNumber}>02</div>
            <div className={styles.featureLabel}>Insights</div>
            <h2 className={styles.featureTitle}>
              Transparent &<br />Insightful Reporting
            </h2>
            <p className={styles.featureDescription}>
              Cut through the noise with crystal-clear reporting. Track P&L impact by
              line item, spot delayed milestones before they become blockers, and make
              data-driven decisions with confidence.
            </p>

            <ul className={styles.featureList}>
              <li><Check size={18} /> Real-time P&L impact visualization</li>
              <li><Check size={18} /> Milestone delay tracking & alerts</li>
              <li><Check size={18} /> Custom dashboards & reports</li>
              <li><Check size={18} /> Executive summary generation</li>
            </ul>

            <blockquote className={styles.featureQuote}>
              <p>"Finally, a reporting tool that executives actually want to use. The insights are invaluable for our board meetings."</p>
              <cite>— Michael Torres, CFO, Global Enterprise</cite>
            </blockquote>
          </div>

          <div className={`${styles.featureVisuals} ${visibleSections['feature-2'] ? styles.visible : ''}`}>
            <div className={styles.screenshotMain}>
              {screenshot2 ? (
                <img src={screenshot2} alt="Reporting Dashboard" className={styles.screenshot} />
              ) : (
                <div className={styles.screenshotPlaceholderLarge}>
                  <Image size={48} />
                  <span>Reporting Dashboard</span>
                  <span className={styles.placeholderHint}>Screenshot placeholder</span>
                </div>
              )}
              <div className={styles.screenshotGlow} />
            </div>
            <div className={styles.screenshotSecondary}>
              <div className={styles.screenshotPlaceholder}>
                <span>P&L Impact</span>
              </div>
              <div className={styles.screenshotPlaceholder}>
                <span>Milestone Tracking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3: Capacity Planning */}
      <section id="feature-3" data-animate className={styles.featureSection}>
        <div className={styles.featureContainer}>
          <div className={`${styles.featureContent} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
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

            <blockquote className={styles.featureQuote}>
              <p>"We reduced planning cycle time by 60% and eliminated resource conflicts entirely. Game changer."</p>
              <cite>— Jennifer Park, Director PMO, Tech Company</cite>
            </blockquote>
          </div>

          <div className={`${styles.featureVisuals} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
            <div className={styles.screenshotMain}>
              {screenshot3 ? (
                <img src={screenshot3} alt="Capacity Planning" className={styles.screenshot} />
              ) : (
                <div className={styles.screenshotPlaceholderLarge}>
                  <Image size={48} />
                  <span>Capacity Heatmap</span>
                  <span className={styles.placeholderHint}>Screenshot placeholder</span>
                </div>
              )}
              <div className={styles.screenshotGlow} />
            </div>
            <div className={styles.screenshotSecondary}>
              <div className={styles.screenshotPlaceholder}>
                <span>Timeline View</span>
              </div>
              <div className={styles.screenshotPlaceholder}>
                <span>Resource Allocation</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" data-animate className={styles.pricingSection}>
        <div className={styles.pricingHeader}>
          <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
          <p className={styles.sectionSubtitle}>
            One plan, all features included. Volume discounts applied automatically.
          </p>
        </div>

        <div className={`${styles.pricingCard} ${visibleSections['pricing'] ? styles.visible : ''}`}>
          <div className={styles.pricingCardHeader}>
            <div className={styles.pricingBadge}>Most Popular</div>
            <h3 className={styles.pricingPlanName}>Enterprise</h3>
            <div className={styles.pricingPrice}>
              <span className={styles.pricingCurrency}>$</span>
              <span className={styles.pricingAmount}>49</span>
              <span className={styles.pricingPeriod}>/ user / month</span>
            </div>
            <p className={styles.pricingNote}>Volume discounts available for 50+ users</p>
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

          <button className={styles.pricingCta} onClick={() => scrollToSection('contact')}>
            Start Free Trial
            <ArrowRight size={18} />
          </button>
        </div>

        <div className={styles.pricingTrust}>
          <p>Trusted by transformation leaders at</p>
          <div className={styles.trustLogos}>
            <div className={styles.trustLogo}>Fortune 500</div>
            <div className={styles.trustLogo}>Global Bank</div>
            <div className={styles.trustLogo}>Tech Giant</div>
            <div className={styles.trustLogo}>Consulting Firm</div>
          </div>
        </div>
      </section>

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
            <a href="mailto:hello@laikapro.com" className={styles.contactLink}>
              hello@laikapro.com
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
              LaikaPro
            </div>
            <p>Enterprise transformation management, streamlined.</p>
          </div>

          <div className={styles.footerLinks}>
            <div className={styles.footerLinkGroup}>
              <h4>Product</h4>
              <span onClick={() => scrollToSection('feature-1')}>Stage Gates</span>
              <span onClick={() => scrollToSection('feature-2')}>Reporting</span>
              <span onClick={() => scrollToSection('feature-3')}>Capacity Planning</span>
            </div>
            <div className={styles.footerLinkGroup}>
              <h4>Company</h4>
              <span>About Us</span>
              <span>Careers</span>
              <span>Contact</span>
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
          <p>&copy; {new Date().getFullYear()} LaikaPro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
