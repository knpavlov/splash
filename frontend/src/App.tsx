import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from './app/AppLayout';
import { NavigationKey, navigationItems } from './app/navigation';
import { AccountsScreen } from './modules/accounts/AccountsScreen';
import { PlaceholderScreen } from './shared/ui/PlaceholderScreen';
import { AuthProvider, AuthSession, useAuth } from './modules/auth/AuthContext';
import { AppStateProvider } from './app/state/AppStateContext';
import { LoginScreen } from './modules/auth/LoginScreen';
import { WorkstreamsScreen } from './modules/workstreams/WorkstreamsScreen';
import { InitiativesScreen, InitiativesViewRoute } from './modules/initiatives/InitiativesScreen';
import { ApprovalsScreen } from './modules/approvals/ApprovalsScreen';
import { ParticipantsScreen } from './modules/participants/ParticipantsScreen';
import { CapacityHeatmapScreen } from './modules/dashboards/CapacityHeatmapScreen';
import { FinancialTreeScreen } from './modules/dashboards/FinancialTreeScreen';
import { StageGateDashboardScreen } from './modules/dashboards/StageGateDashboardScreen';
import { DeadlineDashboardScreen } from './modules/dashboards/DeadlineDashboardScreen';
import { PortfolioPlanScreen } from './modules/dashboards/PortfolioPlanScreen';
import { FinancialDynamicsScreen } from './modules/dashboards/FinancialDynamicsScreen';
import { FinancialsScreen } from './modules/financials/FinancialsScreen';
import { GeneralSettingsScreen } from './modules/settings/GeneralSettingsScreen';
import { InitiativeLogsScreen } from './modules/logs/InitiativeLogsScreen';
import { ActivityScreen } from './modules/activity/ActivityScreen';
import { TaigaLandingPage } from './modules/landing/TaigaLandingPage';
import { LaikaLandingPage } from './modules/landing/LaikaLandingPage';
import { LaikaProLandingPage } from './modules/landing/LaikaProLandingPage';

interface AppRoute {
  page: NavigationKey;
  initiative?: InitiativesViewRoute;
}

type NavigationItem = (typeof navigationItems)[number];



const parseHash = (hash: string): AppRoute => {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const trimmed = normalized.replace(/^\/+/, '').trim();
  if (!trimmed) {
    return { page: 'activity' };
  }

  const [pathPart, queryString] = trimmed.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryString ?? '');
  const [rawPage, action, identifier] = segments;
  const normalizedPage = rawPage === 'snapshot-settings' ? 'general-settings' : rawPage;
  const page = navigationItems.find((item) => item.key === normalizedPage)?.key ?? 'workstreams';

  if (page === 'initiatives') {
    if (action === 'new') {
      return { page: 'initiatives', initiative: { mode: 'create', workstreamId: identifier || undefined } };
    }
    if (action === 'view' && identifier) {
      return {
        page: 'initiatives',
        initiative: {
          mode: 'view',
          initiativeId: identifier,
          planTaskId: query.get('planTask') ?? undefined,
          openPlanFullscreen: query.get('planFullscreen') === '1',
          commentThreadId: query.get('comment') ?? undefined,
          openComments: query.get('comments') === '1'
        }
      };
    }
    if (action === 'ws' && identifier) {
      return { page: 'initiatives', initiative: { mode: 'list', workstreamId: identifier } };
    }
    return { page: 'initiatives', initiative: { mode: 'list' } };
  }

  return { page };
};

const buildHash = (route: AppRoute): string => {


  if (route.page === 'initiatives') {
    const initiativeRoute = route.initiative ?? { mode: 'list' };
    if (initiativeRoute.mode === 'create') {
      if (initiativeRoute.workstreamId) {
        return `/initiatives/new/${initiativeRoute.workstreamId}`;
      }
      return '/initiatives/new';
    }
    if (initiativeRoute.mode === 'view') {
      const params = new URLSearchParams();
      if (initiativeRoute.planTaskId) {
        params.set('planTask', initiativeRoute.planTaskId);
      }
      if (initiativeRoute.openPlanFullscreen) {
        params.set('planFullscreen', '1');
      }
      if (initiativeRoute.commentThreadId) {
        params.set('comment', initiativeRoute.commentThreadId);
      }
      if (initiativeRoute.openComments) {
        params.set('comments', '1');
      }
      const query = params.toString();
      return `/initiatives/view/${initiativeRoute.initiativeId}${query ? `?${query}` : ''}`;
    }
    if (initiativeRoute.workstreamId) {
      return `/initiatives/ws/${initiativeRoute.workstreamId}`;
    }
    return '/initiatives';
  }

  return `/${route.page}`;
};

const routesEqual = (a: AppRoute, b: AppRoute) => {
  if (a.page !== b.page) {
    return false;
  }

  if (a.page === 'initiatives') {
    const left = a.initiative ?? { mode: 'list' };
    const right = b.initiative ?? { mode: 'list' };
    if (left.mode !== right.mode) {
      return false;
    }
    if (left.mode === 'view' && right.mode === 'view') {
      return (
        left.initiativeId === right.initiativeId &&
        (left.commentThreadId ?? '') === (right.commentThreadId ?? '') &&
        Boolean(left.openComments) === Boolean(right.openComments)
      );
    }
    if (left.mode === 'list' && right.mode === 'list') {
      return (left.workstreamId ?? '') === (right.workstreamId ?? '');
    }
    if (left.mode === 'create' && right.mode === 'create') {
      return (left.workstreamId ?? '') === (right.workstreamId ?? '');
    }
    return false;
  }
  return true;
};

