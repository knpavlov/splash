import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CaseFolder, CaseFileUploadDto } from '../../shared/types/caseLibrary';
import { CandidateProfile } from '../../shared/types/candidate';
import { EvaluationConfig, InvitationDeliveryReport, OfferDecisionStatus } from '../../shared/types/evaluation';
import { AccountRecord, AccountRole, InterviewerSeniority } from '../../shared/types/account';
import { FitQuestion } from '../../shared/types/fitQuestion';
import { CaseCriterion } from '../../shared/types/caseCriteria';
import { DomainResult } from '../../shared/types/results';
import { casesApi } from '../../modules/cases/services/casesApi';
import { candidatesApi } from '../../modules/candidates/services/candidatesApi';
import { accountsApi } from '../../modules/accounts/services/accountsApi';
import { fitQuestionsApi } from '../../modules/questions/services/fitQuestionsApi';
import { caseCriteriaApi } from '../../modules/caseCriteria/services/caseCriteriaApi';
import { evaluationsApi } from '../../modules/evaluation/services/evaluationsApi';
import { ApiError } from '../../shared/api/httpClient';
import { useAuth } from '../../modules/auth/AuthContext';

interface AppStateContextValue {
  cases: {
    folders: CaseFolder[];
    createFolder: (name: string) => Promise<DomainResult<CaseFolder>>;
    renameFolder: (id: string, name: string, expectedVersion: number) => Promise<DomainResult<CaseFolder>>;
    deleteFolder: (id: string) => Promise<DomainResult<string>>;
    registerFiles: (
      id: string,
      files: CaseFileUploadDto[],
      expectedVersion: number
    ) => Promise<DomainResult<CaseFolder>>;
    removeFile: (
      folderId: string,
      fileId: string,
      expectedVersion: number
    ) => Promise<DomainResult<CaseFolder>>;
  };
  caseCriteria: {
    list: CaseCriterion[];
    saveCriterion: (
      criterion: CaseCriterion,
      expectedVersion: number | null
    ) => Promise<DomainResult<CaseCriterion>>;
    removeCriterion: (id: string) => Promise<DomainResult<string>>;
  };
  fitQuestions: {
    list: FitQuestion[];
    saveQuestion: (
      question: FitQuestion,
      expectedVersion: number | null
    ) => Promise<DomainResult<FitQuestion>>;
    removeQuestion: (id: string) => Promise<DomainResult<string>>;
  };
  candidates: {
    list: CandidateProfile[];
    saveProfile: (
      profile: CandidateProfile,
      expectedVersion: number | null
    ) => Promise<DomainResult<CandidateProfile>>;
    removeProfile: (id: string) => Promise<DomainResult<string>>;
  };
  evaluations: {
    list: EvaluationConfig[];
    saveEvaluation: (
      config: EvaluationConfig,
      expectedVersion: number | null
    ) => Promise<DomainResult<EvaluationConfig>>;
    removeEvaluation: (id: string) => Promise<DomainResult<string>>;
    sendInvitations: (
      id: string,
      slotIds?: string[]
    ) => Promise<DomainResult<{ evaluation: EvaluationConfig; deliveryReport: InvitationDeliveryReport }>>;
    advanceRound: (id: string) => Promise<DomainResult<EvaluationConfig>>;
    setDecision: (
      id: string,
      decision: 'offer' | 'reject' | null,
      expectedVersion: number
    ) => Promise<DomainResult<EvaluationConfig>>;
    setOfferStatus: (
      id: string,
      status: OfferDecisionStatus,
      expectedVersion: number
    ) => Promise<DomainResult<EvaluationConfig>>;
  };
  accounts: {
    list: AccountRecord[];
    inviteAccount: (
      email: string,
      role: AccountRole,
      firstName: string,
      lastName: string,
      interviewerRole: InterviewerSeniority
    ) => Promise<DomainResult<AccountRecord>>;
    activateAccount: (id: string) => Promise<DomainResult<AccountRecord>>;
    removeAccount: (id: string) => Promise<DomainResult<string>>;
    updateRole: (id: string, role: 'admin' | 'user') => Promise<DomainResult<AccountRecord>>;
  };
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [folders, setFolders] = useState<CaseFolder[]>([]);
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [fitQuestions, setFitQuestions] = useState<FitQuestion[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationConfig[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [caseCriteria, setCaseCriteria] = useState<CaseCriterion[]>([]);
  const { session } = useAuth();

  const syncFolders = useCallback(async (): Promise<CaseFolder[] | null> => {
    try {
      const remote = await casesApi.list();
      setFolders(remote);
      return remote;
    } catch (error) {
      console.error('Failed to load case folders:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setFolders([]);
      return;
    }
    void syncFolders();
  }, [session, syncFolders]);

  useEffect(() => {
    if (!session) {
      setAccounts([]);
      return;
    }
    const loadAccounts = async () => {
      try {
        const remote = await accountsApi.list();
        setAccounts(remote);
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }
    };
    void loadAccounts();
  }, [session]);

  useEffect(() => {
    if (!session) {
      setCandidates([]);
      setFitQuestions([]);
      setEvaluations([]);
      setCaseCriteria([]);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const loadCandidates = async () => {
      try {
        const remote = await candidatesApi.list();
        setCandidates(remote);
      } catch (error) {
        console.error('Failed to load candidates:', error);
      }
    };
    void loadCandidates();
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const loadEvaluations = async () => {
      try {
        const remote = await evaluationsApi.list();
        setEvaluations(remote);
      } catch (error) {
        console.error('Failed to load evaluations:', error);
      }
    };
    void loadEvaluations();
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const loadQuestions = async () => {
      try {
        const remote = await fitQuestionsApi.list();
        setFitQuestions(remote);
      } catch (error) {
        console.error('Failed to load fit questions:', error);
      }
    };
    void loadQuestions();
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const loadCaseCriteria = async () => {
      try {
        const remote = await caseCriteriaApi.list();
        setCaseCriteria(remote);
      } catch (error) {
        console.error('Failed to load case criteria:', error);
      }
    };
    void loadCaseCriteria();
  }, [session]);

  const sortQuestionsByUpdated = (items: FitQuestion[]) =>
    [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const value = useMemo<AppStateContextValue>(() => ({
    cases: {
      folders,
      createFolder: async (name) => {
        const trimmed = name.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const folder = await casesApi.create(trimmed);
          await syncFolders();
          return { ok: true, data: folder };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'duplicate') {
              return { ok: false, error: 'duplicate' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to create folder:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      renameFolder: async (id, name, expectedVersion) => {
        const current = folders.find((item) => item.id === id);
        if (!current) {
          return { ok: false, error: 'not-found' };
        }
        const trimmed = name.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const folder = await casesApi.rename(id, trimmed, expectedVersion);
          await syncFolders();
          return { ok: true, data: folder };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'duplicate') {
              return { ok: false, error: 'duplicate' };
            }
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to rename folder:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      deleteFolder: async (id) => {
        const exists = folders.some((item) => item.id === id);
        if (!exists) {
          return { ok: false, error: 'not-found' };
        }
        try {
          await casesApi.remove(id);
          await syncFolders();
          return { ok: true, data: id };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete folder:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      registerFiles: async (id, files, expectedVersion) => {
        if (!files.length) {
          return { ok: false, error: 'invalid-input' };
        }
        const current = folders.find((item) => item.id === id);
        if (!current) {
          return { ok: false, error: 'not-found' };
        }
        try {
          const folder = await casesApi.uploadFiles(id, files, expectedVersion);
          await syncFolders();
          return { ok: true, data: folder };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to upload files to folder:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeFile: async (folderId, fileId, expectedVersion) => {
        const current = folders.find((item) => item.id === folderId);
        if (!current) {
          return { ok: false, error: 'not-found' };
        }
        try {
          const folder = await casesApi.removeFile(folderId, fileId, expectedVersion);
          await syncFolders();
          return { ok: true, data: folder };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to delete file from folder:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    caseCriteria: {
      list: caseCriteria,
      saveCriterion: async (criterion, expectedVersion) => {
        const trimmedId = criterion.id.trim();
        const trimmedTitle = criterion.title.trim();
        if (!trimmedId || !trimmedTitle) {
          return { ok: false, error: 'invalid-input' };
        }

        const sanitized: CaseCriterion = {
          ...criterion,
          id: trimmedId,
          title: trimmedTitle,
          ratings: {}
        };

        (['1', '2', '3', '4', '5'] as const).forEach((score) => {
          const value = criterion.ratings[Number(score) as 1 | 2 | 3 | 4 | 5];
          if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
              sanitized.ratings[Number(score) as 1 | 2 | 3 | 4 | 5] = trimmed;
            }
          }
        });

        const exists = caseCriteria.some((item) => item.id === trimmedId);

        try {
          if (exists) {
            if (expectedVersion === null || expectedVersion === undefined) {
              return { ok: false, error: 'invalid-input' };
            }
            const updated = await caseCriteriaApi.update(trimmedId, sanitized, expectedVersion);
            setCaseCriteria((prev) => prev.map((item) => (item.id === trimmedId ? updated : item)));
            return { ok: true, data: updated };
          }

          const created = await caseCriteriaApi.create(sanitized);
          setCaseCriteria((prev) => [...prev, created]);
          return { ok: true, data: created };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found') {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to save case criterion:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeCriterion: async (id) => {
        const trimmed = id.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        const exists = caseCriteria.some((item) => item.id === trimmed);
        if (!exists) {
          return { ok: false, error: 'not-found' };
        }
        try {
          await caseCriteriaApi.remove(trimmed);
          setCaseCriteria((prev) => prev.filter((item) => item.id !== trimmed));
          return { ok: true, data: trimmed };
        } catch (error) {
          if (error instanceof ApiError && error.code === 'not-found') {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete case criterion:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    fitQuestions: {
      list: fitQuestions,
      saveQuestion: async (question, expectedVersion) => {
        const trimmedId = question.id.trim();
        if (!trimmedId) {
          return { ok: false, error: 'invalid-input' };
        }

        const sanitized: FitQuestion = {
          ...question,
          id: trimmedId,
          shortTitle: question.shortTitle.trim(),
          content: question.content.trim()
        };

        const exists = fitQuestions.some((item) => item.id === trimmedId);

        try {
          if (exists) {
            if (expectedVersion === null || expectedVersion === undefined) {
              return { ok: false, error: 'invalid-input' };
            }
            const updated = await fitQuestionsApi.update(trimmedId, sanitized, expectedVersion);
            setFitQuestions((prev) =>
              sortQuestionsByUpdated([
                ...prev.filter((item) => item.id !== trimmedId),
                updated
              ])
            );
            return { ok: true, data: updated };
          }

          const created = await fitQuestionsApi.create(sanitized);
          setFitQuestions((prev) => sortQuestionsByUpdated([...prev, created]));
          return { ok: true, data: created };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to save fit question:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeQuestion: async (id) => {
        const trimmed = id.trim();
        if (!trimmed) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          await fitQuestionsApi.remove(trimmed);
          setFitQuestions((prev) => prev.filter((item) => item.id !== trimmed));
          return { ok: true, data: trimmed };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete fit question:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    candidates: {
      list: candidates,
      saveProfile: async (profile, expectedVersion) => {
        const firstName = profile.firstName.trim();
        const lastName = profile.lastName.trim();
        if (!firstName || !lastName) {
          return { ok: false, error: 'invalid-input' };
        }

        const sanitized: CandidateProfile = {
          ...profile,
          firstName,
          lastName,
          gender: profile.gender?.trim() ? profile.gender.trim() : undefined,
          city: profile.city?.trim() ?? '',
          desiredPosition: profile.desiredPosition?.trim() ?? '',
          phone: profile.phone?.trim() ?? '',
          email: profile.email?.trim() ?? '',
          experienceSummary: profile.experienceSummary?.trim() ?? '',
          consultingCompanies: profile.consultingCompanies?.trim() ?? '',
          lastCompany: profile.lastCompany?.trim() ?? '',
          lastPosition: profile.lastPosition?.trim() ?? '',
          lastDuration: profile.lastDuration?.trim() ?? ''
        };

        try {
          if (expectedVersion === null) {
            const created = await candidatesApi.create(sanitized);
            setCandidates((prev) => [...prev, created]);
            return { ok: true, data: created };
          }

          const updated = await candidatesApi.update(profile.id, sanitized, expectedVersion);
          setCandidates((prev) => prev.map((item) => (item.id === profile.id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found') {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to save candidate:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeProfile: async (id) => {
        try {
          await candidatesApi.remove(id);
          setCandidates((prev) => prev.filter((item) => item.id !== id));
          return { ok: true, data: id };
        } catch (error) {
          if (error instanceof ApiError && error.code === 'not-found') {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete candidate:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    evaluations: {
      list: evaluations,
      saveEvaluation: async (config, expectedVersion) => {
        if (!config.candidateId) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          if (expectedVersion === null) {
            const created = await evaluationsApi.create(config);
            setEvaluations((prev) => [...prev, created]);
            return { ok: true, data: created };
          }
          const updated = await evaluationsApi.update(config.id, config, expectedVersion);
          setEvaluations((prev) => prev.map((item) => (item.id === config.id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found') {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to save evaluation:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeEvaluation: async (id) => {
        try {
          await evaluationsApi.remove(id);
          setEvaluations((prev) => prev.filter((item) => item.id !== id));
          return { ok: true, data: id };
        } catch (error) {
          if (error instanceof ApiError && error.code === 'not-found') {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to delete evaluation:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      sendInvitations: async (id, slotIds) => {
        try {
          const result = await evaluationsApi.sendInvitations(id, slotIds);
          setEvaluations((prev) => prev.map((item) => (item.id === id ? result.evaluation : item)));
          return { ok: true, data: result };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'missing-assignment-data') {
              return { ok: false, error: 'missing-assignment-data' };
            }
            if (error.code === 'invalid-assignment-data') {
              return { ok: false, error: 'invalid-assignment-data' };
            }
            if (error.code === 'invalid-assignment-resources') {
              return { ok: false, error: 'invalid-assignment-resources' };
            }
            if (error.code === 'mailer-unavailable') {
              return { ok: false, error: 'mailer-unavailable' };
            }
            if (error.code === 'invalid-portal-url') {
              return { ok: false, error: 'invalid-portal-url' };
            }
            if (error.code === 'invalid-selection') {
              return { ok: false, error: 'invalid-selection' };
            }
            if (error.code === 'invitation-delivery-failed') {
              return { ok: false, error: 'invitation-delivery-failed' };
            }
            if (error.code === 'not-found') {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to send invitations:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      advanceRound: async (id) => {
        try {
          const updated = await evaluationsApi.advance(id);
          setEvaluations((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'forms-pending') {
              return { ok: false, error: 'forms-pending' };
            }
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'not-found') {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to advance evaluation round:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      setDecision: async (id, decision, expectedVersion) => {
        if (decision !== 'offer' && decision !== 'reject' && decision !== null) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const updated = await evaluationsApi.setDecision(id, decision, expectedVersion);
          setEvaluations((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'not-found') {
              return { ok: false, error: 'not-found' };
            }
          }
          console.error('Failed to update evaluation decision:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      setOfferStatus: async (id, status, expectedVersion) => {
        const allowedStatuses: OfferDecisionStatus[] = [
          'pending',
          'accepted',
          'accepted-co',
          'declined',
          'declined-co'
        ];
        if (!allowedStatuses.includes(status)) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const updated = await evaluationsApi.setOfferStatus(id, status, expectedVersion);
          setEvaluations((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'version-conflict') {
              return { ok: false, error: 'version-conflict' };
            }
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.status === 403 || error.code === 'invalid-input') {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to update offer decision status:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    },
    accounts: {
      list: accounts,
      inviteAccount: async (email, role, firstName, lastName, interviewerRole) => {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) {
          return { ok: false, error: 'invalid-input' };
        }
        const normalizedFirst = firstName.trim();
        const normalizedLast = lastName.trim();
        if (!normalizedFirst || !normalizedLast) {
          return { ok: false, error: 'invalid-input' };
        }
        if (!interviewerRole) {
          return { ok: false, error: 'invalid-input' };
        }
        try {
          const account = await accountsApi.invite(
            trimmedEmail,
            role,
            normalizedFirst,
            normalizedLast,
            interviewerRole
          );
          setAccounts((prev) => [...prev, account]);
          return { ok: true, data: account };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'duplicate' || error.status === 409) {
              return { ok: false, error: 'duplicate' };
            }
            if (error.code === 'invalid-input' || error.status === 400) {
              return { ok: false, error: 'invalid-input' };
            }
            if (error.code === 'mailer-unavailable' || error.status === 503) {
              return { ok: false, error: 'mailer-unavailable' };
            }
          }
          console.error('Failed to send invitation:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      activateAccount: async (id) => {
        const current = accounts.find((item) => item.id === id);
        if (!current) {
          return { ok: false, error: 'not-found' };
        }
        try {
          const updated = await accountsApi.activate(id);
          setAccounts((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError && (error.code === 'not-found' || error.status === 404)) {
            return { ok: false, error: 'not-found' };
          }
          console.error('Failed to activate account:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      removeAccount: async (id) => {
        const exists = accounts.some((item) => item.id === id);
        if (!exists) {
          return { ok: false, error: 'not-found' };
        }
        try {
          await accountsApi.remove(id);
          setAccounts((prev) => prev.filter((item) => item.id !== id));
          return { ok: true, data: id };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.status === 403) {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to delete account:', error);
          return { ok: false, error: 'unknown' };
        }
      },
      updateRole: async (id, role) => {
        if (role !== 'admin' && role !== 'user') {
          return { ok: false, error: 'invalid-input' };
        }

        const existing = accounts.find((item) => item.id === id);
        if (!existing) {
          return { ok: false, error: 'not-found' };
        }

        if (existing.role === role) {
          return { ok: true, data: existing };
        }

        try {
          const updated = await accountsApi.updateRole(id, role);
          setAccounts((prev) => prev.map((item) => (item.id === id ? updated : item)));
          return { ok: true, data: updated };
        } catch (error) {
          if (error instanceof ApiError) {
            if (error.code === 'not-found' || error.status === 404) {
              return { ok: false, error: 'not-found' };
            }
            if (error.status === 403) {
              return { ok: false, error: 'invalid-input' };
            }
          }
          console.error('Failed to update account role:', error);
          return { ok: false, error: 'unknown' };
        }
      }
    }
  }), [folders, caseCriteria, fitQuestions, candidates, evaluations, accounts, syncFolders]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('AppStateContext is missing. Wrap the component in AppStateProvider.');
  }
  return context;
};

export const useCasesState = () => useAppState().cases;
export const useCaseCriteriaState = () => useAppState().caseCriteria;
export const useFitQuestionsState = () => useAppState().fitQuestions;
export const useCandidatesState = () => useAppState().candidates;
export const useEvaluationsState = () => useAppState().evaluations;
export const useAccountsState = () => useAppState().accounts;
