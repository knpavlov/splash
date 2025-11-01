// Типы данных для управления фит-вопросами
export interface FitQuestionCriterion {
  id: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

export interface FitQuestion {
  id: string;
  shortTitle: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  criteria: FitQuestionCriterion[];
}
