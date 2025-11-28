import { ReactNode, useState } from 'react';
import { NavigationItem, NavigationKey } from './navigation';
import { Sidebar } from '../components/layout/Sidebar';
import styles from '../styles/AppLayout.module.css';
import { useAuth } from '../modules/auth/AuthContext';
interface AppLayoutProps {
  navigationItems: NavigationItem[];
  activeItem: NavigationKey;
  onNavigate: (key: NavigationKey) => void;
  children: ReactNode;
}

export const AppLayout = ({ navigationItems, activeItem, onNavigate, children }: AppLayoutProps) => {
  const { session } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (!session) {
    return null;
  }

  return (
    <div className={`${styles.container} ${isSidebarCollapsed ? styles.collapsed : ''}`}>
      <Sidebar
        navigationItems={navigationItems}
        activeItem={activeItem}
        onNavigate={onNavigate}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <main className={styles.content}>
        <div className={styles.pageContainer}>{children}</div>
      </main>
    </div>
  );
};
