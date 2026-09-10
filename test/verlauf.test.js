const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

// Verlauf mit n Punkten vortäuschen und die Übersicht auslesen
async function mit(p, n, werte) {
  await p.evaluate(([n, werte]) => {
    localStorage.setItem('lk.trend.v1', JSON.stringify({ n: n, p: werte }));
    localStorage.setItem('lk.history.v1', JSON.stringify([1, 0, 1]));
  }, [n, werte]);
  await p.reload();
  await p.waitForTimeout(120);
  return p.evaluate(() => {
    const box = document.querySelector('#home-total .spark');
    if (!box) return null;
    const poly = box.querySelector('polyline');
    const bench = box.querySelector('.bench');
    return {
      punkte: poly.getAttribute('points').trim().split(/\s+/),
      ziellinie: bench.getAttribute('y1'),
      titel: box.getAttribute('title'),
      dotTop: box.querySelector('.dot').style.top,
      kaesten: [...box.parentNode.querySelectorAll('.streak > i')].length
    };
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('  JS-FEHLER:', String(e)));
  await p.goto(APP);

  console.log('== Wann entsteht das Diagramm? ==');
  ok(await mit(p, 0, []) === null, 'n = 0: kein Diagramm');
  ok(await mit(p, 1, [100]) === null, 'n = 1: kein Diagramm (eine Linie braucht zwei Punkte)');
  const zwei = await mit(p, 2, [100, 50]);
  ok(zwei !== null && zwei.punkte.length === 2, 'n = 2: Linie zwischen p(1) und p(2)');
  ok(zwei.punkte[0].startsWith('0,') && zwei.punkte[1].startsWith('100,'),
     '  erster Punkt ganz links, letzter ganz rechts: ' + zwei.punkte.join('  '));
  ok(Number(zwei.punkte[0].split(',')[1]) < Number(zwei.punkte[1].split(',')[1]),
     '  der höhere Wert (100) liegt über dem niedrigeren (50)');

  const drei = await mit(p, 3, [100, 50, 67]);
  ok(drei.punkte.length === 3 && drei.punkte[1].startsWith('50,'),
     'n = 3: drei Punkte, mittlerer bei x = 50: ' + drei.punkte.join('  '));

  console.log('\n== Fenster ==');
  const g = i => 50 + Math.round(30 * Math.sin(i / 7));
  const neunundzwanzig = Array.from({ length: 29 }, (_, i) => g(i));
  const k29 = await mit(p, 29, neunundzwanzig);
  ok(k29.punkte.length === 29, 'n = 29: alle 29 Werte (' + k29.punkte.length + ')');

  const k30 = await mit(p, 30, neunundzwanzig.concat([g(29)]));
  ok(k30.punkte.length === 30, 'n = 30: alle 30 Werte (' + k30.punkte.length + ')');

  // Über 30 hinaus muss die App selbst kappen - also echt weiterspielen.
  await p.evaluate(() => {
    const werte = Array.from({ length: 30 }, (_, i) => 50 + Math.round(30 * Math.sin(i / 7)));
    localStorage.setItem('lk.trend.v1', JSON.stringify({ n: 30, p: werte }));
  });
  await p.reload();
  await p.click('#btn-start');
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => {
      if (document.getElementById('answer-in')) document.getElementById('answer-in').value = 'x';
      else document.querySelectorAll('#q-body .opts').forEach(gr => gr.querySelector('.opt').click());
    });
    const btn = p.locator('#btn-check');
    if (await btn.isVisible() && (await btn.innerText()) === 'Prüfen') await btn.click();
    await p.waitForSelector('#q-verdict .verdict');
    await p.click('#btn-check');
  }
  const nach = await p.evaluate(() => JSON.parse(localStorage.getItem('lk.trend.v1')));
  ok(nach.n === 35, 'n zählt weiter: ' + nach.n);
  ok(nach.p.length === 30, 'Fenster bleibt bei 30 Werten (' + nach.p.length + ')');
  await p.click('#btn-home');
  const titel = await p.locator('#home-total .trend').getAttribute('title');
  ok(/Fragen 6 bis 35/.test(titel), 'Fenster zeigt n-29 bis n: "' + titel + '"');

  console.log('\n== Ziellinie und Skala ==');
  // Spannt der Verlauf 0 bis 100, entspricht die Achse dem vollen Bereich
  // und die Ziellinie sitzt bei y 20. (Adaptive Fälle: zoom.test.js)
  const rand = await mit(p, 3, [0, 100, 80]);
  ok(rand.ziellinie === '20', 'Achse 0..100: Ziellinie bei y 20 — ' + rand.ziellinie);
  ok(rand.punkte[0] === '0,100' && rand.punkte[1] === '50,0',
     '0 % ganz unten, 100 % ganz oben: ' + rand.punkte.join('  '));
  ok(rand.dotTop === '20%', 'Endpunkt sitzt auf seinem Wert (80 % → top 20 %): ' + rand.dotTop);

  console.log('\n== Farbe an der Ziellinie ==');
  const farben = await mit(p, 5, [50, 90, 60, 95, 40]);
  const linien = await p.evaluate(() => [...document.querySelectorAll('#home-total polyline')]
    .map(l => ({ farbe: l.style.stroke, clip: l.getAttribute('clip-path'),
                 punkte: l.getAttribute('points') })));
  ok(linien.length === 2, 'die Linie wird zweimal gezeichnet (' + linien.length + ')');
  ok(linien[0].farbe.includes('f5') && linien[1].farbe.includes('f1'),
     'grün über, rot unter der Ziellinie: ' + linien.map(l => l.farbe).join(' / '));
  ok(linien[0].punkte === linien[1].punkte, 'beide zeigen denselben Verlauf');
  // Der Schnitt folgt der Ziellinie, wo immer die adaptive Achse sie hinlegt.
  const schnitt = await p.evaluate(() => {
    const box = document.querySelector('#home-total .spark');
    return { ziel: Number(box.querySelector('.bench').getAttribute('y1')),
             clips: [...box.querySelectorAll('clipPath rect')]
               .map(r => [Number(r.getAttribute('y')), Number(r.getAttribute('height'))]) };
  });
  ok(Math.abs(schnitt.clips[0][0] + schnitt.clips[0][1] - schnitt.ziel) < 0.01 &&
     Math.abs(schnitt.clips[1][0] - schnitt.ziel) < 0.01,
     'der Farbschnitt liegt genau auf der Ziellinie (y ' + schnitt.ziel.toFixed(1) + ')');
  ok(farben.dotTop === '100%',
     'der Endpunkt ist zugleich der niedrigste Wert und sitzt ganz unten: ' + farben.dotTop);

  // Zwei Diagramme gleichzeitig im Dokument dürfen sich die Kennungen
  // der clipPaths nicht teilen.
  await p.click('#btn-start');
  await p.waitForTimeout(150);
  const ids = await p.evaluate(() => [...document.querySelectorAll('clipPath')].map(c => c.id));
  ok(ids.length >= 4 && new Set(ids).size === ids.length,
     ids.length + ' clipPath-Kennungen, alle verschieden');
  await p.click('#btn-home');

  console.log('\n== Streak-Kästchen ==');
  const mitStreak = await p.evaluate(() => {
    const h = JSON.parse(localStorage.getItem('lk.history.v1'));
    const k = [...document.querySelectorAll('#home-total .streak > i')]
      .map(x => x.style.background.includes('f5') ? 1 : 0);
    return { hist: h, kaesten: k };
  });
  ok(mitStreak.kaesten.length === mitStreak.hist.length,
     'ein Kästchen je Antwort (' + mitStreak.kaesten.length + ')');
  ok(JSON.stringify(mitStreak.kaesten) === JSON.stringify(mitStreak.hist),
     'grün steht für richtig, rot für falsch');

  console.log('\n== Überlebt den Reload ==');
  const vor = await p.locator('#home-total .spark polyline').first().getAttribute('points');
  await p.reload();
  const nachReload = await p.locator('#home-total .spark polyline').first().getAttribute('points');
  ok(vor === nachReload, 'Diagramm ist nach dem Neustart unverändert da');

  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
