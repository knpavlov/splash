import { useCallback, useEffect, useMemo, useState } from 'react';
import { Initiative } from '../../shared/types/initiative';
import { Workstream } from '../../shared/types/workstream';
import { useInitiativesState, useWorkstreamsState, useAccountsState } from '../../app/state/AppStateContext';
import { InitiativesList } from './components/InitiativesList';
import { InitiativeProfile } from './components/InitiativeProfile';
import { AccountRecord } from '../../shared/types/account';

export type InitiativesViewRoute =
  | { mode: 'list'; workstreamId?: string }
  | { mode: 'create'; workstreamId?: string }
  | { mode: 'view'; initiativeId: string; workstreamId?: string };

interface InitiativesScreenProps {
  view: InitiativesViewRoute;
  onViewChange: (next: InitiativesViewRoute) => void;
}

const findInitiative = (list: Initiative[], id?: string | null) =>
  id ? list.find((item) => item.id === id) ?? null : null;

export const InitiativesScreen = ({ view, onViewChange }: InitiativesScreenProps) => {
  const { list, saveInitiative, removeInitiative, submitStage } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const { list: accounts } = useAccountsState();

  const selectedWorkstreamId = useMemo(() => {
    if (view.mode === 'list' || view.mode === 'create') {
      return view.workstreamId ?? workstreams[0]?.id ?? null;
    }
    return workstreams[0]?.id ?? null;
  }, [view, workstreams]);

  useEffect(() => {
    if (view.mode === 'list' && !view.workstreamId && selectedWorkstreamId) {
      onViewChange({ mode: 'list', workstreamId: selectedWorkstreamId });
    }
  }, [selectedWorkstreamId, view, onViewChange]);

  const handleCreate = useCallback(
    (workstreamId: string | null) => {
      onViewChange({ mode: 'create', workstreamId: workstreamId ?? undefined });
    },
    [onViewChange]
  );

  const handleOpen = useCallback(
    (initiativeId: string) => {
      onViewChange({
        mode: 'view',
        initiativeId,
        workstreamId: selectedWorkstreamId ?? undefined
      });
    },
    [onViewChange, selectedWorkstreamId]
  );

  const handleBackToList = useCallback(
    (workstreamId?: string) => {
      onViewChange({ mode: 'list', workstreamId: workstreamId ?? selectedWorkstreamId ?? undefined });
    },
    [onViewChange, selectedWorkstreamId]
  );

  const handleSave = useCallback(
    async (draft: Initiative, options: { closeAfterSave: boolean }) => {
      const expectedVersion = view.mode === 'view' ? draft.version : null;
      const result = await saveInitiative(draft, expectedVersion);
      if (result.ok) {
        if (view.mode === 'create' && !options.closeAfterSave) {
          onViewChange({ mode: 'view', initiativeId: result.data.id });
        }
        if (options.closeAfterSave) {
          handleBackToList(result.data.workstreamId);
        }
      }
      return result;
    },
    [handleBackToList, onViewChange, saveInitiative, view.mode]
  );

  const handleRemove = useCallback(
    async (id: string) => {
      const result = await removeInitiative(id);
      if (result.ok) {
        handleBackToList();
      }
      return result;
    },
    [handleBackToList, removeInitiative]
  );

  const handleSubmit = useCallback((id: string) => submitStage(id), [submitStage]);

  if (view.mode === 'view') {
    const initiative = findInitiative(list, view.initiativeId);
    return (
      <InitiativeProfile
        mode="view"
        initiative={initiative}
        allInitiatives={list}
        workstreams={workstreams}
        accounts={accounts}
        onBack={handleBackToList}
        onSave={handleSave}
        onDelete={handleRemove}
        onSubmitStage={handleSubmit}
      />
    );
  }

  if (view.mode === 'create') {
    return (
      <InitiativeProfile
        mode="create"
        initiative={null}
        allInitiatives={list}
        workstreams={workstreams}
        accounts={accounts}
        initialWorkstreamId={view.workstreamId ?? selectedWorkstreamId ?? undefined}
        onBack={handleBackToList}
        onSave={handleSave}
        onDelete={handleRemove}
        onSubmitStage={handleSubmit}
      />
    );
  }

  return (
    <InitiativesList
      initiatives={list}
      workstreams={workstreams}
      selectedWorkstreamId={selectedWorkstreamId}
      onSelectWorkstream={(next) => onViewChange({ mode: 'list', workstreamId: next ?? undefined })}
      onCreate={handleCreate}
      onOpen={handleOpen}
    />
  );
};
