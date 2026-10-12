const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('  JS-FEHLER:', String(e)));
  await p.goto(APP);

  console.log('== Bestand ==');
  const best = await p.evaluate(() => {
    const c = JSON.parse(document.getElementById('seed').textContent).cards;
    const z = a => a.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});
    const ids = c.map(x => x.id);
    return { gesamt: c.length, kat: z(c.map(x => x.cat)), arten: z(c.map(x => x.kind)),
             doppelt: ids.length - new Set(ids).size };
  });
  ok(Object.keys(best.kat).length > 0 &&
     Object.values(best.kat).reduce((a, b) => a + b, 0) === best.gesamt,
     'Bestand: ' + JSON.stringify(best.kat) + ' = ' + best.gesamt + ' Karten');
  ok(best.doppelt === 0, 'alle Kennungen eindeutig');

  console.log('\n== Startseite ==');
  const kacheln = await p.evaluate(() => [...document.querySelectorAll('#tiles .tile')]
    .map(t => ({ text: t.innerText.replace(/\n/g, ' '), aus: t.disabled })));
  ok(kacheln.slice(1).every(k => {
       const name = k.text.split(' ')[0];
       return best.kat[name] ? !k.aus && k.text.includes(String(best.kat[name])) : k.aus;
     }), 'Kacheln passen zum Bestand: ' + kacheln.slice(1).map(k => k.text).join(' | '));
  ok(kacheln[0].text.includes(String(best.gesamt)), 'Alle: "' + kacheln[0].text + '"');

  console.log('\n== Jeden Bereich lernen ==');
  const bereiche = Object.keys(best.kat);
  const nr = ['KV','UV','PV','RECHT'].indexOf(bereiche[bereiche.length - 1]) + 1;
  await p.locator('#tiles .tile').nth(nr).click();
  await p.click('#btn-start');
  const arten = {};
  for (let i = 0; i < 40; i++) {
    const r = await p.evaluate(() => {
      const bereich = document.querySelector('#q-tags .tag').textContent;
      const art = document.getElementById('answer-in') ? 'text'
        : document.querySelectorAll('#q-body .blank').length ? 'gaps' : 'choice';
      // irgendwie beantworten
      if (art === 'text') document.getElementById('answer-in').value = 'x';
      else document.querySelectorAll('#q-body .opts').forEach(g => g.querySelector('.opt').click());
      return { bereich, art };
    });
    arten[r.art] = (arten[r.art] || 0) + 1;
    if (r.bereich !== bereiche[bereiche.length - 1]) {
      ok(false, 'fremder Bereich aufgetaucht: ' + r.bereich); break; }
    const btn = p.locator('#btn-check');
    if (await btn.isVisible() && (await btn.innerText()) === 'Prüfen') await btn.click();
    await p.waitForSelector('#q-verdict .verdict');
    await p.click('#btn-check');
  }
  ok(true, '40 Fragen aus ' + bereiche[bereiche.length - 1] +
     ' durchgespielt, Arten: ' + JSON.stringify(arten));

  console.log('\n== Musterlösungen stimmen ==');
  await p.click('#btn-home');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.click('#btn-start');   // gemischt über alle Bereiche
  let richtig = 0, versuche = 0, verfehlt = 0;
  for (let i = 0; i < 50; i++) {
    const plan = await p.evaluate(() => {
      const cards = JSON.parse(document.getElementById('seed').textContent).cards;
      const n = s => s.replace(/\s+/g, ' ').trim();
      const groups = [...document.querySelectorAll('#q-body .opts')];
      const labels = g => [...g.querySelectorAll('.opt .t')].map(x => x.textContent);
      const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
      if (document.getElementById('answer-in')) {
        const c = cards.find(c => c.kind === 'text' && n(c.text) === n(document.getElementById('q-text').textContent));
        if (!c) return null;
        document.getElementById('answer-in').value = c.accepted[c.accepted.length - 1];
        return true;
      }
      if (document.querySelectorAll('#q-body .blank').length) {
        const shown = groups.map(labels);
        // Zwei Zuordnungsfragen haben denselben Text und dieselben Optionen
        // und unterscheiden sich nur in der Zeilenreihenfolge - ohne die
        // Beschriftungen greift man die falsche.
        const marken = [...document.querySelectorAll('#q-body .blank > .lbl')]
          .map(l => l.textContent.replace(/^Lücke\s*\S+\s*/, '').trim());
        const c = cards.find(c => c.kind === 'gaps' && c.blanks.length === shown.length &&
          c.blanks.every((b, i) => same(b.options, shown[i]) &&
                                   (b.label || '') === (marken[i] || '')));
        if (!c) return null;
        c.blanks.forEach((bl, gi) => [...groups[gi].querySelectorAll('.opt')]
          .find(o => o.querySelector('.t').textContent === bl.answer).click());
        return true;
      }
      const shown = labels(groups[0]);
      const c = cards.find(c => c.kind === 'choice' &&
        n(c.text) === n(document.getElementById('q-text').textContent) && same(c.options, shown));
      if (!c) return null;
      c.correct.map(i => c.options[i]).forEach(w =>
        [...groups[0].querySelectorAll('.opt')].find(o => o.querySelector('.t').textContent === w).click());
      return true;
    });
    if (!plan) { verfehlt++; await p.click('#btn-check'); continue; }
    versuche++;
    const btn = p.locator('#btn-check');
    if (await btn.isVisible() && (await btn.innerText()) === 'Prüfen') await btn.click();
    await p.waitForSelector('#q-verdict .verdict');
    if ((await p.locator('#q-verdict .verdict').getAttribute('class')).includes('ok')) richtig++;
    await p.click('#btn-check');
  }
  ok(verfehlt === 0, 'jede Karte in den Daten wiedergefunden (' + verfehlt + ' Ausreißer)');
  ok(richtig === versuche, richtig + '/' + versuche + ' Musterlösungen werden als richtig gewertet');

  console.log('\n== Suche über alle Bereiche ==');
  await p.click('#btn-home');
  await p.click('#btn-search');
  await p.fill('#q', 'Versehrtenrente');
  await p.waitForTimeout(200);
  const s = await p.evaluate(() => {
    const h = [...document.querySelectorAll('#results .hit')];
    return { n: h.length, bereiche: [...new Set(h.map(x => x.querySelector('.tag').textContent))],
             arten: [...new Set(h.map(x => [...x.querySelectorAll('.tag')][2].textContent))] };
  });
  ok(s.n > 0,
     s.n + ' Treffer, Bereiche: ' + s.bereiche.join('/') + ', Arten: ' + s.arten.join(', '));
  await p.fill('#q', 'Betriebsrente');
  await p.waitForTimeout(200);
  const frei = await p.evaluate(() => [...document.querySelectorAll('#results .hit')]
    .map(h => [...h.querySelectorAll('.tag')].map(t => t.textContent).join(' · ')));
  ok(frei.some(x => /Eingabe/.test(x)), 'Freitextfrage gefunden und gekennzeichnet: ' + frei.join(' | '));


  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
