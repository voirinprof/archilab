import type { Lang } from './types.ts';

export const SITE_URL = 'https://eduarchi.xyz';
export const LANGS: Lang[] = ['fr', 'en'];

/** home, an activity page, or an unknown address (404). */
export type Route = { lang: Lang; game: string | null; notFound: boolean };

/** Reads a URL path: /, /fr/, /en/, /fr/activities/<id>/, /en/activities/<id>/. Anything else is a 404. */
export function parseRoute(pathname: string, knownGames: string[]): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { lang: 'fr', game: null, notFound: false };
  const lang = parts[0] === 'en' ? 'en' : 'fr';
  if (parts[0] !== 'fr' && parts[0] !== 'en') return { lang: 'fr', game: null, notFound: true };
  if (parts.length === 1) return { lang, game: null, notFound: false };
  if (parts.length === 3 && parts[1] === 'activities' && knownGames.includes(parts[2])) return { lang, game: parts[2], notFound: false };
  return { lang, game: null, notFound: true };
}

/** Path of a page, always with a trailing slash. */
export function pathFor(lang: Lang, game: string | null = null): string {
  return game ? `/${lang}/activities/${game}/` : `/${lang}/`;
}

export const routeKey = (r: Route) => (r.notFound ? `404:${r.lang}` : `${r.lang}:${r.game ?? ''}`);
