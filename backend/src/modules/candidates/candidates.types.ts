export interface CandidateResumeRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
  textContent?: string;
}

export interface CandidateRecord {
  id: string;
  version: number;
  firstName: string;
  lastName: string;
  gender?: string;
  age?: number;
  city?: string;
  desiredPosition?: string;
  targetPractice?: string;
  targetOffice?: string;
  phone?: string;
  email?: string;
  experienceSummary?: string;
  totalExperienceYears?: number;
  consultingExperienceYears?: number;
  consultingCompanies?: string;
  lastCompany?: string;
  lastPosition?: string;
  lastDuration?: string;
  resume?: CandidateResumeRecord;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateWriteModel {
  id: string;
  firstName: string;
  lastName: string;
  gender?: string;
  age?: number;
  city?: string;
  desiredPosition?: string;
  targetPractice?: string;
  targetOffice?: string;
  phone?: string;
  email?: string;
  experienceSummary?: string;
  totalExperienceYears?: number;
  consultingExperienceYears?: number;
  consultingCompanies?: string;
  lastCompany?: string;
  lastPosition?: string;
  lastDuration?: string;
  resume?: CandidateResumeRecord | null;
}
