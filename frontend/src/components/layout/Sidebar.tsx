import { useMemo, useState } from 'react';
import { NavigationItem, NavigationKey, navigationGroups, NavigationGroupKey } from '../../app/navigation';
import styles from '../../styles/Sidebar.module.css';
import { useAuth } from '../../modules/auth/AuthContext';
import { AccountRole } from '../../shared/types/account';
import { LoadDemoDataLink } from '../../modules/demo/components/LoadDemoDataLink';
import { EraseDemoDataLink } from '../../modules/demo/components/EraseDemoDataLink';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';

interface SidebarProps {
  navigationItems: NavigationItem[];
  activeItem: NavigationKey;
  onNavigate: (key: NavigationKey) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

const roleLabels: Record<AccountRole, string> = {
  'super-admin': 'Super admin',
  admin: 'Admin',
  user: 'User'
};

export const Sidebar = ({ navigationItems, activeItem, onNavigate, isCollapsed, onToggle }: SidebarProps) => {
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

  const renderButton = (item: NavigationItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        className={`${item.key === activeItem ? styles.activeItem : styles.menuItem} ${item.group ? styles.childItem : ''
          } ${item.disabled ? styles.disabledItem : ''} ${isCollapsed ? styles.collapsedItem : ''}`}
        onClick={() => {
          if (!item.disabled) {
            onNavigate(item.key);
          }
        }}
        disabled={item.disabled}
        title={isCollapsed ? item.label : undefined}
      >
        {Icon && <Icon size={18} className={styles.itemIcon} />}
        {!isCollapsed && <span className={styles.itemLabel}>{item.label}</span>}
      </button>
    );
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.logoArea}>
        <div className={styles.logoMark}>TM</div>
        {!isCollapsed && (
          <div className={styles.logoText}>
            <span className={styles.companyName}>Transformation</span>
            <span className={styles.version}>Management</span>
          </div>
        )}
      </div>

      <button
        className={styles.collapseToggle}
        onClick={onToggle}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <nav className={styles.menu}>
        {ungroupedItems.map((item) => renderButton(item))}
        {groupedSections.map((section) => (
          <div key={section.id} className={styles.groupSection}>
            {!isCollapsed && (
              <button
                type="button"
                className={styles.sectionToggle}
                onClick={() => handleGroupToggle(section.id)}
                aria-expanded={!collapsedGroups[section.id]}
              >
                <span className={collapsedGroups[section.id] ? styles.chevronRight : styles.chevronDown} />
                {section.label}
              </button>
            )}
            {isCollapsed && <div className={styles.groupDivider} />}
            {(!collapsedGroups[section.id] || isCollapsed) && (
              <div className={styles.groupItems}>{section.items.map((item) => renderButton(item))}</div>
            )}
          </div>
        ))}
      </nav>
      <div className={styles.logoutBlock}>
        {session && !isCollapsed && (
          <div className={styles.sessionMeta}>
            <span className={styles.sessionInfo}>{session.email}</span>
            <span className={styles.roleBadge}>{roleLabels[session.role]}</span>
          </div>
        )}
        <button
          className={styles.logoutButton}
          onClick={() => logout()}
          title={isCollapsed ? "Sign out" : undefined}
        >
          {isCollapsed ? <LogOut size={18} /> : 'Sign out'}
        </button>
        {!isCollapsed && (
          <>
            <LoadDemoDataLink />
            <EraseDemoDataLink />
          </>
        )}
      </div>
    </aside>
  );
};
