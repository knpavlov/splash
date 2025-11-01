export interface CaseFileRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
}

export interface CaseFolder {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  files: CaseFileRecord[];
  evaluationCriteria: CaseEvaluationCriterion[];
}

export interface CaseFileUploadDto {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface CaseEvaluationCriterion {
  id: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}
