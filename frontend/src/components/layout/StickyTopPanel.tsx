import { ReactNode } from 'react';
import styles from '../../styles/StickyTopPanel.module.css';

interface StickyTopPanelProps {
  left?: ReactNode;
  right?: ReactNode;
  message?: ReactNode;
  className?: string;
}

export const StickyTopPanel = ({ left, right, message, className }: StickyTopPanelProps) => {
  return (
    <div className={`${styles.panel}${className ? ` ${className}` : ''}`}>
      <div className={styles.row}>
        <div className={styles.left}>{left}</div>
        <div className={styles.right}>{right}</div>
      </div>
      {message ? <div className={styles.message}>{message}</div> : null}
    </div>
  );
};