const AppContent = () => {
  const { session } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));
  const previousSessionRef = useRef<AuthSession | null>(null);

  const setRouteFromHash = useCallback(() => {
    const next = parseHash(window.location.hash);
    setRoute((current) => (routesEqual(current, next) ? current : next));
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', setRouteFromHash);
    return () => window.removeEventListener('hashchange', setRouteFromHash);
  }, [setRouteFromHash]);

  useEffect(() => {
    if (!window.location.hash && window.location.pathname && window.location.pathname !== '/') {
      const path = `${window.location.pathname}${window.location.search || ''}`;
      const normalized = path.startsWith('/') ? path : `/${path}`;
      window.location.hash = normalized;
      setRoute(parseHash(normalized));
    }
  }, []);

  const updateRoute = useCallback(
    (next: AppRoute) => {
      setRoute((current) => (routesEqual(current, next) ? current : next));
      const targetHash = buildHash(next);
      const formatted = targetHash.startsWith('/') ? targetHash : `/${targetHash}`;
      const currentHash = window.location.hash;
      if (currentHash !== `#${formatted}`) {
        window.location.hash = formatted;
      }
    },
    []
  );

  useEffect(() => {
    if (!session && previousSessionRef.current) {
      updateRoute({ page: 'workstreams' });
    }
    previousSessionRef.current = session;
  }, [session, updateRoute]);

  const accessibleItems = useMemo<NavigationItem[]>(() => {
    if (!session) {
      return [];
    }

    return navigationItems.filter((item) => {
      if (!item.roleAccess.includes(session.role)) {
        return false;
      }



      return true;
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!accessibleItems.length) {
      updateRoute({ page: 'workstreams' });
      return;
    }
    if (!accessibleItems.find((item) => item.key === route.page)) {
      const fallback = accessibleItems[0].key;
      updateRoute({ page: fallback });
    }
  }, [session, accessibleItems, route.page, updateRoute]);

  if (route.page === 'taiga') {
    return <TaigaLandingPage />;
  }

  if (route.page === 'laika') {
    return <LaikaLandingPage />;
  }

  if (route.page === 'laikapro') {
    return <LaikaProLandingPage />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  const activePage = route.page;

  const handleNavigate = useCallback(
    (key: NavigationKey) => {
      const target = navigationItems.find((item) => item.key === key);
      if (target?.disabled) {
        return;
      }
      if (key === 'initiatives') {
        const currentWorkstream =
          route.initiative && route.initiative.mode !== 'view' ? route.initiative.workstreamId : undefined;
        updateRoute({ page: 'initiatives', initiative: { mode: 'list', workstreamId: currentWorkstream } });
      } else {
        updateRoute({ page: key });
      }
    },
    [route.initiative, updateRoute]
  );

  const handleInitiativeViewChange = useCallback(
    (next: InitiativesViewRoute) => {
      updateRoute({ page: 'initiatives', initiative: next });
    },
    [updateRoute]
  );

  const renderContent = () => {
    switch (activePage) {
      case 'activity':
        return <ActivityScreen />;
      case 'initiatives':
        return (
          <InitiativesScreen
            view={route.initiative ?? { mode: 'list' }}
            onViewChange={handleInitiativeViewChange}
          />
        );
      case 'approvals':
        return <ApprovalsScreen />;
      case 'participants':
        return <ParticipantsScreen />;
      case 'workstreams':
        return <WorkstreamsScreen />;
      case 'financials':
        return <FinancialsScreen />;
      case 'kpis':
        return (
          <PlaceholderScreen
            title="KPIs"
            description="This dashboard will be available soon."
          />
        );
      case 'capacity-heatmap':
        return <CapacityHeatmapScreen />;
      case 'financial-tree':
        return <FinancialTreeScreen />;
      case 'stage-gate-dashboard':
        return <StageGateDashboardScreen />;
      case 'portfolio-plan':
        return <PortfolioPlanScreen />;
      case 'deadline-dashboard':
        return <DeadlineDashboardScreen />;
      case 'financial-dynamics':
        return <FinancialDynamicsScreen />;
      case 'accounts':
        return <AccountsScreen />;
      case 'general-settings':
        return <GeneralSettingsScreen />;
      case 'initiative-logs':
        return <InitiativeLogsScreen />;
      case 'snapshot-settings':
        return <GeneralSettingsScreen />;
      default:
        return (
          <PlaceholderScreen
            title="Раздел в разработке"
            description="Мы работаем над этим экраном. Пожалуйста, вернитесь позже."
          />
        );
    }
  };

  return (
    <AppLayout navigationItems={accessibleItems} activeItem={activePage} onNavigate={handleNavigate}>
      {renderContent()}
    </AppLayout>
  );
};

export const App = () => (
  <AuthProvider>
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  </AuthProvider>
);
