const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

async function mit(p, werte) {
  await p.evaluate(w => {
    localStorage.setItem('lk.trend.v1', JSON.stringify({ n: w.length, p: w }));
    localStorage.setItem('lk.history.v1', JSON.stringify(w.map(v => v >= 80 ? 1 : 0)));
  }, werte);
  await p.reload();
  await p.waitForTimeout(180);
  return p.evaluate(() => {
    const box = document.querySelector('#home-total .spark');
    const g = [...box.querySelectorAll('.grid')].map(l => Number(l.getAttribute('y1')));
    const a = {};
    box.querySelectorAll('.axis > span').forEach(s =>
      a[s.className] = { text: s.textContent, top: s.style.top });
    const poly = box.querySelector('polyline');
    return {
      gitter: g, achse: a,
      punkte: poly.getAttribute('points').trim().split(/\s+/).map(q => q.split(',').map(Number)),
      ziel: Number(box.querySelector('.bench').getAttribute('y1')),
      clip: [...box.querySelectorAll('clipPath rect')].map(r =>
              [Number(r.getAttribute('y')), Number(r.getAttribute('height'))])
    };
  });
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('  JS-FEHLER:', String(e)));
  await p.goto(APP);

  console.log('== Spanne umschließt die Daten ==');
  const a = await mit(p, [40, 95, 60, 88, 52]);
  ok(a.achse.unten.text === '40' && a.achse.oben.text === '95',
     'Achse läuft von ' + a.achse.unten.text + ' bis ' + a.achse.oben.text + ' (Daten 40..95)');
  const ys = a.punkte.map(q => q[1]);
  ok(Math.min(...ys) === 0 && Math.max(...ys) === 100,
     'höchster Wert sitzt ganz oben, niedrigster ganz unten');
  ok(a.achse.ziel && a.achse.ziel.text === '80', 'Ziellinie ist mit "80" beschriftet');
  const zielPos = (95 - 80) / (95 - 40) * 100;
  ok(Math.abs(a.ziel - zielPos) < 0.01,
     'Ziellinie sitzt maßstäblich bei y ' + a.ziel.toFixed(1) + ' (erwartet ' + zielPos.toFixed(1) + ')');
  ok(Math.abs(a.clip[0][0] + a.clip[0][1] - a.ziel) < 0.01 && Math.abs(a.clip[1][0] - a.ziel) < 0.01,
     'der Farbschnitt folgt der Ziellinie mit');

  console.log('\n== Ziellinie außerhalb der Daten ==');
  const b1 = await mit(p, [30, 45, 38, 52, 41]);
  ok(b1.achse.oben.text === '80', 'alles unter 80: Achse reicht bis zur Ziellinie hinauf ('
     + b1.achse.unten.text + '..' + b1.achse.oben.text + ')');
  const b2 = await mit(p, [88, 95, 91, 99, 93]);
  ok(b2.achse.unten.text === '80', 'alles über 80: Achse reicht bis zur Ziellinie hinab ('
     + b2.achse.unten.text + '..' + b2.achse.oben.text + ')');
  ok(!b1.achse.ziel && !b2.achse.ziel,
     'die Marke "80" entfällt, wo sie auf einem Achsenende läge');

  console.log('\n== Flacher Verlauf ==');
  const c = await mit(p, [80, 80, 80, 80, 80]);
  ok(Number(c.achse.oben.text) - Number(c.achse.unten.text) >= 8,
     'keine Division durch null, Mindestspanne greift: ' +
     c.achse.unten.text + '..' + c.achse.oben.text);
  const d = await mit(p, [99, 100, 99, 100, 100]);
  ok(Number(d.achse.oben.text) <= 100 && Number(d.achse.unten.text) >= 0,
     'Spanne bleibt im gültigen Bereich: ' + d.achse.unten.text + '..' + d.achse.oben.text);

  console.log('\n== Kopfzeile bleibt ohne Beschriftung ==');
  await mit(p, [40, 95, 60, 88, 52]);
  await p.click('#btn-start');
  await p.waitForTimeout(180);
  const kopf = await p.evaluate(() => {
    const s = document.querySelector('#crumb .spark');
    return { achse: s.querySelectorAll('.axis').length,
             mitachse: s.classList.contains('mitachse'),
             breite: Math.round(s.getBoundingClientRect().width) };
  });
  ok(kopf.achse === 0 && !kopf.mitachse,
     'in der Kopfzeile keine Achsentexte, dafür volle Breite (' + kopf.breite + 'px)');

  console.log('\n== Beschriftungen überlappen nicht ==');
  await p.click('#btn-home');
  const proben = [[40,95,60,88,52], [79,81,80,82,78], [55,95,70,90,60], [81,99,85,97,90]];
  for (const werte of proben) {
    await mit(p, werte);
    const r = await p.evaluate(() => {
      const s = [...document.querySelectorAll('#home-total .axis > span')]
        .map(x => x.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      let kollision = false;
      for (let i = 1; i < s.length; i++) if (s[i].top < s[i-1].bottom) kollision = true;
      const t = document.getElementById('home-total');
      return { marken: s.length, kollision, ueberlauf: t.scrollWidth > t.clientWidth + 1 };
    });
    ok(!r.kollision && !r.ueberlauf,
       JSON.stringify(werte) + ': ' + r.marken + ' Marken, keine Überlappung, kein Überlauf');
  }

  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
