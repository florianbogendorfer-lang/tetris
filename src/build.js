/* Baut aus Vorlage + Parser + Fragen die eine fertige HTML-Datei.
   Aufruf: node src/build.js [ziel.html] */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'lernkartei.html');

const template = fs.readFileSync(path.join(__dirname, 'app.template.html'), 'utf8');
const parser = fs.readFileSync(path.join(__dirname, 'parser.js'), 'utf8');

// Alle data/*.json einsammeln, die build-data.js erzeugt hat.
const dir = path.join(root, 'data');
const cards = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  cards.push(...set.cards);
  console.log(`  ${f}: ${set.cards.length} Karten (${set.category})`);
}

/* Die Kennungen werden beim Auslesen nur je Datei eindeutig gemacht. Ein
   Themenbereich besteht aber aus mehreren Fragenboxen, und dieselbe Frage
   kann in zweien stehen - dann teilten sich zwei Karten eine Kennung und
   damit ihren Lernfortschritt. Hier wird über alle Dateien hinweg
   nachgezaehlt; die Reihenfolge ist durch die sortierten Dateinamen fest. */
const gesehen = Object.create(null);
let umbenannt = 0;
for (const c of cards) {
  const basis = c.id.replace(/-\d+$/, '');
  gesehen[basis] = (gesehen[basis] || 0) + 1;
  const neu = basis + (gesehen[basis] > 1 ? '-' + gesehen[basis] : '');
  if (neu !== c.id) umbenannt++;
  c.id = neu;
}
if (umbenannt) console.log(`  ${umbenannt} doppelte Kennungen durchnummeriert`);

// "</script>" im JSON würde den Block vorzeitig schließen.
const json = JSON.stringify({ cards }).replace(/</g, '\\u003c');

fs.writeFileSync(out, template
  .replace('/*__PARSER__*/', () => parser)
  .replace('/*__DATA__*/', () => json));

console.log(`\n${path.relative(root, out)}: ${cards.length} Karten, ` +
            `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
