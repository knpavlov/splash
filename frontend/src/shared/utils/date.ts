// Вспомогательная функция для преобразования дат к формату ДД/ММ/ГГГГ (en-AU).
export const formatDate = (
  value: string | number | Date | null | undefined,
  emptyPlaceholder = '—'
): string => {
  if (value == null) {
    return emptyPlaceholder;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return emptyPlaceholder;
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};
