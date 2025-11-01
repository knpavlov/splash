// Simple helper to generate a slug based on a folder name
export const slugify = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\d\s-]/gu, '')
    .replace(/\s+/g, '-');
};
