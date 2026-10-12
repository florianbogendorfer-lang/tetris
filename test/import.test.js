const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
const SRC = process.env.QUIZ_HTML;   // gespeicherte Moodle-Seite zum Testen des Imports
const SHOT = process.env.SHOT_DIR ? process.env.SHOT_DIR + '/' : require('os').tmpdir() + '/lk-';
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
  if (!SRC) {
    console.log('QUIZ_HTML nicht gesetzt — Import-Test übersprungen.\n' +
                'Aufruf: QUIZ_HTML=/pfad/zur/moodle-seite.html node test/import.test.js');
    process.exit(0);
  }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  // Ein dauerhafter Dialog-Handler: die Antworten liegen in der Schlange.
  const answers = [];
  const say = (...v) => answers.push(...v);
  p.on('dialog', async d => {
    const a = answers.length ? answers.shift() : undefined;
    a === false ? await d.dismiss() : await d.accept(a === true ? undefined : a);
  });
  await p.goto(APP);

  // In einen Bereich importieren, der nicht schon mitgeliefert wird -
  // sonst ließe sich "vorher leer, nachher voll" nicht mehr prüfen.
  const start = await p.evaluate(() => {
    const c = JSON.parse(document.getElementById('seed').textContent).cards;
    const je = {};
    c.forEach(x => { je[x.cat] = (je[x.cat] || 0) + 1; });
    const frei = ['PV', 'RECHT', 'UV', 'KV'].find(k => !je[k]);
    return { gesamt: c.length, saetze: Object.keys(je).length, ziel: frei };
  });
  const ZIEL = start.ziel;
  const kachelNr = ['KV', 'UV', 'PV', 'RECHT'].indexOf(ZIEL) + 1;
  console.log('\n== Import als ' + ZIEL + ' ==');
  await p.click('#btn-manage');
  say(ZIEL);   // Abfrage des Themenbereichs
  await p.setInputFiles('#file', SRC);
  await p.waitForSelector('#import-out .note', { timeout: 30000 });
  const msg = await p.locator('#import-out .note').innerText();
  const m = msg.match(/(\d+) Fragen als (\w+)/);
  ok(m && m[2] === ZIEL, 'Rückmeldung: ' + msg.trim());
  const dazu = Number(m[1]);
  ok(await p.locator('#sets .item').count() === start.saetze + 1,
     (start.saetze + 1) + ' Fragensätze gelistet');
  await p.screenshot({ path: SHOT + 'v-import.png' });

  await p.click('#btn-home');
  ok(!(await p.locator('#tiles .tile').nth(kachelNr).isDisabled()),
     ZIEL + '-Kachel ist jetzt aktiv');
  const summe = start.gesamt + dazu;
  ok((await p.locator('#tiles .tile').first().innerText()).includes(String(summe)),
     'Alle = ' + start.gesamt + ' + ' + dazu + ' = ' + summe + ' Fragen');

  console.log('\n== Nach Neustart noch da ==');
  await p.reload();
  ok((await p.locator('#tiles .tile').first().innerText()).includes(String(summe)),
     'Import überlebt den Neustart');

  console.log('\n== ' + ZIEL + ' lernen ==');
  await p.locator('#tiles .tile').nth(kachelNr).click();
  await p.click('#btn-start');
  ok((await p.locator('#q-tags .tag').first().innerText()) === ZIEL,
     'gezeigte Karte ist ' + ZIEL);

  console.log('\n== Sicherung ==');
  await p.click('#btn-home'); await p.click('#btn-manage');
  const dl = p.waitForEvent('download');
  await p.click('#btn-export');
  const file = await dl;
  const dest = SHOT + 'backup.json';
  await file.saveAs(dest);
  const data = JSON.parse(require('fs').readFileSync(dest, 'utf8'));
  ok(data.sets && data.sets[ZIEL] && data.sets[ZIEL].cards.length === dazu,
     'Sicherung enthält den ' + ZIEL + '-Satz (' + dazu + ' Karten)');
  ok(!!data.progress, 'Sicherung enthält den Fortschritt');

  console.log('\n== Entfernen ==');
  say(true);
  // der importierte Satz ist der einzige mit Entfernen-Knopf
  await p.locator('#sets .item button').first().click();
  ok(await p.locator('#sets .item').count() === start.saetze,
     ZIEL + ' wieder entfernt, ' + start.saetze + ' mitgelieferte bleiben');

  console.log('\n== Sicherung zurückspielen ==');
  say(true, true);   // Überschreiben bestätigen, dann "Sicherung geladen"
  await p.setInputFiles('#file-backup', dest);
  await p.waitForTimeout(800);
  ok(await p.locator('#sets .item').count() === start.saetze + 1,
     ZIEL + ' aus der Sicherung wiederhergestellt');

  console.log('\n== Falsche Datei ==');
  const junk = SHOT + 'junk.html';
  require('fs').writeFileSync(junk, '<html><body><p>keine Fragen</p></body></html>');
  say(ZIEL);
  await p.setInputFiles('#file', junk);
  await p.waitForSelector('#import-out .note.warn', { timeout: 15000 });
  ok(true, 'Hinweis: ' + (await p.locator('#import-out .note').innerText()).trim().slice(0, 80));

  console.log('\n== Import abbrechen ==');
  say(false);
  await p.setInputFiles('#file', SRC);
  await p.waitForTimeout(600);
  ok(/abgebrochen/.test(await p.locator('#import-out').innerText()), 'Abbruch wird gemeldet');
  ok(await p.locator('#sets .item').count() === start.saetze + 1,
     'Fragensätze unverändert nach Abbruch');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
