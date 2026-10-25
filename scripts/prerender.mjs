// Static pages for GitHub Pages: one HTML file per route, rendered at build time with React,
// with its own <head> (title, description, canonical, hreflang, Open Graph, JSON-LD), plus sitemap.xml.
// No server runs at run time: the browser hydrates these pages.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
const ssr = await import(new URL('../dist-ssr/entry-server.js', import.meta.url).href);
const { render, games, categoryLabel, LANGS, pathFor, routeKey, homeMeta, activityMeta, notFoundMeta, headTags, sitemap } = ssr;

const template = await readFile(new URL('index.html', dist), 'utf8');
if (!template.includes('<div id="root"></div>')) throw new Error('dist/index.html: <div id="root"></div> not found');

function page(route, meta) {
  const html = template
    .replace(/<html lang="[a-z]+">/, `<html lang="${meta.lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `${headTags(meta)}</head>`)
    .replace('<div id="root"></div>', `<div id="root" data-route="${routeKey(route)}">${render(route)}</div>`);
  return html;
}

async function write(path, content) {
  const file = new URL(path.replace(/^\//, ''), dist);
  await mkdir(dirname(file.pathname), { recursive: true });
  await writeFile(file, content);
}

const pages = [];
for (const lang of LANGS) {
  const home = homeMeta(lang);
  pages.push(home);
  await write(`${pathFor(lang)}index.html`, page({ lang, game: null, notFound: false }, home));
  for (const g of games) {
    const meta = activityMeta(lang, g, categoryLabel);
    pages.push(meta);
    await write(`${pathFor(lang, g.id)}index.html`, page({ lang, game: g.id, notFound: false }, meta));
  }
}
// The root serves the French home page; its canonical is /fr/ so the two are not seen as duplicates.
await write('/index.html', page({ lang: 'fr', game: null, notFound: false }, homeMeta('fr')));
// GitHub Pages serves 404.html for unknown addresses.
await write('/404.html', page({ lang: 'fr', game: null, notFound: true }, notFoundMeta('fr')));
await write('/sitemap.xml', sitemap(pages));
await rm(new URL('../dist-ssr/', import.meta.url), { recursive: true, force: true });
console.log(`Prerendered ${pages.length + 2} pages and sitemap.xml (${pages.length} URLs)`);
