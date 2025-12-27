import { ArrowRight } from 'lucide-react';
import landingStyles from '../LaikaProLandingPage.module.css';
import pageStyles from './LaitenSubpages.module.css';
import type { LaitenSiteView } from './laitenSiteView';

const NAV: { href: string; label: string; activeWhen?: Exclude<LaitenSiteView, 'home'> }[] = [
  { href: '#/laiten#hero', label: 'Intro' },
  { href: '#/laiten#features', label: 'Features' },
  { href: '#/laiten#pricing', label: 'Pricing' },
  { href: '#/laiten#contact', label: 'Contact' },
  { href: '#/laiten/about', label: 'About', activeWhen: 'about' },
  { href: '#/laiten/careers', label: 'Careers', activeWhen: 'careers' }
];

export const LaitenPageLayout = ({
  activeView,
  children
}: {
  activeView: Exclude<LaitenSiteView, 'home'>;
  children: React.ReactNode;
}) => {
  return (
    <div className={landingStyles.container}>
      <header className={landingStyles.header}>
        <a href="#/laiten" className={`${landingStyles.logo} ${pageStyles.logoLink}`}>
          <span className={landingStyles.logoIcon}>L</span>
          Laiten
        </a>
        <nav className={landingStyles.navLinks} aria-label="Laiten">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`${landingStyles.navLink} ${item.activeWhen === activeView ? landingStyles.navLinkActive : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button className={landingStyles.loginButton} onClick={() => (window.location.hash = '')}>
          Log in
          <ArrowRight size={16} />
        </button>
      </header>

      <main className={pageStyles.pageMain}>{children}</main>

      <footer className={landingStyles.footer}>
        <div className={landingStyles.footerContent}>
          <div className={landingStyles.footerBrand}>
            <a href="#/laiten" className={`${landingStyles.logo} ${pageStyles.logoLink}`}>
              <span className={landingStyles.logoIcon}>L</span>
              Laiten
            </a>
            <p>Enterprise transformation management, streamlined.</p>
          </div>

          <div className={landingStyles.footerLinks}>
            <div className={landingStyles.footerLinkGroup}>
              <h4>Product</h4>
              <a href="#/laiten#hero">Intro</a>
              <a href="#/laiten#features">Features</a>
              <a href="#/laiten#pricing">Pricing</a>
              <a href="#/laiten/contact">Contact</a>
            </div>
            <div className={landingStyles.footerLinkGroup}>
              <h4>Company</h4>
              <a href="#/laiten/about">About Us</a>
              <a href="#/laiten/careers">Careers</a>
              <a href="#/laiten/whats-new">Release notes</a>
            </div>
            <div className={landingStyles.footerLinkGroup}>
              <h4>Legal</h4>
              <a href="#/laiten/privacy">Privacy Policy</a>
              <a href="#/laiten/terms">Terms of Service</a>
            </div>
          </div>
        </div>

        <div className={landingStyles.footerBottom}>
          <p>&copy; 2026 Laiten. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
