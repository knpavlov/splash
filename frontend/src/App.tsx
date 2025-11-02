import { useEffect, useMemo } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from './app/AppLayout';
import { NavigationKey, navigationItems, navigationPaths, resolveNavigationKey } from './app/navigation';
import { CasesScreen } from './modules/cases/CasesScreen';
import { CandidatesScreen } from './modules/candidates/CandidatesScreen';
import { EvaluationScreen } from './modules/evaluation/EvaluationScreen';
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
import { EvaluationEditorPage } from './modules/evaluation/EvaluationEditorPage';

const AuthenticatedApp = () => {
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hasInterviewerAssignments = useHasInterviewerAssignments(session?.email);

  const accessibleItems = useMemo(() => {
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
      if (location.pathname !== navigationPaths.evaluation) {
        navigate(navigationPaths.evaluation, { replace: true });
      }
      return;
    }
    const currentKey = resolveNavigationKey(location.pathname);
    if (!accessibleItems.some((item) => item.key === currentKey)) {
      navigate(navigationPaths[accessibleItems[0].key], { replace: true });
    }
  }, [session, accessibleItems, location.pathname, navigate]);

  if (!session) {
    return null;
  }

  const activeKey = resolveNavigationKey(location.pathname);

  const handleNavigate = (key: NavigationKey) => {
    navigate(navigationPaths[key]);
  };

  return (
    <AppLayout
      navigationItems={accessibleItems}
      activeItem={activeKey}
      onNavigate={handleNavigate}
    >
      <Routes>
        <Route path="/" element={<Navigate to={navigationPaths.cases} replace />} />
        <Route path={navigationPaths.cases} element={<CasesScreen />} />
        <Route path={navigationPaths['case-criteria']} element={<CaseCriteriaScreen />} />
        <Route path={navigationPaths.questions} element={<FitQuestionsScreen />} />
        <Route path={navigationPaths.candidates} element={<CandidatesScreen />} />
        <Route path={navigationPaths.evaluation} element={<EvaluationScreen />} />
        <Route path="/evaluations/new" element={<EvaluationEditorPage />} />
        <Route path="/evaluations/:id" element={<EvaluationEditorPage />} />
        <Route path={navigationPaths.interviews} element={<InterviewerScreen />} />
        <Route path={navigationPaths.stats} element={<AnalyticsScreen />} />
        <Route path={navigationPaths.accounts} element={<AccountsScreen />} />
        <Route
          path="*"
          element={
            <PlaceholderScreen
              title="Page not found"
              description="The page you are looking for does not exist."
            />
          }
        />
      </Routes>
    </AppLayout>
  );
};

const AppContent = () => {
  const { session } = useAuth();

  if (!session) {
    return <LoginScreen />;
  }

  return <AuthenticatedApp />;
};

export const App = () => (
  <AuthProvider>
    <AppStateProvider>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </AppStateProvider>
  </AuthProvider>
);
