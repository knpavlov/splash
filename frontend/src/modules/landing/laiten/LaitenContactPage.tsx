import pageStyles from './LaitenSubpages.module.css';
import { LaitenPageLayout } from './LaitenPageLayout';

export const LaitenContactPage = () => {
  return (
    <LaitenPageLayout activeView="contact">
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroSurface}>
          <div className={pageStyles.heroGrid}>
            <div>
              <div className={pageStyles.badge}>Contact</div>
              <h1 className={pageStyles.title}>Talk to the Laiten team.</h1>
              <p className={pageStyles.lede}>
                Tell us about your portfolio, stage gate model, or reporting needs. We will respond with
                a tailored walkthrough and implementation plan.
              </p>
            </div>
            <aside className={pageStyles.heroSideCard}>
              <div className={pageStyles.heroSideTitle}>
                <h3>Direct contact</h3>
                <span>Australia + Global</span>
              </div>
              <ul className={pageStyles.heroSideList}>
                <li>Email <a href="mailto:hello@laiten.com">hello@laiten.com</a></li>
                <li>Response time: 1 business day</li>
                <li>Enterprise onboarding available</li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Send a message</h2>
            <p className={pageStyles.sectionSubtitle}>
              Share the scope of your transformation and the decision timeline. We will tailor the demo.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid2}>
          <form className={pageStyles.formCard}>
            <div className={pageStyles.formGrid}>
              <label className={pageStyles.formField}>
                <span className={pageStyles.formLabel}>Full name</span>
                <input className={pageStyles.formInput} type="text" placeholder="Jane Doe" />
              </label>
              <label className={pageStyles.formField}>
                <span className={pageStyles.formLabel}>Work email</span>
                <input className={pageStyles.formInput} type="email" placeholder="jane@company.com" />
              </label>
              <label className={pageStyles.formField}>
                <span className={pageStyles.formLabel}>Company</span>
                <input className={pageStyles.formInput} type="text" placeholder="Company, Inc." />
              </label>
              <label className={pageStyles.formField}>
                <span className={pageStyles.formLabel}>Role</span>
                <input className={pageStyles.formInput} type="text" placeholder="PMO Lead" />
              </label>
            </div>
            <label className={pageStyles.formField}>
              <span className={pageStyles.formLabel}>Message</span>
              <textarea
                className={pageStyles.formTextarea}
                placeholder="Tell us about your portfolio size, approval workflow, and reporting requirements."
                rows={5}
              />
            </label>
            <div className={pageStyles.formActions}>
              <button type="button" className={pageStyles.formButton}>Submit request</button>
              <span className={pageStyles.formHint}>We only use this info to respond to your inquiry.</span>
            </div>
          </form>

          <div className={pageStyles.callout}>
            <h3>What happens next</h3>
            <p>
              We will review your request, propose a tailored demo, and share onboarding milestones
              aligned to your governance model.
            </p>
            <div className={pageStyles.pillRow}>
              <span className={pageStyles.pill}>Discovery call</span>
              <span className={pageStyles.pill}>Stage gate review</span>
              <span className={pageStyles.pill}>Portfolio pilot</span>
            </div>
          </div>
        </div>
      </section>
    </LaitenPageLayout>
  );
};
