const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.join(__dirname, '..', 'lernkartei.html');
const SHOT = process.env.SHOT_DIR ? process.env.SHOT_DIR + '/' : require('os').tmpdir() + '/lk-';
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };

/* Findet die aktuell gezeigte Karte in den eingebetteten Daten und liefert
   die Beschriftungen, die angeklickt werden muessen. `right=false` waehlt
   bewusst falsch. */
const SOLVE = (right) => {
  const cards = JSON.parse(document.getElementById('seed').textContent).cards;
  const labels = g => [...g.querySelectorAll('.opt .t')].map(n => n.textContent);
  const groups = [...document.querySelectorAll('#q-body .opts')];
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));

  if (document.getElementById('answer-in')) {
    const c = cards.find(c => c.kind === 'text' && c.text === document.getElementById('q-text').textContent);
    if (!c) return null;
    return { kind: 'text', value: right ? c.accepted[0] : '— falsch —' };
  }
  if (document.querySelectorAll('#q-body .blank').length) {
    const shown = groups.map(labels);
    const c = cards.find(c => c.kind === 'gaps' && c.blanks.length === shown.length &&
      c.blanks.every((b, i) => same(b.options, shown[i])));
    if (!c) return null;
    return { kind: 'gaps', picks: c.blanks.map((b, i) =>
      right ? b.answer : (shown[i].find(o => o !== b.answer) || b.answer)) };
  }
  const shown = labels(groups[0]);
  const c = cards.find(c => c.kind === 'choice' && c.text === document.getElementById('q-text').textContent
                            && same(c.options, shown));
  if (!c) return null;
  const good = c.correct.map(i => c.options[i]);
  return { kind: 'choice', multi: good.length > 1,
           picks: right ? good : [shown.find(o => !good.includes(o)) || shown[0]] };
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(APP);

  // eine Frage beantworten; liefert das Urteil der App
  async function answer(right) {
    const plan = await p.evaluate(SOLVE, right);
    if (!plan) return null;
    const armed = await p.evaluate(() => {
      const b = document.getElementById('btn-check');
      return { hidden: b.classList.contains('hide'), off: b.disabled };
    });
    if (plan.kind === 'text') {
      await p.fill('#answer-in', plan.value);
    } else {
      await p.evaluate(picks => {
        const groups = [...document.querySelectorAll('#q-body .opts')];
        picks.forEach((label, i) => {
          const g = groups.length === 1 ? groups[0] : groups[i];
          [...g.querySelectorAll('.opt')].find(o => o.querySelector('.t').textContent === label).click();
        });
      }, plan.kind === 'gaps' ? plan.picks : plan.picks);
    }
    const btn = p.locator('#btn-check');
    if (await btn.isVisible() && (await btn.innerText()) === 'Prüfen') await btn.click();
    await p.waitForSelector('#q-verdict .verdict');
    const cls = await p.locator('#q-verdict .verdict').getAttribute('class');
    const move = await p.locator('#q-verdict .move').innerText();
    return { ok: cls.includes('ok'), move, kind: plan.kind, multi: plan.multi, armed: armed };
  }

  console.log('\n== Übersicht ==');
  ok(await p.locator('#tiles .tile').count() === 5, 'fünf Kacheln (Alle + 4 Bereiche)');
  ok((await p.locator('#tiles .tile').nth(1).innerText()).includes('344'), 'KV zeigt 344 Fragen');
  ok(await p.locator('#tiles .tile').nth(2).isDisabled(), 'UV deaktiviert (nicht importiert)');
  const pcts = await p.locator('#boxes .pct').allInnerTexts();
  ok(JSON.stringify(pcts) === JSON.stringify(['100 %','0 %','0 %','0 %','0 %']),
     'Startverteilung 100/0/0/0/0 — bekommen: ' + pcts.join(' '));
  await p.screenshot({ path: SHOT + '01-home.png', fullPage: true });

  console.log('\n== Richtig beantworten steigt auf ==');
  await p.click('#btn-start');
  const kinds = {}; const armedBad = []; let good = 0, misses = 0;
  for (let i = 0; i < 40; i++) {
    const r = await answer(true);
    if (!r) { misses++; await p.click('#btn-check'); continue; }
    const k = r.kind + (r.multi ? '-multi' : '');
    if (!kinds[k]) { kinds[k] = 0; await p.screenshot({ path: SHOT + 'type-' + k + '.png', fullPage: true }); }
    kinds[k]++;
    if (r.ok) good++; else console.log('       ! als falsch gewertet trotz Musterlösung: ' + r.move);
    if (r.kind === 'gaps' && !r.armed.off) armedBad.push('Lücken: Prüfen war offen');
    if (r.kind === 'choice' && r.multi && !r.armed.off) armedBad.push('Mehrfachauswahl: Prüfen war offen');
    if (r.kind === 'choice' && !r.multi && !r.armed.hidden) armedBad.push('Einfachauswahl: Prüfen sichtbar');
    await p.click('#btn-check');
  }
  ok(misses === 0, 'jede Karte in den Daten wiedergefunden (' + misses + ' Ausreißer)');
  ok(good === 40 - misses, good + '/' + (40 - misses) + ' Musterlösungen wurden als richtig gewertet');
  console.log('       Typen: ' + Object.entries(kinds).map(([k,v]) => k+'×'+v).join(', '));
  ok(!(await p.locator('#q-tags .tag', { hasText: 'RICHTIGE ANTWORTEN' }).count()),
     'Anzahl der richtigen Antworten wird nicht verraten');
  ok(armedBad.length === 0, 'Prüfen-Knopf erst nach Auswahl aktiv' +
     (armedBad.length ? ': ' + [...new Set(armedBad)].join(' / ') : ''));

  const up = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('lk.progress.v1'));
    return Object.values(d).filter(v => v.b > 1).length;
  });
  ok(up > 0, up + ' Karten sind in ein höheres Fach aufgestiegen');

  console.log('\n== Falsch beantworten fällt zurück ==');
  let fell = 0, wronglyOk = 0;
  for (let i = 0; i < 25; i++) {
    const before = await p.evaluate(() => window.__box = (function () {
      const t = [...document.querySelectorAll('#q-tags .tag')].find(x => /^FACH /i.test(x.textContent));
      return parseInt(t.textContent.replace(/\D/g, ''), 10);
    })());
    const r = await answer(false);
    if (!r) { await p.click('#btn-check'); continue; }
    if (r.ok) wronglyOk++;
    else if (before > 1 && /Fach \d+ → Fach 1$/.test(r.move)) fell++;
    else if (before === 1 && /Bleibt in Fach 1/.test(r.move)) fell++;
    await p.click('#btn-check');
  }
  ok(wronglyOk === 0, 'keine falsche Antwort wurde als richtig gewertet');
  ok(fell >= 20, fell + '/25 falsche Antworten landeten in Fach 1');
  ok(await p.locator('#pct .cell').count() === 5, 'fünf Fächer-Balken bleiben während der Frage sichtbar');
  const fills = await p.evaluate(() => [...document.querySelectorAll('#pct .cell')].map(c => ({
    breite: c.querySelector('.fill').style.width,
    wert: c.querySelector('.val').textContent
  })));
  ok(fills.every(f => f.breite.replace(' ', '').startsWith(parseInt(f.wert, 10) === 0 ? '0' : '')),
     'Füllung passt zum Prozentwert');
  console.log('       Balken: ' + fills.map(f => f.wert.replace(/\s/g, '')).join(' '));

  await p.click('#btn-home');
  const p2 = await p.locator('#boxes .pct').allInnerTexts();
  ok(p2[0] !== '100 %', 'Übersicht zeigt die neue Verteilung: ' + p2.join(' '));
  const sum = p2.reduce((a, s) => a + parseInt(s, 10), 0);
  ok(sum >= 98 && sum <= 102, 'Prozente ergeben rund 100 (' + sum + ')');
  await p.screenshot({ path: SHOT + '02-home-progress.png', fullPage: true });

  console.log('\n== Persistenz ==');
  await p.reload();
  ok(JSON.stringify(p2) === JSON.stringify(await p.locator('#boxes .pct').allInnerTexts()),
     'Verteilung überlebt den Neustart');

  console.log('\n== Themenbereich erst nach dem Prüfen ==');
  await p.locator('#tiles .tile').first().click();      // "Alle" = gemischt
  await p.click('#btn-start');
  // Das Etikett steckt im DOM, ist aber ausgeblendet - auf Sichtbarkeit prüfen.
  ok(!(await p.locator('#q-tags .tag').first().isVisible()),
     'gemischt: Bereich ist vor dem Antworten verdeckt');
  await answer(true);
  ok((await p.locator('#q-tags .tag').first().innerText()) === 'KV',
     'nach dem Prüfen steht der Bereich da');
  await p.click('#btn-check');
  await p.click('#btn-home');
  await p.locator('#tiles .tile').nth(1).click();       // nur KV
  await p.click('#btn-start');
  ok((await p.locator('#q-tags .tag').first().innerText()) === 'KV',
     'einzelne Kartei: Bereich steht von Anfang an da');
  await p.click('#btn-home');
  await p.locator('#tiles .tile').first().click();

  console.log('\n== Fachfilter ==');
  await p.locator('#boxes .boxrow').nth(1).click();
  const label = await p.locator('#btn-start').innerText();
  ok(/Lernen starten · \d+/.test(label), 'Fach 2 gefiltert: "' + label + '"');
  await p.click('#btn-start');
  ok((await p.locator('#q-tags .tag.hi').innerText()).toUpperCase() === 'FACH 2',
     'gezeigte Karte kommt aus Fach 2');
  await p.click('#btn-home');
  await p.locator('#boxes .boxrow').nth(1).click();

  console.log('\n== Tastatur ==');
  await p.click('#btn-start');
  // zu einer Einfachauswahl blättern (dort wertet ein Tastendruck sofort)
  for (let i = 0; i < 60; i++) {
    const single = await p.evaluate(() =>
      document.getElementById('btn-check').classList.contains('hide'));
    if (single) break;
    const r = await answer(false);
    if (!r) { await p.click('#btn-check'); continue; }
    await p.click('#btn-check');
  }
  const before = await p.locator('#q-body .opt').first().innerText();
  ok((await p.locator('#q-body .opt .k').allInnerTexts()).slice(0, 10).join('') === '123456789Q'.slice(0, await p.locator('#q-body .opt').count()),
     'Knöpfe sind mit 1,2,3 … beschriftet: ' + (await p.locator('#q-body .opt .k').allInnerTexts()).join(''));
  await p.keyboard.press('1');
  await p.waitForSelector('#q-verdict .verdict', { timeout: 3000 });
  const picked = await p.locator('#q-body .opt[aria-pressed="true"] .t').innerText();
  ok(before.includes(picked), 'Taste 1 wählt die erste Antwort');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  ok(!(await p.locator('#q-verdict .verdict').count()), 'Enter blättert weiter');

  console.log('\n== Tastatur über mehrere Lücken ==');
  await p.click('#btn-home');
  await p.click('#btn-start');
  for (let i = 0; i < 200; i++) {
    const n = await p.locator('#q-body .blank').count();
    if (n >= 3) break;
    const r = await answer(false);
    if (!r) { await p.click('#btn-check'); continue; }
    await p.click('#btn-check');
  }
  const keys = await p.locator('#q-body .opt .k').allInnerTexts();
  ok(new Set(keys).size === keys.length,
     'jede Taste kommt nur einmal vor: ' + keys.join(' '));
  ok(keys.join('') === '123456789QWERTZUIOP'.slice(0, keys.length),
     'durchgehend nummeriert über alle Lücken: ' + keys.join(' '));
  // die Taste der letzten Lücke drücken
  const last = keys[keys.length - 1];
  await p.keyboard.press(last.toLowerCase());
  const gap = await p.evaluate(() => {
    const b = document.querySelector('#q-body .opt[aria-pressed="true"]');
    return b ? { blank: b.dataset.blank, text: b.querySelector('.t').textContent } : null;
  });
  ok(gap && gap.blank === String(await p.locator('#q-body .blank').count() - 1),
     'Taste "' + last + '" trifft die letzte Lücke: ' + JSON.stringify(gap));
  const marks = await p.locator('#q-text .gap').allInnerTexts();
  ok(marks.some(m => /[\u2460-\u2473]/.test(m)),
     'Lücken im Text sind eingekreist nummeriert: ' + marks.join(' '));

  console.log('\n== Verwaltung ==');
  await p.click('#btn-home');           // "Verwalten" ist beim Lernen ausgeblendet
  await p.click('#btn-manage');
  ok((await p.locator('#sets .item').innerText()).includes('344'), 'Fragensatz KV gelistet');
  await p.screenshot({ path: SHOT + '03-manage.png', fullPage: true });
  await p.click('[data-theme="dark"]');
  await p.click('#btn-home');
  await p.screenshot({ path: SHOT + '04-dark.png', fullPage: true });
  await p.click('#btn-start');
  await p.screenshot({ path: SHOT + '05-dark-question.png', fullPage: true });

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  await b.close();
  console.log(fails ? '\n>>> ' + fails + ' FEHLER' : '\n>>> alles grün');
  process.exit(fails ? 1 : 0);
})();
