import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useDemoDataEraser } from '../hooks/useDemoDataEraser';
import styles from '../../../styles/Sidebar.module.css';

export const EraseDemoDataLink = () => {
  const { session } = useAuth();
  const email = useMemo(() => (session?.role === 'super-admin' ? session.email : null), [session]);
  const { state, error, summary, trigger } = useDemoDataEraser(email);

  if (!email) {
    return null;
  }

  let helperText: string | null = null;

  if (state === 'success' && summary) {
    helperText = `Removed ${summary.candidatesRemoved} candidates.`;
  } else if (state === 'error' && error) {
    helperText = error;
  }

  return (
    <div className={styles.demoSeedBlock}>
      <button
        type="button"
        className={styles.demoEraseLink}
        disabled={state === 'loading'}
        onClick={() => trigger()}
      >
        {state === 'loading' ? 'Erasing demo data…' : 'Erase demo data'}
      </button>
      {helperText && <span className={styles.demoSeedHint}>{helperText}</span>}
    </div>
  );
};
