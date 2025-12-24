import { ReactNode, forwardRef } from 'react';
import styles from '../../styles/StickyTopPanel.module.css';

interface StickyTopPanelProps {
  left?: ReactNode;
  right?: ReactNode;
  message?: ReactNode;
  top?: ReactNode;
  className?: string;
  density?: 'default' | 'compact';
}

export const StickyTopPanel = forwardRef<HTMLDivElement, StickyTopPanelProps>(
  ({ left, right, message, top, className, density = 'default' }, ref) => {
    const densityClass = density === 'compact' ? ` ${styles.compact}` : '';
    return (
      <div ref={ref} className={`${styles.panel}${densityClass}${className ? ` ${className}` : ''}`}>
        <div className={styles.row}>
          <div className={styles.left}>{left}</div>
          {top ? <div className={styles.center}>{top}</div> : null}
          <div className={styles.right}>{right}</div>
        </div>
        {message ? <div className={styles.message}>{message}</div> : null}
      </div>
    );
  }
);

StickyTopPanel.displayName = 'StickyTopPanel';

