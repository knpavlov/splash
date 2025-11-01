import { Buffer } from 'buffer';
import { QueryableClient, toUuid } from './demoData.shared.js';

// Тип ключей для фит-критериев
export type FitCriterionKey =
  | 'clientCommunication'
  | 'clientOwnership'
  | 'clientDrive'
  | 'leadershipDirection'
  | 'leadershipResilience'
  | 'leadershipGrowth'
  | 'collaborationAlignment'
  | 'collaborationCommunication'
  | 'collaborationExecution';

// Тип ключей для критериев кейсов
export type CaseCriterionKey =
  | 'structure'
  | 'quant'
  | 'communication'
  | 'problemSolving'
  | 'insight'
  | 'rigor'
  | 'creativity'
  | 'synthesis'
  | 'clientImpact';

// Определение фит-критерия с текстом описания уровней
interface FitCriterionDefinition {
  id: string;
  resolvedId?: string;
  slug: string;
  question: 'client-trust' | 'leadership' | 'collaboration';
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

// Определение глобального критерия кейса
interface CaseCriterionDefinition {
  id: string;
  resolvedId?: string;
  slug: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

// Определение файла кейса
interface CaseFileSeed {
  key: string;
  fileName: string;
  mimeType: string;
  content: string;
}

// Определение критерия оценки внутри конкретной папки кейса
interface CaseEvaluationCriterionSeed {
  key: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

// Описание папки кейса
interface CaseFolderSeed {
  key: 'infrastructure' | 'retail-pricing' | 'supply-chain' | 'digital-growth';
  id?: string;
  name: string;
  files: CaseFileSeed[];
  evaluationCriteria: CaseEvaluationCriterionSeed[];
}

// Описание фит-вопроса
interface FitQuestionSeed {
  id: string;
  key: 'client-trust' | 'leadership' | 'collaboration';
  shortTitle: string;
  content: string;
  criteria: FitCriterionKey[];
}

// Каталог фит-критериев, общий для сидера
export const fitCriteriaCatalog: Record<FitCriterionKey, FitCriterionDefinition> = {
  clientCommunication: {
    id: toUuid('fit-criterion:listening'),
    slug: 'fit-listening',
    question: 'client-trust',
    title: 'Listening',
    ratings: {
      1: 'Frequently misses context or interrupts the conversation, leading to incorrect conclusions.',
      2: 'Understands the core of the discussion but needs reminders to slow down and listen fully.',
      3: 'Listens carefully, clarifies assumptions and reflects the storyline accurately.',
      4: 'Actively probes for nuance, summarises crisply and keeps the conversation anchored.',
      5: 'Creates space for the interviewer, surfaces hidden signals and steers the dialogue with intent.'
    }
  },
  clientOwnership: {
    id: toUuid('fit-criterion:influencing'),
    slug: 'fit-influencing',
    question: 'client-trust',
    title: 'Influencing',
    ratings: {
      1: 'Struggles to build credibility and rarely shifts stakeholder opinions.',
      2: 'Influences peers with effort but cannot consistently win senior sponsorship.',
      3: 'Earns trust from client managers and lands key points with supporting logic.',
      4: 'Anticipates objections, adapts messaging and guides the room to the right outcome.',
      5: 'Shapes the agenda for executives and secures alignment on difficult trade-offs.'
    }
  },
  clientDrive: {
    id: toUuid('fit-criterion:resilience'),
    slug: 'fit-resilience',
    question: 'client-trust',
    title: 'Resilience',
    ratings: {
      1: 'Shuts down after setbacks and avoids the tougher parts of the mandate.',
      2: 'Recovers eventually but needs heavy guidance to get back on track.',
      3: 'Bounces back from pushback, keeps composure and follows through.',
      4: 'Handles pressure confidently and keeps the client assured when plans change.',
      5: 'Turns adversity into momentum, demonstrates calm resolve and keeps everyone focused.'
    }
  },
  leadershipDirection: {
    id: toUuid('fit-criterion:ambition'),
    slug: 'fit-ambition',
    question: 'leadership',
    title: 'Ambition',
    ratings: {
      1: 'Accepts the brief as-is and does not push for stronger outcomes.',
      2: 'Wants to deliver more but lacks the conviction to escalate ideas.',
      3: 'Raises the bar selectively and shows desire to drive bigger results.',
      4: 'Sets a bold vision, rallies the team and pushes the client to aim higher.',
      5: 'Redefines ambition for the organisation and creates energy to achieve it.'
    }
  },
  leadershipResilience: {
    id: toUuid('fit-criterion:impact'),
    slug: 'fit-impact',
    question: 'leadership',
    title: 'Impact',
    ratings: {
      1: 'Focuses on activities without explaining the value delivered.',
      2: 'Describes outputs but connects them to outcomes inconsistently.',
      3: 'Shows a line of sight to client value with clear examples.',
      4: 'Links strategic choices to measurable results and brings stakeholders along.',
      5: 'Consistently creates transformational impact and articulates the change compellingly.'
    }
  },
  leadershipGrowth: {
    id: toUuid('fit-criterion:drive'),
    slug: 'fit-drive',
    question: 'leadership',
    title: 'Drive',
    ratings: {
      1: 'Waits for direction and delivers only what is requested.',
      2: 'Shows bursts of energy but does not sustain momentum.',
      3: 'Maintains steady pace and follows through on commitments.',
      4: 'Creates urgency, empowers others and keeps the team moving.',
      5: 'Operates with relentless pace and unlocks capacity in everyone around them.'
    }
  },
  collaborationAlignment: {
    id: toUuid('fit-criterion:insight'),
    slug: 'fit-insight',
    question: 'collaboration',
    title: 'Insight',
    ratings: {
      1: 'Summarises what was said without adding perspective.',
      2: 'Identifies the obvious drivers but misses second-order effects.',
      3: 'Surfaces relevant insights that move the conversation forward.',
      4: 'Connects patterns across stakeholders and highlights implications.',
      5: 'Spots emerging themes early and shapes the organisation-wide response.'
    }
  },
  collaborationCommunication: {
    id: toUuid('fit-criterion:structure'),
    slug: 'fit-structure',
    question: 'collaboration',
    title: 'Structure',
    ratings: {
      1: 'Approaches collaboration chaotically and confuses owners.',
      2: 'Shares updates irregularly and leaves gaps in accountability.',
      3: 'Keeps stakeholders reasonably aligned with periodic structure.',
      4: 'Runs a clear cadence, assigns ownership and keeps deliverables moving.',
      5: 'Designs robust operating rhythm that scales across teams and geographies.'
    }
  },
  collaborationExecution: {
    id: toUuid('fit-criterion:executive-communication'),
    slug: 'fit-executive-communication',
    question: 'collaboration',
    title: 'Executive communication clarity',
    ratings: {
      1: 'Produces dense updates that senior stakeholders cannot use.',
      2: 'Conveys information but lacks clarity on decisions and asks.',
      3: 'Summarises key points with acceptable brevity for leaders.',
      4: 'Tells a structured story, highlights trade-offs and enables quick decisions.',
      5: 'Communicates with board-level precision and drives decisive action.'
    }
  }
};

// Каталог критериев кейса
export const caseCriteriaCatalog: Record<CaseCriterionKey, CaseCriterionDefinition> = {
  structure: {
    id: toUuid('case-criterion:structure'),
    slug: 'case-structure',
    title: 'Problem structure & logic',
    ratings: {
      1: 'Unstructured thinking without a hypothesis.',
      2: 'Basic framework that misses major components.',
      3: 'Reasonable structure with minor gaps.',
      4: 'Clear, MECE structure with relevant detail.',
      5: 'Elegant structure that drives the discussion and adapts dynamically.'
    }
  },
  quant: {
    id: toUuid('case-criterion:quant'),
    slug: 'case-quant',
    title: 'Quantitative rigour',
    ratings: {
      1: 'Frequent math errors and incorrect units.',
      2: 'Needs guidance to complete calculations.',
      3: 'Accurate maths with minor slips.',
      4: 'Fast, precise calculations with useful cross-checks.',
      5: 'Outstanding quant skills, stress-tests numbers independently.'
    }
  },
  communication: {
    id: toUuid('case-criterion:communication'),
    slug: 'case-communication',
    title: 'Communication & presence',
    ratings: {
      1: 'Disorganised messaging and confusing takeaway.',
      2: 'Understands points but fails to communicate them clearly.',
      3: 'Communicates core ideas clearly with prompts.',
      4: 'Confident communicator with concise messaging.',
      5: 'Executive-level storytelling that inspires confidence.'
    }
  },
  problemSolving: {
    id: toUuid('case-criterion:problem-solving'),
    slug: 'case-problem-solving',
    title: 'Problem solving creativity',
    ratings: {
      1: 'Relies on surface-level ideas and struggles to progress.',
      2: 'Generates ideas but lacks depth and prioritisation.',
      3: 'Produces relevant hypotheses with interviewer guidance.',
      4: 'Develops creative, actionable ideas and tests them logically.',
      5: 'Consistently reframes the problem and unlocks new insights.'
    }
  },
  insight: {
    id: toUuid('case-criterion:insight'),
    slug: 'case-insight',
    title: 'Insight generation',
    ratings: {
      1: 'Misses key signals and draws incorrect conclusions.',
      2: 'Needs extensive steering to reach useful insights.',
      3: 'Identifies the main drivers with help.',
      4: 'Extracts nuanced insights independently.',
      5: 'Connects disparate data points into compelling narratives.'
    }
  },
  rigor: {
    id: toUuid('case-criterion:rigor'),
    slug: 'case-rigor',
    title: 'Rigor & attention to detail',
    ratings: {
      1: 'Inaccurate assumptions and frequent mistakes.',
      2: 'Catches some errors but overlooks important checks.',
      3: 'Reasonably thorough with occasional gaps.',
      4: 'Methodical, double-checks work and validates assumptions.',
      5: 'Highly reliable, stress-tests every step and documents logic.'
    }
  },
  creativity: {
    id: toUuid('case-criterion:creativity'),
    slug: 'case-creativity',
    title: 'Creativity & adaptability',
    ratings: {
      1: 'Repeats textbook answers without tailoring.',
      2: 'Adapts slowly when faced with new information.',
      3: 'Adjusts approach with some prompting.',
      4: 'Quickly pivots and introduces fresh perspectives.',
      5: 'Combines creativity with practicality, inspiring client confidence.'
    }
  },
  synthesis: {
    id: toUuid('case-criterion:synthesis'),
    slug: 'case-synthesis',
    title: 'Synthesis & recommendation',
    ratings: {
      1: 'Cannot form a coherent recommendation.',
      2: 'Summarises facts without implications.',
      3: 'Provides a reasonable recommendation with coaching.',
      4: 'Delivers clear takeaways anchored in evidence.',
      5: 'Persuasive, executive-ready synthesis with next steps.'
    }
  },
  clientImpact: {
    id: toUuid('case-criterion:client-impact'),
    slug: 'case-client-impact',
    title: 'Focus on client impact',
    ratings: {
      1: 'Ignores the client context and priorities.',
      2: 'Understands impact but fails to integrate it in answers.',
      3: 'Connects analysis to impact with support.',
      4: 'Consistently grounds discussion in client value.',
      5: 'Shapes the case around measurable client outcomes.'
    }
  }
};

// Хелпер для получения data URL из текстового содержимого
const buildDataUrl = (content: string, mimeType: string) => {
  const buffer = Buffer.from(content, 'utf8');
  const base64 = buffer.toString('base64');
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    size: buffer.byteLength
  };
};

// Описания папок кейсов с файлами и критериями
export const caseFolderSeeds: CaseFolderSeed[] = [
  {
    key: 'infrastructure',
    name: 'Aircraft Leasing',
    files: [
      {
        key: 'pack',
        fileName: 'Interview Case Study_Aircraft Leasing.pdf',
        mimeType: 'application/pdf',
        content:
          'Aircraft Leasing case study pack. Summarise fleet utilisation, outline lease renewal economics and prepare an offer recommendation.'
      },
      {
        key: 'support',
        fileName: 'Interview Case Study_Aircraft Leasing_notes.txt',
        mimeType: 'text/plain',
        content:
          'Background: Flagship Airways is assessing whether to extend a wide-body lease. Analyse demand scenarios, maintenance exposure and capital alternatives.'
      }
    ],
    evaluationCriteria: [
      {
        key: 'aircraft-analysis',
        title: 'Fleet economics analysis',
        ratings: {
          1: 'Misses key cost drivers and ignores utilisation trends.',
          3: 'Covers the main drivers with basic scenario work.',
          5: 'Builds a cohesive economic view including sensitivity checks and risk levers.'
        }
      },
      {
        key: 'aircraft-recommendation',
        title: 'Recommendation clarity',
        ratings: {
          1: 'Provides a generic recommendation without linking to evidence.',
          3: 'Articulates a direction with selective data points.',
          5: 'Delivers a confident, data-backed answer with quantified impact.'
        }
      },
      {
        key: 'aircraft-risk',
        title: 'Risk awareness',
        ratings: {
          1: 'Overlooks maintenance or counterparty risk.',
          3: 'Mentions the primary risks with limited mitigations.',
          5: 'Maps operational and financial risks with pragmatic mitigation ideas.'
        }
      }
    ]
  },
  {
    key: 'retail-pricing',
    name: 'Iceberg',
    files: [
      {
        key: 'pack',
        fileName: 'Interview Case Study_Iceberg.pdf',
        mimeType: 'application/pdf',
        content:
          'Iceberg scenario brief. Diagnose revenue leakage in a specialty grocer, explore pricing moves and define implementation guardrails.'
      },
      {
        key: 'support',
        fileName: 'Interview Case Study_Iceberg_notes.txt',
        mimeType: 'text/plain',
        content:
          'Data set summary: includes store traffic, conversion, SKU mix and discount penetration over the past six quarters.'
      }
    ],
    evaluationCriteria: [
      {
        key: 'iceberg-insight',
        title: 'Insight depth',
        ratings: {
          1: 'Repeats facts without generating business insight.',
          3: 'Translates key data points into workable insights.',
          5: 'Identifies the hidden drivers and frames sharp hypotheses.'
        }
      },
      {
        key: 'iceberg-communication',
        title: 'Communication & presence',
        ratings: {
          1: 'Loses structure and leaves stakeholders confused.',
          3: 'Communicates the storyline with occasional prompts.',
          5: 'Narrates with executive polish and keeps the client engaged.'
        }
      },
      {
        key: 'iceberg-creativity',
        title: 'Creativity',
        ratings: {
          1: 'Suggests predictable moves without differentiation.',
          3: 'Combines known levers with a few fresh ideas.',
          5: 'Introduces distinctive, commercially grounded initiatives.'
        }
      }
    ]
  },
  {
    key: 'supply-chain',
    name: 'Project Blue',
    files: [
      {
        key: 'pack',
        fileName: 'Interview Case Study_Project Blue.pdf',
        mimeType: 'application/pdf',
        content:
          'Project Blue brief. Evaluate a national telco B2B go-to-market transformation, including segment focus and product investment choices.'
      },
      {
        key: 'support',
        fileName: 'Interview Case Study_Project Blue_backlog.txt',
        mimeType: 'text/plain',
        content:
          'Attachment: backlog of enterprise opportunities by segment, historical conversion rates and customer satisfaction commentary.'
      }
    ],
    evaluationCriteria: [
      {
        key: 'blue-diagnostics',
        title: 'Diagnostics quality',
        ratings: {
          1: 'Misses core issues in the commercial engine.',
          3: 'Surfaces the key blockers with support from data.',
          5: 'Connects process, product and talent insights into a coherent diagnosis.'
        }
      },
      {
        key: 'blue-plan',
        title: 'Transformation plan',
        ratings: {
          1: 'Lists actions without structure or prioritisation.',
          3: 'Proposes a plausible roadmap with basic sequencing.',
          5: 'Builds a bold yet pragmatic plan with metrics and ownership.'
        }
      },
      {
        key: 'blue-leadership',
        title: 'Stakeholder leadership',
        ratings: {
          1: 'Ignores the need to mobilise teams and leaders.',
          3: 'Mentions stakeholder moves with limited specificity.',
          5: 'Defines an inspiring change story and mobilisation approach.'
        }
      }
    ]
  },
  {
    key: 'digital-growth',
    name: 'Project Box',
    files: [
      {
        key: 'pack',
        fileName: 'Interview Case Study_Project Box.pdf',
        mimeType: 'application/pdf',
        content:
          'Project Box case materials. Analyse a logistics spin-out opportunity, size the market and propose partnership structures.'
      }
    ],
    evaluationCriteria: [
      {
        key: 'box-structure',
        title: 'Problem structure',
        ratings: {
          1: 'Struggles to frame the problem and scope the workstreams.',
          3: 'Creates a workable structure with a few gaps.',
          5: 'Builds a crisp, MECE structure that guides the interview.'
        }
      },
      {
        key: 'box-quant',
        title: 'Quantitative rigour',
        ratings: {
          1: 'Makes arithmetic mistakes and ignores units.',
          3: 'Completes calculations with minor guidance.',
          5: 'Runs precise maths, triangulates results and sanity-checks them.'
        }
      },
      {
        key: 'box-summary',
        title: 'Executive summary',
        ratings: {
          1: 'Ends without a clear take-away or action plan.',
          3: 'Summarises the case with some actionable points.',
          5: 'Delivers a compelling, executive-ready close with next steps.'
        }
      }
    ]
  }
];

// Описание фит-вопросов с привязкой к критериям
export const fitQuestionSeeds: FitQuestionSeed[] = [
  {
    id: '0c073434-6a3a-4344-8b80-79e284b7ed9f',
    key: 'client-trust',
    shortTitle: 'Building client trust',
    content:
      'Tell us about a time you had to convince a skeptical client executive and earn the right to advise them. Focus on your actions and the outcomes.',
    criteria: ['clientCommunication', 'clientOwnership', 'clientDrive']
  },
  {
    id: 'a83d8f1e-0933-4e33-a3e8-4d0c0f4feff8',
    key: 'leadership',
    shortTitle: 'Leading through ambiguity',
    content:
      'Describe a situation where the mandate was unclear and you had to create direction for the team. How did you motivate others and what changed as a result?',
    criteria: ['leadershipDirection', 'leadershipResilience', 'leadershipGrowth']
  },
  {
    id: '8be6d0a7-f70d-4949-b7a1-7ab17729ff10',
    key: 'collaboration',
    shortTitle: 'Driving collaboration',
    content:
      'Share an example of orchestrating a complex programme with multiple stakeholders. How did you keep everyone aligned and deliver the outcome?',
    criteria: ['collaborationAlignment', 'collaborationCommunication', 'collaborationExecution']
  }
];

export const caseFolderReferences = caseFolderSeeds.map((folder) => ({ key: folder.key, name: folder.name }));
export const fitQuestionReferences = fitQuestionSeeds.map((question) => ({ key: question.key, shortTitle: question.shortTitle }));

const toNullable = (value: string | undefined) => (value ? value : null);

const applyRatings = (
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>
): [string | null, string | null, string | null, string | null, string | null] => [
  toNullable(ratings[1]),
  toNullable(ratings[2]),
  toNullable(ratings[3]),
  toNullable(ratings[4]),
  toNullable(ratings[5])
];

const fetchExistingId = async (
  client: QueryableClient,
  query: string,
  params: unknown[]
): Promise<string | null> => {
  const result = await client.query<{ id?: string }>(query, params);
  if (result.rows && result.rows.length > 0) {
    const id = result.rows[0]?.id;
    return typeof id === 'string' && id ? id : null;
  }
  return null;
};

// Готовим или обновляем папки кейсов, файлы и критерии
export const ensureCaseLibraryAssets = async (
  client: QueryableClient,
  logInfo: (message: string) => void
) => {
  for (const folder of caseFolderSeeds) {
    const existingFolderId = await fetchExistingId(
      client,
      'SELECT id FROM case_folders WHERE name = $1 LIMIT 1',
      [folder.name]
    );
    const folderId = folder.id ?? existingFolderId ?? toUuid(`case-folder:${folder.key}`);
    folder.id = folderId;
    await client.query(
      `INSERT INTO case_folders (id, name, version, created_at, updated_at)
       VALUES ($1, $2, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         updated_at = NOW(),
         version = case_folders.version + 1;`,
      [folderId, folder.name]
    );

    const fileIds: string[] = [];
    for (const file of folder.files) {
      const fileId =
        (await fetchExistingId(
          client,
          'SELECT id FROM case_files WHERE folder_id = $1 AND file_name = $2 LIMIT 1',
          [folderId, file.fileName]
        )) ?? toUuid(`case-file:${folder.key}:${file.key}`);
      const { dataUrl, size } = buildDataUrl(file.content, file.mimeType);
      fileIds.push(fileId);
      await client.query(
        `INSERT INTO case_files (id, folder_id, file_name, mime_type, file_size, data_url, uploaded_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           file_name = EXCLUDED.file_name,
           mime_type = EXCLUDED.mime_type,
           file_size = EXCLUDED.file_size,
           data_url = EXCLUDED.data_url,
           uploaded_at = NOW();`,
        [fileId, folderId, file.fileName, file.mimeType, size, dataUrl]
      );
    }

    await client.query(
      `DELETE FROM case_files WHERE folder_id = $1 AND id <> ALL($2::uuid[]);`,
      [folderId, fileIds]
    );

    const evaluationCriterionIds: string[] = [];
    for (const criterion of folder.evaluationCriteria) {
      const criterionId =
        (await fetchExistingId(
          client,
          'SELECT id FROM case_evaluation_criteria WHERE folder_id = $1 AND title = $2 LIMIT 1',
          [folderId, criterion.title]
        )) ?? toUuid(`case-folder:${folder.key}:criterion:${criterion.key}`);
      const [r1, r2, r3, r4, r5] = applyRatings(criterion.ratings);
      evaluationCriterionIds.push(criterionId);
      await client.query(
        `INSERT INTO case_evaluation_criteria (id, folder_id, title, rating_1, rating_2, rating_3, rating_4, rating_5, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           rating_1 = EXCLUDED.rating_1,
           rating_2 = EXCLUDED.rating_2,
           rating_3 = EXCLUDED.rating_3,
           rating_4 = EXCLUDED.rating_4,
           rating_5 = EXCLUDED.rating_5;`,
        [criterionId, folderId, criterion.title, r1, r2, r3, r4, r5]
      );
    }

    await client.query(
      `DELETE FROM case_evaluation_criteria WHERE folder_id = $1 AND id <> ALL($2::uuid[]);`,
      [folderId, evaluationCriterionIds]
    );

    logInfo(`Case folder "${folder.name}" синхронизирована.`);
  }
};

// Готовим каталог фит-вопросов и их критериев
export const ensureFitQuestionAssets = async (
  client: QueryableClient,
  logInfo: (message: string) => void
) => {
  for (const question of fitQuestionSeeds) {
    const questionId =
      question.id ??
      (await fetchExistingId(
        client,
        'SELECT id FROM fit_questions WHERE short_title = $1 LIMIT 1',
        [question.shortTitle]
      )) ??
      toUuid(`fit-question:${question.key}`);
    question.id = questionId;
    await client.query(
      `INSERT INTO fit_questions (id, short_title, content, version, created_at, updated_at)
       VALUES ($1, $2, $3, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         short_title = EXCLUDED.short_title,
         content = EXCLUDED.content,
         updated_at = NOW(),
         version = fit_questions.version + 1;`,
      [questionId, question.shortTitle, question.content]
    );

    const criterionIds: string[] = [];
    for (const key of question.criteria) {
      const definition = fitCriteriaCatalog[key];
      if (!definition) {
        throw new Error(`Unknown fit criterion key: ${key}`);
      }
      if (definition.question !== question.key) {
        throw new Error(`Fit criterion ${definition.slug} назначен на неверный вопрос.`);
      }
      const criterionId =
        (await fetchExistingId(
          client,
          'SELECT id FROM fit_question_criteria WHERE question_id = $1 AND title = $2 LIMIT 1',
          [questionId, definition.title]
        )) ?? definition.id;
      definition.id = criterionId;
      const [r1, r2, r3, r4, r5] = applyRatings(definition.ratings);
      criterionIds.push(criterionId);
      await client.query(
        `INSERT INTO fit_question_criteria (id, question_id, title, rating_1, rating_2, rating_3, rating_4, rating_5, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           rating_1 = EXCLUDED.rating_1,
           rating_2 = EXCLUDED.rating_2,
           rating_3 = EXCLUDED.rating_3,
           rating_4 = EXCLUDED.rating_4,
           rating_5 = EXCLUDED.rating_5;`,
        [criterionId, questionId, definition.title, r1, r2, r3, r4, r5]
      );
    }

    await client.query(
      `DELETE FROM fit_question_criteria WHERE question_id = $1 AND id <> ALL($2::uuid[]);`,
      [questionId, criterionIds]
    );

    logInfo(`Fit question "${question.shortTitle}" синхронизирован.`);
  }
};

// Восстанавливаем глобальные критерии кейсов
export const ensureCaseCriteriaCatalog = async (
  client: QueryableClient,
  logInfo: (message: string) => void
) => {
  const criterionIds: string[] = [];
  for (const definition of Object.values(caseCriteriaCatalog)) {
    const [r1, r2, r3, r4, r5] = applyRatings(definition.ratings);
    criterionIds.push(definition.id);
    await client.query(
      `INSERT INTO case_criteria (id, title, rating_1, rating_2, rating_3, rating_4, rating_5, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         rating_1 = EXCLUDED.rating_1,
         rating_2 = EXCLUDED.rating_2,
         rating_3 = EXCLUDED.rating_3,
         rating_4 = EXCLUDED.rating_4,
         rating_5 = EXCLUDED.rating_5,
         updated_at = NOW(),
         version = case_criteria.version + 1;`,
      [definition.id, definition.title, r1, r2, r3, r4, r5]
    );
  }

  await client.query(
    `DELETE FROM case_criteria WHERE id <> ALL($1::uuid[]) AND title SIMILAR TO 'Problem%|Quant%|Communication%|Insight%|Rigor%|Creativity%|Synthesis%|Client%';`,
    [criterionIds]
  );

  logInfo('Case criteria catalog синхронизирован.');
};
