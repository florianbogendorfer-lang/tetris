/* ------------------------------------------------------------------
   Moodle-Quiz-Parser
   Liest eine gespeicherte Moodle-Seite ("Überprüfung des Testversuchs")
   und baut daraus Lernkarten.

   Wird an zwei Stellen verwendet:
     1. beim Build, um die mitgelieferten Fragen zu erzeugen
     2. in der App selbst, wenn weitere HTML-Dateien importiert werden
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var GAP_OPEN = '\uE000';
  var GAP_CLOSE = '\uE001';

  /* ---------- Textwerkzeuge ---------- */

  function norm(s) {
    return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Vergleichsform: Groß-/Kleinschreibung, Bindestrich-Varianten und
  // Satzzeichen am Rand egal. Moodle mischt normale Bindestriche mit
  // geschützten (U+2011), je nachdem wie die Frage erfasst wurde.
  function dashes(s) {
    return (s || '').replace(/[‐-―−]/g, '-').replace(/[‘’ʼ]/g, "'");
  }

  function key(s) {
    return dashes(norm(s))
      .toLowerCase()
      .replace(/^[\s.,;:!?"'‚‘’„“”()\[\]-]+/, '')
      .replace(/[\s.,;:!?"'‚‘’„“”()\[\]-]+$/, '');
  }

  var BLOCK = /^(P|DIV|LI|TR|TD|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|UL|OL|TABLE|SECTION|PRE)$/;

  /* Wandelt einen DOM-Knoten in Text um. Zeilenumbrüche der Vorlage
     bleiben erhalten, `skip` blendet Knoten aus (Icons, sr-only ...),
     `mark` ersetzt einen Knoten durch einen Lücken-Platzhalter.        */
  function blockText(node, opts) {
    opts = opts || {};
    var skip = opts.skip || function () { return false; };
    var mark = opts.mark || function () { return null; };
    var out = [];

    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\u00A0/g, ' ')); return; }
      if (n.nodeType !== 1) return;
      var marked = mark(n);
      if (marked !== null && marked !== undefined) { out.push(marked); return; }
      if (skip(n)) return;
      var tag = n.tagName;
      if (tag === 'BR') { out.push('\n'); return; }
      var block = BLOCK.test(tag);
      if (block) out.push('\n');
      for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
      if (block) out.push('\n');
    })(node);

    return out.join('')
      .replace(/[ \t\u00A0]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function isNoise(n) {
    var cls = typeof n.className === 'string' ? n.className : '';
    if (n.tagName === 'I' && /\bicon\b/.test(cls)) return true;
    return /\b(accesshide|sr-only|questionflag|answernumber)\b/.test(cls);
  }

  function txt(el) { return el ? blockText(el, { skip: isNoise }) : ''; }

  function hasClass(el, name) {
    var cls = el && typeof el.className === 'string' ? el.className : '';
    return (' ' + cls + ' ').indexOf(' ' + name + ' ') >= 0;
  }

  /* ---------- Musterlösung ---------- */

  var PREFIX = /^\s*Die\s+richtige(?:n|r)?\s+Antwort(?:en)?\s+(?:ist|sind|lautet|lauten|lautete)\s*:?\s*/i;

  function rightAnswerNode(el) { return el.querySelector('.rightanswer'); }

  function rightAnswerText(el) {
    var n = rightAnswerNode(el);
    return n ? txt(n).replace(PREFIX, '').trim() : '';
  }

  /* Sucht die Optionen der Musterlösung: längste zuerst, damit
     "Krankengeld" nicht in "Krankengeld ohne Zusatzversicherung" trifft. */
  function matchOptions(solution, options) {
    var hay = ' ' + key(solution) + ' ';
    var order = options
      .map(function (o, i) { return { i: i, k: key(o) }; })
      .filter(function (o) { return o.k.length > 0; })
      .sort(function (a, b) { return b.k.length - a.k.length; });

    var hits = [];
    order.forEach(function (o) {
      var pos = hay.indexOf(o.k);
      if (pos < 0) return;
      hits.push(o.i);
      hay = hay.slice(0, pos) + new Array(o.k.length + 1).join(' ') + hay.slice(pos + o.k.length);
    });
    return hits.sort(function (a, b) { return a - b; });
  }

  /* Werte in eckigen Klammern aus der Musterlösung, in Reihenfolge. */
  function bracketAnswers(el) {
    var n = rightAnswerNode(el);
    if (!n) return [];
    var t = txt(n).replace(PREFIX, '');
    var res = [], m, re = /\[([^\[\]]*)\]/g;
    while ((m = re.exec(t)) !== null) res.push(norm(m[1]));
    return res;
  }

  /* Rastet eine Antwort aus der Musterloesung auf den exakten Wortlaut
     der passenden Option ein, damit answer immer in options vorkommt. */
  function snap(answer, options) {
    if (!answer) return null;
    var k = key(answer);
    for (var i = 0; i < options.length; i++) if (key(options[i]) === k) return options[i];
    return answer;
  }

  /* ---------- Fragetypen ---------- */

  function readChoices(el) {
    var rows = el.querySelectorAll('.answer > div');
    var options = [], picked = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var label = row.querySelector('[data-region="answer-label"]') || row.querySelector('label');
      options.push(txt(label || row));
      var input = row.querySelector('input');
      picked.push(!!(input && input.checked) && hasClass(row, 'correct'));
    }
    return { options: options, picked: picked };
  }

  function parseChoice(el, type) {
    var read = readChoices(el);
    var options = read.options;
    if (!options.length) return null;

    var correct = matchOptions(rightAnswerText(el), options);

    if (type === 'truefalse') {
      // "Die richtige Antwort ist 'Falsch'."
      var m = txt(rightAnswerNode(el))
        .match(/['‚‘’"„“”]([^'‚‘’"„“”]+)['‚‘’"„“”]/);
      if (m) {
        var wanted = key(m[1]);
        for (var j = 0; j < options.length; j++) {
          if (key(options[j]) === wanted) { correct = [j]; break; }
        }
      }
    }

    // Notnagel: wurde die Frage richtig beantwortet, ist die eigene
    // Auswahl auch die Musterlösung.
    if (!correct.length && hasClass(el, 'correct')) {
      read.picked.forEach(function (p, i) { if (p) correct.push(i); });
    }
    if (!correct.length) return null;

    return { kind: 'choice', text: txt(el.querySelector('.qtext')), options: options, correct: correct };
  }

  function parseShortAnswer(el) {
    var solution = rightAnswerText(el);
    if (!solution) return null;

    // "Beitragsgrundlage oder Beitragssatz" und "LGHF/LGF" nennen mehrere
    // gültige Antworten. Die ungeteilte Fassung bleibt ebenfalls gültig.
    var accepted = [solution];
    solution.split(/\s+oder\s+|\s*\/\s*/i).forEach(function (part) {
      part = norm(part);
      if (part && accepted.indexOf(part) < 0) accepted.push(part);
    });

    // Manche Fragen haben das Eingabefeld mitten im Satz stehen - ohne
    // Platzhalter fehlt im Fragetext sonst ein Wort.
    var qtext = el.querySelector('.qtext');
    var text = qtext ? blockText(qtext, {
      skip: isNoise,
      mark: function (node) {
        return node.tagName === 'INPUT' && node.type === 'text' ? ' _____ ' : null;
      }
    }) : '';

    return { kind: 'text', text: text, solution: solution, accepted: accepted };
  }

  function readSelect(sel) {
    var options = [], chosen = null;
    var opts = sel.querySelectorAll('option');
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      if (!o.value || o.value === '0') continue;
      var t = norm(o.textContent);
      if (!t) continue;
      options.push(t);
      if (o.selected) chosen = t;
    }
    return { options: options, chosen: chosen };
  }

  /* gapselect: Auswahlfelder mitten im Text */
  function parseGapSelect(el) {
    var qtext = el.querySelector('.qtext');
    if (!qtext) return null;
    var selects = [], n = 0;

    var text = blockText(qtext, {
      skip: isNoise,
      mark: function (node) {
        var sel = node.tagName === 'SELECT' ? node
                : (hasClass(node, 'control') ? node.querySelector('select') : null);
        if (!sel) return null;
        selects.push(sel);
        return ' ' + GAP_OPEN + (++n) + GAP_CLOSE + ' ';
      }
    });
    if (!selects.length) return null;

    var solutions = bracketAnswers(el);
    var blanks = selects.map(function (sel, i) {
      var read = readSelect(sel);
      var answer = solutions[i] || null;
      if (!answer && read.chosen && hasClass(sel, 'correct')) answer = read.chosen;
      return { label: null, options: read.options, answer: snap(answer, read.options) };
    });
    if (blanks.some(function (b) { return !b.answer || !b.options.length; })) return null;

    return { kind: 'gaps', text: text, blanks: blanks };
  }

  function groupOf(node) {
    var cls = node && typeof node.className === 'string' ? node.className : '';
    var m = cls.match(/\bgroup(\d+)\b/);
    return m ? m[1] : '1';
  }

  /* ddwtos: Begriffe in Lücken ziehen. Die Begriffe sind in Gruppen
     eingeteilt — eine Lücke nimmt nur Wörter ihrer eigenen Gruppe.
     Gruppen, zu denen keine Lücke gehört, bleiben außen vor. */
  function parseDragText(el) {
    var qtext = el.querySelector('.qtext');
    if (!qtext) return null;
    var groups = [];

    var text = blockText(qtext, {
      skip: isNoise,
      mark: function (node) {
        if (!hasClass(node, 'drop')) return null;
        groups.push(groupOf(node));
        return ' ' + GAP_OPEN + groups.length + GAP_CLOSE + ' ';
      }
    });
    if (!groups.length) return null;

    var pools = {};
    var homes = el.querySelectorAll('.answercontainer .draghome');
    for (var i = 0; i < homes.length; i++) {
      var g = groupOf(homes[i]), t = txt(homes[i]);
      if (!t) continue;
      var pool = pools[g] || (pools[g] = []);
      if (pool.indexOf(t) < 0) pool.push(t);
    }

    var solutions = bracketAnswers(el);
    if (solutions.length !== groups.length) return null;

    var blanks = groups.map(function (g, i) {
      var options = pools[g] || [];
      return { label: null, options: options, answer: snap(solutions[i], options) };
    });
    if (blanks.some(function (b) {
      return !b.answer || !b.options.length || b.options.indexOf(b.answer) < 0;
    })) return null;

    return { kind: 'gaps', text: text, blanks: blanks };
  }

  /* match: Zuordnungstabelle */
  function parseMatch(el) {
    var rows = el.querySelectorAll('table.answer tr');
    if (!rows.length) return null;

    // "links -> rechts" aus der Musterlösung einsammeln
    var pairs = [];
    txt(rightAnswerNode(el)).replace(PREFIX, '').split(/\n+/).forEach(function (line) {
      line.split(/,(?=[^,]*→)/).forEach(function (part) {
        var bits = part.split('→');
        if (bits.length === 2) pairs.push({ l: key(bits[0]), r: norm(bits[1].replace(/,\s*$/, '')) });
      });
    });

    var blanks = [];
    for (var i = 0; i < rows.length; i++) {
      var label = txt(rows[i].querySelector('td.text'));
      var sel = rows[i].querySelector('select');
      if (!sel || !label) continue;

      var read = readSelect(sel);
      var answer = null;
      for (var p = 0; p < pairs.length; p++) {
        if (pairs[p].l === key(label)) { answer = pairs[p].r; break; }
      }
      if (!answer && read.chosen && hasClass(rows[i].querySelector('td.control'), 'correct')) {
        answer = read.chosen;
      }
      blanks.push({ label: label, options: read.options, answer: snap(answer, read.options) });
    }
    if (!blanks.length || blanks.some(function (b) { return !b.answer || !b.options.length; })) return null;

    return { kind: 'gaps', text: txt(el.querySelector('.qtext')), blanks: blanks };
  }

  /* ---------- Kennung ---------- */

  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2654435761) >>> 0;
    }
    return (h1.toString(36) + h2.toString(36)).slice(0, 12);
  }

  /* Vergleichsabdruck einer Karte: gleiche Frage, gleiche Antworten,
     unabhängig davon, wie Moodle sie diesmal gemischt hat. */
  function fingerprint(cat, card) {
    var parts = [cat, card.kind, key(card.text)];
    if (card.kind === 'choice') {
      parts.push(card.options.map(key).sort().join('~'));
      parts.push(card.correct.map(function (i) { return key(card.options[i]); }).sort().join('~'));
    } else if (card.kind === 'gaps') {
      card.blanks.forEach(function (b) {
        parts.push(key(b.label || '') + '>' + key(b.answer) + '<' + b.options.map(key).sort().join('~'));
      });
    } else {
      parts.push(key(card.solution));
    }
    return parts.join('|');
  }

  /* ---------- Kategorie aus dem Seitentitel ---------- */

  var CATEGORIES = ['KV', 'UV', 'PV', 'RECHT'];

  function guessCategory(doc) {
    var head = doc.querySelector('h1') || doc.querySelector('.page-header-headings');
    var up = ((doc.title || '') + ' ' + txt(head)).toUpperCase();
    if (/\bRECHT\b/.test(up)) return 'RECHT';
    var m = up.match(/\b(KV|UV|PV)\b/);
    return m ? m[1] : null;
  }

  /* ---------- Einstiegspunkt ---------- */

  var TYPES = ['answersselect', 'multichoice', 'truefalse', 'shortanswer',
               'gapselect', 'ddwtos', 'match'];

  function parse(doc, category) {
    var cat = category || guessCategory(doc) || 'KV';
    var cards = [], failed = [], seen = {};
    var nodes = doc.querySelectorAll('div.que');

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var cls = ' ' + el.className + ' ';
      var type = TYPES.filter(function (t) { return cls.indexOf(' ' + t + ' ') >= 0; })[0];

      var card = null;
      try {
        if (type === 'answersselect' || type === 'multichoice' || type === 'truefalse') {
          card = parseChoice(el, type);
        } else if (type === 'shortanswer') { card = parseShortAnswer(el); }
        else if (type === 'gapselect')     { card = parseGapSelect(el); }
        else if (type === 'ddwtos')        { card = parseDragText(el); }
        else if (type === 'match')         { card = parseMatch(el); }
      } catch (e) { card = null; }

      if (!card || !card.text) {
        failed.push({ nr: norm(txt(el.querySelector('.qno'))), type: type || '?',
                      text: txt(el.querySelector('.qtext')).slice(0, 140) });
        continue;
      }

      card.cat = cat;
      card.src = type;
      // Doppelte Fragen bleiben absichtlich erhalten und bekommen eine
      // eigene Kennung. Die Kennung ignoriert die Reihenfolge der Antworten,
      // damit ein späterer Export derselben Fragen den Lernfortschritt behält.
      var base = hash(fingerprint(cat, card));
      seen[base] = (seen[base] || 0) + 1;
      card.id = base + (seen[base] > 1 ? '-' + seen[base] : '');
      cards.push(card);
    }

    return { cards: cards, failed: failed, category: cat, total: nodes.length };
  }

  var api = { parse: parse, guessCategory: guessCategory, CATEGORIES: CATEGORIES,
              GAP_OPEN: GAP_OPEN, GAP_CLOSE: GAP_CLOSE };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MoodleParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
