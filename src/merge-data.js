/* Spielt weitere Durchgaenge derselben Fragenbox in einen vorhandenen
   Fragensatz ein.

   Moodle zeigt je Durchgang nur eine Stichprobe aus dem Antwortvorrat einer
   Frage - mal sieben von neun Moeglichkeiten, mal andere sieben. Wer einen
   zweiten Durchgang derselben Box speichert, hat daher Antworten in der Hand,
   die im ersten gar nicht auftauchten. Dieses Werkzeug legt sie zusammen.

   Die Kennungen der vorhandenen Karten bleiben, damit der Lernfortschritt
   nicht verlorengeht; sie passen danach nicht mehr zum Inhalt, was nichts
   macht, weil sie nur als Schluessel dienen.

   Aufruf: node src/merge-data.js <ziel.json> <durchgang.html> [...] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const norm = s => String(s == null ? '' : s)
  .replace(/[]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/* Woran eine Frage wiederzuerkennen ist. Bei Zuordnungsfragen wuerfelt Moodle
   auch die Zeilen durch und zwei verschiedene Fragen koennen denselben
   Vorspann haben - dort gehoeren die Zeilenbeschriftungen zur Kennung. */
const beschriftet = c => c.kind === 'gaps' && c.blanks.every(b => b.label);
function kennung(c) {
  const t = c.kind + '␟' + norm(c.text);
  return beschriftet(c) ? t + '␟' + c.blanks.map(b => norm(b.label)).sort().join('␞') : t;
}

/* Eine Frage wird auf Faecher heruntergebrochen: die Auswahlfrage selbst hat
   eines, ein Lueckentext eines je Luecke. Innerhalb eines Faches wird jede
   Antwortmoeglichkeit als richtig oder falsch vermerkt. */
function faecher(c) {
  if (c.kind === 'choice') {
    const r = new Set(c.correct);
    return [{ fach: '', opts: c.options.map((o, i) => [o, r.has(i)]) }];
  }
  if (c.kind === 'gaps') {
    const mitLabel = beschriftet(c);
    return c.blanks.map((b, i) => ({
      fach: mitLabel ? norm(b.label) : 'nr' + i,
      opts: b.options.map(o => [o, norm(o) === norm(b.answer)])
    }));
  }
  return [{ fach: '', opts: c.accepted.map(a => [a, true]) }];
}

async function lies(datei) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await page.goto('file://' + path.resolve(datei), { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(__dirname, 'parser.js') });
  const res = await page.evaluate(() => window.MoodleParser.parse(document, null));
  await browser.close();
  return res;
}

(async () => {
  const ziel = process.argv[2];
  const quellen = process.argv.slice(3);
  if (!ziel || !quellen.length) {
    console.error('Aufruf: node src/merge-data.js <ziel.json> <durchgang.html> [...]');
    process.exit(1);
  }

  const satz = JSON.parse(fs.readFileSync(ziel, 'utf8'));
  console.error(`Ziel       : ${ziel} (${satz.cards.length} Karten, ${satz.category})`);

  /* Vorrat aufbauen: Kennung -> Fach -> Antworttext -> {roh, status}.
     Die vorhandenen Karten kommen mit hinein, damit ein Widerspruch auch dann
     auffaellt, wenn er zwischen zwei Karten derselben Datei steckt. */
  const vorrat = new Map();
  const einlesen = (cards, woher) => {
    for (const c of cards) {
      const k = kennung(c);
      if (!vorrat.has(k)) vorrat.set(k, new Map());
      const faecherMap = vorrat.get(k);
      for (const { fach, opts } of faecher(c)) {
        if (!faecherMap.has(fach)) faecherMap.set(fach, new Map());
        const m = faecherMap.get(fach);
        for (const [roh, ok] of opts) {
          const t = norm(roh);
          if (!m.has(t)) m.set(t, { roh, status: new Set(), woher: new Set() });
          m.get(t).status.add(ok);
          m.get(t).woher.add(woher);
        }
      }
    }
  };
  einlesen(satz.cards, ziel);

  for (const q of quellen) {
    const res = await lies(q);
    console.error(`Durchgang  : ${path.basename(q)} — ${res.cards.length} Karten, ` +
                  `${res.failed.length} Fehlschlag`);
    res.failed.forEach(f => console.error(`  ! Nr ${f.nr} [${f.type}] ${f.text}`));
    const unbekannt = res.cards.filter(c => !vorrat.has(kennung(c)));
    if (unbekannt.length) {
      console.error(`  ! ${unbekannt.length} Frage(n) ohne Gegenstueck im Ziel — werden übergangen:`);
      unbekannt.slice(0, 5).forEach(c => console.error('    ' + norm(c.text).slice(0, 100)));
    }
    einlesen(res.cards.filter(c => vorrat.has(kennung(c))), q);
  }

  /* Fragen, bei denen dieselbe Antwort einmal richtig und einmal falsch ist,
     bleiben unangetastet: dort steckt ein Irrtum, und raten hilft niemandem. */
  const strittig = new Set();
  for (const [k, faecherMap] of vorrat)
    for (const [, m] of faecherMap)
      for (const [, v] of m) if (v.status.size > 1) strittig.add(k);
  if (strittig.size) {
    console.error(`\n! ${strittig.size} Frage(n) mit widersprüchlichen Antworten — unverändert gelassen:`);
    for (const k of strittig) console.error('  ' + k.split('␟')[1].slice(0, 110));
  }

  /* Zusammenlegen. Die vorhandene Reihenfolge bleibt vorne, Neues haengt
     hinten an - die App mischt beim Üben ohnehin selbst. */
  let karten = 0, neueOpts = 0;
  const bericht = [];
  for (const c of satz.cards) {
    const k = kennung(c);
    if (strittig.has(k)) continue;
    const faecherMap = vorrat.get(k);
    let dazu = 0;

    const ergaenze = (vorhandene, fach) => {
      const m = faecherMap.get(fach);
      if (!m) return [];
      const da = new Set(vorhandene.map(norm));
      const neu = [...m.values()].filter(v => !da.has(norm(v.roh)));
      dazu += neu.length;
      return neu;
    };

    if (c.kind === 'choice') {
      const neu = ergaenze(c.options, '');
      const richtig = new Set(c.correct.map(i => norm(c.options[i])));
      neu.forEach(v => { if ([...v.status][0]) richtig.add(norm(v.roh)); });
      c.options = c.options.concat(neu.map(v => v.roh));
      c.correct = c.options.map((o, i) => [o, i]).filter(([o]) => richtig.has(norm(o))).map(([, i]) => i);
    } else if (c.kind === 'gaps') {
      const mitLabel = beschriftet(c);
      c.blanks.forEach((b, i) => {
        const neu = ergaenze(b.options, mitLabel ? norm(b.label) : 'nr' + i);
        b.options = b.options.concat(neu.map(v => v.roh));
      });
    } else {
      const neu = ergaenze(c.accepted, '');
      c.accepted = c.accepted.concat(neu.map(v => v.roh));
    }

    if (dazu) { karten++; neueOpts += dazu; bericht.push([dazu, norm(c.text).slice(0, 90)]); }
  }

  fs.writeFileSync(ziel, JSON.stringify(satz, null, 1));
  console.error(`\n${karten} Karte(n) ergänzt, ${neueOpts} neue Antwortmöglichkeit(en):`);
  bericht.sort((a, b) => b[0] - a[0]).forEach(([n, t]) => console.error(`  +${n}  ${t}`));
})();
