import { ArrowRight, BarChart3, Compass, Shield, Sparkles, Users } from 'lucide-react';
import pageStyles from './LaitenSubpages.module.css';
import { LaitenPageLayout } from './LaitenPageLayout';

export const LaitenAboutPage = () => {
  return (
    <LaitenPageLayout activeView="about">
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroSurface}>
          <div className={pageStyles.heroGrid}>
            <div>
              <div className={pageStyles.badge}>
                <Sparkles size={16} />
                About Laiten
              </div>
              <h1 className={pageStyles.title}>We built Laiten to make transformation feel… manageable.</h1>
              <p className={pageStyles.lede}>
                We’re a small team of developers and former management consultants based in Sydney.
                After years of running and rescuing programs inside large organisations, we kept seeing the same pattern:
                strategy was clear, intentions were good, but execution lived in spreadsheets, status decks, and fragmented tooling.
              </p>
              <p className={pageStyles.lede}>
                Laiten is our answer: a single place where governance, delivery, capacity, and value stay connected—so teams can make
                decisions with evidence, not noise.
              </p>

              <div className={pageStyles.heroActions}>
                <a href="mailto:hello@laiten.com?subject=Hello%20Laiten" className={pageStyles.ctaPrimary}>
                  Talk to the team <ArrowRight size={18} />
                </a>
                <a href="#/laiten/whats-new" className={pageStyles.ctaSecondary}>
                  See what’s new <ArrowRight size={18} />
                </a>
              </div>
            </div>

            <aside className={pageStyles.heroSideCard}>
              <div className={pageStyles.heroSideTitle}>
                <h3>Why we’re credible</h3>
                <span>Sydney, AU</span>
              </div>
              <ul className={pageStyles.heroSideList}>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Users size={18} />
                  </span>
                  Ex-consultants who have owned stage-gates, benefits cases, and steering committees.
                </li>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <BarChart3 size={18} />
                  </span>
                  Builders who obsess over traceability—from initiative to KPI to financial impact.
                </li>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Shield size={18} />
                  </span>
                  We ship enterprise-grade foundations: audit trail, security controls, and governance workflows.
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>What we saw (and why we started)</h2>
            <p className={pageStyles.sectionSubtitle}>
              Organisations don’t fail at ideas. They fail at visibility, trade-offs, and follow-through—especially when portfolios scale.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid3}>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>
              <span className={pageStyles.heroSideIcon}>
                <Compass size={18} />
              </span>
              “Status theatre”
            </h3>
            <p className={pageStyles.cardBody}>
              Weekly updates drift into storytelling. Evidence is scattered, and decisions get delayed.
            </p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>
              <span className={pageStyles.heroSideIcon}>
                <BarChart3 size={18} />
              </span>
              Value without traceability
            </h3>
            <p className={pageStyles.cardBody}>
              Benefits cases exist—until delivery reality changes. The link between scope, value, and assumptions breaks.
            </p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>
              <span className={pageStyles.heroSideIcon}>
                <Users size={18} />
              </span>
              Capacity is invisible
            </h3>
            <p className={pageStyles.cardBody}>
              Teams can’t see overload early. Critical work silently slips, and risk shows up too late.
            </p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>How Laiten helps</h2>
            <p className={pageStyles.sectionSubtitle}>
              We combine the discipline of consulting with the ergonomics of modern product design.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid2}>
          <div className={pageStyles.callout}>
            <h3>Governance that doesn’t slow you down</h3>
            <p>
              Stage-gates, approvals, and audit-ready logging—without the overhead. Keep teams aligned while preserving autonomy.
            </p>
            <div className={pageStyles.pillRow}>
              <span className={pageStyles.pill}>Stage gates</span>
              <span className={pageStyles.pill}>Approvals</span>
              <span className={pageStyles.pill}>Audit trail</span>
            </div>
          </div>
          <div className={pageStyles.callout}>
            <h3>Decisions powered by real signal</h3>
            <p>
              Reporting that connects delivery progress to portfolio outcomes—so steering committees can focus on trade-offs, not data wrangling.
            </p>
            <div className={pageStyles.pillRow}>
              <span className={pageStyles.pill}>Dashboards</span>
              <span className={pageStyles.pill}>P&amp;L tree</span>
              <span className={pageStyles.pill}>Snapshots</span>
            </div>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Our story (in 60 seconds)</h2>
            <p className={pageStyles.sectionSubtitle}>
              A timeline of the problem we lived—and the product we wanted to exist.
            </p>
          </div>
        </div>

        <div className={pageStyles.timeline}>
          <div className={pageStyles.timelineItem}>
            <div className={pageStyles.timelineMeta}>Consulting years</div>
            <div className={pageStyles.timelineContent}>
              <h4>Transformation at scale</h4>
              <p>
                We led PMOs, built governance models, and supported leadership teams across multi-year portfolios.
                The hard part wasn’t frameworks—it was operational clarity and focus.
              </p>
            </div>
          </div>
          <div className={pageStyles.timelineItem}>
            <div className={pageStyles.timelineMeta}>The breaking point</div>
            <div className={pageStyles.timelineContent}>
              <h4>Too many tools, not enough truth</h4>
              <p>
                Spreadsheets for plans, decks for updates, chat for decisions, emails for approvals.
                Everyone worked hard—yet visibility got worse as programs grew.
              </p>
            </div>
          </div>
          <div className={pageStyles.timelineItem}>
            <div className={pageStyles.timelineMeta}>Laiten today</div>
            <div className={pageStyles.timelineContent}>
              <h4>A platform built for the operating rhythm</h4>
              <p>
                Stage-gates, reporting, capacity planning, and monitoring in one connected model.
                Less admin. Better steering. Faster delivery.
              </p>
            </div>
          </div>
        </div>
      </section>
    </LaitenPageLayout>
  );
};

