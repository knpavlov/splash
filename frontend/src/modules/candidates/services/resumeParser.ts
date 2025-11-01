import { CandidateProfile } from '../../../shared/types/candidate';

const extractValue = (text: string, patterns: RegExp[]): string | undefined => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
};

export const parseResumeText = (text: string): Partial<CandidateProfile> => {
  const safeText = text.replace(/\r/g, '');
  const firstLine = safeText.split('\n').find((line) => line.trim().length > 0) ?? '';
  const [maybeFirstName, maybeLastName] = firstLine.split(/\s+/);

  const firstName =
    extractValue(
      safeText,
      [/\u0418\u043c\u044f[:\-]\s*(.+)/i, /First Name[:\-]\s*(.+)/i]
    ) || maybeFirstName;
  const lastName =
    extractValue(
      safeText,
      [/\u0424\u0430\u043c\u0438\u043b\u0438\u044f[:\-]\s*(.+)/i, /Last Name[:\-]\s*(.+)/i]
    ) || maybeLastName;
  const city = extractValue(safeText, [/\u0413\u043e\u0440\u043e\u0434[:\-]\s*(.+)/i, /City[:\-]\s*(.+)/i]);
  const desiredPosition = extractValue(
    safeText,
    [/\u0416\u0435\u043b\u0430\u0435\u043c\u0430\u044f \u0434\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c[:\-]\s*(.+)/i, /Position[:\-]\s*(.+)/i]
  );
  const phone = extractValue(safeText, [/\u0422\u0435\u043b\u0435\u0444\u043e\u043d[:\-]\s*(.+)/i, /(\+\d[\d\s\-()]{6,})/]);
  const email = extractValue(safeText, [/Email[:\-]\s*(.+)/i, /E-mail[:\-]\s*(.+)/i, /([\w.-]+@[\w.-]+)/]);
  const lastCompany = extractValue(
    safeText,
    [/\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f[:\-]\s*(.+)/i, /Last Company[:\-]\s*(.+)/i]
  );
  const lastPosition = extractValue(
    safeText,
    [/\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c[:\-]\s*(.+)/i, /Position[:\-]\s*(.+)/i]
  );
  const experienceSummary = extractValue(safeText, [/Summary[:\-]\s*([\s\S]+?)\n\n/i]);

  const totalExpMatch = safeText.match(/(\d{1,2})\s*(?:\u043b\u0435\u0442|years)\s*(?:\u043e\u043f\u044b\u0442\u0430|experience)/i);
  const consultingExpMatch = safeText.match(/(\d{1,2})\s*(?:\u043b\u0435\u0442|years).*\u043a\u043e\u043d\u0441\u0430\u043b\u0442/i);

  return {
    firstName: firstName || '',
    lastName: lastName || '',
    city,
    desiredPosition,
    phone,
    email,
    lastCompany,
    lastPosition,
    experienceSummary,
    totalExperienceYears: totalExpMatch ? Number(totalExpMatch[1]) : undefined,
    consultingExperienceYears: consultingExpMatch ? Number(consultingExpMatch[1]) : undefined
  };
};
