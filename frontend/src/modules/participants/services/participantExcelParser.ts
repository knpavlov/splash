import * as XLSX from 'xlsx';

export interface ParticipantExcelRow {
  displayName: string;
  email: string | null;
  role: string | null;
  hierarchyLevel1: string | null;
  hierarchyLevel2: string | null;
  hierarchyLevel3: string | null;
}

export interface ParticipantExcelParseResult {
  rows: ParticipantExcelRow[];
  skippedRows: number;
}

const HEADER_MATCHERS = [
  ['name', 'full name', 'display name'],
  ['email', 'mail'],
  ['role', 'position'],
  ['hierarchy level 1', 'level 1', 'unit'],
  ['hierarchy level 2', 'level 2', 'subunit'],
  ['hierarchy level 3', 'level 3', 'team']
];

const normalizeCell = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
};

const matchesHeaderRow = (row: unknown[]): boolean => {
  if (!row.length) {
    return false;
  }
  return HEADER_MATCHERS.every((aliases, index) => {
    const raw = normalizeCell(row[index] ?? '');
    if (!raw) {
      return false;
    }
    const candidate = raw.toLowerCase();
    return aliases.some((alias) => candidate === alias);
  });
};

const toNullable = (value: string): string | null => (value ? value : null);

export const parseParticipantExcelFile = async (
  file: File
): Promise<ParticipantExcelParseResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('no-sheet');
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false
  });

  if (!rows.length) {
    return { rows: [], skippedRows: 0 };
  }

  const parsedRows: ParticipantExcelRow[] = [];
  let skippedRows = 0;

  rows.forEach((row, index) => {
    if (index === 0 && matchesHeaderRow(row)) {
      return;
    }

    const displayName = normalizeCell(row[0]);
    const email = normalizeCell(row[1]);
    const role = normalizeCell(row[2]);
    const level1 = normalizeCell(row[3]);
    const level2 = normalizeCell(row[4]);
    const level3 = normalizeCell(row[5]);
    const allEmpty =
      !displayName && !email && !role && !level1 && !level2 && !level3;
    if (!displayName) {
      if (!allEmpty) {
        skippedRows += 1;
      }
      return;
    }
    parsedRows.push({
      displayName,
      email: toNullable(email),
      role: toNullable(role),
      hierarchyLevel1: toNullable(level1),
      hierarchyLevel2: toNullable(level2),
      hierarchyLevel3: toNullable(level3)
    });
  });

  return { rows: parsedRows, skippedRows };
};

