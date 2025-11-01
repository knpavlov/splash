import { apiRequest } from '../../../shared/api/httpClient';
import {
  EvaluationCriterionScore,
  InterviewerAssignmentView,
  InterviewStatusRecord,
  OfferRecommendationValue,
  InterviewPeerFormView
} from '../../../shared/types/evaluation';
import {
  CandidateProfile,
  CandidateResume,
  CandidateTargetPractice
} from '../../../shared/types/candidate';
import { CaseFileRecord, CaseFolder } from '../../../shared/types/caseLibrary';
import { FitQuestion } from '../../../shared/types/fitQuestion';

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
};

const TARGET_PRACTICE_OPTIONS: CandidateTargetPractice[] = [
  'PI',
  'PEPI',
  'ET',
  'Tax',
  'Restructuring'
];

const normalizePractice = (value: unknown): CandidateTargetPractice | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return TARGET_PRACTICE_OPTIONS.includes(trimmed as CandidateTargetPractice)
    ? (trimmed as CandidateTargetPractice)
    : undefined;
};

const normalizeIso = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const DECISION_VALUES = ['offer', 'accepted-offer', 'reject', 'progress'] as const;

const normalizeDecision = (value: unknown): InterviewerAssignmentView['decision'] => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const match = DECISION_VALUES.find((entry) => entry === normalized);
  return (match ?? null) as InterviewerAssignmentView['decision'];
};

const normalizePeerForm = (value: unknown): InterviewPeerFormView | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Partial<InterviewPeerFormView> & {
    slotId?: unknown;
    interviewerEmail?: unknown;
    form?: unknown;
    submitted?: unknown;
  };
  const slotId = normalizeString(payload.slotId)?.trim();
  if (!slotId) {
    return undefined;
  }
  const interviewerEmail = normalizeString(payload.interviewerEmail)?.trim();
  if (!interviewerEmail) {
    return undefined;
  }
  return {
    slotId,
    interviewerEmail,
    interviewerName: normalizeString(payload.interviewerName) ?? 'Interviewer',
    submitted: typeof payload.submitted === 'boolean' ? payload.submitted : Boolean(payload.form && (payload.form as { submitted?: unknown }).submitted),
    form: normalizeForm(payload.form)
  };
};

const normalizePeerForms = (value: unknown): InterviewPeerFormView[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizePeerForm(item))
    .filter((item): item is InterviewPeerFormView => Boolean(item));
};

const normalizeCriteriaList = (value: unknown): EvaluationCriterionScore[] => {
  const result: EvaluationCriterionScore[] = [];
  const appendEntry = (entry: unknown, fallbackId?: string) => {
    if (entry && typeof entry === 'object') {
      const payload = entry as Record<string, unknown>;
      const explicitId = normalizeString(payload.criterionId)?.trim();
      const criterionId = explicitId || (fallbackId ?? '');
      if (!criterionId) {
        return;
      }
      const rawScore = explicitId ? payload.score : payload.score ?? payload.value ?? entry;
      let score: number | undefined;
      if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
        score = rawScore;
      } else if (typeof rawScore === 'string' && rawScore.trim()) {
        const parsed = Number(rawScore);
        if (!Number.isNaN(parsed)) {
          score = parsed;
        }
      }
      const notApplicable = payload.notApplicable === true;
      result.push({ criterionId, score, notApplicable });
      return;
    }
    if (!fallbackId) {
      return;
    }
    let score: number | undefined;
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      score = entry;
    } else if (typeof entry === 'string' && entry.trim()) {
      const parsed = Number(entry);
      if (!Number.isNaN(parsed)) {
        score = parsed;
      }
    }
    result.push({ criterionId: fallbackId, score });
  };

  if (Array.isArray(value)) {
    for (const entry of value) {
      appendEntry(entry);
    }
    return result;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      appendEntry(entry, key);
    }
    return result;
  }

  return result;
};

const normalizeOfferRecommendation = (value: unknown): OfferRecommendationValue | undefined => {
  if (value === 'yes_priority' || value === 'yes_strong' || value === 'yes_keep_warm' || value === 'no_offer') {
    return value;
  }
  return undefined;
};

const normalizeResume = (value: unknown): CandidateResume | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Partial<CandidateResume> & { id?: unknown };
  const id = normalizeString(payload.id)?.trim();
  const fileName = normalizeString(payload.fileName)?.trim();
  const dataUrl = normalizeString(payload.dataUrl);
  if (!id || !fileName || !dataUrl) {
    return undefined;
  }
  return {
    id,
    fileName,
    mimeType: normalizeString(payload.mimeType) ?? 'application/octet-stream',
    size: normalizeNumber(payload.size) ?? 0,
    dataUrl,
    uploadedAt: normalizeIso(payload.uploadedAt) ?? new Date().toISOString(),
    textContent: normalizeString(payload.textContent)
  };
};

