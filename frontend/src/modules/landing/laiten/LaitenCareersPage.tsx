import { ArrowRight, ChevronDown, Code, Compass, HeartHandshake, Layout, MapPin, Shield, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import pageStyles from './LaitenSubpages.module.css';
import { LaitenPageLayout } from './LaitenPageLayout';

type Job = {
  id: string;
  title: string;
  location: string;
  type: string;
  team: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave?: string[];
};

export const LaitenCareersPage = () => {
  const jobs = useMemo<Job[]>(
    () => [
      {
        id: 'fullstack-senior',
        title: 'Senior Full-Stack Engineer (TypeScript)',
        location: 'Sydney (hybrid) or Remote (APAC)',
        type: 'Full-time',
        team: 'Product Engineering',
        summary:
          'Own end-to-end features across the product: interactive planning, dashboards, collaboration, and delightful details that make teams faster.',
        responsibilities: [
          'Ship product features from idea → production, collaborating closely with design and product.',
          'Build robust UI patterns for complex workflows (stage-gates, approvals, reporting).',
          'Design APIs and data models that preserve traceability across initiatives, portfolios, and outcomes.',
          'Raise the bar on performance, accessibility, and developer experience.'
        ],
        requirements: [
          'Strong TypeScript skills across front-end and back-end.',
          'Experience building data-heavy UIs (tables, charts, workflows, permissions).',
          'Comfortable owning ambiguous problems and turning them into shipped outcomes.',
          'A bias for simple solutions and crisp product thinking.'
        ],
        niceToHave: ['Experience with React, Vite, and modern CSS patterns.', 'Exposure to B2B SaaS and enterprise security basics.']
      },
      {
        id: 'designer-product',
        title: 'Product Designer (Design Systems + Data UX)',
        location: 'Sydney (hybrid) or Remote (APAC)',
        type: 'Full-time',
        team: 'Design',
        summary:
          'Design high-trust interfaces for leadership teams: dashboards, governance flows, and collaboration that feels effortless.',
        responsibilities: [
          'Own the end-to-end design process: discovery, flows, visual design, prototypes, and iteration.',
          'Evolve the design system (components, tokens, patterns) alongside engineering.',
          'Design complex reporting experiences with clarity, hierarchy, and intention.',
          'Partner with customers to understand how transformation really runs in the wild.'
        ],
        requirements: [
          'A portfolio showing strong visual craft and system thinking.',
          'Experience designing data-rich products (dashboards, tables, filters, drill-down).',
          'Confidence facilitating trade-offs and communicating rationale.',
          'Excellent taste and attention to micro-interactions.'
        ],
        niceToHave: ['Experience with enterprise products, RBAC, auditability, and admin tooling.']
      },
      {
        id: 'implementation-cs',
        title: 'Implementation & Customer Success Lead',
        location: 'Sydney (hybrid) + occasional travel',
        type: 'Full-time',
        team: 'Customer',
        summary:
          'Help customers stand up transformation operating rhythms: governance, reporting, and adoption—then make sure they get compounding value.',
        responsibilities: [
          'Lead onboarding and implementation for new customers (configuration, workshops, enablement).',
          'Translate portfolio governance into pragmatic product setup that teams actually use.',
          'Create templates, playbooks, and repeatable rollout patterns.',
          'Bring product feedback back to the team with clarity and context.'
        ],
        requirements: [
          'Experience in PMO, transformation, consulting, or implementation roles.',
          'Strong facilitation and stakeholder management skills.',
          'Comfort with ambiguity and building structure from scratch.',
          'High empathy, high standards, and calm under pressure.'
        ],
        niceToHave: ['Experience rolling out software into large organisations.', 'Understanding of benefits tracking, stage-gates, and governance.']
      },
      {
        id: 'security-platform',
        title: 'Platform Engineer (Security + Reliability)',
        location: 'Remote (APAC)',
        type: 'Full-time',
        team: 'Platform',
        summary:
          'Make Laiten enterprise-ready by default: harden security foundations, improve reliability, and build internal tooling that keeps us fast.',
        responsibilities: [
          'Improve observability and reliability across deployments.',
          'Design and implement security controls, policies, and best practices.',
          'Work on authentication, permissions, and auditability foundations.',
          'Automate and document operational runbooks.'
        ],
        requirements: [
          'Experience with production systems and incident-free engineering habits.',
          'Strong understanding of security basics (authn/authz, secrets, least privilege).',
          'Ability to build pragmatic tooling and automation.',
          'Clear communication and a preference for sustainable solutions.'
        ],
        niceToHave: ['Familiarity with SOC2-aligned controls, SSO, and audit trail requirements.']
      }
    ],
    []
  );

  const [openJobId, setOpenJobId] = useState<string | null>(jobs[0]?.id ?? null);

  return (
    <LaitenPageLayout activeView="careers">
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroSurface}>
          <div className={pageStyles.heroGrid}>
            <div>
              <div className={pageStyles.badge}>
                <Sparkles size={16} />
                Careers
              </div>
              <h1 className={pageStyles.title}>Build the platform that turns strategy into delivered outcomes.</h1>
              <p className={pageStyles.lede}>
                Laiten is for teams running complex portfolios: stage-gates, reporting, capacity, approvals, and monitoring—all in one connected
                model. We’re small, opinionated, and shipping fast.
              </p>
              <p className={pageStyles.lede}>
                If you care about craft, clarity, and impact—and you want to work with people who’ve actually run transformations—come build with us.
              </p>

              <div className={pageStyles.heroActions}>
                <a href="mailto:hello@laiten.com?subject=Careers%20at%20Laiten" className={pageStyles.ctaPrimary}>
                  Apply via email <ArrowRight size={18} />
                </a>
                <a href="#/laiten/about" className={pageStyles.ctaSecondary}>
                  Meet the team <ArrowRight size={18} />
                </a>
              </div>
            </div>

            <aside className={pageStyles.heroSideCard}>
              <div className={pageStyles.heroSideTitle}>
                <h3>What you’ll get</h3>
                <span>Small team</span>
              </div>
              <ul className={pageStyles.heroSideList}>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Compass size={18} />
                  </span>
                  High agency: own problems end-to-end and ship work that customers feel immediately.
                </li>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Layout size={18} />
                  </span>
                  Craft-first: design and engineering collaborate daily, with a strong design system mindset.
                </li>
                <li>
                  <span className={pageStyles.heroSideIcon}>
                    <Shield size={18} />
                  </span>
                  Enterprise-grade by default: security, auditability, and reliability are part of the product.
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>How we work</h2>
            <p className={pageStyles.sectionSubtitle}>
              A culture designed for shipping with quality—without losing the human side of building.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid3}>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>
              <span className={pageStyles.heroSideIcon}>
                <Code size={18} />
              </span>
              Keep it simple
            </h3>
            <p className={pageStyles.cardBody}>We prefer crisp models and boring reliability over complexity that looks clever.</p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>
              <span className={pageStyles.heroSideIcon}>
                <HeartHandshake size={18} />
              </span>
              Customers in the loop
            </h3>
            <p className={pageStyles.cardBody}>We build with customers, not for them. Short feedback cycles, pragmatic defaults.</p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>
              <span className={pageStyles.heroSideIcon}>
                <Shield size={18} />
              </span>
              Quality is a feature
            </h3>
            <p className={pageStyles.cardBody}>Security, accessibility, and performance are non-negotiable—especially in enterprise.</p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Open roles</h2>
            <p className={pageStyles.sectionSubtitle}>
              See a role that fits? Email <a href="mailto:hello@laiten.com">hello@laiten.com</a> with a short intro and links.
            </p>
          </div>
        </div>

        <div className={pageStyles.jobList}>
          {jobs.map((job) => {
            const open = openJobId === job.id;
            return (
              <div key={job.id} className={pageStyles.jobCard}>
                <button
                  type="button"
                  className={pageStyles.jobButton}
                  onClick={() => setOpenJobId((prev) => (prev === job.id ? null : job.id))}
                  aria-expanded={open}
                >
                  <div>
                    <h3 className={pageStyles.jobTitle}>{job.title}</h3>
                    <div className={pageStyles.jobMeta}>
                      <span>
                        <MapPin size={16} style={{ marginRight: 6 }} />
                        {job.location}
                      </span>
                      <span>{job.type}</span>
                      <span>{job.team}</span>
                    </div>
                  </div>
                  <ChevronDown size={20} className={`${pageStyles.jobChevron} ${open ? pageStyles.jobChevronOpen : ''}`} />
                </button>

                {open && (
                  <div className={pageStyles.jobDetails}>
                    <p style={{ margin: 0 }}>{job.summary}</p>

                    <h4>What you’ll do</h4>
                    <ul>
                      {job.responsibilities.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>

                    <h4>What we’re looking for</h4>
                    <ul>
                      {job.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>

                    {job.niceToHave?.length ? (
                      <>
                        <h4>Nice to have</h4>
                        <ul>
                          {job.niceToHave.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    <div className={pageStyles.heroActions} style={{ marginTop: '1.1rem' }}>
                      <a
                        href={`mailto:hello@laiten.com?subject=${encodeURIComponent(`Application — ${job.title}`)}`}
                        className={pageStyles.ctaPrimary}
                      >
                        Apply <ArrowRight size={18} />
                      </a>
                      <a href="#/laiten/whats-new" className={pageStyles.ctaSecondary}>
                        See the product <ArrowRight size={18} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.grid2}>
          <div className={pageStyles.callout}>
            <h3>Don’t see your role?</h3>
            <p>
              If you’re excited about transformation, product craft, and building for enterprise reality, send a note anyway.
              We’re happy to create roles for exceptional people.
            </p>
          </div>
          <div className={pageStyles.callout}>
            <h3>How to apply</h3>
            <p>
              Email <a href="mailto:hello@laiten.com">hello@laiten.com</a> with a short intro, your LinkedIn or CV, and anything you’ve built.
              If relevant, include a couple of sentences on why transformation software should exist.
            </p>
          </div>
        </div>
      </section>
    </LaitenPageLayout>
  );
};

