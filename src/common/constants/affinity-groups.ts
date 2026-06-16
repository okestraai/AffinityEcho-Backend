// Canonical source of truth for affinity groups.
//
// `id` and `label` are kept identical (human-readable display strings) so we
// stay backward-compatible with the values already stored in users' encrypted
// `affinity_tags_encrypted` column — no data migration is required.
//
// `AFFINITY_GROUPS` is the GOING-FORWARD list the client should send/render:
// "Black Women in Tech" is retired (not exposed) and "Allies & Advocates" is
// new. The client should only ever send values from this list.
//
// Validation (`isValidAffinityTag`) is deliberately MORE permissive than this
// list: live data contains a mix of display strings AND legacy kebab-case ids,
// plus ~22 users still on "Black Women in Tech". We accept those legacy values
// so existing users don't lose their selection when they re-save, even though
// the frontend no longer offers them. See LEGACY_AFFINITY_TAGS below.

export interface AffinityGroup {
  id: string;
  label: string;
  icon: string;
}

export const AFFINITY_GROUPS: AffinityGroup[] = [
  { id: 'Black Professionals', label: 'Black Professionals', icon: '✊🏾' },
  { id: 'Latino Leaders', label: 'Latino Leaders', icon: '🌎' },
  { id: 'Women in Leadership', label: 'Women in Leadership', icon: '👩🏽‍💼' },
  { id: 'LGBTQ+ in Finance', label: 'LGBTQ+ in Finance', icon: '🏳️‍🌈' },
  { id: 'Asian Entrepreneurs', label: 'Asian Entrepreneurs', icon: '🌏' },
  {
    id: 'First-Gen College Grads',
    label: 'First-Gen College Grads',
    icon: '🎓',
  },
  { id: 'Working Parents', label: 'Working Parents', icon: '👨‍👩‍👧' },
  { id: 'Military Veterans', label: 'Military Veterans', icon: '🎖️' },
  { id: 'Disabled Professionals', label: 'Disabled Professionals', icon: '♿' },
  {
    id: 'Immigrant Professionals',
    label: 'Immigrant Professionals',
    icon: '🛫',
  },
  { id: 'Allies & Advocates', label: 'Allies & Advocates', icon: '🤝' },
];

export const AFFINITY_GROUP_IDS: string[] = AFFINITY_GROUPS.map((g) => g.id);

export const AFFINITY_GROUP_LABELS: string[] = AFFINITY_GROUPS.map(
  (g) => g.label,
);

// Legacy values present in stored data that the frontend no longer sends but we
// still accept on write so existing users keep their selection. This includes
// the retired "Black Women in Tech" group and the kebab-case ids observed in
// the `affinity_tags_encrypted` column.
export const LEGACY_AFFINITY_TAGS: string[] = [
  'Black Women in Tech',
  'black-women-tech',
  'black-professionals',
  'latino-leaders',
  'women-leadership',
  'lgbtq-finance',
  'asian-entrepreneurs',
  'first-gen-college',
  'working-parents',
  'military-veterans',
  'disabled-professionals',
  'immigrant-professionals',
];

// The full set accepted by validation = canonical (going-forward) + legacy.
const ACCEPTED_AFFINITY_TAG_SET = new Set([
  ...AFFINITY_GROUP_IDS,
  ...LEGACY_AFFINITY_TAGS,
]);

export function isValidAffinityTag(id: string): boolean {
  return ACCEPTED_AFFINITY_TAG_SET.has(id);
}
