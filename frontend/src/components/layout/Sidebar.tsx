import { NavigationItem, NavigationKey } from '../../app/navigation';
import styles from '../../styles/Sidebar.module.css';
import { useAuth } from '../../modules/auth/AuthContext';
import { AccountRole } from '../../shared/types/account';
import { LoadDemoDataLink } from '../../modules/demo/components/LoadDemoDataLink';
import { EraseDemoDataLink } from '../../modules/demo/components/EraseDemoDataLink';

interface SidebarProps {
  navigationItems: NavigationItem[];
  activeItem: NavigationKey;
  onNavigate: (key: NavigationKey) => void;
}

const roleLabels: Record<AccountRole, string> = {
  'super-admin': 'Super admin',
  admin: 'Admin',
  user: 'User'
};

export const Sidebar = ({ navigationItems, activeItem, onNavigate }: SidebarProps) => {
  const { session, logout } = useAuth();
  const sections = navigationItems.reduce<
    { label: string | null; items: NavigationItem[] }[]
  >((acc, item) => {
    const label = item.groupLabel ?? null;
    const last = acc[acc.length - 1];
    if (!last || last.label !== label) {
      acc.push({ label, items: [item] });
    } else {
      last.items.push(item);
    }
    return acc;
  }, []);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <div className={styles.logoMark}>R2</div>
        <div className={styles.logoText}>
          <span className={styles.companyName}>Recruitment</span>
          <span className={styles.version}>2.0</span>
        </div>
      </div>
      <nav className={styles.menu}>
        {sections.map((section, index) => (
          <div key={section.label ?? `section-${index}`}>
            {section.label && <p className={styles.sectionHeading}>{section.label}</p>}
            {section.items.map((item) => (
              <button
                key={item.key}
                className={`${item.key === activeItem ? styles.activeItem : styles.menuItem} ${
                  section.label ? styles.childItem : ''
                }`}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.logoutBlock}>
        {session && (
          <div className={styles.sessionMeta}>
            <span className={styles.sessionInfo}>{session.email}</span>
            <span className={styles.roleBadge}>{roleLabels[session.role]}</span>
          </div>
        )}
        <button
          className={styles.logoutButton}
          onClick={() => logout()}
        >
          Sign out
        </button>
        <LoadDemoDataLink />
        <EraseDemoDataLink />
      </div>
    </aside>
  );
};
