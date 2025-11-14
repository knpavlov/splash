import { useMemo, useState } from 'react';
import styles from '../../styles/ParticipantsScreen.module.css';
import { useParticipantsState } from '../../app/state/AppStateContext';
import { Participant, ParticipantUpdatePayload } from '../../shared/types/participant';

const emptyForm = {
  displayName: '',
  email: '',
  role: '',
  hierarchyLevel1: '',
  hierarchyLevel2: '',
  hierarchyLevel3: ''
};

type ParticipantField =
  | 'displayName'
  | 'email'
  | 'role'
  | 'hierarchyLevel1'
  | 'hierarchyLevel2'
  | 'hierarchyLevel3';

export const ParticipantsScreen = () => {
  const { list, createParticipant, updateParticipant } = useParticipantsState();
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const sortedParticipants = useMemo(
    () => [...list].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [list]
  );

  const handleNewInputChange = (field: ParticipantField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccessMessage(null);
  };

  const handleCreate = async () => {
    const trimmedName = form.displayName.trim();
    if (!trimmedName) {
      setError('Enter participant name.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    const result = await createParticipant({
      displayName: trimmedName,
      email: form.email,
      role: form.role,
      hierarchyLevel1: form.hierarchyLevel1,
      hierarchyLevel2: form.hierarchyLevel2,
      hierarchyLevel3: form.hierarchyLevel3
    });
    setIsSaving(false);
    if (result.ok) {
      setForm(emptyForm);
      setSuccessMessage('Participant added.');
    } else {
      setError('Failed to add participant.');
    }
  };

  const handleNewKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleCreate();
    }
  };

  const handleFieldBlur = async (participant: Participant, field: ParticipantField, raw: string) => {
    const currentValue = participant[field] ?? '';
    const trimmed = raw.trim();
    if (field === 'displayName' && !trimmed) {
      return;
    }
    if ((currentValue || '') === (trimmed || '')) {
      return;
    }
    const payload: ParticipantUpdatePayload = { [field]: trimmed };
    await updateParticipant(participant.id, payload);
  };

  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    }
  };

  const renderParticipantRow = (participant: Participant) => (
    <tr key={participant.id}>
      <td>
        <input
          defaultValue={participant.displayName}
          onBlur={(event) => handleFieldBlur(participant, 'displayName', event.target.value)}
          onKeyDown={handleFieldKeyDown}
        />
      </td>
      <td>
        <input
          defaultValue={participant.email ?? ''}
          placeholder="name@email.com"
          onBlur={(event) => handleFieldBlur(participant, 'email', event.target.value)}
          onKeyDown={handleFieldKeyDown}
        />
      </td>
      <td>
        <input
          defaultValue={participant.role ?? ''}
          placeholder="Role"
          onBlur={(event) => handleFieldBlur(participant, 'role', event.target.value)}
          onKeyDown={handleFieldKeyDown}
        />
      </td>
      <td>
        <input
          defaultValue={participant.hierarchyLevel1 ?? ''}
          placeholder="Level 1"
          onBlur={(event) => handleFieldBlur(participant, 'hierarchyLevel1', event.target.value)}
          onKeyDown={handleFieldKeyDown}
        />
      </td>
      <td>
        <input
          defaultValue={participant.hierarchyLevel2 ?? ''}
          placeholder="Level 2"
          onBlur={(event) => handleFieldBlur(participant, 'hierarchyLevel2', event.target.value)}
          onKeyDown={handleFieldKeyDown}
        />
      </td>
      <td>
        <input
          defaultValue={participant.hierarchyLevel3 ?? ''}
          placeholder="Level 3"
          onBlur={(event) => handleFieldBlur(participant, 'hierarchyLevel3', event.target.value)}
          onKeyDown={handleFieldKeyDown}
        />
      </td>
    </tr>
  );

  return (
    <section className={styles.participantsScreen}>
      <header className={styles.header}>
        <div>
          <h1>Participants</h1>
          <p>Manage the people available for initiative plans and resource dashboards.</p>
        </div>
        {successMessage && <span className={styles.success}>{successMessage}</span>}
        {error && <span className={styles.error}>{error}</span>}
      </header>

      <div className={styles.card}>
        <div className={styles.quickAddRow}>
          <input
            placeholder="Full name *"
            value={form.displayName}
            onChange={(event) => handleNewInputChange('displayName', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(event) => handleNewInputChange('email', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Role"
            value={form.role}
            onChange={(event) => handleNewInputChange('role', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Hierarchy level 1"
            value={form.hierarchyLevel1}
            onChange={(event) => handleNewInputChange('hierarchyLevel1', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Hierarchy level 2"
            value={form.hierarchyLevel2}
            onChange={(event) => handleNewInputChange('hierarchyLevel2', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <input
            placeholder="Hierarchy level 3"
            value={form.hierarchyLevel3}
            onChange={(event) => handleNewInputChange('hierarchyLevel3', event.target.value)}
            onKeyDown={handleNewKeyDown}
          />
          <button
            type="button"
            className={styles.addButton}
            disabled={isSaving}
            onClick={() => void handleCreate()}
          >
            {isSaving ? 'Adding…' : 'Add participant'}
          </button>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Hierarchy level 1</th>
              <th>Hierarchy level 2</th>
              <th>Hierarchy level 3</th>
            </tr>
          </thead>
          <tbody>
            {sortedParticipants.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
                  No participants yet. Add them above to start assigning tasks.
                </td>
              </tr>
            ) : (
              sortedParticipants.map((participant) => renderParticipantRow(participant))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
