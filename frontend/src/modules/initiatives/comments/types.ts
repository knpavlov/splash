import { InitiativeCommentSelection, InitiativeStageKey } from '../../../shared/types/initiative';

export interface CommentSelectionTarget {
  targetId: string;
  targetLabel: string | null;
  targetPath: string | null;
  selection: InitiativeCommentSelection;
  cursor?: { x: number; y: number };
  mode?: 'element' | 'region';
}

export interface CommentSelectionDraft extends CommentSelectionTarget {
  stageKey: InitiativeStageKey;
}
