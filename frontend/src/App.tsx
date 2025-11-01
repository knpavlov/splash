import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from './app/AppLayout';
import { NavigationKey, navigationItems } from './app/navigation';
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

const AppContent = () => {
  const { session } = useAuth();
  const [activePage, setActivePage] = useState<NavigationKey>('cases');
  const hasInterviewerAssignments = useHasInterviewerAssignments(session?.email);

  useEffect(() => {
    if (!session) {
      setActivePage('cases');
    }
  }, [session]);

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
      setActivePage('evaluation');
      return;
    }
    if (!accessibleItems.find((item) => item.key === activePage)) {
      setActivePage(accessibleItems[0].key);
    }
  }, [session, accessibleItems, activePage]);

  if (!session) {
    return <LoginScreen />;
  }

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
        return <EvaluationScreen />;
      case 'interviews':
        return <InterviewerScreen />;
      case 'stats':
        return <AnalyticsScreen />;
      case 'accounts':
        return <AccountsScreen />;
      default:
        return null;
    }
  };

  return (
    <AppLayout
      navigationItems={accessibleItems}
      activeItem={activePage}
      onNavigate={setActivePage}
    >
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
