import { ArrowRight, BarChart3, Calendar, Shield, Sparkles, Zap } from 'lucide-react';
import { useEffect } from 'react';
import pageStyles from './LaitenSubpages.module.css';
import { LaitenPageLayout } from './LaitenPageLayout';

type Release = {
  id: string;
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  details: { title: string; items: string[] }[];
  tags: string[];
};

const RELEASES: Release[] = [
  {
    id: 'v2-7',
    version: '2.7',
    date: 'Dec 16, 2025',
    title: 'Stage-gate templates + faster approvals',
    summary:
      'Standardise governance without the admin: reusable stage-gate templates, auto-generated checklists, and smarter approval routing.',
    highlights: [
      'Template stage-gates per program type (Digital, Ops, Compliance)',
      'Auto-checklists for evidence and risk items',
      'Approval routing based on portfolio, threshold, and role'
    ],
    details: [
      {
        title: 'What changed',
        items: [
          'Templates let PMOs define stages, required evidence, and gate owners once.',
          'Approvals support thresholds (e.g., spend, risk) with explicit routing rules.',
          'Gate history includes who approved what, when, and with which evidence.'
        ]
      },
      {
        title: 'Designed for',
        items: ['PMOs standardising governance across workstreams.', 'Delivery teams who want clarity and fewer handoffs.']
      }
    ],
    tags: ['Stage gates', 'Approvals', 'Audit']
  },
  {
    id: 'v2-6',
    version: '2.6',
    date: 'Dec 12, 2025',
    title: 'Scenario-ready portfolio planning',
    summary:
      'Model trade-offs before the steering meeting: compare capacity, timing, and value across scenarios without rebuilding spreadsheets.',
    highlights: [
      'Create scenarios from your live portfolio (Baseline → Option A/B)',
      'Side-by-side comparisons for value, capacity load, and delivery risk',
      'Scenario notes and decision log for governance-ready traceability'
    ],
    details: [
      {
        title: 'What changed',
        items: [
          'Scenario snapshots capture initiatives, assumptions, and key deltas—without duplicating operational data.',
          'Capacity comparisons highlight hotspots by team and month to make staffing trade-offs explicit.',
          'Decision log ties outcomes back to the scenario you approved.'
        ]
      },
      {
        title: 'Why it matters',
        items: [
          'Leaders can decide quickly with clear, comparable options.',
          'Teams stop rebuilding plans in parallel artifacts.',
          'Portfolio conversations shift from opinions to evidence.'
        ]
      }
    ],
    tags: ['Portfolio', 'Capacity', 'Governance']
  },
  {
    id: 'v2-5',
    version: '2.5',
    date: 'Dec 11, 2025',
    title: 'Enhanced reporting & dashboards',
    summary:
      'Richer dashboards with drill-down views, faster filters, and executive-ready narratives—without losing the underlying data.',
    highlights: [
      'New dashboard layouts with clearer hierarchy and KPI callouts',
      'Saved filters for recurring leadership views',
      'One-click exports for board packs and steering updates'
    ],
    details: [
      {
        title: 'What changed',
        items: [
          'Dashboards render faster on large portfolios via smarter data aggregation.',
          'Saved views preserve filters and sorting so leaders get consistent reads week-to-week.',
          'Exports include context notes to reduce “what does this mean?” follow-ups.'
        ]
      }
    ],
    tags: ['Reporting', 'Dashboards', 'Exec-ready']
  },
  {
    id: 'v2-4',
    version: '2.4',
    date: 'Dec 10, 2025',
    title: 'Enhanced security & two-factor authentication',
    summary:
      'Added TOTP-based 2FA, passkey support, and improved session management for enterprise security compliance.',
    highlights: [
      'TOTP-based two-factor authentication (2FA)',
      'Passkey support for modern passwordless sign-in',
      'Stronger session controls and enterprise-ready security defaults'
    ],
    details: [
      {
        title: 'What changed',
        items: [
          '2FA can be enabled per account for additional protection.',
          'Passkeys improve login UX while strengthening security posture.',
          'Session management is more resilient with tighter controls and clearer visibility.'
        ]
      }
    ],
    tags: ['Security', 'Compliance', 'Enterprise']
  },
  {
    id: 'v2-3',
    version: '2.3',
    date: 'Nov 21, 2025',
    title: 'Advanced activity logging & audit trail',
    summary:
      'A compliance-ready audit trail: who changed what, when, and why—searchable, exportable, and designed for real investigations.',
    highlights: ['Search across actions, entities, and users', 'Exportable reports for governance reviews', 'Contextual diffs on critical fields'],
    details: [
      {
        title: 'What changed',
        items: [
          'Activity events include entity context (initiative, stage, approval, comment).',
          'Critical changes show before/after values with the actor and timestamp.',
          'Export formats support audit reviews and internal controls.'
        ]
      }
    ],
    tags: ['Security', 'Audit', 'Compliance']
  },
  {
    id: 'v2-2',
    version: '2.2',
    date: 'Oct 29, 2025',
    title: 'Daily snapshots & historical comparison',
    summary:
      'Track portfolio movement over time: point-in-time snapshots, comparisons, and change detection that make drift obvious.',
    highlights: ['Automated daily snapshots', 'Compare any two dates', 'Highlight changes in scope, value, and progress'],
    details: [
      {
        title: 'What changed',
        items: [
          'Snapshots capture the portfolio state without slowing day-to-day operations.',
          'Comparison views highlight deltas and trends so you can explain “what changed” quickly.',
          'Supports governance rhythms: weekly, monthly, quarterly reviews.'
        ]
      }
    ],
    tags: ['Snapshots', 'Reporting', 'Governance']
  },
  {
    id: 'v2-1',
    version: '2.1',
    date: 'Sep 29, 2025',
    title: 'Comments, @mentions, and collaboration',
    summary:
      'Threaded discussions and inline comments keep decisions with the work—so context doesn’t vanish into email.',
    highlights: ['Threaded discussions', '@mentions + notifications', 'Inline comments across initiative content'],
    details: [
      {
        title: 'What changed',
        items: [
          'Comment threads stay attached to initiatives, gates, and evidence items.',
          '@mentions notify stakeholders and keep approvals moving.',
          'Designed to replace “status deck” side conversations with durable context.'
        ]
      }
    ],
    tags: ['Collaboration', 'Delivery', 'Governance']
  }
];

