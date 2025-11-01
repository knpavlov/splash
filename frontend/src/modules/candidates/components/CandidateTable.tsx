import styles from '../../../styles/CandidatesScreen.module.css';

export type CandidateSortKey =
  | 'firstName'
  | 'lastName'
  | 'gender'
  | 'age'
  | 'city'
  | 'desiredPosition'
  | 'targetPractice'
  | 'targetOffice'
  | 'phone'
  | 'email'
  | 'updatedAt';

export interface CandidateTableRow {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  age: string;
  city: string;
  desiredPosition: string;
  targetPractice: string;
  targetOffice: string;
  phone: string;
  email: string;
  updatedAt: string;
  hasResume: boolean;
  onOpen: () => void;
  onDownloadResume?: () => void;
}

interface CandidateTableProps {
  rows: CandidateTableRow[];
  sortKey: CandidateSortKey;
  sortDirection: 'asc' | 'desc';
  onSortChange: (key: CandidateSortKey) => void;
}

const formatDate = (input: string) => {
  const date = new Date(input);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(date);
};

const SORTABLE_COLUMNS: Array<{ key: CandidateSortKey; title: string }> = [
  { key: 'firstName', title: 'First name' },
  { key: 'lastName', title: 'Last name' },
  { key: 'gender', title: 'Gender' },
  { key: 'age', title: 'Age' },
  { key: 'city', title: 'City' },
  { key: 'desiredPosition', title: 'Desired position' },
  { key: 'targetPractice', title: 'Target practice' },
  { key: 'targetOffice', title: 'Target office' },
  { key: 'phone', title: 'Phone' },
  { key: 'email', title: 'Email' },
  { key: 'updatedAt', title: 'Last updated' }
];

const getSortLabel = (direction: 'asc' | 'desc') => (direction === 'asc' ? '▲' : '▼');

export const CandidateTable = ({ rows, sortDirection, sortKey, onSortChange }: CandidateTableProps) => {
  if (rows.length === 0) {
    return (
      <div className={styles.tableWrapper}>
        <div className={styles.emptyState}>
          <h2>No candidates yet</h2>
          <p>Use the “Create profile” button to add the first candidate.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {SORTABLE_COLUMNS.map((column) => {
              const isActive = sortKey === column.key;
              return (
                <th key={column.key}>
                  <button
                    type="button"
                    className={`${styles.sortButton} ${isActive ? styles.sortButtonActive : ''}`}
                    onClick={() => onSortChange(column.key)}
                  >
                    {column.title}
                    {isActive && <span className={styles.sortIcon}>{getSortLabel(sortDirection)}</span>}
                  </button>
                </th>
              );
            })}
            <th className={styles.resumeHeader}>Resume</th>
            <th className={styles.actionsHeader}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.firstName}</td>
              <td>{row.lastName}</td>
              <td>{row.gender}</td>
              <td>{row.age}</td>
              <td>{row.city}</td>
              <td>{row.desiredPosition}</td>
              <td>{row.targetPractice}</td>
              <td>{row.targetOffice}</td>
              <td>{row.phone}</td>
              <td>{row.email}</td>
              <td>{formatDate(row.updatedAt)}</td>
              <td className={styles.resumeCell}>
                {row.hasResume ? (
                  <button
                    className={styles.tableSecondaryButton}
                    onClick={() => row.onDownloadResume?.()}
                  >
                    Download
                  </button>
                ) : (
                  <span className={styles.resumePlaceholder}>No resume</span>
                )}
              </td>
              <td className={styles.actionsCell}>
                <button className={styles.tableSecondaryButton} onClick={row.onOpen}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
