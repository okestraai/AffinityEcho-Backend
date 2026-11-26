// Ethnicity choices offered worldwide. Earlier US-style answers stay valid because members re-save them.
export const ETHNICITY_OPTIONS = [
  'Black / African',
  'African American',
  'Caribbean',
  'East Asian',
  'South Asian',
  'Southeast Asian',
  'Hispanic / Latino',
  'Indigenous',
  'Middle Eastern / North African',
  'Pacific Islander',
  'White',
  'Mixed',
  'Prefer not to say',
] as const;

// Several ethnicities are stored in one encrypted field, joined with this.
export const ETHNICITY_SEPARATOR = ', ';

export const MAX_ETHNICITIES = 5;

// Reads the stored value back as a list; an older single answer becomes a list of one.
export function splitEthnicities(stored: string | null): string[] {
  if (!stored) return [];
  return stored
    .split(ETHNICITY_SEPARATOR)
    .map((e) => e.trim())
    .filter(Boolean);
}

// Names that belong to built-in forum spaces, so no company or school may use them.
export const RESERVED_SPACE_NAMES = ['students', 'others', 'other companies'];

export function isReservedSpaceName(name: string): boolean {
  return RESERVED_SPACE_NAMES.includes(name.trim().toLowerCase());
}

// Capitalises the first letter of each word and leaves the rest as typed, so "MIT" stays "MIT".
export function titleCaseWords(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(
      /(^|\s)(\S)/g,
      (_m, space: string, first: string) => space + first.toUpperCase(),
    );
}
