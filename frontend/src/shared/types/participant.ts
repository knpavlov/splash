export interface Participant {
  id: string;
  displayName: string;
  email: string | null;
  role: string | null;
  hierarchyLevel1: string | null;
  hierarchyLevel2: string | null;
  hierarchyLevel3: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantPayload {
  displayName: string;
  email?: string | null;
  role?: string | null;
  hierarchyLevel1?: string | null;
  hierarchyLevel2?: string | null;
  hierarchyLevel3?: string | null;
}

export type ParticipantUpdatePayload = Partial<ParticipantPayload>;
