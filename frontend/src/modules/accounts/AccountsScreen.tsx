import { useMemo, useState } from 'react';
import styles from '../../styles/AccountsScreen.module.css';
import { useAccountsState } from '../../app/state/AppStateContext';
import { useAuth } from '../auth/AuthContext';
import { resolveAccountName } from '../../shared/utils/accountName';
import type { InterviewerSeniority } from '../../shared/types/account';

type Banner = { type: 'info' | 'error'; text: string } | null;

type SortKey = 'name' | 'email' | 'status' | 'role' | 'invitation';

const INTERVIEWER_ROLES: InterviewerSeniority[] = ['MD', 'SD', 'D', 'SM', 'M', 'SA', 'A'];

export const AccountsScreen = () => {
  const { session } = useAuth();
  const role = session?.role ?? 'user';
  const { list, inviteAccount, activateAccount, removeAccount, updateRole } = useAccountsState();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [targetRole, setTargetRole] = useState<'admin' | 'user'>('admin');
  const [interviewerRole, setInterviewerRole] = useState<InterviewerSeniority>('MD');
  const [banner, setBanner] = useState<Banner>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const sortedAccounts = useMemo(() => {
    const copy = [...list];

    const nameCache = new Map<string, string>();
    const readName = (account: typeof copy[number]) => {
      const cached = nameCache.get(account.id);
      if (cached) {
        return cached;
      }
      const resolved = resolveAccountName(account);
      nameCache.set(account.id, resolved);
      return resolved;
    };

    const compareStrings = (a: string, b: string) => a.localeCompare(b, 'ru', { sensitivity: 'base' });
    const compareRoles = (a: typeof copy[number], b: typeof copy[number]) => {
      const order = new Map([
        ['super-admin', 2],
        ['admin', 1],
        ['user', 0]
      ]);
      const scoreA = order.get(a.role) ?? -1;
      const scoreB = order.get(b.role) ?? -1;
      return scoreA - scoreB;
    };
    const compareStatus = (a: typeof copy[number], b: typeof copy[number]) => {
      const statusOrder = new Map([
        ['active', 1],
        ['pending', 0]
      ]);
      const scoreA = statusOrder.get(a.status) ?? -1;
      const scoreB = statusOrder.get(b.status) ?? -1;
      return scoreA - scoreB;
    };

    copy.sort((a, b) => {
      let result = 0;

      if (sortKey === 'name') {
        result = compareStrings(readName(a), readName(b));
      } else if (sortKey === 'email') {
        result = compareStrings(a.email, b.email);
      } else if (sortKey === 'role') {
        result = compareRoles(a, b);
      } else if (sortKey === 'status') {
        result = compareStatus(a, b);
      } else if (sortKey === 'invitation') {
        const invitationA = a.invitationToken ?? '';
        const invitationB = b.invitationToken ?? '';
        result = compareStrings(invitationA, invitationB);
      }

      if (result === 0 && sortKey !== 'email') {
        result = compareStrings(readName(a), readName(b));
        if (result === 0) {
          result = compareStrings(a.email, b.email);
        }
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return copy;
  }, [list, sortDirection, sortKey]);

  const handleSortChange = (key: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setSortDirection('asc');
      return key;
    });
  };

  if (role !== 'super-admin' && role !== 'admin') {
    return (
      <section className={styles.wrapper}>
        <div className={styles.restricted}>
          <h1>Access denied</h1>
          <p>Only administrators can manage accounts.</p>
        </div>
      </section>
    );
  }

  const handleInvite = async () => {
    const result = await inviteAccount(email, targetRole, firstName, lastName, interviewerRole);
    if (!result.ok) {
      const message =
        result.error === 'duplicate'
          ? 'This user has already been invited.'
          : result.error === 'invalid-input'
            ? 'Enter a valid name, email, and interviewer role.'
            : result.error === 'mailer-unavailable'
              ? 'Email delivery is not configured. Fix the settings and try again.'
              : 'Failed to send the invitation. Try again later.';
      setBanner({ type: 'error', text: message });
      return;
    }
    setBanner({ type: 'info', text: `Invitation email sent to ${result.data.email}.` });
    setEmail('');
    setFirstName('');
    setLastName('');
    setInterviewerRole('MD');
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setBanner({ type: 'info', text: 'Invitation token copied.' });
    } catch (error) {
      console.error('Failed to copy invitation token:', error);
      setBanner({ type: 'error', text: 'Failed to copy the token. Copy it manually.' });
    }
  };

  const handleActivate = async (id: string) => {
    const result = await activateAccount(id);
    if (!result.ok) {
      const message =
        result.error === 'not-found' ? 'Account not found.' : 'Failed to activate the account.';
      setBanner({ type: 'error', text: message });
      return;
    }
    setBanner({ type: 'info', text: `Account ${result.data.email} activated.` });
  };

  const handleRemove = async (id: string) => {
    const confirmed = window.confirm('Delete the account permanently?');
    if (!confirmed) {
      return;
    }
    const result = await removeAccount(id);
    if (!result.ok) {
      const message =
        result.error === 'not-found'
          ? 'Account not found.'
          : result.error === 'invalid-input'
            ? 'The super admin cannot be deleted.'
            : 'Failed to delete the account.';
      setBanner({ type: 'error', text: message });
      return;
    }
    setBanner({ type: 'info', text: 'Account deleted.' });
  };

  const handleRoleChange = async (id: string, nextRole: 'admin' | 'user') => {
    setUpdatingRoleId(id);
    try {
      const result = await updateRole(id, nextRole);
      if (!result.ok) {
        const message =
          result.error === 'not-found'
            ? 'Account not found.'
            : result.error === 'invalid-input'
              ? 'This access level cannot be assigned to the selected account.'
              : 'Failed to update the access level.';
        setBanner({ type: 'error', text: message });
        return;
      }
      const updatedAccount = result.data;
      const name = resolveAccountName(updatedAccount) || updatedAccount.email;
      setBanner({ type: 'info', text: `Access level updated for ${name}.` });
    } catch (error) {
      console.error('Failed to update account role:', error);
      setBanner({ type: 'error', text: 'Failed to update the access level.' });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Account management</h1>
          <p className={styles.subtitle}>
            Invite admins and users, track activation, and remove accounts.
          </p>
        </div>
      </header>

      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
      )}

      <section className={styles.invitePanel} aria-labelledby="invite-heading">
        <div className={styles.invitePanelHeader}>
          <h2 id="invite-heading">Create a new account</h2>
          <p>Fill in the personal details, pick access level, and send an invitation email.</p>
        </div>
        <div className={styles.inviteForm}>
          <input
            className={styles.firstNameInput}
            placeholder="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <input
            className={styles.lastNameInput}
            placeholder="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
          <input
            className={styles.emailInput}
            placeholder="email@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select
            className={styles.roleSelect}
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value as 'admin' | 'user')}
          >
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <select
            className={styles.roleSelect}
            value={interviewerRole}
            aria-label="A&M role"
            onChange={(event) => setInterviewerRole(event.target.value as InterviewerSeniority)}
          >
            {INTERVIEWER_ROLES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <button className={styles.primaryButton} onClick={() => void handleInvite()} type="button">
            Send invitation
          </button>
        </div>
      </section>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortKey === 'name' ? styles.sortButtonActive : ''}`}
                  onClick={() => handleSortChange('name')}
                >
                  Name
                  {sortKey === 'name' && (
                    <span className={styles.sortIcon}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortKey === 'email' ? styles.sortButtonActive : ''}`}
                  onClick={() => handleSortChange('email')}
                >
                  Email
                  {sortKey === 'email' && (
                    <span className={styles.sortIcon}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortKey === 'status' ? styles.sortButtonActive : ''}`}
                  onClick={() => handleSortChange('status')}
                >
                  Status
                  {sortKey === 'status' && (
                    <span className={styles.sortIcon}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortKey === 'role' ? styles.sortButtonActive : ''}`}
                  onClick={() => handleSortChange('role')}
                >
                  Role
                  {sortKey === 'role' && (
                    <span className={styles.sortIcon}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th>A&amp;M role</th>
              <th>
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortKey === 'invitation' ? styles.sortButtonActive : ''}`}
                  onClick={() => handleSortChange('invitation')}
                >
                  Invitation
                  {sortKey === 'invitation' && (
                    <span className={styles.sortIcon}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.map((account) => (
              <tr key={account.id}>
                <td>{resolveAccountName(account)}</td>
                <td>{account.email}</td>
                <td>
                  <span
                    className={
                      account.status === 'active' ? styles.statusBadgeActive : styles.statusBadgePending
                    }
                  >
                    {account.status === 'active' ? 'Active' : 'Pending activation'}
                  </span>
                </td>
                <td>
                  {account.role === 'super-admin' ? (
                    'Super admin'
                  ) : (
                    <select
                      className={styles.roleInlineSelect}
                      value={account.role}
                      disabled={updatingRoleId === account.id}
                      aria-label={`Change access level for ${resolveAccountName(account) || account.email}`}
                      onChange={(event) =>
                        handleRoleChange(account.id, event.target.value === 'admin' ? 'admin' : 'user')
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                    </select>
                  )}
                </td>
                <td>{account.interviewerRole ?? '—'}</td>
                <td>
                  {account.status === 'pending' ? (
                    <div className={styles.tokenCell}>
                      <code className={styles.tokenValue}>{account.invitationToken}</code>
                      <button
                        className={styles.secondaryButton}
                        onClick={() => void handleCopyToken(account.invitationToken)}
                        type="button"
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <span className={styles.tokenInfo}>Account active</span>
                  )}
                </td>
                <td className={styles.actionsCell}>
                  {account.status === 'pending' && (
                    <button
                      className={styles.secondaryButton}
                      onClick={() => void handleActivate(account.id)}
                      type="button"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    className={styles.dangerButton}
                    onClick={() => void handleRemove(account.id)}
                    disabled={account.role === 'super-admin'}
                    type="button"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