const normalizeCandidate = (value: unknown): CandidateProfile | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Partial<CandidateProfile> & { id?: unknown; firstName?: unknown; lastName?: unknown };
  const id = normalizeString(payload.id)?.trim();
  if (!id) {
    return undefined;
  }
  const firstName = normalizeString(payload.firstName)?.trim() ?? '';
  const lastName = normalizeString(payload.lastName)?.trim() ?? '';
  const resume = normalizeResume(payload.resume);
  return {
    id,
    version: normalizeNumber(payload.version) ?? 1,
    firstName,
    lastName,
    gender: normalizeString(payload.gender) ?? undefined,
    age: normalizeNumber(payload.age),
    city: normalizeString(payload.city) ?? undefined,
    desiredPosition: normalizeString(payload.desiredPosition) ?? undefined,
    targetPractice: normalizePractice(payload.targetPractice),
    targetOffice: normalizeString(payload.targetOffice) ?? undefined,
    phone: normalizeString(payload.phone) ?? undefined,
    email: normalizeString(payload.email) ?? undefined,
    experienceSummary: normalizeString(payload.experienceSummary) ?? undefined,
    totalExperienceYears: normalizeNumber(payload.totalExperienceYears),
    consultingExperienceYears: normalizeNumber(payload.consultingExperienceYears),
    consultingCompanies: normalizeString(payload.consultingCompanies) ?? undefined,
    lastCompany: normalizeString(payload.lastCompany) ?? undefined,
    lastPosition: normalizeString(payload.lastPosition) ?? undefined,
    lastDuration: normalizeString(payload.lastDuration) ?? undefined,
    resume,
    createdAt: normalizeIso(payload.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeIso(payload.updatedAt) ?? new Date().toISOString()
  };
};

const normalizeCaseFile = (value: unknown): CaseFileRecord | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Partial<CaseFileRecord> & { id?: unknown };
  const id = normalizeString(payload.id)?.trim();
  const fileName = normalizeString(payload.fileName)?.trim();
  const dataUrl = normalizeString(payload.dataUrl);
  if (!id || !fileName || !dataUrl) {
    return undefined;
  }
  return {
    id,
    fileName,
    mimeType: normalizeString(payload.mimeType) ?? 'application/octet-stream',
    size: normalizeNumber(payload.size) ?? 0,
    uploadedAt: normalizeIso(payload.uploadedAt) ?? new Date().toISOString(),
    dataUrl
  };
};

const normalizeCaseFolder = (value: unknown): CaseFolder | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Partial<CaseFolder> & { id?: unknown };
  const id = normalizeString(payload.id)?.trim();
  const name = normalizeString(payload.name)?.trim();
  if (!id || !name) {
    return undefined;
  }
  const files = Array.isArray(payload.files)
    ? payload.files
        .map((item) => normalizeCaseFile(item))
        .filter((file): file is CaseFileRecord => Boolean(file))
    : [];
  const criteria = Array.isArray(payload.evaluationCriteria)
    ? payload.evaluationCriteria
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return undefined;
          }
          const criterion = entry as Partial<CaseFolder['evaluationCriteria'][number]> & { id?: unknown };
          const criterionId = normalizeString(criterion.id)?.trim();
          const title = normalizeString(criterion.title)?.trim();
          if (!criterionId || !title) {
            return undefined;
          }
          const ratings: CaseFolder['evaluationCriteria'][number]['ratings'] = {};
          const source = (criterion.ratings ?? {}) as Record<string, unknown>;
          for (const score of [1, 2, 3, 4, 5] as const) {
            const valueRaw = normalizeString(source[String(score)]);
            if (valueRaw) {
              ratings[score] = valueRaw;
            }
          }
          return { id: criterionId, title, ratings };
        })
        .filter((item): item is CaseFolder['evaluationCriteria'][number] => Boolean(item))
    : [];
  return {
    id,
    name,
    version: normalizeNumber(payload.version) ?? 1,
    createdAt: normalizeIso(payload.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeIso(payload.updatedAt) ?? new Date().toISOString(),
    files,
    evaluationCriteria: criteria
  };
};

