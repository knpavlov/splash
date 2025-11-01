export interface CandidateResume {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
  textContent?: string;
}

export type CandidateTargetPractice = 'PI' | 'PEPI' | 'ET' | 'Tax' | 'Restructuring';

export interface CandidateProfile {
  id: string;
  version: number;
  firstName: string;
  lastName: string;
  gender?: string;
  age?: number;
  city?: string;
  desiredPosition?: string;
  targetPractice?: CandidateTargetPractice;
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
  resume?: CandidateResume;
  createdAt: string;
  updatedAt: string;
}
