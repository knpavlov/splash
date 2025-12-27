import pageStyles from './LaitenSubpages.module.css';
import { LaitenPageLayout } from './LaitenPageLayout';

export const LaitenTermsPage = () => {
  return (
    <LaitenPageLayout activeView="terms">
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroSurface}>
          <div className={pageStyles.heroGrid}>
            <div>
              <div className={pageStyles.badge}>Terms of Service</div>
              <h1 className={pageStyles.title}>Clear terms for mission critical delivery.</h1>
              <p className={pageStyles.lede}>
                These terms govern access to the Laiten platform. By using Laiten you agree to the
                responsibilities below. Contract terms in a signed agreement take precedence.
              </p>
            </div>
            <aside className={pageStyles.heroSideCard}>
              <div className={pageStyles.heroSideTitle}>
                <h3>Summary</h3>
                <span>Effective 2026</span>
              </div>
              <ul className={pageStyles.heroSideList}>
                <li>Use Laiten only for lawful business purposes.</li>
                <li>Keep credentials secure and assign access responsibly.</li>
                <li>We protect the service and maintain uptime targets.</li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Service scope</h2>
            <p className={pageStyles.sectionSubtitle}>
              Laiten provides governance, reporting, planning, and delivery monitoring for transformation initiatives.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid2}>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Access and accounts</h3>
            <p className={pageStyles.cardBody}>
              You are responsible for managing user access, roles, and the accuracy of data entered into the platform.
            </p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Acceptable use</h3>
            <p className={pageStyles.cardBody}>
              You agree not to misuse the service, attempt unauthorized access, or disrupt other customers.
            </p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Security and availability</h2>
            <p className={pageStyles.sectionSubtitle}>
              We maintain controls appropriate for enterprise workloads and provide audit trails for governance.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid2}>
          <div className={pageStyles.callout}>
            <h3>Security commitments</h3>
            <p>
              Laiten follows industry best practices for encryption, access logging, and incident response.
            </p>
          </div>
          <div className={pageStyles.callout}>
            <h3>Service levels</h3>
            <p>
              We target high availability and provide support to restore service quickly when issues arise.
            </p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Intellectual property</h2>
            <p className={pageStyles.sectionSubtitle}>
              You retain ownership of your initiative data. We retain ownership of the Laiten platform.
            </p>
          </div>
        </div>

        <div className={pageStyles.card}>
          <h3 className={pageStyles.cardTitle}>Feedback</h3>
          <p className={pageStyles.cardBody}>
            If you share feedback or suggestions, you grant us permission to use them to improve the service.
          </p>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Contact and questions</h2>
            <p className={pageStyles.sectionSubtitle}>
              For contract questions or compliance requests, reach out to our legal team.
            </p>
          </div>
        </div>

        <div className={pageStyles.callout}>
          <h3>Legal contact</h3>
          <p>
            Email <a href="mailto:legal@laiten.com">legal@laiten.com</a> for terms updates or contract questions.
          </p>
        </div>
      </section>
    </LaitenPageLayout>
  );
};
