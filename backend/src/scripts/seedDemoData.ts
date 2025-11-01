
import { createHash } from 'crypto';
import { pathToFileURL } from 'url';
import { postgresPool } from '../shared/database/postgres.client.js';
import { runMigrations } from '../shared/database/migrations.js';
import {
  caseCriteriaCatalog,
  fitCriteriaCatalog,
  fitQuestionReferences,
  fitQuestionSeeds,
  type CaseCriterionKey,
  type FitCriterionKey
} from './demoData.assets.js';
import { toUuid } from './demoData.shared.js';

// Набор кодов ошибок, которые сигнализируют о невозможности соединиться с базой
const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET']);

// Интерфейс-описание AggregateError для окружений, где тип не объявлен явно
interface AggregateErrorLike extends Error {
  errors: unknown[];
}

// Проверка, что ошибка похожа на AggregateError
const isAggregateError = (error: unknown): error is AggregateErrorLike => {
  return Boolean(error) && typeof error === 'object' && Array.isArray((error as AggregateErrorLike).errors);
};

// Проверка, что ошибка похожа на стандартное исключение Node.js с полями errno/code
const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => {
  return Boolean(error) && typeof error === 'object' && 'code' in (error as Record<string, unknown>);
};

// Рекурсивно ищем первопричину ошибки подключения (AggregateError, cause и т.д.)
const unwrapConnectionError = (error: unknown): NodeJS.ErrnoException | undefined => {
  if (!error) {
    return undefined;
  }

  if (isAggregateError(error)) {
    for (const inner of error.errors) {
      const resolved = unwrapConnectionError(inner);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }

  if (isErrnoException(error) && error.code && CONNECTION_ERROR_CODES.has(error.code)) {
    return error;
  }

  if (typeof error === 'object' && 'cause' in (error as Record<string, unknown>)) {
    return unwrapConnectionError((error as { cause?: unknown }).cause);
  }

  return undefined;
};

interface DatabaseClient {
  query: <T = any>(query: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  release: () => void;
}

// Настройки, позволяющие переиспользовать сидер вне CLI
export interface SeedDemoDataOptions {
  runMigrations?: boolean;
  shutdownPool?: boolean;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string, details?: unknown) => void;
  };
}

// Короткое резюме результата прогонки сидера
export interface SeedDemoDataResult {
  candidatesProcessed: number;
  evaluationsProcessed: number;
  interviewsProcessed: number;
}

export interface EraseDemoDataResult {
  candidatesRemoved: number;
  evaluationsRemoved: number;
}

let referenceNow = new Date();

const refreshReferenceNow = () => {
  referenceNow = new Date();
};

// Базовый час отправки формы, если он не задан явно
const BASE_FORM_SUBMISSION_HOUR = 11;
// Сдвиг между интервью по умолчанию, чтобы их метки не накладывались
const INTERVIEW_OFFSET_HOURS = 30;

// Returns a past date offset by the provided number of days and a fixed time of day
const daysAgo = (offset: number, hour = 10, minute = 0) => {
  const date = new Date(referenceNow.getTime());
  date.setUTCDate(date.getUTCDate() - offset);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
};

// Список разрешённых интервьюеров; имена подтянем из базы при запуске
const INTERVIEWER_EMAILS = [
  'knpavlov@gmail.com',
  'kpavlov.me@gmail.com',
  'konst-pavlov@mail.ru',
  'kpavlov@alvarezandmarsal.com'
] as const;

type InterviewerEmail = (typeof INTERVIEWER_EMAILS)[number];

type CaseFolderKey =
  | 'infrastructure'
  | 'retail-pricing'
  | 'supply-chain'
  | 'digital-growth';

type FitQuestionKey = 'client-trust' | 'leadership' | 'collaboration';

interface CaseFolderRecord {
  id: string;
  name: string;
}

interface FitQuestionRecord {
  id: string;
  shortTitle: string;
  key: FitQuestionKey;
}

interface FitQuestionDirectory {
  list: FitQuestionRecord[];
  map: Map<FitQuestionKey, string>;
}

interface FitQuestionReference {
  key: FitQuestionKey;
  shortTitle: string;
}

const FIT_QUESTION_REFERENCES: FitQuestionReference[] = fitQuestionReferences;

type FitCriterionSeed =
  | { criterion: FitCriterionKey; score?: number; notApplicable?: boolean }
  | { criterionId: string; score?: number; notApplicable?: boolean };

type CaseCriterionSeed =
  | { criterion: CaseCriterionKey; score?: number; notApplicable?: boolean }
  | { criterionId: string; score?: number; notApplicable?: boolean };

interface InterviewSeed {
  slotId: string;
  interviewerEmail: InterviewerEmail;
  caseFolder: CaseFolderKey;
  fitQuestion: FitQuestionKey;
  invitationSentDaysAgo: number;
  submittedDaysAgo: number;
  submittedHour?: number;
  fitScore?: number;
  caseScore?: number;
  notes: string;
  fitNotes?: string;
  caseNotes?: string;
  interestNotes?: string;
  issuesToTest?: string;
  offerRecommendation?: 'yes_priority' | 'yes_strong' | 'yes_keep_warm' | 'no_offer';
  fitCriteria?: FitCriterionSeed[];
  caseCriteria?: CaseCriterionSeed[];
}

interface RoundSeed {
  roundNumber: number;
  processStartedDaysAgo: number;
  completedDaysAgo: number;
  decision: 'offer' | 'accepted-offer' | 'reject' | 'progress';
  interviews: InterviewSeed[];
}

interface EvaluationSeed {
  decision: 'offer' | 'accepted-offer' | 'reject' | 'progress';
  rounds: RoundSeed[];
}

interface CandidateSeed {
  key: string;
  firstName: string;
  lastName: string;
  gender: 'female' | 'male';
  age: number;
  city: string;
  desiredPosition: string;
  targetPractice: string;
  targetOffice: string;
  phone: string;
  email: string;
  experienceSummary: string;
  totalExperienceYears: number;
  consultingExperienceYears: number;
  consultingCompanies: string;
  lastCompany: string;
  lastPosition: string;
  lastDuration: string;
  appliedDaysAgo: number;
  evaluation: EvaluationSeed;
}

const REQUIRED_FIT_CRITERIA: Record<FitQuestionKey, FitCriterionKey[]> = fitQuestionSeeds.reduce(
  (acc, seed) => {
    acc[seed.key] = [...seed.criteria];
    return acc;
  },
  {
    'client-trust': [] as FitCriterionKey[],
    leadership: [] as FitCriterionKey[],
    collaboration: [] as FitCriterionKey[]
  }
);

// Сопоставление старых слагов с новыми ключами для каждого фит-вопроса
const LEGACY_FIT_CRITERION_ALIASES: Record<FitQuestionKey, Record<string, FitCriterionKey>> = {
  'client-trust': {
    'fit-communication': 'clientCommunication',
    'fit-leadership': 'clientOwnership',
    'fit-ownership': 'clientOwnership',
    'fit-drive': 'clientDrive',
    'fit-resilience': 'clientDrive'
  },
  leadership: {
    'fit-leadership': 'leadershipDirection',
    'fit-communication': 'leadershipResilience',
    'fit-collaboration': 'leadershipGrowth',
    'fit-resilience': 'leadershipResilience',
    'fit-drive': 'leadershipGrowth',
    'fit-growth-mindset': 'leadershipGrowth'
  },
  collaboration: {
    'fit-collaboration': 'collaborationAlignment',
    'fit-leadership': 'collaborationAlignment',
    'fit-communication': 'collaborationCommunication',
    'fit-drive': 'collaborationExecution'
  }
};

// Сопоставление старых слагов критериев кейса с новыми ключами
const LEGACY_CASE_CRITERION_ALIASES: Record<string, CaseCriterionKey> = Object.entries(caseCriteriaCatalog).reduce(
  (acc, [key, definition]) => {
    acc[definition.slug] = key as CaseCriterionKey;
    return acc;
  },
  {
    'case-structure': 'structure',
    'case-quant': 'quant',
    'case-communication': 'communication',
    'case-problem-solving': 'problemSolving',
    'case-insight': 'insight',
    'case-rigor': 'rigor',
    'case-creativity': 'creativity',
    'case-synthesis': 'synthesis',
    'case-client-impact': 'clientImpact'
  } as Record<string, CaseCriterionKey>
);

