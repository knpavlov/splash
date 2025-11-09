import { InitiativeCommentSelection, InitiativeStageKey } from '../../../shared/types/initiative';

export interface CommentSelectionTarget {
  targetId: string;
  targetLabel: string | null;
  targetPath: string | null;
  selection: InitiativeCommentSelection;
}

export interface CommentSelectionDraft extends CommentSelectionTarget {
  stageKey: InitiativeStageKey;
}
