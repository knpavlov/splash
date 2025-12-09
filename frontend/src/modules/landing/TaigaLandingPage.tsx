import { useEffect, useRef } from 'react';
import styles from './TaigaLandingPage.module.css'; // Assuming this maps to the CSS file
import { Check, ChevronRight, Layers, TrendingUp, Calendar, ArrowRight } from 'lucide-react';

export const TaigaLandingPage = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Canvas Animation Effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const particles: { x: number; y: number; vx: number; vy: number; size: number }[] = [];
        const particleCount = 100;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2,
            });
        }

        const animate = () => {
            if (!ctx || !canvas) return;
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(0, 255, 157, 0.5)'; // Primary accent color

            particles.forEach((p, i) => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                // Connect particles
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(0, 255, 157, ${0.1 - dist / 1500})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });
            requestAnimationFrame(animate);
        };

        animate();

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const scrollToValues = () => {
        document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.logo}>Taiga</div>
                <button className={styles.authButton} onClick={() => window.location.hash = ''}>
                    Log in
                </button>
            </header>

            {/* Hero Section */}
            <section className={styles.hero}>
                <canvas ref={canvasRef} className={styles.canvasBackground} />
                <div className={styles.heroContent}>
                    <div className={styles.eyebrow}>Introducing Taiga</div>
                    <h1 className={styles.heroTitle}>
                        Transformation management <br />
                        <span className={styles.gradientText}>Streamlined.</span>
                    </h1>
                    <p className={styles.heroSlogan}>
                        The ultimate platform for orchestrating complex initiatives with precision and clarity.
                    </p>
                    <button className={styles.ctaButton} onClick={scrollToValues}>
                        Explore Platform
                    </button>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className={styles.section}>
                <div className={styles.featuresGrid}>
                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}><Layers /></div>
                        <h3 className={styles.featureTitle}>End-to-End Governance</h3>
                        <p className={styles.featureDescription}>
                            Seamless stage-gate management with integrated approvals.
                            Keep everyone aligned with easy-to-use comments and real-time validation.
                        </p>
                        <div className={styles.featureVisual}>
                            Screenshots / Animation Placeholder
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}><TrendingUp /></div>
                        <h3 className={styles.featureTitle}>Transparent Reporting</h3>
                        <p className={styles.featureDescription}>
                            Instant visibility into P&L impact by line item.
                            Track delayed milestones and financial variances with actionable insights.
                        </p>
                        <div className={styles.featureVisual}>
                            Screenshots / Animation Placeholder
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}><Calendar /></div>
                        <h3 className={styles.featureTitle}>Smart Sequencing</h3>
                        <p className={styles.featureDescription}>
                            Advanced capacity planning and initiative sequencing.
                            Ensure resources are allocated effectively across your entire portfolio.
                        </p>
                        <div className={styles.featureVisual}>
                            Screenshots / Animation Placeholder
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className={styles.section}>
                <div className={styles.pricingTable}>
                    <div className={styles.pricingHeader}>
                        <h2>Simple, Transparent Pricing</h2>
                        <div className={styles.priceTag}>
                            $49 <span className={styles.priceSub}>/ account / month</span>
                        </div>
                        <p className={styles.priceSub}>Volume discounts available for large teams.</p>
                    </div>

                    <div className={styles.featureList}>
                        <div className={styles.checkItem}><Check size={18} className={styles.checkIcon} /> Unlimited Projects</div>
                        <div className={styles.checkItem}><Check size={18} className={styles.checkIcon} /> 24/7 Uptime SLA</div>
                        <div className={styles.checkItem}><Check size={18} className={styles.checkIcon} /> SOC2 Security Compliance</div>
                        <div className={styles.checkItem}><Check size={18} className={styles.checkIcon} /> Priority Support</div>
                        <div className={styles.checkItem}><Check size={18} className={styles.checkIcon} /> Advanced Analytics</div>
                        <div className={styles.checkItem}><Check size={18} className={styles.checkIcon} /> Custom API Access</div>
                    </div>
                </div>
            </section>

            {/* Footer / CTA */}
            <footer className={styles.footer}>
                <h2 className={styles.footerTitle}>Ready to transform?</h2>
                <form className={styles.contactForm} onSubmit={(e) => e.preventDefault()}>
                    <input type="email" placeholder="Enter your email" className={styles.input} />
                    <button className={styles.ctaButton}>
                        Get Demo Access <ArrowRight size={20} style={{ marginLeft: 8 }} />
                    </button>
                </form>
                <p style={{ color: '#666', marginTop: '2rem' }}>© {new Date().getFullYear()} Taiga. All rights reserved.</p>
            </footer>
        </div>
    );
};
