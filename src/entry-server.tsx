import { renderToString } from 'react-dom/server';
import { App, gameIds, games, categoryLabel } from './App.tsx';
import type { Route } from './routes.ts';

/** Build-time rendering of one page (no server at run time: see scripts/prerender.mjs). */
export function render(route: Route): string {
  return renderToString(<App initialRoute={route} />);
}

export { gameIds, games, categoryLabel };
export { activityMeta, headTags, homeMeta, notFoundMeta, sitemap } from './seo.ts';
export { LANGS, pathFor, routeKey } from './routes.ts';
