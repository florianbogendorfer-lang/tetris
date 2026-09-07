/* Fuehrt src/parser.js in einem echten Browser auf einer gespeicherten
   Moodle-Seite aus und schreibt die Karten als JSON.
   Aufruf: node src/build-data.js <datei.html> [KATEGORIE] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const file = process.argv[2];
  const cat = process.argv[3] || null;
  if (!file) { console.error('Aufruf: node src/build-data.js <datei.html> [KATEGORIE]'); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Die gespeicherte Seite verweist auf den Moodle-Server; alles ausser der
  // Datei selbst wird geblockt, sonst laeuft das Laden in einen Timeout.
  await page.route('**/*', route =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await page.goto('file://' + path.resolve(file), { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(__dirname, 'parser.js') });

  const result = await page.evaluate(c => window.MoodleParser.parse(document, c), cat);
  await browser.close();

  console.error(`Datei      : ${file}`);
  console.error(`Kategorie  : ${result.category}`);
  console.error(`Fragen     : ${result.total}`);
  console.error(`Karten     : ${result.cards.length}`);
  console.error(`Fehlschlag : ${result.failed.length}`);
  result.failed.forEach(f => console.error(`  ! Nr ${f.nr} [${f.type}] ${f.text}`));
  process.stdout.write(JSON.stringify(result, null, 1));
})();
