import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from './app/AppLayout';
import { NavigationKey, navigationItems } from './app/navigation';
import { CasesScreen } from './modules/cases/CasesScreen';
import { CandidatesScreen } from './modules/candidates/CandidatesScreen';
import { EvaluationScreen, EvaluationViewRoute } from './modules/evaluation/EvaluationScreen';
import { AccountsScreen } from './modules/accounts/AccountsScreen';
import { PlaceholderScreen } from './shared/ui/PlaceholderScreen';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import { AppStateProvider } from './app/state/AppStateContext';
import { LoginScreen } from './modules/auth/LoginScreen';
import { FitQuestionsScreen } from './modules/questions/FitQuestionsScreen';
import { CaseCriteriaScreen } from './modules/caseCriteria/CaseCriteriaScreen';
import { InterviewerScreen } from './modules/evaluation/InterviewerScreen';
import { useHasInterviewerAssignments } from './app/hooks/useHasInterviewerAssignments';
import { AnalyticsScreen } from './modules/analytics/AnalyticsScreen';

interface AppRoute {
  page: NavigationKey;
  evaluation?: EvaluationViewRoute;
}

type NavigationItem = (typeof navigationItems)[number];

const normalizeEvaluationRoute = (value?: EvaluationViewRoute): EvaluationViewRoute => {
  if (!value) {
    return { mode: 'list' };
  }
  if (value.mode === 'edit' && !value.evaluationId) {
    return { mode: 'list' };
  }
  return value;
};

const routesEqual = (a: AppRoute, b: AppRoute) => {
  if (a.page !== b.page) {
    return false;
  }
  if (a.page !== 'evaluation') {
    return true;
  }
  const left = normalizeEvaluationRoute(a.evaluation);
  const right = normalizeEvaluationRoute(b.evaluation);
  if (left.mode !== right.mode) {
    return false;
  }
  if (left.mode === 'edit' && right.mode === 'edit') {
    return left.evaluationId === right.evaluationId;
  }
  return true;
};

const parseHash = (hash: string): AppRoute => {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  const trimmed = normalized.replace(/^\/+/, '').trim();
  if (!trimmed) {
    return { page: 'cases' };
  }

  const segments = trimmed.split('/').filter(Boolean);
  const [rawPage, action, identifier] = segments;
  const page = navigationItems.find((item) => item.key === rawPage)?.key ?? 'cases';

  if (page === 'evaluation') {
    if (action === 'new') {
      return { page: 'evaluation', evaluation: { mode: 'create' } };
    }
    if (action === 'edit' && identifier) {
      return { page: 'evaluation', evaluation: { mode: 'edit', evaluationId: identifier } };
    }
    return { page: 'evaluation', evaluation: { mode: 'list' } };
  }

  return { page };
};

const buildHash = (route: AppRoute): string => {
  if (route.page === 'evaluation') {
    const evaluationRoute = normalizeEvaluationRoute(route.evaluation);
    if (evaluationRoute.mode === 'create') {
      return '/evaluation/new';
    }
    if (evaluationRoute.mode === 'edit') {
      return `/evaluation/edit/${evaluationRoute.evaluationId}`;
    }
    return '/evaluation';
  }

  return `/${route.page}`;
};

const AppContent = () => {
  const { session } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));
  const hasInterviewerAssignments = useHasInterviewerAssignments(session?.email);

  const setRouteFromHash = useCallback(() => {
    const next = parseHash(window.location.hash);
    setRoute((current) => (routesEqual(current, next) ? current : next));
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', setRouteFromHash);
    return () => window.removeEventListener('hashchange', setRouteFromHash);
  }, [setRouteFromHash]);

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
    if (!session) {
      updateRoute({ page: 'cases' });
    }
  }, [session, updateRoute]);

  const accessibleItems = useMemo<NavigationItem[]>(() => {
    if (!session) {
      return [];
    }

    return navigationItems.filter((item) => {
      if (!item.roleAccess.includes(session.role)) {
        return false;
      }

      if (item.key === 'interviews') {
        if (session.role === 'user') {
          return hasInterviewerAssignments;
        }

        // Для админов не требуем назначений интервью, чтобы все админские разделы оставались доступными
        return true;
      }

      return true;
    });
  }, [session, hasInterviewerAssignments]);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!accessibleItems.length) {
      updateRoute({ page: 'evaluation', evaluation: { mode: 'list' } });
      return;
    }
    if (!accessibleItems.find((item) => item.key === route.page)) {
      const fallback = accessibleItems[0].key;
      if (fallback === 'evaluation') {
        updateRoute({ page: fallback, evaluation: { mode: 'list' } });
      } else {
        updateRoute({ page: fallback });
      }
    }
  }, [session, accessibleItems, route.page, updateRoute]);

  if (!session) {
    return <LoginScreen />;
  }

  const activePage = route.page;

  const handleNavigate = useCallback(
    (key: NavigationKey) => {
      if (key === 'evaluation') {
        updateRoute({ page: 'evaluation', evaluation: { mode: 'list' } });
      } else {
        updateRoute({ page: key });
      }
    },
    [updateRoute]
  );

  const renderContent = () => {
    switch (activePage) {
      case 'cases':
        return <CasesScreen />;
      case 'case-criteria':
        return <CaseCriteriaScreen />;
      case 'questions':
        return <FitQuestionsScreen />;
      case 'candidates':
        return <CandidatesScreen />;
      case 'evaluation':
        return (
          <EvaluationScreen
            view={normalizeEvaluationRoute(route.evaluation)}
            onViewChange={(next) => updateRoute({ page: 'evaluation', evaluation: next })}
          />
        );
      case 'interviews':
        return <InterviewerScreen />;
      case 'stats':
        return <AnalyticsScreen />;
      case 'accounts':
        return <AccountsScreen />;
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