const normalizeFitQuestion = (value: unknown): FitQuestion | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const payload = value as Partial<FitQuestion> & { id?: unknown };
  const id = normalizeString(payload.id)?.trim();
  const shortTitle = normalizeString(payload.shortTitle)?.trim();
  const content = normalizeString(payload.content)?.trim();
  if (!id || !shortTitle || !content) {
    return undefined;
  }
  const criteria = Array.isArray(payload.criteria)
    ? payload.criteria.map((item) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const criterion = item as FitQuestion['criteria'][number] & { id?: unknown };
        const criterionId = normalizeString(criterion.id)?.trim();
        const title = normalizeString(criterion.title)?.trim();
        if (!criterionId || !title) {
          return undefined;
        }
        const ratings: FitQuestion['criteria'][number]['ratings'] = {};
        const source = criterion.ratings ?? {};
        for (const score of [1, 2, 3, 4, 5] as const) {
          const valueRaw = normalizeString((source as Record<string, unknown>)[String(score)]);
          if (valueRaw) {
            ratings[score] = valueRaw;
          }
        }
        return { id: criterionId, title, ratings };
      }).filter((item): item is FitQuestion['criteria'][number] => Boolean(item))
    : [];
  return {
    id,
    shortTitle,
    content,
    criteria,
    version: normalizeNumber(payload.version) ?? 1,
    createdAt: normalizeIso(payload.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeIso(payload.updatedAt) ?? new Date().toISOString()
  };
};

const normalizeForm = (value: unknown): InterviewStatusRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Partial<InterviewStatusRecord> & { slotId?: unknown };
  const slotId = normalizeString(payload.slotId)?.trim();
  if (!slotId) {
    return null;
  }
  return {
    slotId,
    interviewerName: normalizeString(payload.interviewerName) ?? 'Interviewer',
    submitted: typeof payload.submitted === 'boolean' ? payload.submitted : false,
    submittedAt: normalizeIso(payload.submittedAt),
    notes: normalizeString(payload.notes) ?? undefined,
    fitScore: normalizeNumber(payload.fitScore),
    caseScore: normalizeNumber(payload.caseScore),
    fitNotes: normalizeString(payload.fitNotes) ?? undefined,
    caseNotes: normalizeString(payload.caseNotes) ?? undefined,
    fitCriteria: normalizeCriteriaList(payload.fitCriteria),
    caseCriteria: normalizeCriteriaList(payload.caseCriteria),
    interestNotes: normalizeString(payload.interestNotes) ?? undefined,
    issuesToTest: normalizeString(payload.issuesToTest) ?? undefined,
    offerRecommendation: normalizeOfferRecommendation(payload.offerRecommendation)
  };
};

const normalizeAssignment = (value: unknown): InterviewerAssignmentView | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Partial<InterviewerAssignmentView> & {
    evaluationId?: unknown;
    slotId?: unknown;
    interviewerEmail?: unknown;
    interviewerName?: unknown;
    invitationSentAt?: unknown;
    roundNumber?: unknown;
    evaluationUpdatedAt?: unknown;
    evaluationProcessStatus?: unknown;
    candidate?: unknown;
    caseFolder?: unknown;
    fitQuestion?: unknown;
    form?: unknown;
    peerForms?: unknown;
    decision?: unknown;
  };

  const evaluationId = normalizeString(payload.evaluationId)?.trim();
  const slotId = normalizeString(payload.slotId)?.trim();
  const interviewerEmail = normalizeString(payload.interviewerEmail)?.trim();
  if (!evaluationId || !slotId || !interviewerEmail) {
    return null;
  }

  return {
    evaluationId,
    slotId,
    interviewerEmail,
    interviewerName: normalizeString(payload.interviewerName) ?? 'Interviewer',
    invitationSentAt: normalizeIso(payload.invitationSentAt) ?? new Date().toISOString(),
    roundNumber: Number(payload.roundNumber ?? 1) || 1,
    evaluationUpdatedAt: normalizeIso(payload.evaluationUpdatedAt) ?? new Date().toISOString(),
    evaluationProcessStatus:
      (normalizeString(payload.evaluationProcessStatus) as InterviewerAssignmentView['evaluationProcessStatus']) ?? 'draft',
    candidate: normalizeCandidate(payload.candidate),
    caseFolder: normalizeCaseFolder(payload.caseFolder),
    fitQuestion: normalizeFitQuestion(payload.fitQuestion),
    form: normalizeForm(payload.form),
    peerForms: normalizePeerForms(payload.peerForms),
    decision: normalizeDecision(payload.decision)
  };
};

const ensureAssignmentList = (value: unknown): InterviewerAssignmentView[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeAssignment(item))
    .filter((assignment): assignment is InterviewerAssignmentView => Boolean(assignment));
};

export const interviewerApi = {
  listAssignments: async (email: string) =>
    ensureAssignmentList(await apiRequest<unknown>(`/interviewer/assignments?email=${encodeURIComponent(email)}`)),
  submitForm: async (
    evaluationId: string,
    slotId: string,
    payload: { email: string } & Partial<InterviewStatusRecord>
  ) => {
    await apiRequest<unknown>(`/interviewer/assignments/${evaluationId}/${slotId}`, {
      method: 'POST',
      body: payload
    });
  }
};
