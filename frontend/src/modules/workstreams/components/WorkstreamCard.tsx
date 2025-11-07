import { Workstream } from '../../../shared/types/workstream';
import styles from '../../../styles/WorkstreamCard.module.css';

interface WorkstreamCardProps {
  workstream: Workstream;
  onOpen: () => void;
}

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const WorkstreamCard = ({ workstream, onOpen }: WorkstreamCardProps) => (
  <button className={styles.card} onClick={onOpen}>
    <h3>{workstream.name}</h3>
    <p className={styles.description}>{workstream.description || 'No description yet.'}</p>
    <p className={styles.updated}>Last update: {formatTimestamp(workstream.updatedAt)}</p>
  </button>
);