const mapFitCriteriaToPayload = (
  fitQuestion: FitQuestionKey,
  criteria: FitCriterionSeed[] | undefined,
  fallbackScore?: number
) => {
  const expectedKeys = REQUIRED_FIT_CRITERIA[fitQuestion] ?? [];
  const resolved = new Map<FitCriterionKey, { score?: number; notApplicable?: boolean }>();
  const legacyMap = LEGACY_FIT_CRITERION_ALIASES[fitQuestion] ?? {};

  if (Array.isArray(criteria)) {
    for (const entry of criteria) {
      let key: FitCriterionKey | undefined;
      if ('criterion' in entry && entry.criterion) {
        key = entry.criterion;
      } else if ('criterionId' in entry && entry.criterionId) {
        const normalized = entry.criterionId.trim().toLowerCase();
        key = legacyMap[normalized] ?? legacyMap[`fit-${normalized}`];
        if (!key) {
          const catalogEntry = Object.entries(fitCriteriaCatalog).find(
            ([, definition]) => definition.slug === normalized
          );
          if (catalogEntry) {
            key = catalogEntry[0] as FitCriterionKey;
          }
        }
      }

      if (!key) {
        continue;
      }

      resolved.set(key, { score: entry.score, notApplicable: entry.notApplicable });
    }
  }

  const payload: { criterionId: string; score?: number; notApplicable?: boolean }[] = [];

  for (const key of expectedKeys) {
    const definition = fitCriteriaCatalog[key];
    const criterionId = definition.resolvedId;
    if (!criterionId) {
      continue;
    }
    const existing = resolved.get(key);
    payload.push({
      criterionId,
      score: existing?.score ?? fallbackScore,
      notApplicable: existing?.notApplicable
    });
    resolved.delete(key);
  }

  return payload;
};

const mapCaseCriteriaToPayload = (criteria: CaseCriterionSeed[] | undefined) => {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return [] as { criterionId: string; score?: number; notApplicable?: boolean }[];
  }

  const payload: { criterionId: string; score?: number; notApplicable?: boolean }[] = [];

  for (const entry of criteria) {
    let key: CaseCriterionKey | undefined;
    if ('criterion' in entry && entry.criterion) {
      key = entry.criterion;
    } else if ('criterionId' in entry && entry.criterionId) {
      const normalized = entry.criterionId.trim().toLowerCase();
      key = LEGACY_CASE_CRITERION_ALIASES[normalized] ?? LEGACY_CASE_CRITERION_ALIASES[`case-${normalized}`];
    }

    if (!key) {
      continue;
    }

    const definition = caseCriteriaCatalog[key];
    const criterionId = definition.resolvedId;
    if (!criterionId) {
      continue;
    }
    payload.push({
      criterionId,
      score: entry.score,
      notApplicable: entry.notApplicable
    });
  }

  return payload;
};

