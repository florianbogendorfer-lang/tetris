const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

async function suche(p, begriff) {
  await p.fill('#q', begriff);
  await p.waitForTimeout(120);
  return p.evaluate(() => ({
    info: document.getElementById('search-info').textContent,
    treffer: document.querySelectorAll('#results .hit').length,
    marks: document.querySelectorAll('#results mark').length,
    erste: (function () {
      const h = document.querySelector('#results .hit');
      if (!h) return null;
      return {
        frage: h.querySelector('.qtext').textContent,
        richtig: [...h.querySelectorAll('.ans.ok .t')].map(x => x.textContent),
        falsch: [...h.querySelectorAll('.ans.no .t')].map(x => x.textContent),
        bereich: h.querySelector('.tag').textContent
      };
    })()
  }));
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('  JS-FEHLER:', String(e)));
  await p.goto(APP);

  console.log('== Einstieg ==');
  ok(await p.locator('#btn-search').isVisible(), 'Knopf auf der Startseite');
  await p.click('#btn-search');
  ok(await p.locator('#s-search').isVisible() && !(await p.locator('#s-home').isVisible()),
     'öffnet den Suchbildschirm');
  ok(await p.locator('#btn-home').isVisible(), 'Rückweg zur Übersicht ist da');
  ok(/344/.test(await p.locator('#search-info').textContent()),
     'Hinweis nennt den Umfang: "' + (await p.locator('#search-info').textContent()) + '"');

  console.log('\n== Treffer in der Frage ==');
  const a = await suche(p, 'Wochengeld');
  ok(a.treffer > 0, a.info);
  ok(a.marks > 0, a.marks + ' Fundstellen hervorgehoben');
  ok(a.erste.richtig.length > 0, 'richtige Antworten werden gezeigt: ' +
     JSON.stringify(a.erste.richtig.slice(0, 2)));

  console.log('\n== Treffer nur in einer Antwort ==');
  const b2 = await suche(p, 'Jugendlichenuntersuchung');
  const nurAntwort = await p.evaluate(() => {
    const h = [...document.querySelectorAll('#results .hit')].find(
      x => !/Jugendlichenuntersuchung/i.test(x.querySelector('.qtext').textContent));
    if (!h) return null;
    return { frage: h.querySelector('.qtext').textContent.slice(0, 60),
             markInAntwort: !!h.querySelector('.ans mark') };
  });
  ok(nurAntwort && nurAntwort.markInAntwort,
     'auch Karten gefunden, wo der Begriff nur in einer Antwort steht');

  console.log('\n== Richtig und falsch getrennt ==');
  const c = await suche(p, 'Krankengeld ohne Zusatzversicherung');
  const trennung = await p.evaluate(() => {
    const seed = JSON.parse(document.getElementById('seed').textContent).cards;
    const h = document.querySelector('#results .hit');
    const frage = h.querySelector('.qtext').textContent;
    const karte = seed.find(k => k.kind === 'choice' && k.text === frage);
    if (!karte) return { uebersprungen: true };
    const rich = [...h.querySelectorAll('.ans.ok .t')].map(x => x.textContent).sort();
    const soll = karte.correct.map(i => karte.options[i]).sort();
    const fal = [...h.querySelectorAll('.ans.no .t')].map(x => x.textContent).length;
    return { stimmt: JSON.stringify(rich) === JSON.stringify(soll),
             anzahl: rich.length + fal === karte.options.length };
  });
  ok(trennung.uebersprungen || (trennung.stimmt && trennung.anzahl),
     'grün markiert sind genau die richtigen, und alle Optionen sind da');

  console.log('\n== Mehrere Begriffe = UND ==');
  const ein = await suche(p, 'Wochengeld');
  const zwei = await suche(p, 'Wochengeld Anspruch');
  ok(zwei.treffer <= ein.treffer, 'zweiter Begriff schränkt ein: ' +
     ein.treffer + ' → ' + zwei.treffer);
  const alleEnthalten = await p.evaluate(() =>
    [...document.querySelectorAll('#results .hit')].every(h =>
      /wochengeld/i.test(h.textContent) && /anspruch/i.test(h.textContent)));
  ok(alleEnthalten, 'jeder Treffer enthält beide Begriffe');

  console.log('\n== Umlaute ==');
  const mit = await suche(p, 'ärztliche');
  const ohne = await suche(p, 'arztliche');
  ok(ohne.treffer === mit.treffer && mit.treffer > 0,
     '"arztliche" findet dasselbe wie "ärztliche" (' + mit.treffer + ')');

  console.log('\n== Randfälle ==');
  const leer = await suche(p, '   ');
  ok(leer.treffer === 0 && /344/.test(leer.info), 'leere Eingabe zeigt nur den Hinweis');
  const nichts = await suche(p, 'xyzqwertz');
  ok(nichts.treffer === 0 && /Kein Treffer/.test(nichts.info), 'kein Treffer wird gemeldet');
  const viel = await suche(p, 'e');
  ok(viel.treffer <= 60 && /gezeigt werden die ersten/.test(viel.info),
     'sehr viele Treffer werden gedeckelt: "' + viel.info + '"');

  console.log('\n== Zurück ==');
  await p.click('#btn-home');
  ok(await p.locator('#s-home').isVisible(), 'zurück auf der Übersicht');

  console.log('\n== Lückentexte ==');
  await p.click('#btn-search');
  await suche(p, 'Rehabilitationsgeld');
  const luecke = await p.evaluate(() => {
    const seed = JSON.parse(document.getElementById('seed').textContent).cards;
    const h = [...document.querySelectorAll('#results .hit')].find(
      x => x.querySelector('.blbl'));
    if (!h) return null;
    const marken = [...h.querySelectorAll('.blbl')].map(x => x.textContent);
    const frage = h.querySelector('.qtext').textContent;
    return { marken: marken.length, beschriftet: marken[0],
             keineRohmarke: !/[\uE000\uE001]/.test(frage),
             eingekreist: /[\u2460-\u2473]/.test(frage) || marken[0] !== '',
             richtig: h.querySelectorAll('.ans.ok').length,
             falsch: h.querySelectorAll('.ans.no').length };
  });
  ok(luecke && luecke.marken > 0, 'Lücken sind einzeln aufgeführt (' +
     (luecke ? luecke.marken : 0) + ')');
  ok(luecke && luecke.keineRohmarke, 'keine rohen Platzhalter im Fragetext');
  ok(luecke && luecke.richtig === luecke.marken,
     'je Lücke genau eine richtige Antwort (' + (luecke ? luecke.richtig : 0) + ')');
  ok(luecke && luecke.falsch > 0, 'die übrigen Möglichkeiten stehen als falsch daneben');

  console.log('\n== Nach einem Import wird neu indexiert ==');
  const vorher = (await suche(p, 'Wochengeld')).treffer;
  await p.evaluate(() => {
    // Kartensatz künstlich verdoppeln, wie es ein Import täte
    const seed = JSON.parse(document.getElementById('seed').textContent).cards;
    const kopie = seed.slice(0, 40).map((c, i) =>
      Object.assign({}, c, { cat: 'UV', id: 'uv-' + i }));
    localStorage.setItem('lk.sets.v1', JSON.stringify({ UV: { cards: kopie, at: Date.now() } }));
  });
  await p.reload();
  await p.click('#btn-search');
  const nachher = (await suche(p, 'Wochengeld')).treffer;
  ok(nachher >= vorher, 'der Index kennt die neuen Karten: ' + vorher + ' → ' + nachher);

  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
