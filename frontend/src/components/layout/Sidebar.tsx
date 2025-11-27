import { useMemo, useState } from 'react';
import { NavigationItem, NavigationKey, navigationGroups, NavigationGroupKey } from '../../app/navigation';
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<NavigationGroupKey, boolean>>(() => {
    const defaults = {} as Record<NavigationGroupKey, boolean>;
    navigationGroups.forEach((group) => {
      defaults[group.id] = group.collapsed ?? false;
    });
    return defaults;
  });

  const ungroupedItems = useMemo(
    () => navigationItems.filter((item) => !item.group && !item.hidden),
    [navigationItems]
  );
  const groupedSections = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: navigationItems.filter((item) => item.group === group.id && !item.hidden)
        }))
        .filter((group) => group.items.length),
    [navigationItems]
  );

  const handleGroupToggle = (groupId: NavigationGroupKey) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderButton = (item: NavigationItem) => (
    <button
      key={item.key}
      className={`${item.key === activeItem ? styles.activeItem : styles.menuItem} ${item.group ? styles.childItem : ''} ${
        item.disabled ? styles.disabledItem : ''
      }`}
      onClick={() => {
        if (!item.disabled) {
          onNavigate(item.key);
        }
      }}
      disabled={item.disabled}
    >
      {item.label}
    </button>
  );

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <div className={styles.logoMark}>TM</div>
        <div className={styles.logoText}>
          <span className={styles.companyName}>Transformation</span>
          <span className={styles.version}>Management</span>
        </div>
      </div>
      <nav className={styles.menu}>
        {ungroupedItems.map((item) => renderButton(item))}
        {groupedSections.map((section) => (
          <div key={section.id} className={styles.groupSection}>
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => handleGroupToggle(section.id)}
              aria-expanded={!collapsedGroups[section.id]}
            >
              <span className={collapsedGroups[section.id] ? styles.chevronRight : styles.chevronDown} />
              {section.label}
            </button>
            {!collapsedGroups[section.id] && (
              <div className={styles.groupItems}>{section.items.map((item) => renderButton(item))}</div>
            )}
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
