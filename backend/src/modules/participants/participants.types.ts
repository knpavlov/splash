export interface ParticipantRecord {
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

export interface ParticipantWriteModel {
  id: string;
  displayName: string;
  email: string | null;
  role: string | null;
  hierarchyLevel1: string | null;
  hierarchyLevel2: string | null;
  hierarchyLevel3: string | null;
}

export interface ParticipantUpdateModel {
  displayName?: string;
  email?: string | null;
  role?: string | null;
  hierarchyLevel1?: string | null;
  hierarchyLevel2?: string | null;
  hierarchyLevel3?: string | null;
}

export interface ParticipantInput {
  displayName: string;
  email?: string | null;
  role?: string | null;
  hierarchyLevel1?: string | null;
  hierarchyLevel2?: string | null;
  hierarchyLevel3?: string | null;
}
