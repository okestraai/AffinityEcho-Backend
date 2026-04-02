/**
 * Map of supported company names to their known email domains.
 * Only companies in this map are eligible for verification.
 * "Others" company is excluded.
 */
export const COMPANY_DOMAINS: Record<string, string[]> = {
  'Abbott': ['abbott.com'],
  'Amazon': ['amazon.com', 'amazon.co.uk', 'aboutamazon.com'],
  'Apple': ['apple.com'],
  'Bank of America': ['bankofamerica.com', 'bofa.com', 'bofasecurities.com'],
  'Boston Consulting Group': ['bcg.com'],
  'Bristol Myers Squibb': ['bms.com', 'bristolmyers.com'],
  'Deloitte': ['deloitte.com', 'deloitte.co.uk'],
  'Goldman Sachs': ['goldmansachs.com', 'gs.com'],
  'Google': ['google.com', 'alphabet.com', 'youtube.com'],
  'Johnson & Johnson': ['jnj.com', 'its.jnj.com'],
  'JPMorgan Chase': ['jpmorgan.com', 'jpmchase.com', 'chase.com'],
  'McKinsey & Company': ['mckinsey.com'],
  'Merck': ['merck.com', 'msd.com'],
  'Meta': ['meta.com', 'facebook.com', 'instagram.com', 'whatsapp.com', 'oculus.com'],
  'Microsoft': ['microsoft.com', 'linkedin.com', 'github.com'],
  'Netflix': ['netflix.com'],
  'Pfizer': ['pfizer.com'],
  'PwC': ['pwc.com', 'pwcglobal.com'],
  'Tesla': ['tesla.com', 'teslamotors.com'],
  'Wells Fargo': ['wellsfargo.com', 'wf.com'],
};

export function getCompanyDomains(companyName: string): string[] | null {
  const entry = Object.entries(COMPANY_DOMAINS).find(
    ([name]) => name.toLowerCase() === companyName.toLowerCase(),
  );
  return entry ? entry[1] : null;
}

export function isCompanyEligible(companyName: string): boolean {
  return getCompanyDomains(companyName) !== null;
}

export function isEmailDomainValid(email: string, companyName: string): boolean {
  const domains = getCompanyDomains(companyName);
  if (!domains) return false;
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain) return false;
  return domains.some(d => d.toLowerCase() === emailDomain);
}
