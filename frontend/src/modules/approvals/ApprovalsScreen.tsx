import { useCallback, useEffect, useState } from 'react';
import styles from '../../styles/ApprovalsScreen.module.css';
import { approvalsApi } from './services/approvalsApi';
import { ApprovalDecision, ApprovalTask } from '../../shared/types/approval';
import { ApiError } from '../../shared/api/httpClient';
import { useAuth } from '../auth/AuthContext';
import { ApprovalsQueueTable } from './components/ApprovalsQueueTable';
import { InitiativeProfile } from '../initiatives/components/InitiativeProfile';
import { initiativesApi } from '../initiatives/services/initiativesApi';
import { Initiative } from '../../shared/types/initiative';
import { useAccountsState, useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';

type Banner = { type: 'info' | 'error'; text: string } | null;
type ViewMode = 'queue' | 'profile';

export const ApprovalsScreen = () => {
  const { session } = useAuth();
  const { list: workstreams } = useWorkstreamsState();
  const { list: accounts } = useAccountsState();
  const { saveInitiative, removeInitiative, submitStage } = useInitiativesState();

  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('queue');
  const [selectedTask, setSelectedTask] = useState<ApprovalTask | null>(null);
  const [selectedInitiative, setSelectedInitiative] = useState<Initiative | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isDeciding, setIsDeciding] = useState<ApprovalDecision | null>(null);
  const [comment, setComment] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const handleProfileSave = useCallback(
    (next: Initiative, _options: { closeAfterSave: boolean }) => saveInitiative(next, next.version ?? null),
    [saveInitiative]
  );
  const handleProfileDelete = useCallback((id: string) => removeInitiative(id), [removeInitiative]);

  const loadTasks = useCallback(async () => {
    setIsQueueLoading(true);
    try {
      const data = await approvalsApi.list({ status: 'pending', accountId: session?.accountId });
      setTasks(data);
      if (data.length === 0) {
        setSelectedTask(null);
        setSelectedInitiative(null);
        setViewMode('queue');
      } else if (selectedTask) {
        const updatedTask = data.find((task) => task.id === selectedTask.id);
        if (!updatedTask) {
          setSelectedTask(null);
          setSelectedInitiative(null);
          setViewMode('queue');
        } else {
          setSelectedTask(updatedTask);
        }
      }
    } catch (error) {
      console.error('Failed to load approvals', error);
      setBanner({ type: 'error', text: 'Failed to load approval queue. Please retry.' });
    } finally {
      setIsQueueLoading(false);
    }
  }, [selectedTask, session?.accountId]);

  useEffect(() => {
    loadTasks().catch(() => {});
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTask) {
      setSelectedInitiative(null);
      setHasLoadedProfile(false);
      return;
    }
    setIsProfileLoading(true);
    setProfileError(null);
    initiativesApi
      .get(selectedTask.initiativeId)
      .then((initiative) => {
        setSelectedInitiative(initiative);
        setHasLoadedProfile(true);
      })
      .catch((error) => {
        console.error('Failed to load initiative profile', error);
        setProfileError('Failed to load initiative profile. Please retry.');
      })
      .finally(() => setIsProfileLoading(false));
  }, [selectedTask]);

  const handleOpenTask = (task: ApprovalTask) => {
    setSelectedTask(task);
    setViewMode('profile');
    setComment('');
    setBanner(null);
  };

  const handleBackToQueue = () => {
    setViewMode('queue');
    setSelectedTask(null);
    setSelectedInitiative(null);
    setComment('');
    setHasLoadedProfile(false);
  };

  const handleDecision = async (decision: ApprovalDecision) => {
    if (!selectedTask) {
      return;
    }
    if ((decision === 'return' || decision === 'reject') && !comment.trim()) {
      setBanner({ type: 'error', text: 'Please add a comment before returning or rejecting the initiative.' });
      return;
    }
    setIsDeciding(decision);
    setBanner(null);
    try {
      await approvalsApi.decide(selectedTask.id, decision, {
        comment: comment.trim() || null,
        accountId: session?.accountId
      });
      setComment('');
      await loadTasks();
      setBanner({ type: 'info', text: decision === 'approve' ? 'Approved successfully.' : 'Decision saved.' });
      handleBackToQueue();
    } catch (error) {
      if (error instanceof ApiError) {
        const message =
          error.code === 'forbidden'
            ? 'You cannot act on this approval.'
            : error.code === 'missing-approvers'
              ? 'Workstream approvers are not set up for the next round.'
              : 'Failed to submit your decision. Please retry.';
        setBanner({ type: 'error', text: message });
      } else {
        console.error('Failed to submit decision', error);
        setBanner({ type: 'error', text: 'Failed to submit your decision. Please retry.' });
      }
    } finally {
      setIsDeciding(null);
    }
  };

  const renderQueue = () => (
    <section className={styles.queueWrapper}>
      <header className={styles.queueHeader}>
        <div>
          <h1>Approvals</h1>
          <p>Review initiatives waiting for your sign-off.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => loadTasks()}>
          Refresh
        </button>
      </header>
      {banner && banner.type === 'error' && <div className={styles.errorBanner}>{banner.text}</div>}
      <div className={styles.queueCard}>
        <ApprovalsQueueTable tasks={tasks} isLoading={isQueueLoading} onSelect={handleOpenTask} />
      </div>
    </section>
  );

  const renderProfile = () => (
    <section className={styles.profileView}>
      <header className={styles.profileTopBar}>
        <button className={styles.backButton} type="button" onClick={handleBackToQueue}>
          Back to queue
        </button>
        <div>
          <h2>{selectedTask?.initiativeName}</h2>
          <p>
            {selectedTask?.workstreamName} В· {selectedTask?.role}
          </p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => loadTasks()}>
          Refresh queue
        </button>
      </header>
      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
      )}
      {profileError && <div className={styles.errorBanner}>{profileError}</div>}
      {isProfileLoading && !hasLoadedProfile && (
        <p className={styles.placeholder}>Loading initiative profile...</p>
      )}
      {selectedInitiative && (
        <div className={styles.profileBody}>
          <InitiativeProfile
            mode="view"
            initiative={selectedInitiative}
            workstreams={workstreams}
            accounts={accounts}
            onBack={() => handleBackToQueue()}
            onSave={handleProfileSave}
            onDelete={handleProfileDelete}
            onSubmitStage={submitStage}
            readOnly
            hideBackLink
          />
          {isProfileLoading && (
            <div className={styles.profileLoadingOverlay}>
              <span>Refreshing profile...</span>
            </div>
          )}
        </div>
      )}
      <div className={styles.decisionPanel}>
        <h3>Your decision</h3>
        <textarea
          className={styles.commentInput}
          placeholder="Add a comment (required for return/reject)"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
        />
        <div className={styles.decisionActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => handleDecision('return')}
            disabled={isDeciding === 'return'}
          >
            {isDeciding === 'return' ? 'Sending...' : 'Return'}
          </button>
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() => handleDecision('reject')}
            disabled={isDeciding === 'reject'}
          >
            {isDeciding === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => handleDecision('approve')}
            disabled={isDeciding === 'approve'}
          >
            {isDeciding === 'approve' ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>
    </section>
  );

  return viewMode === 'queue' ? renderQueue() : renderProfile();
};

