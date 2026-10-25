// Renders the share images public/og/eduarchi-{fr,en}.png (1200 × 630) from og.html.
// Not part of the build: run it by hand after changing the design, with a Chromium available, e.g.
//   npm i --no-save playwright-core && CHROME=/path/to/chrome node scripts/og/render.mjs
// The PNG files are versioned, so the site never needs a browser to build.
import { chromium } from 'playwright-core';

const here = new URL('./', import.meta.url);
const out = new URL('../../public/og/', import.meta.url);
const text = {
  fr: { title: 'Découvre l’architecture en jouant', sub: 'Des mini-jeux interactifs et gratuits pour penser comme un architecte.', chips: ['Plans', 'Espaces', 'Lumière', 'Volumes'] },
  en: { title: 'Discover architecture through play', sub: 'Free interactive mini-games to think like an architect.', chips: ['Plans', 'Spaces', 'Light', 'Volumes'] },
};
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [lang, t] of Object.entries(text)) {
  await page.goto(new URL('og.html', here).href);
  await page.evaluate(t => {
    document.getElementById('title').textContent = t.title;
    document.getElementById('sub').textContent = t.sub;
    document.getElementById('chips').innerHTML = t.chips.map(c => `<span>${c}</span>`).join('');
  }, t);
  await page.screenshot({ path: new URL(`eduarchi-${lang}.png`, out).pathname, type: 'png' });
}
await browser.close();
