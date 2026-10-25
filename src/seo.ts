import type { Lang, Localized, LocalizedList } from './types.ts';
import { LANGS, SITE_URL, pathFor } from './routes.ts';

/** What the SEO needs from an activity: all of it comes from its YAML file. */
export type SeoActivity = {
  id: string;
  category: string;
  duration_minutes: number;
  title: Localized;
  description: Localized;
  concepts: LocalizedList;
  /** Optional share image for this challenge (a path under public/, e.g. /og/my-game.png); defaults to the site image. */
  share_image?: string;
};

export type PageMeta = {
  lang: Lang;
  /** Canonical path of the page, or null for pages that must not be indexed. */
  canonical: string | null;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  type: 'website' | 'article';
  /** hreflang alternates: language → path, plus x-default. */
  alternates: { hreflang: string; path: string }[];
  jsonLd: object[];
  noindex?: boolean;
};

const BRAND = 'EduArchi';
const LOCALE: Record<Lang, string> = { fr: 'fr_CA', en: 'en_CA' };

const text = {
  fr: {
    homeTitle: 'EduArchi — Découvre l’architecture en jouant',
    homeDescription: 'Découvre le métier d’architecte avec EduArchi, une plateforme gratuite de mini-jeux interactifs pour explorer les plans, les espaces, les structures et la conception des bâtiments.',
    imageAlt: 'EduArchi — Découvre l’architecture en jouant : mini-jeux interactifs gratuits',
    activity: (d: number, cat: string, concepts: string[]) => `Mini-jeu gratuit de ${d} min · ${cat} · Notions : ${concepts.join(', ')}.`,
    level: 'Secondaire', type: 'Jeu interactif',
    notFound: 'Page introuvable — EduArchi', notFoundDescription: 'Cette page n’existe pas. Retrouve tous les mini-jeux d’architecture d’EduArchi sur la page d’accueil.',
  },
  en: {
    homeTitle: 'EduArchi — Discover architecture through play',
    homeDescription: 'Discover what architects do with EduArchi, a free platform of interactive mini-games to explore plans, spaces, structures and building design.',
    imageAlt: 'EduArchi — Discover architecture through play: free interactive mini-games',
    activity: (d: number, cat: string, concepts: string[]) => `Free ${d}-minute mini-game · ${cat} · Concepts: ${concepts.join(', ')}.`,
    level: 'Secondary school', type: 'Interactive game',
    notFound: 'Page not found — EduArchi', notFoundDescription: 'This page doesn’t exist. Find all of EduArchi’s architecture mini-games on the home page.',
  },
};

export const siteImage = (lang: Lang) => `/og/eduarchi-${lang}.png`;
export const absolute = (path: string) => `${SITE_URL}${path}`;

function alternatesFor(game: string | null) {
  return [
    ...LANGS.map(l => ({ hreflang: l, path: pathFor(l, game) })),
    // the root serves the French home page; French is also the default for activities
    { hreflang: 'x-default', path: game ? pathFor('fr', game) : '/' },
  ];
}

export function homeMeta(lang: Lang): PageMeta {
  const t = text[lang];
  return {
    lang,
    canonical: pathFor(lang),
    title: t.homeTitle,
    description: t.homeDescription,
    image: siteImage(lang),
    imageAlt: t.imageAlt,
    type: 'website',
    alternates: alternatesFor(null),
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND,
      url: absolute(pathFor(lang)),
      inLanguage: lang,
      description: t.homeDescription,
    }],
  };
}

export function activityMeta(lang: Lang, a: SeoActivity, categoryLabel: (id: string, lang: Lang) => string): PageMeta {
  const t = text[lang];
  const category = categoryLabel(a.category, lang);
  const description = `${a.description[lang]} ${t.activity(a.duration_minutes, category, a.concepts[lang])}`;
  const image = a.share_image ?? siteImage(lang);
  return {
    lang,
    canonical: pathFor(lang, a.id),
    title: `${a.title[lang]} — ${BRAND}`,
    description,
    image,
    imageAlt: a.share_image ? a.title[lang] : t.imageAlt,
    type: 'article',
    alternates: alternatesFor(a.id),
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: a.title[lang],
      description: a.description[lang],
      url: absolute(pathFor(lang, a.id)),
      inLanguage: lang,
      isAccessibleForFree: true,
      educationalLevel: t.level,
      learningResourceType: t.type,
      timeRequired: `PT${a.duration_minutes}M`,
      teaches: a.concepts[lang],
      keywords: [category, ...a.concepts[lang]].join(', '),
      image: absolute(image),
      isPartOf: { '@type': 'WebSite', name: BRAND, url: absolute(pathFor(lang)) },
    }],
  };
}

export function notFoundMeta(lang: Lang): PageMeta {
  const t = text[lang];
  return { lang, canonical: null, title: t.notFound, description: t.notFoundDescription, image: siteImage(lang), imageAlt: t.imageAlt, type: 'website', alternates: [], jsonLd: [], noindex: true };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for a <script> element: "<" is escaped so the content can never close the element. */
const jsonForScript = (o: object) => JSON.stringify(o).replace(/</g, '\\u003c');

/** Everything that goes in <head> for a page, as static HTML. */
export function headTags(m: PageMeta): string {
  const other: Lang = m.lang === 'fr' ? 'en' : 'fr';
  const url = m.canonical ? absolute(m.canonical) : null;
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}"/>`,
    m.noindex ? '<meta name="robots" content="noindex"/>' : '',
    url ? `<link rel="canonical" href="${url}"/>` : '',
    ...m.alternates.map(a => `<link rel="alternate" hreflang="${a.hreflang}" href="${absolute(a.path)}"/>`),
    `<meta property="og:site_name" content="${BRAND}"/>`,
    `<meta property="og:title" content="${esc(m.title)}"/>`,
    `<meta property="og:description" content="${esc(m.description)}"/>`,
    `<meta property="og:type" content="${m.type}"/>`,
    url ? `<meta property="og:url" content="${url}"/>` : '',
    `<meta property="og:image" content="${absolute(m.image)}"/>`,
    `<meta property="og:image:width" content="1200"/>`,
    `<meta property="og:image:height" content="630"/>`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}"/>`,
    `<meta property="og:locale" content="${LOCALE[m.lang]}"/>`,
    `<meta property="og:locale:alternate" content="${LOCALE[other]}"/>`,
    '<meta name="twitter:card" content="summary_large_image"/>',
    `<meta name="twitter:title" content="${esc(m.title)}"/>`,
    `<meta name="twitter:description" content="${esc(m.description)}"/>`,
    `<meta name="twitter:image" content="${absolute(m.image)}"/>`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}"/>`,
    ...m.jsonLd.map(j => `<script type="application/ld+json">${jsonForScript(j)}</script>`),
  ];
  return tags.filter(Boolean).join('');
}

/** sitemap.xml listing every canonical page with its language alternates; no lastmod, as no reliable date is known. */
export function sitemap(pages: PageMeta[]): string {
  const urls = pages.filter(p => p.canonical && !p.noindex).map(p => [
    '<url>',
    `<loc>${absolute(p.canonical!)}</loc>`,
    ...p.alternates.map(a => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${absolute(a.path)}"/>`),
    '</url>',
  ].join(''));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}
