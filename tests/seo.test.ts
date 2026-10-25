import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoute, pathFor, routeKey } from '../src/routes.ts';
import { activityMeta, headTags, homeMeta, notFoundMeta, sitemap } from '../src/seo.ts';
import type { SeoActivity } from '../src/seo.ts';

const games = JSON.parse(readFileSync(new URL('../src/generated/activities.json', import.meta.url), 'utf8')) as SeoActivity[];
const ids = games.map(g => g.id);
const label = (id: string) => `cat:${id}`;

test('routes: root and /fr/ are the French home, /en/ the English one, activities have their own path', () => {
  assert.deepEqual(parseRoute('/', ids), { lang: 'fr', game: null, notFound: false });
  assert.deepEqual(parseRoute('/fr/', ids), { lang: 'fr', game: null, notFound: false });
  assert.deepEqual(parseRoute('/en', ids), { lang: 'en', game: null, notFound: false });
  assert.deepEqual(parseRoute('/en/activities/mission-25m2/', ids), { lang: 'en', game: 'mission-25m2', notFound: false });
  assert.equal(parseRoute('/fr/activities/does-not-exist/', ids).notFound, true);
  assert.equal(parseRoute('/de/', ids).notFound, true);
  assert.equal(pathFor('fr', 'mission-25m2'), '/fr/activities/mission-25m2/');
  assert.equal(routeKey(parseRoute('/', ids)), routeKey(parseRoute('/fr/', ids)), 'the root reuses the /fr/ prerendering');
});

test('home page: requested title and description, canonical per language, x-default at the root', () => {
  const fr = homeMeta('fr');
  assert.equal(fr.title, 'EduArchi — Découvre l’architecture en jouant');
  assert.equal(fr.description, 'Découvre le métier d’architecte avec EduArchi, une plateforme gratuite de mini-jeux interactifs pour explorer les plans, les espaces, les structures et la conception des bâtiments.');
  assert.equal(fr.canonical, '/fr/');
  assert.deepEqual(fr.alternates, [{ hreflang: 'fr', path: '/fr/' }, { hreflang: 'en', path: '/en/' }, { hreflang: 'x-default', path: '/' }]);
  assert.equal(homeMeta('en').canonical, '/en/');
});

test('activity pages: metadata comes from the YAML, structured data only uses known facts', () => {
  const g = games.find(a => a.id === 'chasse-au-soleil')!;
  const m = activityMeta('fr', g, label);
  assert.equal(m.title, 'Chasse au soleil — EduArchi');
  assert.ok(m.description.startsWith(g.description.fr));
  assert.ok(m.description.includes(`${g.duration_minutes} min`) && m.description.includes('cat:light'));
  const ld = m.jsonLd[0] as Record<string, unknown>;
  assert.equal(ld['@type'], 'LearningResource');
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.timeRequired, `PT${g.duration_minutes}M`);
  assert.deepEqual(ld.teaches, g.concepts.fr);
  for (const invented of ['author', 'publisher', 'aggregateRating', 'review', 'provider']) assert.equal(ld[invented], undefined, invented);
  assert.equal(activityMeta('fr', { ...g, share_image: '/og/sun.png' }, label).image, '/og/sun.png');
});

test('head tags are escaped and JSON-LD cannot break out of its script', () => {
  const g = { ...games[0], title: { fr: 'A "quoted" <b>title</b>', en: 'x' } };
  const html = headTags(activityMeta('fr', g, label));
  assert.ok(html.includes('A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt;'));
  assert.ok(!html.includes('<b>title</b>'));
  assert.ok(html.includes('\\u003cb>'));
});

test('404 is not indexed and the sitemap only lists canonical pages, without invented dates', () => {
  assert.ok(headTags(notFoundMeta('fr')).includes('noindex'));
  const xml = sitemap([homeMeta('fr'), homeMeta('en'), notFoundMeta('fr'), ...games.map(g => activityMeta('en', g, label))]);
  assert.equal((xml.match(/<loc>/g) ?? []).length, 2 + games.length);
  assert.ok(!xml.includes('lastmod'));
  assert.ok(xml.includes('hreflang="x-default" href="https://eduarchi.xyz/"'));
});
