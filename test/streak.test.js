const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

const SOLVE = (right) => {
  const cards = JSON.parse(document.getElementById('seed').textContent).cards;
  const labels = g => [...g.querySelectorAll('.opt .t')].map(n => n.textContent);
  const groups = [...document.querySelectorAll('#q-body .opts')];
  const same = (a,b) => a.length===b.length && a.every(x=>b.includes(x));
  if (document.getElementById('answer-in')) {
    const c = cards.find(c => c.kind==='text' && c.text===document.getElementById('q-text').textContent);
    document.getElementById('answer-in').value = (c && right) ? c.accepted[0] : 'daneben'; return;
  }
  if (document.querySelectorAll('#q-body .blank').length) {
    const shown = groups.map(labels);
    const c = cards.find(c => c.kind==='gaps' && c.blanks.length===shown.length &&
      c.blanks.every((b,i)=>same(b.options, shown[i])));
    c.blanks.forEach((bl,gi)=>{ const w = right ? bl.answer : (shown[gi].find(o=>o!==bl.answer)||bl.answer);
      [...groups[gi].querySelectorAll('.opt')].find(o=>o.querySelector('.t').textContent===w).click(); });
    return;
  }
  const shown = labels(groups[0]);
  const c = cards.find(c => c.kind==='choice' && c.text===document.getElementById('q-text').textContent && same(c.options, shown));
  const good = c.correct.map(i=>c.options[i]);
  (right ? good : [shown.find(o=>!good.includes(o))||shown[0]]).forEach(w =>
    [...groups[0].querySelectorAll('.opt')].find(o=>o.querySelector('.t').textContent===w).click());
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('  JS-FEHLER:', String(e)));
  await p.goto(APP);
  await p.click('#btn-start');

  const muster = [];
  for (let i = 0; i < 40; i++) {
    const r = i % 3 !== 0;                 // Muster: jede dritte falsch
    muster.push(r ? 1 : 0);
    await p.evaluate(SOLVE, r);
    const btn = p.locator('#btn-check');
    if (await btn.isVisible() && (await btn.innerText()) === 'Prüfen') await btn.click();
    await p.waitForSelector('#q-verdict .verdict');
    await p.click('#btn-check');
  }

  console.log('== Kopfzeile ==');
  ok(!(await p.locator('#crumb .run').count()), 'Sitzungszähler ist weg');
  ok((await p.locator('#crumb').innerText()).replace(/\s+/g,' ').trim().startsWith('PROGNOSE'),
     'Kopfzeile: "' + (await p.locator('#crumb').innerText()).replace(/\s+/g,' ').trim() + '"');

  console.log('\n== Diagramm und Kästchen ==');
  const st = await p.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('lk.trend.v1'));
    const h = JSON.parse(localStorage.getItem('lk.history.v1'));
    const k = [...document.querySelectorAll('#crumb .streak > i')]
      .map(x => x.style.background.includes('f5') ? 1 : 0);
    const poly = document.querySelector('#crumb path.line');
    return { punkte: poly.getAttribute('d').split('C').length,
             trendLen: t.p.length, histLen: h.length, kaesten: k, hist: h };
  });
  ok(st.trendLen === 30, 'Diagramm hält 30 Werte (' + st.trendLen + ')');
  ok(st.punkte === 30, 'Kurve verbindet 30 Punkte (' + st.punkte + ')');
  ok(st.kaesten.length === 30, '30 Kästchen (' + st.kaesten.length + ')');
  ok(JSON.stringify(st.kaesten) === JSON.stringify(st.hist),
     'Kästchen entsprechen den letzten 30 Antworten');
  ok(JSON.stringify(st.kaesten) === JSON.stringify(muster.slice(-30)),
     'und stimmen mit dem eingegebenen Muster überein');
  const gruen = st.kaesten.filter(x => x).length;
  ok(gruen === muster.slice(-30).filter(x=>x).length,
     gruen + ' grün (richtig), ' + (30-gruen) + ' rot (falsch)');

  console.log('\n== Breiten ==');
  for (const w of [320, 390, 430, 760]) {
    await p.setViewportSize({ width: w, height: 860 });
    await p.waitForTimeout(150);
    const r = await p.evaluate(() => {
      const c = document.getElementById('crumb');
      const tr = c.querySelector('.trend');
      const s = c.querySelector('.streak');
      const sp = c.querySelector('.spark');
      return { da: !!tr, breite: tr ? Math.round(tr.getBoundingClientRect().width) : 0,
               gleich: tr && Math.abs(s.getBoundingClientRect().width - sp.getBoundingClientRect().width) < 1,
               ueberlauf: c.scrollWidth > c.clientWidth + 1 };
    });
    ok(!r.ueberlauf && (!r.da || r.gleich),
       w + 'px: Block ' + (r.da ? r.breite + 'px, Kästchen bündig zum Diagramm' : 'ausgeblendet') +
       ', kein Überlauf');
  }

  console.log('\n== Übersicht ==');
  await p.setViewportSize({ width: 390, height: 900 });
  await p.click('#btn-home');
  await p.waitForTimeout(200);
  const uebersicht = await p.evaluate(() => {
    const k = [...document.querySelectorAll('#home-total .streak > i')].length;
    const t = document.getElementById('home-total');
    return { kaesten: k, ueberlauf: t.scrollWidth > t.clientWidth + 1 };
  });
  ok(uebersicht.kaesten === 30, 'auch in der Übersicht 30 Kästchen (' + uebersicht.kaesten + ')');
  ok(!uebersicht.ueberlauf, 'die Kennzahlen laufen nicht über');
  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
