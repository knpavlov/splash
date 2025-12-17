import { ArrowRight } from 'lucide-react';
import landingStyles from '../LaikaProLandingPage.module.css';
import pageStyles from './LaitenSubpages.module.css';
import type { LaitenSiteView } from './laitenSiteView';

const NAV: { href: string; label: string; view: LaitenSiteView }[] = [
  { href: '#/laiten', label: 'Overview', view: 'home' },
  { href: '#/laiten/whats-new', label: "What's New", view: 'whats-new' },
  { href: '#/laiten/about', label: 'About', view: 'about' },
  { href: '#/laiten/careers', label: 'Careers', view: 'careers' }
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
              className={`${landingStyles.navLink} ${item.view === activeView ? landingStyles.navLinkActive : ''}`}
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
              <a href="#/laiten">Overview</a>
              <a href="#/laiten/whats-new">Release notes</a>
              <a href="mailto:hello@laiten.com?subject=Laiten%20Demo%20Request">Request a demo</a>
            </div>
            <div className={landingStyles.footerLinkGroup}>
              <h4>Company</h4>
              <a href="#/laiten/about">About Us</a>
              <a href="#/laiten/careers">Careers</a>
              <a href="mailto:hello@laiten.com">Contact</a>
            </div>
            <div className={landingStyles.footerLinkGroup}>
              <h4>Legal</h4>
              <a href="#/laiten/whats-new">Security</a>
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
            </div>
          </div>
        </div>

        <div className={landingStyles.footerBottom}>
          <p>&copy; {new Date().getFullYear()} Laiten. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
