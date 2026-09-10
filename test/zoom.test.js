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
    const a = [...box.querySelectorAll('.axis > span')]
      .map(s => ({ klasse: s.className, text: s.textContent, top: s.style.top }));
    const poly = box.querySelector('path.line');
    const d = poly.getAttribute('d');
    const stuetz = [d.slice(1).split('C')[0].trim().split(',').map(Number)].concat(
      d.split('C').slice(1).map(c => {
        const z = c.trim().split(/[\s,]+/).map(Number);
        return [z[4], z[5]];
      }));
    return {
      gitter: g, achse: a, punkte: stuetz,
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

  // Bereich: unten Tiefstwert minus 2, oben immer 102. Beschriftet werden
  // die gemeinten Werte, nicht die Ränder: unten der Tiefstwert, oben 100.
  const y = (v, min) => (102 - v) / (104 - min) * 100;

  console.log('== Bereich und Beschriftung ==');
  const a = await mit(p, [40, 95, 60, 88, 52]);
  const marken = a.achse.map(m => m.text).sort((x, z) => z - x);
  ok(marken[0] === '100', 'oben steht immer 100: ' + marken.join(' / '));
  ok(marken[marken.length - 1] === '40', 'unten steht der Tiefstwert (40)');
  ok(marken.indexOf('80') >= 0, 'die Ziellinie ist mit 80 beschriftet');

  const ys = a.punkte.map(q => q[1]);
  ok(Math.abs(Math.min(...ys) - y(95, 40)) < 0.01 && Math.abs(Math.max(...ys) - y(40, 40)) < 0.01,
     'Höchst- und Tiefstwert sitzen maßstäblich, mit Luft zum Rand: ' +
     Math.min(...ys).toFixed(1) + '..' + Math.max(...ys).toFixed(1));
  ok(Math.max(...ys) < 100 && Math.min(...ys) > 0,
     'die Linie berührt keinen Rand und wird darum nicht abgeschnitten');
  ok(Math.abs(a.ziel - y(80, 40)) < 0.01,
     'Ziellinie maßstäblich bei y ' + a.ziel.toFixed(1));
  ok(Math.abs(a.clip[0][0] + a.clip[0][1] - a.ziel) < 0.01 && Math.abs(a.clip[1][0] - a.ziel) < 0.01,
     'der Farbschnitt folgt der Ziellinie mit');
  ok(a.gitter.length === 2 &&
     Math.abs(a.gitter[0] - y(40, 40)) < 0.01 && Math.abs(a.gitter[1] - y(100, 40)) < 0.01,
     'die Rahmenlinien liegen auf den beschrifteten Werten');

  console.log('\n== Ränder ==');
  const b1 = await mit(p, [30, 45, 38, 52, 41]);
  ok(b1.achse.some(m => m.text === '30') && b1.achse.some(m => m.text === '100'),
     'alles unter 80: Achse 30..100, die Ziellinie bleibt im Bild');
  const b2 = await mit(p, [88, 95, 91, 99, 93]);
  ok(b2.achse.some(m => m.text === '88'),
     'alles über 80: Achse beginnt beim Tiefstwert 88');
  ok(!b2.achse.some(m => m.text === '80'),
     'die Marke 80 entfällt, weil sie außerhalb liegt');

  console.log('\n== Flacher Verlauf ==');
  const c = await mit(p, [80, 80, 80, 80, 80]);
  ok(c.punkte.every(q => isFinite(q[1])),
     'konstanter Verlauf ergibt gültige Koordinaten (keine Division durch null)');
  const d = await mit(p, [100, 100, 100, 100, 100]);
  ok(d.punkte.every(q => isFinite(q[1]) && q[1] > 0 && q[1] < 100),
     'auch bei durchgehend 100 % bleibt Luft zum Rand: y ' + d.punkte[0][1].toFixed(1));

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
