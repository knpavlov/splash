import pageStyles from './LaitenSubpages.module.css';
import { LaitenPageLayout } from './LaitenPageLayout';

export const LaitenPrivacyPage = () => {
  return (
    <LaitenPageLayout activeView="privacy">
      <section className={pageStyles.hero}>
        <div className={pageStyles.heroSurface}>
          <div className={pageStyles.heroGrid}>
            <div>
              <div className={pageStyles.badge}>Privacy Policy</div>
              <h1 className={pageStyles.title}>Privacy built for enterprise transformation teams.</h1>
              <p className={pageStyles.lede}>
                This policy explains what data Laiten collects, how we use it, and the choices you have.
                We design our platform to minimize data exposure while still giving leadership teams the
                insights they need to steer initiatives.
              </p>
            </div>
            <aside className={pageStyles.heroSideCard}>
              <div className={pageStyles.heroSideTitle}>
                <h3>Key points</h3>
                <span>Updated 2026</span>
              </div>
              <ul className={pageStyles.heroSideList}>
                <li>We only collect data required to run stage gates, reporting, and planning.</li>
                <li>Customer data stays owned by you. We never sell it.</li>
                <li>Admins control access, retention, and export requests.</li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Data we collect</h2>
            <p className={pageStyles.sectionSubtitle}>
              We collect information necessary to provide the service and keep it secure.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid3}>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Account details</h3>
            <p className={pageStyles.cardBody}>
              Name, email, role, and authentication metadata used to manage access and permissions.
            </p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Initiative data</h3>
            <p className={pageStyles.cardBody}>
              Information you enter about initiatives, financials, plans, KPIs, risks, and approvals.
            </p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Usage telemetry</h3>
            <p className={pageStyles.cardBody}>
              Activity logs, audit trails, and performance metrics used to keep the platform reliable.
            </p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>How we use information</h2>
            <p className={pageStyles.sectionSubtitle}>
              We process data to run Laiten, support customers, and meet compliance obligations.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid2}>
          <div className={pageStyles.callout}>
            <h3>Operate the platform</h3>
            <p>
              We use your data to render dashboards, workflows, and audit trails, and to calculate
              the metrics you request.
            </p>
          </div>
          <div className={pageStyles.callout}>
            <h3>Support and security</h3>
            <p>
              We monitor for anomalies, investigate incidents, and provide support when you ask for help.
            </p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Sharing and retention</h2>
            <p className={pageStyles.sectionSubtitle}>
              We only share data with trusted subprocessors that help run the service, under strict contracts.
            </p>
          </div>
        </div>

        <div className={pageStyles.grid2}>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Subprocessors</h3>
            <p className={pageStyles.cardBody}>
              We use cloud hosting, monitoring, and email providers that meet enterprise security standards.
              A current list is available on request.
            </p>
          </div>
          <div className={pageStyles.card}>
            <h3 className={pageStyles.cardTitle}>Retention</h3>
            <p className={pageStyles.cardBody}>
              You control how long initiative data is retained. Admins can export or delete data at any time.
            </p>
          </div>
        </div>
      </section>

      <section className={pageStyles.section}>
        <div className={pageStyles.sectionHeader}>
          <div>
            <h2 className={pageStyles.sectionTitle}>Your rights</h2>
            <p className={pageStyles.sectionSubtitle}>
              We support access, correction, deletion, and portability requests within contractual limits.
            </p>
          </div>
        </div>

        <div className={pageStyles.callout}>
          <h3>Contact privacy</h3>
          <p>
            Email <a href="mailto:privacy@laiten.com">privacy@laiten.com</a> to submit a request or
            ask about data processing agreements.
          </p>
        </div>
      </section>
    </LaitenPageLayout>
  );
};
