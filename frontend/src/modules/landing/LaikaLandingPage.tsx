import { useEffect, useRef, useState } from 'react';
import styles from './LaikaLandingPage.module.css';
import { Check, ArrowRight, ChevronDown } from 'lucide-react';

const useIntersectionObserver = (options = {}) => {
    const [elements, setElements] = useState<HTMLElement[]>([]);
    const [entries, setEntries] = useState<IntersectionObserverEntry[]>([]);

    useEffect(() => {
        if (elements.length === 0) return;

        const observer = new IntersectionObserver((observedEntries) => {
            setEntries(observedEntries);
        }, options);

        elements.forEach(el => observer.observe(el));

        return () => observer.disconnect();
    }, [elements, options]);

    return [setElements, entries] as const;
};

export const LaikaLandingPage = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visibleSections, setVisibleSections] = useState<Record<string, boolean>>({});

    // Animation Observer Setup
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setVisibleSections((prev) => ({
                            ...prev,
                            [entry.target.id]: true,
                        }));
                    }
                });
            },
            { threshold: 0.3 }
        );

        const sections = document.querySelectorAll(`.${styles.featureSection}, .${styles.pricingTable}`);
        sections.forEach((section) => observer.observe(section));

        return () => observer.disconnect();
    }, []);


    // Canvas Animation (Enhanced)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        interface Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;
            color: string;
        }

        const particles: Particle[] = [];
        const particleCount = window.innerWidth < 768 ? 50 : 120;
        const colors = ['rgba(109, 40, 217, 0.5)', 'rgba(14, 165, 233, 0.5)', 'rgba(236, 72, 153, 0.3)'];

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.8,
                vy: (Math.random() - 0.5) * 0.8,
                size: Math.random() * 2 + 0.5,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }

        let mouseX = 0;
        let mouseY = 0;

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };
        window.addEventListener('mousemove', handleMouseMove);

        const animate = () => {
            if (!ctx || !canvas) return;
            ctx.clearRect(0, 0, width, height);

            particles.forEach((p, i) => {
                p.x += p.vx;
                p.y += p.vy;

                // Mouse interaction repulsion
                const dx = p.x - mouseX;
                const dy = p.y - mouseY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 150) {
                    const angle = Math.atan2(dy, dx);
                    p.vx += Math.cos(angle) * 0.02;
                    p.vy += Math.sin(angle) * 0.02;
                }

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                // Speed limit
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (speed > 2) {
                    p.vx = (p.vx / speed) * 2;
                    p.vy = (p.vy / speed) * 2;
                }

                ctx.beginPath();
                ctx.fillStyle = p.color;
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                // Connect particles
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(148, 163, 184, ${0.1 - dist / 1200})`; // Slate-400 equivalent
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
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const scrollToSection = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.logo}>Laika</div>
                <nav className={styles.navLinks}>
                    <span onClick={() => scrollToSection('about')} className={styles.navLink}>Product</span>
                    <span onClick={() => scrollToSection('pricing')} className={styles.navLink}>Pricing</span>
                    <span onClick={() => scrollToSection('contact')} className={styles.navLink}>Contact</span>
                </nav>
                <button className={styles.authButton} onClick={() => window.location.hash = ''}>
                    Log in
                </button>
            </header>

            {/* Hero Section */}
            <section className={styles.hero}>
                <canvas ref={canvasRef} className={styles.canvasBackground} />
                <div className={styles.heroContent}>
                    <div className={styles.eyebrow}>Transformation management - streamlined</div>
                    <h1 className={styles.heroTitle}>
                        Orchestrate your <br />
                        <span className={styles.gradientText}>vision.</span>
                    </h1>
                    <button className={styles.ctaButton} onClick={() => scrollToSection('feature-1')}>
                        Explore Features <ChevronDown />
                    </button>
                </div>
            </section>

            {/* Feature 1 */}
            <section id="feature-1" className={styles.featureSection}>
                <div className={styles.featureContainer}>
                    <div className={`${styles.featureContent} ${visibleSections['feature-1'] ? styles.visible : ''}`}>
                        <div className={styles.featureIndex}>01</div>
                        <h2 className={styles.featureTitle}>End-to-End Governance</h2>
                        <p className={styles.featureDescription}>
                            Comprehensive stage gate management from ideation to delivery.
                            Streamline approvals with built-in stage gates and keep the conversation flowing with
                            easy-to-use context-aware comments.
                        </p>
                        <div className={styles.quote}>
                            "The clarity we gained in just two weeks was unprecedented."
                        </div>
                    </div>
                    <div className={`${styles.featureVisual} ${visibleSections['feature-1'] ? styles.visible : ''}`}>
                        {/* Abstract Stage Gate Visualization */}
                        <div className={styles.visualPlaceholder}>
                            <div className={styles.gateLine} />
                            <div className={styles.gateNode} style={{ left: '20%' }}>G1</div>
                            <div className={styles.gateNode} style={{ left: '50%', background: 'rgba(14, 165, 233, 0.2)', borderColor: '#0ea5e9' }}>G2</div>
                            <div className={styles.gateNode} style={{ left: '80%', background: 'rgba(236, 72, 153, 0.2)', borderColor: '#ec4899' }}>G3</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature 2 */}
            <section id="feature-2" className={`${styles.featureSection} ${styles.reversed}`}>
                <div className={styles.featureContainer}>
                    <div className={`${styles.featureContent} ${visibleSections['feature-2'] ? styles.visible : ''}`}>
                        <div className={styles.featureIndex}>02</div>
                        <h2 className={styles.featureTitle}>Transparent Reporting</h2>
                        <p className={styles.featureDescription}>
                            Super transparent and insightful reporting that cuts through the noise.
                            Visualize P&L impact by line item and gain instant visibility over delayed milestones
                            before they become critical blockers.
                        </p>
                    </div>
                    <div className={`${styles.featureVisual} ${visibleSections['feature-2'] ? styles.visible : ''}`}>
                        {/* Abstract Reporting Visualization */}
                        <div className={styles.visualPlaceholder} style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', padding: '100px 50px' }}>
                            <div style={{ flex: 1, height: '40%', background: '#6d28d9', borderRadius: '8px 8px 0 0' }}></div>
                            <div style={{ flex: 1, height: '70%', background: '#0ea5e9', borderRadius: '8px 8px 0 0' }}></div>
                            <div style={{ flex: 1, height: '55%', background: '#ec4899', borderRadius: '8px 8px 0 0' }}></div>
                            <div style={{ flex: 1, height: '90%', background: '#a78bfa', borderRadius: '8px 8px 0 0' }}></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature 3 */}
            <section id="feature-3" className={styles.featureSection}>
                <div className={styles.featureContainer}>
                    <div className={`${styles.featureContent} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
                        <div className={styles.featureIndex}>03</div>
                        <h2 className={styles.featureTitle}>Capacity Planning</h2>
                        <p className={styles.featureDescription}>
                            Advanced capacity planning and sequencing to ensure your initiatives land when they should.
                            Balance resources and sequence work for maximum impact without burnout.
                        </p>
                    </div>
                    <div className={`${styles.featureVisual} ${visibleSections['feature-3'] ? styles.visible : ''}`}>
                        {/* Abstract sequencing */}
                        <div className={styles.visualPlaceholder} style={{ padding: '60px' }}>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} style={{
                                    height: '40px',
                                    width: `${60 + Math.random() * 40}%`,
                                    background: 'rgba(255,255,255,0.1)',
                                    marginBottom: '20px',
                                    borderRadius: '20px',
                                    marginLeft: `${i * 30}px`,
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, bottom: 0, width: '40%',
                                        background: i % 2 === 0 ? '#0ea5e9' : '#6d28d9', opacity: 0.5
                                    }} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className={styles.pricingSection}>
                <div className={styles.pricingContent}>
                    <div id="pricing-table" className={styles.pricingTable}>
                        <h2 className={styles.featureTitle}>One Simple Plan</h2>
                        <div className={styles.priceTag}>
                            $49 <span className={styles.priceSub}>/ month</span>
                        </div>
                        <p className={styles.priceSub}>Per unique account created. Volume discounts applied automatically.</p>

                        <div className={styles.featureList}>
                            <div className={styles.checkItem}><Check size={20} className={styles.checkIcon} /> All Features Included</div>
                            <div className={styles.checkItem}><Check size={20} className={styles.checkIcon} /> 24/7 Uptime SLA</div>
                            <div className={styles.checkItem}><Check size={20} className={styles.checkIcon} /> SOC2 Security Compliance</div>
                            <div className={styles.checkItem}><Check size={20} className={styles.checkIcon} /> Unlimited Projects</div>
                            <div className={styles.checkItem}><Check size={20} className={styles.checkIcon} /> Priority Support</div>
                            <div className={styles.checkItem}><Check size={20} className={styles.checkIcon} /> Regular Backups</div>
                        </div>

                        <button className={styles.ctaButton} style={{ width: '100%', justifyContent: 'center' }}>
                            Start Your Free Trial
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer / CTA */}
            <footer id="contact" className={styles.footer}>
                <div className={`${styles.featureContent} ${visibleSections['contact'] ? styles.visible : ''}`}>
                    <h2 className={styles.footerTitle}>Ready to start?</h2>
                    <form className={styles.contactForm} onSubmit={(e) => { e.preventDefault(); alert("Thanks for your interest! Demo request sent."); }}>
                        <input type="email" placeholder="Enter your email" className={styles.input} required />
                        <button type="submit" className={styles.ctaButton}>
                            Get Demo Access <ArrowRight size={20} />
                        </button>
                    </form>
                    <p style={{ color: '#64748b', marginTop: '2rem' }}>
                        Laika © {new Date().getFullYear()}. All rights reserved. <br />
                        Designed for modern teams.
                    </p>
                </div>
            </footer>
        </div>
    );
};
