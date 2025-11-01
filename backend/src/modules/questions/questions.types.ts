export interface FitQuestionCriterionRecord {
  id: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

export interface FitQuestionRecord {
  id: string;
  shortTitle: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  criteria: FitQuestionCriterionRecord[];
}

export interface FitQuestionCriterionWriteModel {
  id: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

export interface FitQuestionWriteModel {
  id: string;
  shortTitle: string;
  content: string;
  criteria: FitQuestionCriterionWriteModel[];
}
