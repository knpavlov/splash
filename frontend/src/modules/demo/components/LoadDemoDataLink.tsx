import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useDemoDataLoader } from '../hooks/useDemoDataLoader';
import styles from '../../../styles/Sidebar.module.css';

export const LoadDemoDataLink = () => {
  const { session } = useAuth();
  const email = useMemo(() => (session?.role === 'super-admin' ? session.email : null), [session]);
  const { state, error, summary, trigger } = useDemoDataLoader(email);

  if (!email) {
    return null;
  }

  let helperText: string | null = null;

  if (state === 'success' && summary) {
    helperText = `Loaded ${summary.candidatesProcessed} candidates.`;
  } else if (state === 'error' && error) {
    helperText = error;
  }

  return (
    <div className={styles.demoSeedBlock}>
      <button
        type="button"
        className={styles.demoSeedLink}
        disabled={state === 'loading'}
        onClick={() => trigger()}
      >
        {state === 'loading' ? 'Loading demo data…' : 'Load demo data'}
      </button>
      {helperText && <span className={styles.demoSeedHint}>{helperText}</span>}
    </div>
  );
};
