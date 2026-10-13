/* Bringt einen Fragensatz auf den vollen Antwortvorrat.

   Moodle zeigt je Frage nur eine Stichprobe aus ihrem Antwortvorrat - mal
   fuenf von zwoelf Moeglichkeiten, mal andere fuenf. Wer dieselbe Frage
   mehrfach vor sich hat, sei es als Dublette in einer Box oder in einem
   zweiten gespeicherten Durchgang, hat damit Antworten in der Hand, die ein
   einzelnes Vorkommen gar nicht zeigt.

   Die Kennungen der bleibenden Karten aendern sich nicht, damit der
   Lernfortschritt erhalten bleibt; sie passen danach nicht mehr zum Inhalt,
   was nichts macht, weil sie nur als Schluessel dienen.

   Aufruf: node src/merge-data.js <ziel.json> [--dubletten] [durchgang.html ...]
     --dubletten   Karten derselben Frage zu einer zusammenlegen
     durchgang.html  weiterer gespeicherter Durchgang derselben Box */
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
  const argv = process.argv.slice(2);
  const dubletten = argv.includes('--dubletten');
  const [ziel, ...quellen] = argv.filter(a => a !== '--dubletten');
  if (!ziel || (!quellen.length && !dubletten)) {
    console.error('Aufruf: node src/merge-data.js <ziel.json> [--dubletten] [durchgang.html ...]');
    process.exit(1);
  }

  const satz = JSON.parse(fs.readFileSync(ziel, 'utf8'));
  console.error(`Ziel       : ${ziel} (${satz.cards.length} Karten, ${satz.category})`);

  /* Vorrat aufbauen: Kennung -> Fach -> Antworttext -> {roh, status}.
     Die vorhandenen Karten kommen mit hinein, damit ein Widerspruch auch dann
     auffaellt, wenn er zwischen zwei Karten derselben Datei steckt. */
  const vorrat = new Map();
  const luecken = new Map();     // Kennung -> gesehene Lueckenzahlen
  const einlesen = cards => {
    for (const c of cards) {
      const k = kennung(c);
      if (c.kind === 'gaps') {
        if (!luecken.has(k)) luecken.set(k, new Set());
        luecken.get(k).add(c.blanks.length);
      }
      if (!vorrat.has(k)) vorrat.set(k, new Map());
      const faecherMap = vorrat.get(k);
      for (const { fach, opts } of faecher(c)) {
        if (!faecherMap.has(fach)) faecherMap.set(fach, new Map());
        const m = faecherMap.get(fach);
        for (const [roh, ok] of opts) {
          const t = norm(roh);
          if (!m.has(t)) m.set(t, { roh, status: new Set() });
          m.get(t).status.add(ok);
        }
      }
    }
  };
  einlesen(satz.cards);

  for (const q of quellen) {
    const res = await lies(q);
    console.error(`Durchgang  : ${path.basename(q)} — ${res.cards.length} Karten, ` +
                  `${res.failed.length} Fehlschlag`);
    res.failed.forEach(f => console.error(`  ! Nr ${f.nr} [${f.type}] ${f.text}`));
    const unbekannt = res.cards.filter(c => !vorrat.has(kennung(c)));
    if (unbekannt.length) {
      console.error(`  ! ${unbekannt.length} Frage(n) ohne Gegenstück im Ziel — werden übergangen:`);
      unbekannt.slice(0, 5).forEach(c => console.error('    ' + norm(c.text).slice(0, 100)));
    }
    einlesen(res.cards.filter(c => vorrat.has(kennung(c))));
  }

  /* Fragen, bei denen dieselbe Antwort einmal richtig und einmal falsch ist,
     bleiben unangetastet: dort steckt ein Irrtum, und raten hilft niemandem.
     Dasselbe gilt bei ungleicher Lueckenzahl - dann ist es trotz gleichen
     Wortlauts nicht dieselbe Frage. */
  const strittig = new Set();
  for (const [k, faecherMap] of vorrat)
    for (const [, m] of faecherMap)
      for (const [, v] of m) if (v.status.size > 1) strittig.add(k);
  for (const [k, n] of luecken) if (n.size > 1) strittig.add(k);
  if (strittig.size) {
    console.error(`\n! ${strittig.size} Frage(n) mit widersprüchlichen Antworten — unverändert gelassen:`);
    for (const k of strittig) console.error('  ' + k.split('␟')[1].slice(0, 110));
  }

  /* Zusammenlegen. Die vorhandene Reihenfolge bleibt vorne, Neues haengt
     hinten an - die App mischt beim Üben ohnehin selbst. */
  let ergaenzt = 0, neueOpts = 0, gefallen = 0;
  const bericht = [];
  const erste = new Map();        // Kennung -> Karte, die bleibt
  const behalten = [];

  for (const c of satz.cards) {
    const k = kennung(c);
    if (strittig.has(k)) { behalten.push(c); continue; }
    if (dubletten && erste.has(k)) { gefallen++; continue; }   // Dublette faellt weg
    erste.set(k, c);
    behalten.push(c);

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

    if (dazu) { ergaenzt++; neueOpts += dazu; bericht.push([dazu, norm(c.text).slice(0, 90)]); }
  }

  satz.cards = behalten;
  fs.writeFileSync(ziel, JSON.stringify(satz, null, 1));

  if (dubletten) console.error(`\n${gefallen} Dublette(n) zusammengelegt, ${behalten.length} Karten bleiben.`);
  console.error(`${ergaenzt} Karte(n) ergänzt, ${neueOpts} neue Antwortmöglichkeit(en):`);
  bericht.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(([n, t]) => console.error(`  +${n}  ${t}`));
  if (bericht.length > 25) console.error(`  … und ${bericht.length - 25} weitere`);
})();
