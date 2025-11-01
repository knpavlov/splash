export const composeFullName = (
  firstName?: string | null,
  lastName?: string | null
): string => {
  const parts = [firstName?.trim() ?? '', lastName?.trim() ?? ''].filter((value) => value.length > 0);
  return parts.join(' ');
};

export const buildLastNameSortKey = (
  firstName?: string | null,
  lastName?: string | null
): string => {
  const parts = [lastName?.trim() ?? '', firstName?.trim() ?? ''].filter((value) => value.length > 0);
  return parts.join(' ');
};
