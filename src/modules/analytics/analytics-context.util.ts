// Request-context parsing for analytics ingest: user-agent → device/OS/browser,
// IP → coarse geo, IP → salted hash (raw IP is never stored), and referrer URL →
// a normalised acquisition source. Everything here is best-effort and must never
// throw — a parsing failure degrades to nulls, it never breaks ingest.
import * as crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import * as geoip from 'geoip-lite';

// Fail-closed: with no configured salt we do NOT hash the IP at all (storing
// sha256 with a known/default salt over the ~4B IPv4 space is trivially
// reversible). Set ANALYTICS_IP_SALT in the environment to enable IP hashing.
const IP_SALT = process.env.ANALYTICS_IP_SALT || '';

const BOT_RE =
  /bot|crawler|spider|crawling|slurp|mediapartners|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|preview|scrapy|python-requests|axios|curl|wget|headless|lighthouse|pingdom|uptime/i;

export function clientIp(req: any): string | undefined {
  const fwd = req?.headers?.['x-forwarded-for'];
  const first = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined;
  return first || req?.socket?.remoteAddress || undefined;
}

export function hashIp(ip?: string): string | null {
  if (!ip || !IP_SALT) return null;
  try {
    return crypto
      .createHash('sha256')
      .update(IP_SALT + ip)
      .digest('hex');
  } catch {
    return null;
  }
}

export function lookupGeo(ip?: string): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const empty = { country: null, region: null, city: null };
  if (!ip) return empty;
  try {
    // geoip-lite only handles public IPv4/IPv6; private/loopback return null.
    const g = geoip.lookup(ip);
    if (!g) return empty;
    return {
      country: g.country || null,
      region: Array.isArray(g.region) ? g.region[0] || null : g.region || null,
      city: g.city || null,
    };
  } catch {
    return empty;
  }
}

export function parseUserAgent(ua?: string): {
  device_type: string | null;
  os: string | null;
  os_version: string | null;
  browser: string | null;
  device_model: string | null;
  is_bot: boolean;
} {
  const fallback = {
    device_type: null,
    os: null,
    os_version: null,
    browser: null,
    device_model: null,
    is_bot: false,
  };
  if (!ua) return fallback;
  try {
    const is_bot = BOT_RE.test(ua);
    const r = UAParser(ua);
    return {
      // UAParser leaves device.type undefined for desktops.
      device_type: r.device?.type || 'desktop',
      os: r.os?.name || null,
      os_version: r.os?.version || null,
      browser: r.browser?.name || null,
      device_model: r.device?.model || null,
      is_bot,
    };
  } catch {
    return { ...fallback, is_bot: BOT_RE.test(ua) };
  }
}

// Map a referrer URL to a coarse acquisition source. Empty referrer = "direct".
const SOURCE_MAP: Array<[RegExp, string]> = [
  [/(^|\.)google\./i, 'google'],
  [/(^|\.)bing\./i, 'bing'],
  [/(^|\.)duckduckgo\./i, 'duckduckgo'],
  [/(^|\.)yahoo\./i, 'yahoo'],
  [/(^|\.)(twitter|x)\.com|t\.co/i, 'twitter'],
  [/(^|\.)facebook\.|fb\.me/i, 'facebook'],
  [/(^|\.)instagram\./i, 'instagram'],
  [/(^|\.)linkedin\.|lnkd\.in/i, 'linkedin'],
  [/(^|\.)youtube\.|youtu\.be/i, 'youtube'],
  [/(^|\.)reddit\.|redd\.it/i, 'reddit'],
  [/(^|\.)tiktok\./i, 'tiktok'],
  [/(^|\.)whatsapp\.|wa\.me/i, 'whatsapp'],
  [/(^|\.)telegram\.|t\.me/i, 'telegram'],
];

export function referrerSource(
  referrer?: string,
  selfHosts: string[] = [],
): { referrer_source: string; referrer_url: string | null } {
  if (!referrer || !referrer.trim()) {
    return { referrer_source: 'direct', referrer_url: null };
  }
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();
    if (selfHosts.some((h) => host === h || host.endsWith('.' + h))) {
      return {
        referrer_source: 'internal',
        referrer_url: referrer.slice(0, 512),
      };
    }
    for (const [re, name] of SOURCE_MAP) {
      if (re.test(host))
        return { referrer_source: name, referrer_url: referrer.slice(0, 512) };
    }
    // Unknown external site — use its bare host as the source.
    return {
      referrer_source: host.replace(/^www\./, ''),
      referrer_url: referrer.slice(0, 512),
    };
  } catch {
    return { referrer_source: 'other', referrer_url: referrer.slice(0, 512) };
  }
}
