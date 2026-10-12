/* Prüft das Einfügen aus der Zwischenablage beim Klick in die Suchleiste.
   Aufruf: node test/ablage.test.js */
const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

const feld = p => p.inputValue('#q');
const treffer = p => p.locator('#results .hit').count();
const kopiere = (p, t) => p.evaluate(t => navigator.clipboard.writeText(t), t);

async function klick(p) {                    // Klick in die Mitte des Feldes
  await p.click('#q');
  await p.waitForTimeout(150);
}

(async () => {
  const b = await chromium.launch();

  /* ---------------- mit Freigabe ---------------- */
  const ctx = await b.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', e => { console.log('  JS-FEHLER:', String(e)); fails++; });
  await p.goto(APP);

  console.log('== Klick fügt ein ==');
  await kopiere(p, 'Wochengeld');
  await p.click('#btn-search');
  ok(await feld(p) === '', 'Feld ist zu Beginn leer');
  await klick(p);
  ok(await feld(p) === 'Wochengeld', 'nach dem Klick steht der Text im Feld: "' + await feld(p) + '"');
  const n = await treffer(p);
  ok(n > 0, 'und die Suche ist gelaufen (' + n + ' Treffer)');

  console.log('\n== derselbe Inhalt kommt kein zweites Mal ==');
  await p.fill('#q', 'Wochengeld und mehr');
  await klick(p);
  ok(await feld(p) === 'Wochengeld und mehr', 'eigene Ergänzung überlebt den nächsten Klick');

  console.log('\n== neu Kopiertes fügt wieder ein ==');
  await kopiere(p, 'Krankengeld');
  await klick(p);
  ok(await feld(p) === 'Krankengeld', 'neuer Inhalt ersetzt den alten: "' + await feld(p) + '"');

  console.log('\n== Rückgängig ==');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(80);
  ok(await feld(p) === 'Wochengeld und mehr',
     'Strg+Z stellt den Stand von vorher her: "' + await feld(p) + '"');

  console.log('\n== mehrzeiliger Inhalt ==');
  await kopiere(p, '  Anspruch auf\n\n  Rehabilitationsgeld  \n');
  await klick(p);
  ok(await feld(p) === 'Anspruch auf Rehabilitationsgeld',
     'wird auf eine Zeile gezogen: "' + await feld(p) + '"');

  console.log('\n== Tabulator löst nichts aus ==');
  await p.fill('#q', '');
  await kopiere(p, 'Pflegegeld');
  await p.evaluate(() => document.getElementById('q').blur());
  await p.focus('#q');                       // Fokus ohne Klick
  await p.waitForTimeout(150);
  ok(await feld(p) === '', 'bloßer Fokus fügt nicht ein');

  /* Das × der Suchleiste räumt das Feld erst, nachdem der Klick durch ist —
     das Einfügen darf es danach nicht sofort wieder befüllen. Trifft der Klick
     das × nicht, ist er ein gewöhnlicher Klick ins Feld und der Text landet
     drin; der Test schlägt dann fehl und sagt damit auch, dass er danebenlag. */
  console.log('\n== das × leert und bleibt leer ==');
  await p.fill('#q', 'Unfall');
  await kopiere(p, 'Berufskrankheit');
  const box = await p.locator('#q').boundingBox();
  await p.mouse.click(box.x + box.width - 23, box.y + box.height / 2);
  await p.waitForTimeout(250);
  ok(await feld(p) === '', 'Feld ist nach dem × leer und wird nicht neu befüllt: "' +
                           await feld(p) + '"');
  // Der nächste richtige Klick darf dann aber wieder einfügen.
  await klick(p);
  ok(await feld(p) === 'Berufskrankheit', 'der nächste Klick ins Feld fügt ein: "' + await feld(p) + '"');

  console.log('\n== gleicher Text wie im Feld ==');
  await p.fill('#q', 'Berufskrankheit');
  await klick(p);
  ok(await feld(p) === 'Berufskrankheit', 'bleibt unverändert, keine Dopplung');

  console.log('\n== nach erneutem Aufruf der Suche ==');
  await p.fill('#q', '');
  await p.click('#btn-home');
  await p.click('#btn-search');
  await klick(p);
  ok(await feld(p) === 'Berufskrankheit',
     'dieselbe Zwischenablage greift wieder: "' + await feld(p) + '"');

  /* ---------------- ohne Freigabe ---------------- */
  console.log('\n== ohne Freigabe ==');
  const ctx2 = await b.newContext();          // nichts freigegeben
  const p2 = await ctx2.newPage({ viewport: { width: 390, height: 900 } });
  p2.on('pageerror', e => { console.log('  JS-FEHLER:', String(e)); fails++; });
  await p2.goto(APP);
  await p2.click('#btn-search');
  await klick(p2);
  ok(await feld(p2) === '', 'Feld bleibt leer, kein Absturz');
  const info = await p2.locator('#search-info').textContent();
  ok(/Strg\+V/.test(info), 'Hinweis nennt den Weg von Hand: "' + info + '"');
  await p2.fill('#q', 'Wochengeld');
  await p2.waitForTimeout(120);
  ok(await treffer(p2) > 0, 'die Suche selbst funktioniert weiter');

  await b.close();
  console.log(fails ? '\n' + fails + ' FEHLER' : '\nalles in Ordnung');
  process.exit(fails ? 1 : 0);
})();