export const LaitenWhatsNewPage = () => {
  useEffect(() => {
    const scrollToAnchor = () => {
      const parts = window.location.hash.split('#');
      const fragment = parts.length >= 3 ? parts[2] : '';
      if (!fragment) {
        return;
      }
      const el = document.getElementById(fragment);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    scrollToAnchor();
    window.addEventListener('hashchange', scrollToAnchor);
    return () => window.removeEventListener('hashchange', scrollToAnchor);
  }, []);

  return (
    <LaitenPageLayout activeView="whats-new">
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroSurface}>
          <div className={pageStyles.heroGrid}>
            <div>
              <div className={pageStyles.badge}>
                <Sparkles size={16} />
                Release notes
              </div>
              <h1 className={pageStyles.title}>What’s new in Laiten</h1>
              <p className={pageStyles.lede}>
                Recent improvements across stage-gates, reporting, capacity planning, and enterprise foundations.
                This page is written for real operators: clear outcomes, not marketing fog.
              </p>

              <div className={pageStyles.heroActions}>
                <a href="#/laiten" className={pageStyles.ctaPrimary}>
                  Back to overview <ArrowRight size={18} />
                </a>
                <a href="mailto:hello@laiten.com?subject=Laiten%20Demo%20Request" className={pageStyles.ctaSecondary}>
                  Request a demo <ArrowRight size={18} />
                </a>
              </div>
            </div>

            <aside className={pageStyles.heroSideCard}>
              <div className={pageStyles.heroSideTitle}>
                <h3>Shipped recently</h3>
                <span>Last 90 days</span>
              </div>
              <ul className={pageStyles.heroSideList}>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Zap size={18} />
                  </span>
                  Faster executive reporting with saved views and exports.
                </li>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <BarChart3 size={18} />
                  </span>
                  Scenario-ready portfolio planning with capacity comparisons.
                </li>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Shield size={18} />
                  </span>
                  Audit-ready activity logging and governance traceability.
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Release timeline</h2>
            <p className={pageStyles.sectionSubtitle}>
              Looking for a specific update? Jump to a version, or skim the highlights.
            </p>
          </div>
        </div>

        <div className={pageStyles.releaseLayout}>
          <aside className={pageStyles.releaseToc} aria-label="Release navigation">
            <h3>Jump to</h3>
            {RELEASES.map((r) => (
              <a key={r.id} href={`#/laiten/whats-new#${r.id}`}>
                <span>v{r.version}</span>
                <span style={{ color: 'var(--color-text-subtle)', fontWeight: 700 }}>
                  <Calendar size={14} style={{ marginRight: 6 }} />
                  {r.date}
                </span>
              </a>
            ))}
          </aside>

          <div className={pageStyles.releaseStack}>
            {RELEASES.map((r) => (
              <article key={r.id} id={r.id} className={pageStyles.releaseCard}>
                <div className={pageStyles.releaseHeader}>
                  <h3>
                    v{r.version} — {r.title}
                  </h3>
                  <span>{r.date}</span>
                </div>
                <p className={pageStyles.cardBody} style={{ margin: 0 }}>
                  {r.summary}
                </p>

                <h4 style={{ margin: '1rem 0 0.5rem', letterSpacing: '-0.02em' }}>Highlights</h4>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
                  {r.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                {r.details.map((block) => (
                  <div key={block.title} style={{ marginTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>{block.title}</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className={pageStyles.tagRow}>
                  {r.tags.map((tag) => (
                    <span key={tag} className={pageStyles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}

            <div className={pageStyles.callout}>
              <h3>Want deeper details?</h3>
              <p>
                If you’re evaluating Laiten or planning a rollout, we can share tailored examples: stage-gate models, dashboard packs,
                and how capacity planning ties to real decision-making.
              </p>
              <div className={pageStyles.heroActions} style={{ marginTop: '1.1rem' }}>
                <a href="mailto:hello@laiten.com?subject=Laiten%20Examples%20Request" className={pageStyles.ctaPrimary}>
                  Request examples <ArrowRight size={18} />
                </a>
                <a href="#/laiten/about" className={pageStyles.ctaSecondary}>
                  About the team <ArrowRight size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </LaitenPageLayout>
  );
};