const candidates: CandidateSeed[] = [
  {
    key: 'amelia-nguyen',
    firstName: 'Amelia',
    lastName: 'Nguyen',
    gender: 'female',
    age: 29,
    city: 'Sydney',
    desiredPosition: 'Senior Associate',
    targetPractice: 'Corporate Finance',
    targetOffice: 'Sydney',
    phone: '+61 415 203 884',
    email: 'amelia.nguyen@example.com',
    experienceSummary:
      'Has spent six years helping infrastructure and telecom clients evaluate investments and optimise CAPEX and has led project teams for the last two years.',
    totalExperienceYears: 6,
    consultingExperienceYears: 4,
    consultingCompanies: 'Deloitte Australia, KPMG Australia',
    lastCompany: 'Deloitte Australia',
    lastPosition: 'Manager, Strategy & Operations',
    lastDuration: '2 years',
    appliedDaysAgo: 55,
    evaluation: {
      decision: 'offer',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 50,
          completedDaysAgo: 44,
          decision: 'progress',
          interviews: [
            {
              slotId: 'amelia-r1-1',
              interviewerEmail: 'kpavlov@alvarezandmarsal.com',
              caseFolder: 'retail-pricing',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 49,
              submittedDaysAgo: 45,
              fitScore: 4.5,
              caseScore: 4.2,
              notes:
                'Structured the financial model answer immediately without prompts, asked relevant regional sensitivity questions, and closed with a clear implementation plan.',
              fitNotes:
                'Gave a convincing example of managing client expectations on a pricing project and was transparent about where director-level support was needed.',
              caseNotes:
                'Suggested a three-cluster assortment segmentation and embraced pilot store testing, calculating the impact on basket size.',
              interestNotes: 'Open to travel across Australia and New Zealand with a preference for operations improvement engagements.',
              issuesToTest: 'Use round two to double-check depth of financial modelling and handling of conflicting stakeholders.',
              offerRecommendation: 'yes_strong',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 5 },
                { criterion: 'clientOwnership', score: 4 },
                { criterion: 'clientDrive', score: 5 }
              ],
              caseCriteria: [
                { criterion: 'structure', score: 4 },
                { criterion: 'quant', score: 4 }
              ]
            },
            {
              slotId: 'amelia-r1-2',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'supply-chain',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 48,
              submittedDaysAgo: 44,
              fitScore: 4.2,
              caseScore: 4.4,
              notes:
                'Quickly highlighted supply-chain bottlenecks, prepared a stakeholder map in advance, and proposed a realistic roadmap that accounts for seasonality.',
              fitNotes: 'Strong story about standing up a cross-functional PMO for an energy client.',
              caseNotes: 'Comfortable with numbers, proactively asked for inventory turns and built the savings model without errors.',
              interestNotes: 'Keen on industrial clients and ready to support internal DEI initiatives.',
              offerRecommendation: 'yes_strong',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 4 },
                { criterion: 'collaborationCommunication', score: 4 },
                { criterion: 'collaborationExecution', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'problemSolving', score: 5 },
                { criterion: 'communication', score: 4 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 14,
          completedDaysAgo: 6,
          decision: 'offer',
          interviews: [
            {
              slotId: 'amelia-r2-1',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'digital-growth',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 15,
              submittedDaysAgo: 6,
              submittedHour: 9,
              fitScore: 4.8,
              caseScore: 4.6,
              notes:
                'Showed mature strategic thinking in round two: prioritised digital channels immediately and outlined a roadmap with quick wins.',
              fitNotes: 'Compelling leadership example: took over a loss-making branch and stabilised the P&L in three months.',
              caseNotes: 'Estimated CAC and LTV correctly, spotted cannibalisation risk early, and suggested an A/B testing approach.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 5 },
                { criterion: 'leadershipResilience', score: 5 },
                { criterion: 'leadershipGrowth', score: 5 }
              ],
              caseCriteria: [
                { criterion: 'insight', score: 5 },
                { criterion: 'rigor', score: 4 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'oliver-chen',
    firstName: 'Oliver',
    lastName: 'Chen',
    gender: 'male',
    age: 31,
    city: 'Melbourne',
    desiredPosition: 'Engagement Manager',
    targetPractice: 'Performance Improvement',
    targetOffice: 'Melbourne',
    phone: '+61 430 118 552',
    email: 'oliver.chen@example.com',
    experienceSummary:
      'Seven years in industrial operations transformations with hands-on experience building KPI systems and launching lean programmes.',
    totalExperienceYears: 7,
    consultingExperienceYears: 5,
    consultingCompanies: 'EY-Parthenon, Bain & Company',
    lastCompany: 'EY-Parthenon',
    lastPosition: 'Manager, Operations Excellence',
    lastDuration: '3 years',
    appliedDaysAgo: 47,
    evaluation: {
      decision: 'reject',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 42,
          completedDaysAgo: 38,
          decision: 'progress',
          interviews: [
            {
              slotId: 'oliver-r1-1',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'supply-chain',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 41,
              submittedDaysAgo: 39,
              fitScore: 3.6,
              caseScore: 3.8,
              notes:
                'Maintained structure but drifted into detail. Understood warehouse constraints well and proposed a phased rollout plan.',
              fitNotes: 'Nickel mining client story sounded credible, though team roles could have been clearer.',
              caseNotes: 'Savings calculation was correct, yet the closing synthesis could link more explicitly to NPS impact.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 4 },
                { criterion: 'clientOwnership', score: 4 },
                { criterion: 'clientDrive', score: 3 }
              ],
              caseCriteria: [
                { criterion: 'structure', score: 4 },
                { criterion: 'creativity', score: 3 }
              ]
            },
            {
              slotId: 'oliver-r1-2',
              interviewerEmail: 'kpavlov@alvarezandmarsal.com',
              caseFolder: 'infrastructure',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 40,
              submittedDaysAgo: 38,
              fitScore: 2.8,
              caseScore: 3.2,
              notes:
                'Lost track on capital expenditure questions, confused project timelines, and did not validate contractor risks.',
              fitNotes: 'Complex client story was high level and did not unpack his individual contribution.',
              caseNotes: 'Made repeated calculation mistakes and had to recompute IRR twice.',
              issuesToTest: 'If he proceeds, focus on financial analytics depth and leadership evidence.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 2 },
                { criterion: 'collaborationCommunication', score: 3 },
                { criterion: 'collaborationExecution', score: 2 }
              ],
              caseCriteria: [
                { criterion: 'rigor', score: 2 },
                { criterion: 'synthesis', score: 3 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 18,
          completedDaysAgo: 17,
          decision: 'reject',
          interviews: [
            {
              slotId: 'oliver-r2-1',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'retail-pricing',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 19,
              submittedDaysAgo: 17,
              fitScore: 2.5,
              caseScore: 2.8,
              notes:
                'Could not build the promotion economics, missed the margin impact, and abandoned the hypothesis without justification.',
              fitNotes: 'Gave a formal answer when asked about a failed initiative and avoided ownership.',
              caseNotes: 'Needed heavy steering on the calculations and did not tie conclusions back to data.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 2 },
                { criterion: 'leadershipResilience', score: 2 },
                { criterion: 'leadershipGrowth', score: 2 }
              ],
              caseCriteria: [
                { criterion: 'quant', score: 2 },
                { criterion: 'communication', score: 3 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'priya-raman',
    firstName: 'Priya',
    lastName: 'Raman',
    gender: 'female',
    age: 27,
    city: 'Brisbane',
    desiredPosition: 'Consultant',
    targetPractice: 'Private Equity',
    targetOffice: 'Brisbane',
    phone: '+61 402 772 915',
    email: 'priya.raman@example.com',
    experienceSummary:
      'Four years in commercial due diligence for PE and corporate buyers with strong market modelling and customer interview skills.',
    totalExperienceYears: 4,
    consultingExperienceYears: 4,
    consultingCompanies: 'Strategy&, PwC Deals',
    lastCompany: 'Strategy&',
    lastPosition: 'Senior Associate, Commercial Due Diligence',
    lastDuration: '1.5 years',
    appliedDaysAgo: 40,
    evaluation: {
      decision: 'progress',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 34,
          completedDaysAgo: 30,
          decision: 'progress',
          interviews: [
            {
              slotId: 'priya-r1-1',
              interviewerEmail: 'kpavlov@alvarezandmarsal.com',
              caseFolder: 'digital-growth',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 33,
              submittedDaysAgo: 31,
              fitScore: 4,
              caseScore: 3.9,
              notes:
                'Built a crisp view of the target market and quickly surfaced the growth drivers. Comfortable when referencing client examples.',
              fitNotes: 'Multifunctional team story was detailed and demonstrated awareness of political nuances.',
              caseNotes: 'Minor arithmetic slip but she caught and corrected it herself.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 4 },
                { criterion: 'collaborationCommunication', score: 4 },
                { criterion: 'collaborationExecution', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'structure', score: 4 },
                { criterion: 'insight', score: 4 }
              ]
            },
            {
              slotId: 'priya-r1-2',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'retail-pricing',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 32,
              submittedDaysAgo: 30,
              fitScore: 3.8,
              caseScore: 4,
              notes:
                'Calculated LTV across client segments and quickly framed churn hypotheses. Very sharp analytical accuracy.',
              fitNotes: 'Story about rebuilding investor trust was persuasive.',
              caseNotes: 'Delivered a strong final recommendation with a clear set of quick wins.',
              offerRecommendation: 'yes_strong',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 4 },
                { criterion: 'clientOwnership', score: 4 },
                { criterion: 'clientDrive', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'quant', score: 4 },
                { criterion: 'synthesis', score: 4 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 9,
          completedDaysAgo: 4,
          decision: 'progress',
          interviews: [
            {
              slotId: 'priya-r2-1',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'supply-chain',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 10,
              submittedDaysAgo: 4,
              fitScore: 4.2,
              caseScore: 4.1,
              notes:
                'Confident second round: Priya built a due diligence plan with concrete cut-off dates and thought through investment committee communications.',
              fitNotes: 'Demonstrated a mature approach to managing team workload and escalating risks.',
              caseNotes: 'Calculated the EBITDA bridge and proactively described commodity sensitivities.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 4 },
                { criterion: 'leadershipResilience', score: 4 },
                { criterion: 'leadershipGrowth', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'communication', score: 4 },
                { criterion: 'rigor', score: 4 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'ethan-wallace',
    firstName: 'Ethan',
    lastName: 'Wallace',
    gender: 'male',
    age: 35,
    city: 'Sydney',
    desiredPosition: 'Senior Manager',
    targetPractice: 'Restructuring',
    targetOffice: 'Sydney',
    phone: '+61 419 882 337',
    email: 'ethan.wallace@example.com',
    experienceSummary:
      'Ten years in restructuring mandates leading cash-flow stabilisation work and negotiating with creditor groups.',
    totalExperienceYears: 10,
    consultingExperienceYears: 7,
    consultingCompanies: 'Alvarez & Marsal, McKinsey & Company',
    lastCompany: 'Alvarez & Marsal',
    lastPosition: 'Director, Turnaround & Restructuring',
    lastDuration: '4 years',
    appliedDaysAgo: 52,
    evaluation: {
      decision: 'reject',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 46,
          completedDaysAgo: 43,
          decision: 'progress',
          interviews: [
            {
              slotId: 'ethan-r1-1',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'infrastructure',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 45,
              submittedDaysAgo: 44,
              fitScore: 3.5,
              caseScore: 3.7,
              notes:
                'Set up the structure but simplified the legal constraints too aggressively. Conversation flow was solid.',
              fitNotes: 'Bank negotiations example felt genuine but lacked metrics to show success.',
              caseNotes: 'Handled the liquidity calculation yet needed prompts for the step order.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 3 },
                { criterion: 'collaborationCommunication', score: 4 },
                { criterion: 'collaborationExecution', score: 3 }
              ],
              caseCriteria: [
                { criterionId: 'case-structure', score: 4 },
                { criterionId: 'case-creativity', score: 3 }
              ]
            },
            {
              slotId: 'ethan-r1-2',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'supply-chain',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 44,
              submittedDaysAgo: 43,
              fitScore: 3.2,
              caseScore: 3.3,
              notes:
                'Missed opportunities for quick working-capital stabilisation in the supply-chain case and focused on long-term levers.',
              fitNotes: 'Failed project story raised questions and he did not articulate the lessons learned.',
              caseNotes: 'Inventory reduction calculations required several corrections.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 3 },
                { criterion: 'clientOwnership', score: 3 },
                { criterion: 'clientDrive', score: 3 }
              ],
              caseCriteria: [
                { criterionId: 'case-rigor', score: 3 },
                { criterionId: 'case-quant', score: 3 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 20,
          completedDaysAgo: 12,
          decision: 'reject',
          interviews: [
            {
              slotId: 'ethan-r2-1',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'digital-growth',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 21,
              submittedDaysAgo: 12,
              fitScore: 2.9,
              caseScore: 3,
              notes:
                'Final interview lacked depth on scenario planning and risk management questions.',
              fitNotes: 'Leadership examples felt tired and showed limited energy for team development.',
              caseNotes: 'Did not calculate the cash conversion cycle impact until prompted.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 3 },
                { criterion: 'leadershipResilience', score: 3 },
                { criterion: 'leadershipGrowth', score: 3 }
              ],
              caseCriteria: [
                { criterionId: 'case-communication', score: 3 },
                { criterionId: 'case-insight', score: 3 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'sofia-alvarez',
    firstName: 'Sofia',
    lastName: 'Alvarez',
    gender: 'female',
    age: 33,
    city: 'Melbourne',
    desiredPosition: 'Principal',
    targetPractice: 'Transactions & Strategy',
    targetOffice: 'Melbourne',
    phone: '+61 422 190 664',
    email: 'sofia.alvarez@example.com',
    experienceSummary:
      'Leads large energy-sector transactions and aligns legal, financial, and operational workstreams across M&A programmes.',
    totalExperienceYears: 11,
    consultingExperienceYears: 8,
    consultingCompanies: 'Strategy&, Oliver Wyman',
    lastCompany: 'Oliver Wyman',
    lastPosition: 'Principal, Energy Practice',
    lastDuration: '3 years',
    appliedDaysAgo: 44,
    evaluation: {
      decision: 'accepted-offer',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 37,
          completedDaysAgo: 34,
          decision: 'progress',
          interviews: [
            {
              slotId: 'sofia-r1-1',
              interviewerEmail: 'kpavlov@alvarezandmarsal.com',
              caseFolder: 'infrastructure',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 36,
              submittedDaysAgo: 34,
              fitScore: 4.6,
              caseScore: 4.5,
              notes:
                'Held the strategic line from the first question, ran her own sensitivity analysis, and proposed a regulator negotiation plan.',
              fitNotes: 'Powerful example of crisis leadership during a renewables transaction.',
              caseNotes: 'Exceptionally strong with the numbers and delivered a crisp synthesised recommendation.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 5 },
                { criterion: 'leadershipResilience', score: 4 },
                { criterion: 'leadershipGrowth', score: 5 }
              ],
              caseCriteria: [
                { criterionId: 'case-synthesis', score: 5 },
                { criterionId: 'case-quant', score: 4 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 11,
          completedDaysAgo: 3,
          decision: 'accepted-offer',
          interviews: [
            {
              slotId: 'sofia-r2-1',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'digital-growth',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 12,
              submittedDaysAgo: 4,
              fitScore: 4.7,
              caseScore: 4.4,
              notes:
                'Brought excellent ideas for integrating digital channels post-merger and mapped the change management approach with KPIs.',
              fitNotes: 'Impressive story about integrating teams across time zones.',
              caseNotes: 'Synthesis was sharp and she quickly estimated capex requirements and IT risks.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 5 },
                { criterion: 'collaborationCommunication', score: 5 },
                { criterion: 'collaborationExecution', score: 5 }
              ],
              caseCriteria: [
                { criterionId: 'case-structure', score: 4 },
                { criterionId: 'case-rigor', score: 4 }
              ]
            },
            {
              slotId: 'sofia-r2-2',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'retail-pricing',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 11,
              submittedDaysAgo: 3,
              fitScore: 4.8,
              caseScore: 4.6,
              notes:
                'Outlined a step-by-step value creation plan in the final conversation and anchored it in real deal examples.',
              fitNotes: 'Earned the trust of a portfolio-company CEO within two months — standout story.',
              caseNotes: 'Built the financial model cleanly and identified the key value drivers independently.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 5 },
                { criterion: 'clientOwnership', score: 5 },
                { criterion: 'clientDrive', score: 5 }
              ],
              caseCriteria: [
                { criterionId: 'case-communication', score: 4 },
                { criterionId: 'case-insight', score: 5 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'liam-oconnor',
    firstName: 'Liam',
    lastName: "O'Connor",
    gender: 'male',
    age: 28,
    city: 'Brisbane',
    desiredPosition: 'Senior Analyst',
    targetPractice: 'Performance Improvement',
    targetOffice: 'Brisbane',
    phone: '+61 408 555 196',
    email: 'liam.oconnor@example.com',
    experienceSummary:
      'Three years in operations consulting focused on warehouse optimisation and reducing logistics costs.',
    totalExperienceYears: 3,
    consultingExperienceYears: 3,
    consultingCompanies: 'Kearney',
    lastCompany: 'Kearney',
    lastPosition: 'Business Analyst',
    lastDuration: '2 years',
    appliedDaysAgo: 36,
    evaluation: {
      decision: 'reject',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 28,
          completedDaysAgo: 24,
          decision: 'reject',
          interviews: [
            {
              slotId: 'liam-r1-1',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'supply-chain',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 27,
              submittedDaysAgo: 25,
              fitScore: 2.9,
              caseScore: 3,
              notes:
                'Asked for prompts frequently and did not take the analysis through to a conclusion. Fit examples were overly generic.',
              fitNotes: 'Did not demonstrate initiative in difficult situations and leaned on his manager.',
              caseNotes: 'Misestimated savings and required assumption corrections.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 2 },
                { criterion: 'collaborationCommunication', score: 3 },
                { criterion: 'collaborationExecution', score: 2 }
              ],
              caseCriteria: [
                { criterionId: 'case-quant', score: 3 },
                { criterionId: 'case-synthesis', score: 2 }
              ]
            },
            {
              slotId: 'liam-r1-2',
              interviewerEmail: 'kpavlov@alvarezandmarsal.com',
              caseFolder: 'retail-pricing',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 26,
              submittedDaysAgo: 24,
              fitScore: 2.7,
              caseScore: 2.8,
              notes:
                'Failed to link the sensitivity analysis to a final recommendation and the synthesis was vague.',
              fitNotes: 'Client conflict story was unconvincing and light on facts.',
              caseNotes: 'Forgot to include fixed costs, forcing a rebuild of the model.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 2 },
                { criterion: 'clientOwnership', score: 2 },
                { criterion: 'clientDrive', score: 3 }
              ],
              caseCriteria: [
                { criterionId: 'case-structure', score: 2 },
                { criterionId: 'case-creativity', score: 2 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'harper-smith',
    firstName: 'Harper',
    lastName: 'Smith',
    gender: 'female',
    age: 30,
    city: 'Sydney',
    desiredPosition: 'Engagement Manager',
    targetPractice: 'Digital Transformation',
    targetOffice: 'Sydney',
    phone: '+61 416 782 901',
    email: 'harper.smith@example.com',
    experienceSummary:
      'Eight years driving digital transformations for banks and insurers, launching agile portfolios and shaping design culture.',
    totalExperienceYears: 8,
    consultingExperienceYears: 6,
    consultingCompanies: 'Accenture Strategy, BCG',
    lastCompany: 'BCG',
    lastPosition: 'Project Leader, Digital Transformation',
    lastDuration: '3 years',
    appliedDaysAgo: 33,
    evaluation: {
      decision: 'offer',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 27,
          completedDaysAgo: 22,
          decision: 'progress',
          interviews: [
            {
              slotId: 'harper-r1-1',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'digital-growth',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 26,
              submittedDaysAgo: 23,
              fitScore: 4.3,
              caseScore: 4.1,
              notes:
                'Delivered a thorough diagnostic of the bank’s digital channels and proposed an 18-month release roadmap.',
              fitNotes: 'Great example about launching agile tribes and aligning with IT.',
              caseNotes: 'Quantified cross-sell impact and spotted cannibalisation risks.',
              offerRecommendation: 'yes_strong',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 4 },
                { criterion: 'collaborationCommunication', score: 5 },
                { criterion: 'collaborationExecution', score: 4 }
              ],
              caseCriteria: [
                { criterionId: 'case-insight', score: 4 },
                { criterionId: 'case-communication', score: 4 }
              ]
            },
            {
              slotId: 'harper-r1-2',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'supply-chain',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 25,
              submittedDaysAgo: 22,
              fitScore: 4.1,
              caseScore: 3.9,
              notes:
                'In the logistics case she mapped the process quickly and suggested digital monitoring solutions.',
              fitNotes: 'Explained leadership through an upskilling programme very well.',
              caseNotes: 'Maths was tidy and she confidently explained the SLA impact.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 4 },
                { criterion: 'leadershipResilience', score: 4 },
                { criterion: 'leadershipGrowth', score: 4 }
              ],
              caseCriteria: [
                { criterionId: 'case-structure', score: 4 },
                { criterionId: 'case-rigor', score: 3 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 8,
          completedDaysAgo: 2,
          decision: 'offer',
          interviews: [
            {
              slotId: 'harper-r2-1',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'digital-growth',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 9,
              submittedDaysAgo: 2,
              fitScore: 4.6,
              caseScore: 4.3,
              notes:
                'In the final interview she laid out a digital bank roadmap with clear KPIs and team structure.',
              fitNotes: 'Powerful example of scaling agile across the whole organisation.',
              caseNotes: 'Stayed focused on value capture and handled the maths confidently.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 5 },
                { criterion: 'leadershipResilience', score: 5 },
                { criterion: 'leadershipGrowth', score: 5 }
              ],
              caseCriteria: [
                { criterionId: 'case-communication', score: 4 },
                { criterionId: 'case-insight', score: 4 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'ava-kelly',
    firstName: 'Ava',
    lastName: 'Kelly',
    gender: 'female',
    age: 32,
    city: 'Melbourne',
    desiredPosition: 'Principal',
    targetPractice: 'Customer & Growth',
    targetOffice: 'Melbourne',
    phone: '+61 417 210 448',
    email: 'ava.kelly@example.com',
    experienceSummary:
      'Nine years leading omnichannel growth programmes for retail and consumer clients with emphasis on analytics-driven market entry.',
    totalExperienceYears: 9,
    consultingExperienceYears: 7,
    consultingCompanies: 'McKinsey & Company, Strategy&',
    lastCompany: 'Strategy&',
    lastPosition: 'Associate Director, Customer Strategy',
    lastDuration: '3 years',
    appliedDaysAgo: 31,
    evaluation: {
      decision: 'offer',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 26,
          completedDaysAgo: 21,
          decision: 'progress',
          interviews: [
            {
              slotId: 'ava-r1-1',
              interviewerEmail: 'kpavlov@alvarezandmarsal.com',
              caseFolder: 'retail-pricing',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 25,
              submittedDaysAgo: 22,
              fitScore: 4.4,
              caseScore: 4.2,
              notes:
                'Quantified regional price elasticity quickly and proposed a phased pilot plan balancing promo depth and brand health.',
              fitNotes: 'Shared a thoughtful story about restoring board confidence during an underperforming launch.',
              caseNotes: 'Built the demand model independently and highlighted sensitivity ranges without prompting.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 5 },
                { criterion: 'clientOwnership', score: 4 },
                { criterion: 'clientDrive', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'quant', score: 4 },
                { criterion: 'synthesis', score: 4 }
              ]
            },
            {
              slotId: 'ava-r1-2',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'digital-growth',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 24,
              submittedDaysAgo: 21,
              fitScore: 4.5,
              caseScore: 4.3,
              notes:
                'Outlined an actionable growth roadmap with quarterly milestones and built alignment plans for marketing and technology.',
              fitNotes: 'Detailed how she navigated conflicting country priorities and secured sponsorship from both CMOs.',
              caseNotes: 'Connected CAC improvements to digital mix shifts and quantified lift scenarios accurately.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 5 },
                { criterion: 'collaborationCommunication', score: 4 },
                { criterion: 'collaborationExecution', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'insight', score: 4 },
                { criterion: 'communication', score: 4 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 7,
          completedDaysAgo: 2,
          decision: 'offer',
          interviews: [
            {
              slotId: 'ava-r2-1',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'digital-growth',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 8,
              submittedDaysAgo: 2,
              fitScore: 4.7,
              caseScore: 4.5,
              notes:
                'Delivered a confident three-year platform build roadmap and drilled into data governance trade-offs.',
              fitNotes: 'Strong example about steering a cross-regional transformation and growing new partners.',
              caseNotes: 'Stress-tested economics, surfaced talent constraints and sequenced the backlog sensibly.',
              offerRecommendation: 'yes_priority',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 5 },
                { criterion: 'leadershipResilience', score: 4 },
                { criterion: 'leadershipGrowth', score: 5 }
              ],
              caseCriteria: [
                { criterion: 'structure', score: 4 },
                { criterion: 'rigor', score: 4 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'mason-brown',
    firstName: 'Mason',
    lastName: 'Brown',
    gender: 'male',
    age: 34,
    city: 'Brisbane',
    desiredPosition: 'Senior Manager',
    targetPractice: 'Restructuring',
    targetOffice: 'Brisbane',
    phone: '+61 419 330 552',
    email: 'mason.brown@example.com',
    experienceSummary:
      'Twelve years in turnaround programmes across mining and industrial clients with deep creditor negotiation experience.',
    totalExperienceYears: 12,
    consultingExperienceYears: 8,
    consultingCompanies: 'FTI Consulting, Alvarez & Marsal',
    lastCompany: 'FTI Consulting',
    lastPosition: 'Senior Director, Turnaround & Restructuring',
    lastDuration: '4 years',
    appliedDaysAgo: 29,
    evaluation: {
      decision: 'reject',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 23,
          completedDaysAgo: 19,
          decision: 'progress',
          interviews: [
            {
              slotId: 'mason-r1-1',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'supply-chain',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 22,
              submittedDaysAgo: 20,
              fitScore: 3.6,
              caseScore: 3.4,
              notes:
                'Identified major working-capital levers but stayed surface-level on stakeholder plan and governance cadence.',
              fitNotes: 'Collaboration example showed effort yet missed how he handled resistance from operations leads.',
              caseNotes: 'Maths was correct though he needed nudges to link cash release to EBITDA guidance.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 3 },
                { criterion: 'collaborationCommunication', score: 4 },
                { criterion: 'collaborationExecution', score: 3 }
              ],
              caseCriteria: [
                { criterion: 'problemSolving', score: 3 },
                { criterion: 'communication', score: 3 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 12,
          completedDaysAgo: 8,
          decision: 'reject',
          interviews: [
            {
              slotId: 'mason-r2-1',
              interviewerEmail: 'knpavlov@gmail.com',
              caseFolder: 'infrastructure',
              fitQuestion: 'leadership',
              invitationSentDaysAgo: 13,
              submittedDaysAgo: 8,
              fitScore: 3,
              caseScore: 2.9,
              notes:
                'Struggled to lay out a clear turnaround roadmap and leaned on high-level statements during the case.',
              fitNotes: 'Leadership story skipped the decision-making process and impact on teams.',
              caseNotes: 'Skipped over financing structure details and needed heavy prompting for risk mitigation.',
              offerRecommendation: 'no_offer',
              fitCriteria: [
                { criterion: 'leadershipDirection', score: 3 },
                { criterion: 'leadershipResilience', score: 3 },
                { criterion: 'leadershipGrowth', score: 2 }
              ],
              caseCriteria: [
                { criterion: 'structure', score: 3 },
                { criterion: 'rigor', score: 2 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    key: 'nina-patel',
    firstName: 'Nina',
    lastName: 'Patel',
    gender: 'female',
    age: 27,
    city: 'Sydney',
    desiredPosition: 'Consultant',
    targetPractice: 'Private Equity',
    targetOffice: 'Sydney',
    phone: '+61 423 882 167',
    email: 'nina.patel@example.com',
    experienceSummary:
      'Early-career consultant focused on due diligence and portfolio value creation with a strong analytics background.',
    totalExperienceYears: 4,
    consultingExperienceYears: 4,
    consultingCompanies: 'EY-Parthenon',
    lastCompany: 'EY-Parthenon',
    lastPosition: 'Senior Associate',
    lastDuration: '1.5 years',
    appliedDaysAgo: 18,
    evaluation: {
      decision: 'progress',
      rounds: [
        {
          roundNumber: 1,
          processStartedDaysAgo: 15,
          completedDaysAgo: 13,
          decision: 'progress',
          interviews: [
            {
              slotId: 'nina-r1-1',
              interviewerEmail: 'konst-pavlov@mail.ru',
              caseFolder: 'digital-growth',
              fitQuestion: 'collaboration',
              invitationSentDaysAgo: 14,
              submittedDaysAgo: 13,
              fitScore: 3.9,
              caseScore: 3.8,
              notes:
                'Structured the growth opportunity well and created a tangible experimentation backlog with metrics.',
              fitNotes: 'Shared a thoughtful story about unifying an international diligence team under a tight deadline.',
              caseNotes: 'Calculated CAC/LTV accurately and highlighted competitive risks early.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'collaborationAlignment', score: 4 },
                { criterion: 'collaborationCommunication', score: 4 },
                { criterion: 'collaborationExecution', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'structure', score: 4 },
                { criterion: 'insight', score: 4 }
              ]
            }
          ]
        },
        {
          roundNumber: 2,
          processStartedDaysAgo: 6,
          completedDaysAgo: 2,
          decision: 'progress',
          interviews: [
            {
              slotId: 'nina-r2-1',
              interviewerEmail: 'kpavlov.me@gmail.com',
              caseFolder: 'retail-pricing',
              fitQuestion: 'client-trust',
              invitationSentDaysAgo: 7,
              submittedDaysAgo: 2,
              fitScore: 3.8,
              caseScore: 3.9,
              notes:
                'Handled the pricing analytics with ease and proposed a pilot structure grounded in customer cohorts.',
              fitNotes: 'Demonstrated empathy while managing a demanding CFO relationship.',
              caseNotes: 'Explained the financial impact crisply and prioritised initiatives logically.',
              offerRecommendation: 'yes_keep_warm',
              fitCriteria: [
                { criterion: 'clientCommunication', score: 4 },
                { criterion: 'clientOwnership', score: 4 },
                { criterion: 'clientDrive', score: 4 }
              ],
              caseCriteria: [
                { criterion: 'quant', score: 4 },
                { criterion: 'synthesis', score: 4 }
              ]
            }
          ]
        }
      ]
    }
  }
];

const computeChecksum = (
  email: string,
  name: string,
  caseFolderId: string,
  fitQuestionId: string
): string => {
  const hash = createHash('sha256');
  hash.update(email ?? '');
  hash.update('|');
  hash.update(name ?? '');
  hash.update('|');
  hash.update(caseFolderId);
  hash.update('|');
  hash.update(fitQuestionId);
  return hash.digest('hex');
};

const pickDeterministicItem = <T>(seed: string, items: T[]): T => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Unable to pick an item from an empty collection.');
  }

  const hash = createHash('sha256');
  hash.update(seed);
  const digest = hash.digest();

  let accumulator = 0;
  for (let index = 0; index < 6 && index < digest.length; index += 1) {
    accumulator = (accumulator << 8) | digest[index];
  }

  const normalizedIndex = Math.abs(accumulator) % items.length;
  return items[normalizedIndex];
};

const normalizeLabel = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const loadCaseFolders = async (client: DatabaseClient): Promise<CaseFolderRecord[]> => {
  const result = await client.query<CaseFolderRecord>(
    `SELECT id, name FROM case_folders ORDER BY updated_at DESC, id DESC;`
  );

  if (!result.rows || result.rows.length === 0) {
    throw new Error('No case folders found in the database.');
  }

  return result.rows;
};

const loadFitQuestionDirectory = async (
  client: DatabaseClient,
  logWarn: (message: string) => void = console.warn
): Promise<FitQuestionDirectory> => {
  const availableQuestions = await client.query<{ id: string; short_title: string }>(
    `SELECT DISTINCT ON (short_title) id, short_title FROM fit_questions ORDER BY short_title, version DESC;`
  );

  if (!availableQuestions.rows || availableQuestions.rows.length === 0) {
    throw new Error('No fit questions found in the database.');
  }

  const referenceByShortTitle = new Map(
    FIT_QUESTION_REFERENCES.map((reference) => [normalizeLabel(reference.shortTitle), reference.key])
  );

  const assigned = new Map<FitQuestionKey, FitQuestionRecord>();
  const usedQuestionIds = new Set<string>();

  for (const row of availableQuestions.rows) {
    const normalizedTitle = normalizeLabel(row.short_title);
    const matchedKey = referenceByShortTitle.get(normalizedTitle);

    if (!matchedKey || assigned.has(matchedKey)) {
      continue;
    }

    assigned.set(matchedKey, { id: row.id, shortTitle: row.short_title, key: matchedKey });
    usedQuestionIds.add(row.id);
  }

  const fallbackPool = availableQuestions.rows.filter((row) => !usedQuestionIds.has(row.id));

  for (const reference of FIT_QUESTION_REFERENCES) {
    if (assigned.has(reference.key)) {
      continue;
    }

    const fallbackRow = fallbackPool.shift() ?? availableQuestions.rows[0];

    if (!fallbackRow) {
      throw new Error('No fit questions available to assign for demo data.');
    }

    logWarn(
      `Fit question "${reference.shortTitle}" не найден по названию. Используем вопрос "${fallbackRow.short_title}".`
    );

    assigned.set(reference.key, {
      id: fallbackRow.id,
      shortTitle: fallbackRow.short_title,
      key: reference.key
    });
  }

  const ordered = FIT_QUESTION_REFERENCES.map((reference) => assigned.get(reference.key)!)
    .filter((record): record is FitQuestionRecord => Boolean(record));

  return {
    list: ordered,
    map: new Map(ordered.map((entry) => [entry.key, entry.id]))
  };
};

const hydrateCaseCriteriaCatalog = async (
  client: DatabaseClient,
  logWarn: (message: string) => void
) => {
  for (const definition of Object.values(caseCriteriaCatalog)) {
    definition.resolvedId = undefined;
  }

  const result = await client.query<{ id: string; title: string }>(
    `SELECT id, title FROM case_criteria;`
  );

  if (!result.rows || result.rows.length === 0) {
    logWarn('В таблице case_criteria не найдено записей. Критерии кейса будут пропущены.');
    return;
  }

  const byTitle = new Map(
    result.rows.map((row) => [normalizeLabel(row.title), row.id])
  );

  const unused = new Set(result.rows.map((row) => row.id));
  const allIds = result.rows.map((row) => row.id);
  const allTitlesById = new Map(result.rows.map((row) => [row.id, row.title]));

  for (const definition of Object.values(caseCriteriaCatalog)) {
    const normalizedTitle = normalizeLabel(definition.title);
    const matchedId = byTitle.get(normalizedTitle);

    if (matchedId) {
      definition.resolvedId = matchedId;
      unused.delete(matchedId);
      continue;
    }

    let fallbackId = unused.values().next().value as string | undefined;

    if (!fallbackId) {
      fallbackId = allIds[0];
    }

    if (!fallbackId) {
      logWarn(
        `Для критерия кейса "${definition.title}" не нашлось ни одной подходящей записи в базе. Значение будет пропущено.`
      );
      continue;
    }

    const fallbackTitle = allTitlesById.get(fallbackId) ?? fallbackId;

    logWarn(
      `Категория кейса "${definition.title}" не найдена по названию. Использован критерий "${fallbackTitle}" (ID ${fallbackId}).`
    );
    definition.resolvedId = fallbackId;
    unused.delete(fallbackId);
  }
};

const hydrateFitCriteriaCatalog = async (
  client: DatabaseClient,
  directory: FitQuestionDirectory,
  logWarn: (message: string) => void
) => {
  for (const definition of Object.values(fitCriteriaCatalog)) {
    definition.resolvedId = undefined;
  }

  const result = await client.query<{ id: string; title: string; question_id: string }>(
    `SELECT id, title, question_id FROM fit_question_criteria;`
  );

  if (!result.rows || result.rows.length === 0) {
    logWarn('В таблице fit_question_criteria отсутствуют записи. Оценки по fit будут без детализации.');
  }

  const byQuestion = new Map<string, Map<string, string>>();

  const unusedByQuestion = new Map<string, Set<string>>();

  for (const row of result.rows) {
    const normalizedTitle = normalizeLabel(row.title);
    if (!byQuestion.has(row.question_id)) {
      byQuestion.set(row.question_id, new Map());
      unusedByQuestion.set(row.question_id, new Set());
    }
    byQuestion.get(row.question_id)!.set(normalizedTitle, row.id);
    unusedByQuestion.get(row.question_id)!.add(row.id);
  }

  for (const definition of Object.values(fitCriteriaCatalog)) {
    const questionId = directory.map.get(definition.question);
    if (!questionId) {
      logWarn(`Фит-вопрос с ключом "${definition.question}" отсутствует в базе. Связанные критерии пропущены.`);
      continue;
    }

    const normalizedTitle = normalizeLabel(definition.title);
    const lookup = byQuestion.get(questionId);
    const matchedId = lookup?.get(normalizedTitle);

    if (matchedId) {
      definition.resolvedId = matchedId;
      unusedByQuestion.get(questionId)?.delete(matchedId);
      continue;
    }

    const fallbackSet = unusedByQuestion.get(questionId);
    let fallbackId = fallbackSet ? fallbackSet.values().next().value : undefined;

    if (!fallbackId) {
      const allIds = result.rows
        .filter((row) => row.question_id === questionId)
        .map((row) => row.id);
      fallbackId = allIds[0];
    }

    if (!fallbackId) {
      logWarn(
        `Для фит-критерия "${definition.title}" (вопрос ${definition.question}) нет записей в базе. Критерий будет пропущен.`
      );
      continue;
    }

    const fallbackTitle = result.rows.find((row) => row.id === fallbackId)?.title ?? fallbackId;

    logWarn(
      `Критерий fit "${definition.title}" не найден по названию. Использован критерий "${fallbackTitle}" (ID ${fallbackId}).`
    );
    definition.resolvedId = fallbackId;
    fallbackSet?.delete(fallbackId);
  }
};

const ensureInterviewerAccounts = async (
  client: DatabaseClient,
  logWarn: (message: string) => void = console.warn
): Promise<Map<InterviewerEmail, string>> => {
  // Проверяем, что все интервьюеры уже имеют аккаунты в системе и вытаскиваем их отображаемые имена
  const emails = [...INTERVIEWER_EMAILS];
  const result = await client.query<{
    email: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT email, display_name, first_name, last_name FROM accounts WHERE email = ANY($1::text[]);`,
    [emails]
  );

  const existingEmails = new Set(result.rows.map((row) => row.email.toLowerCase()));
  const missingEmails = emails.filter((email) => !existingEmails.has(email.toLowerCase()));

  if (missingEmails.length > 0) {
    throw new Error(
      `Accounts missing for interviewer emails: ${missingEmails.join(', ')}. Create the accounts before running the demo seed.`
    );
  }

  const directory = new Map<InterviewerEmail, string>();

  for (const row of result.rows) {
    const normalizedEmail = INTERVIEWER_EMAILS.find(
      (email) => email.toLowerCase() === row.email.toLowerCase()
    );

    if (!normalizedEmail) {
      continue;
    }

    const displayName = row.display_name?.trim() ?? '';
    const firstName = row.first_name?.trim() ?? '';
    const lastName = row.last_name?.trim() ?? '';
    const combined = `${firstName} ${lastName}`.trim();

    let resolvedName = displayName || combined;

    if (!resolvedName) {
      logWarn(
        `Имя для интервьюера ${normalizedEmail} не заполнено в базе. Будет использован адрес e-mail.`
      );
      resolvedName = normalizedEmail;
    }

    directory.set(normalizedEmail, resolvedName);
  }

  return directory;
};

export const seedDemoData = async (
  options: SeedDemoDataOptions = {}
): Promise<SeedDemoDataResult> => {
  const { runMigrations: shouldRunMigrations = true, shutdownPool = false, logger } = options;

  const logInfo = logger?.info ?? console.log;
  const logWarn = logger?.warn ?? console.warn;
  const logError = logger?.error ?? console.error;

  refreshReferenceNow();

  if (shouldRunMigrations) {
    logInfo('Running migrations...');
    await runMigrations();
  }

  let client: DatabaseClient | undefined;
  let transactionStarted = false;
  let totalInterviews = 0;

  try {
    client = await (postgresPool as unknown as { connect: () => Promise<DatabaseClient> }).connect();

    await client.query('BEGIN');
    transactionStarted = true;

    logInfo('Loading case folders and fit questions from the database...');
    const caseFolders = await loadCaseFolders(client);
    const fitQuestionDirectory = await loadFitQuestionDirectory(client, logWarn);

    logInfo('Aligning catalog identifiers with the existing records...');
    await hydrateCaseCriteriaCatalog(client, logWarn);
    await hydrateFitCriteriaCatalog(client, fitQuestionDirectory, logWarn);

    logInfo('Validating interviewer accounts...');
    const interviewerDirectory = await ensureInterviewerAccounts(client, logWarn);

    for (const candidate of candidates) {
      const candidateId = toUuid(`candidate:${candidate.key}`);
      const evaluationId = toUuid(`evaluation:${candidate.key}`);

      const candidateCreatedAt = daysAgo(candidate.appliedDaysAgo, 7, 45).toISOString();
      const candidateUpdatedAt = daysAgo(candidate.appliedDaysAgo - 1, 9, 0).toISOString();

      await client.query(
        `INSERT INTO candidates (
           id, first_name, last_name, gender, age, city, desired_position,
           target_practice, target_office, phone, email, experience_summary,
           total_experience_years, consulting_experience_years, consulting_companies,
           last_company, last_position, last_duration, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18, $19, $20
         )
         ON CONFLICT (id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           gender = EXCLUDED.gender,
           age = EXCLUDED.age,
           city = EXCLUDED.city,
           desired_position = EXCLUDED.desired_position,
           target_practice = EXCLUDED.target_practice,
           target_office = EXCLUDED.target_office,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           experience_summary = EXCLUDED.experience_summary,
           total_experience_years = EXCLUDED.total_experience_years,
           consulting_experience_years = EXCLUDED.consulting_experience_years,
           consulting_companies = EXCLUDED.consulting_companies,
           last_company = EXCLUDED.last_company,
           last_position = EXCLUDED.last_position,
           last_duration = EXCLUDED.last_duration,
           updated_at = EXCLUDED.updated_at;`,
        [
          candidateId,
          candidate.firstName,
          candidate.lastName,
          candidate.gender,
          candidate.age,
          candidate.city,
          candidate.desiredPosition,
          candidate.targetPractice,
          candidate.targetOffice,
          candidate.phone,
          candidate.email,
          candidate.experienceSummary,
          candidate.totalExperienceYears,
          candidate.consultingExperienceYears,
          candidate.consultingCompanies,
          candidate.lastCompany,
          candidate.lastPosition,
          candidate.lastDuration,
          candidateCreatedAt,
          candidateUpdatedAt
        ]
      );

      const roundsPayload = candidate.evaluation.rounds.map((round) => {
        const processStartedAt = daysAgo(round.processStartedDaysAgo, 8, 30);
        const completedAt = daysAgo(round.completedDaysAgo, 13, 15);
        const createdAt = daysAgo(round.processStartedDaysAgo, 8, 0);

        const resolvedInterviews = round.interviews.map((interview, index) => {
          const assignmentSeed = `${candidate.key}:${round.roundNumber}:${interview.slotId}`;
          const assignedCaseFolder = pickDeterministicItem(
            `${assignmentSeed}:case`,
            caseFolders
          );
          const assignedFitQuestion = pickDeterministicItem(
            `${assignmentSeed}:fit`,
            fitQuestionDirectory.list
          );
          const submissionHour =
            interview.submittedHour ?? BASE_FORM_SUBMISSION_HOUR + index * INTERVIEW_OFFSET_HOURS;
          const submittedAt = daysAgo(
            interview.submittedDaysAgo,
            submissionHour,
            index % 2 === 0 ? 20 : 45
          ).toISOString();
          const interviewerName =
            interviewerDirectory.get(interview.interviewerEmail) ?? interview.interviewerEmail;

          return {
            slotId: interview.slotId,
            interviewerEmail: interview.interviewerEmail,
            interviewerName,
            caseFolderId: assignedCaseFolder.id,
            fitQuestionId: assignedFitQuestion.id,
            fitQuestionKey: assignedFitQuestion.key,
            invitationSentDaysAgo: interview.invitationSentDaysAgo,
            submittedAt,
            notes: interview.notes,
            fitScore: interview.fitScore,
            caseScore: interview.caseScore,
            fitNotes: interview.fitNotes,
            caseNotes: interview.caseNotes,
            interestNotes: interview.interestNotes,
            issuesToTest: interview.issuesToTest,
            offerRecommendation: interview.offerRecommendation,
            fitCriteria: interview.fitCriteria,
            caseCriteria: interview.caseCriteria
          };
        });

        const interviews = resolvedInterviews.map((interview) => ({
          id: interview.slotId,
          interviewerName: interview.interviewerName,
          interviewerEmail: interview.interviewerEmail,
          caseFolderId: interview.caseFolderId,
          fitQuestionId: interview.fitQuestionId
        }));

        const forms = resolvedInterviews.map((interview) => ({
          slotId: interview.slotId,
          interviewerName: interview.interviewerName,
          submitted: true,
          submittedAt: interview.submittedAt,
          notes: interview.notes,
          fitScore: interview.fitScore,
          caseScore: interview.caseScore,
          fitNotes: interview.fitNotes,
          caseNotes: interview.caseNotes,
          interestNotes: interview.interestNotes,
          issuesToTest: interview.issuesToTest,
          offerRecommendation: interview.offerRecommendation,
          fitCriteria: mapFitCriteriaToPayload(
            interview.fitQuestionKey,
            interview.fitCriteria,
            interview.fitScore
          ),
          caseCriteria: mapCaseCriteriaToPayload(interview.caseCriteria)
        }));

        return {
          roundNumber: round.roundNumber,
          interviewCount: round.interviews.length,
          interviews,
          forms,
          fitQuestionId: interviews[0]?.fitQuestionId,
          processStatus: 'completed',
          processStartedAt: processStartedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          createdAt: createdAt.toISOString(),
          decision: round.decision
        };
      });

      const roundsByNumber = new Map(roundsPayload.map((payload) => [payload.roundNumber, payload]));
      const currentRoundNumber = Math.max(
        ...candidate.evaluation.rounds.map((round) => round.roundNumber)
      );
      const currentRoundSnapshot = roundsByNumber.get(currentRoundNumber);
      const currentInterviews = currentRoundSnapshot?.interviews ?? [];
      const currentForms = currentRoundSnapshot?.forms ?? [];
      const currentInterviewCount = currentRoundSnapshot?.interviewCount ?? currentInterviews.length;
      const currentFitQuestionId = currentRoundSnapshot?.fitQuestionId ?? null;

      const oldestRound = candidate.evaluation.rounds.reduce((oldest, round) =>
        round.processStartedDaysAgo > oldest.processStartedDaysAgo ? round : oldest
      );
      const latestRound = candidate.evaluation.rounds.reduce((latest, round) =>
        round.completedDaysAgo < latest.completedDaysAgo ? round : latest
      );
      const processStatus =
        candidate.evaluation.decision === 'progress' ? 'in-progress' : 'completed';

      const evaluationCreatedAt = daysAgo(oldestRound.processStartedDaysAgo + 1, 12, 0);
      const evaluationUpdatedAt = daysAgo(latestRound.completedDaysAgo, 15, 30);
      const evaluationProcessStartedAt = daysAgo(oldestRound.processStartedDaysAgo, 8, 30).toISOString();

      await client.query(
        `INSERT INTO evaluations (
           id, candidate_id, round_number, interview_count, interviews, fit_question_id,
           version, created_at, updated_at, forms, process_status,
           process_started_at, round_history, decision
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb, $6,
           1, $7, $8, $9::jsonb, $10,
           $11, $12::jsonb, $13
         )
         ON CONFLICT (id) DO UPDATE SET
           candidate_id = EXCLUDED.candidate_id,
           round_number = EXCLUDED.round_number,
           interview_count = EXCLUDED.interview_count,
           interviews = EXCLUDED.interviews,
           fit_question_id = EXCLUDED.fit_question_id,
           updated_at = EXCLUDED.updated_at,
           forms = EXCLUDED.forms,
           process_status = EXCLUDED.process_status,
           process_started_at = EXCLUDED.process_started_at,
           round_history = EXCLUDED.round_history,
           decision = EXCLUDED.decision;`,
        [
          evaluationId,
          candidateId,
          currentRoundNumber,
          currentInterviewCount,
          JSON.stringify(currentInterviews),
          currentFitQuestionId,
          evaluationCreatedAt.toISOString(),
          evaluationUpdatedAt.toISOString(),
          JSON.stringify(currentForms),
          processStatus,
          evaluationProcessStartedAt,
          JSON.stringify(roundsPayload),
          candidate.evaluation.decision
        ]
      );

      await client.query(`DELETE FROM evaluation_assignments WHERE evaluation_id = $1;`, [evaluationId]);

      for (const round of candidate.evaluation.rounds) {
        totalInterviews += round.interviews.length;
        for (const interview of round.interviews) {
          const assignmentId = toUuid(`assignment:${candidate.key}:${interview.slotId}`);
          const roundSnapshot = roundsPayload.find((payload) => payload.roundNumber === round.roundNumber);
          const interviewSnapshot = roundSnapshot?.interviews.find((entry) => entry.id === interview.slotId);

          if (!interviewSnapshot) {
            throw new Error(
              `Unable to locate assignment snapshot for slot ${interview.slotId} in round ${round.roundNumber}.`
            );
          }

          const caseFolderId = interviewSnapshot.caseFolderId;
          const fitQuestionId = interviewSnapshot.fitQuestionId;
          const interviewerName = interviewSnapshot.interviewerName ??
            interviewerDirectory.get(interview.interviewerEmail) ??
            interview.interviewerEmail;
          const invitationSentAt = daysAgo(interview.invitationSentDaysAgo, 7, 15).toISOString();
          const checksum = computeChecksum(interview.interviewerEmail, interviewerName, caseFolderId, fitQuestionId);

          await client.query(
            `INSERT INTO evaluation_assignments (
               id, evaluation_id, slot_id, interviewer_email, interviewer_name,
               case_folder_id, fit_question_id, round_number, invitation_sent_at,
               created_at, details_checksum, last_sent_checksum, last_delivery_attempt_at
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, $9,
               $10, $11, $11, $9
             )
             ON CONFLICT (id) DO UPDATE SET
               interviewer_email = EXCLUDED.interviewer_email,
               interviewer_name = EXCLUDED.interviewer_name,
               case_folder_id = EXCLUDED.case_folder_id,
               fit_question_id = EXCLUDED.fit_question_id,
               round_number = EXCLUDED.round_number,
               invitation_sent_at = EXCLUDED.invitation_sent_at,
               details_checksum = EXCLUDED.details_checksum,
               last_sent_checksum = EXCLUDED.last_sent_checksum,
               last_delivery_attempt_at = EXCLUDED.last_delivery_attempt_at;`,
            [
              assignmentId,
              evaluationId,
              interview.slotId,
              interview.interviewerEmail,
              interviewerName,
              caseFolderId,
              fitQuestionId,
              round.roundNumber,
              invitationSentAt,
              invitationSentAt,
              checksum
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
    logInfo('Demo data successfully loaded.');

    return {
      candidatesProcessed: candidates.length,
      evaluationsProcessed: candidates.length,
      interviewsProcessed: totalInterviews
    };
  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logError('Failed to rollback transaction after demo seed error.', rollbackError);
      }
    }
    logError('Failed to load demo data.', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    if (shutdownPool) {
      await postgresPool.end();
    }
  }
};

export const eraseDemoData = async (
  options: SeedDemoDataOptions = {}
): Promise<EraseDemoDataResult> => {
  const { runMigrations: shouldRunMigrations = false, shutdownPool = false, logger } = options;
  const logInfo = logger?.info ?? console.log;
  const logError = logger?.error ?? console.error;

  if (shouldRunMigrations) {
    logInfo('Running migrations before erasing demo data...');
    await runMigrations();
  }

  const candidateIds = candidates.map((candidate) => toUuid(`candidate:${candidate.key}`));
  const evaluationIds = candidates.map((candidate) => toUuid(`evaluation:${candidate.key}`));

  let client: DatabaseClient | undefined;
  let transactionStarted = false;

  try {
    client = await (postgresPool as unknown as { connect: () => Promise<DatabaseClient> }).connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const evaluationResult = await client.query<{ id: string }>(
      `DELETE FROM evaluations WHERE id = ANY($1::uuid[]) RETURNING id;`,
      [evaluationIds]
    );

    const candidateResult = await client.query<{ id: string }>(
      `DELETE FROM candidates WHERE id = ANY($1::uuid[]) RETURNING id;`,
      [candidateIds]
    );

    await client.query('COMMIT');
    logInfo('Demo data removed successfully.');

    const candidateRemovedCount =
      'rowCount' in candidateResult && typeof candidateResult.rowCount === 'number'
        ? candidateResult.rowCount
        : candidateResult.rows.length;

    const evaluationRemovedCount =
      'rowCount' in evaluationResult && typeof evaluationResult.rowCount === 'number'
        ? evaluationResult.rowCount
        : evaluationResult.rows.length;

    return {
      candidatesRemoved: candidateRemovedCount,
      evaluationsRemoved: evaluationRemovedCount
    };
  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logError('Failed to rollback transaction after demo erase error.', rollbackError);
      }
    }
    logError('Failed to erase demo data.', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    if (shutdownPool) {
      await postgresPool.end();
    }
  }
};

if (process.argv[1]) {
  const entryUrl = pathToFileURL(process.argv[1]).href;
  if (import.meta.url === entryUrl) {
    seedDemoData({ runMigrations: true, shutdownPool: true })
      .then(() => {
        console.log('Done.');
      })
      .catch((error) => {
        const connectionError = unwrapConnectionError(error);
        if (connectionError) {
          console.error('Не удалось подключиться к PostgreSQL. Проверьте доступность базы и переменные окружения.');
          const socketMeta = connectionError as NodeJS.ErrnoException & { address?: string; port?: number };
          if (socketMeta.address || socketMeta.port) {
            console.error(
              `Текущее соединение пыталось обратиться к ${socketMeta.address ?? 'неизвестному хосту'}:${
                socketMeta.port ?? 'неизвестный порт'
              }.`
            );
          }
          console.error('Исходная ошибка подключения:', connectionError.message);
        } else {
          console.error('Demo seed script failed:', error);
        }

        void postgresPool.end().catch((closeError) => {
          console.error('Не удалось корректно закрыть пул соединений:', closeError);
        });
        process.exit(1);
      });
  }
}
