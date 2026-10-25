import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './style.css';
import { App, gameIds } from './App.tsx';
import { parseRoute, pathFor, routeKey } from './routes.ts';

// Old links used ?game=<id>: send them to the activity's permanent address.
const legacy = new URLSearchParams(location.search).get('game');
if (legacy && gameIds.includes(legacy)) {
  location.replace(pathFor(location.pathname.startsWith('/en') ? 'en' : 'fr', legacy));
} else {
  const container = document.getElementById('root')!;
  const route = parseRoute(location.pathname, gameIds);
  const app = <React.StrictMode><App initialRoute={route} /></React.StrictMode>;
  // Pages are prerendered at build time: reuse that HTML when it was made for this very route.
  if (container.dataset.route === routeKey(route)) hydrateRoot(container, app);
  else createRoot(container).render(app);
}
