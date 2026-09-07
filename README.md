# Lernkartei Sozialversicherung

Eine Lernkartei nach dem Leitner-Prinzip (fünf Fächer) für die Fragenboxen aus
Moodle — Themenbereiche **KV**, **UV**, **PV** und **RECHT**.

Die fertige App ist die einzelne Datei **`lernkartei.html`**. Sie läuft ohne
Server, ohne Internet und ohne Installation: Datei anklicken, fertig. Der
Lernfortschritt liegt im `localStorage` des Browsers.

## Benutzen

1. `lernkartei.html` herunterladen und im Browser öffnen (Doppelklick genügt).
2. Themenbereich wählen, **Lernen starten**.
3. Am Handy: die Datei z. B. in iCloud/Drive ablegen und von dort öffnen, oder
   im Browser als Lesezeichen bzw. „Zum Home-Bildschirm“ ablegen.

Mitgeliefert sind die **344 KV-Fragen**. UV, PV und RECHT importierst du selbst
(siehe unten) — dafür ist kein neuer Build nötig.

## Die fünf Fächer

Alles startet in Fach 1. Eine richtige Antwort hebt die Frage ein Fach höher,
eine falsche wirft sie zurück in Fach 1. Fach 5 heißt „sitzt“.

Fragen aus niedrigen Fächern kommen deutlich häufiger dran (Gewichtung
16 : 8 : 4 : 2 : 1), damit die Wackelkandidaten die Zeit bekommen.

Über jeder Frage steht die aktuelle Verteilung in Prozent — am Anfang
100 % in Fach 1, danach wandert das Band nach rechts.

## Weitere Fragen importieren

1. In Moodle den Test durchspielen und die Seite **„Überprüfung des
   Testversuchs“** öffnen — dort stehen alle Fragen samt Musterlösung.
2. Die Seite als vollständige HTML-Datei speichern (Strg + S bzw. Cmd + S).
3. In der App auf **Verwalten → HTML-Datei auswählen** und den Themenbereich
   bestätigen.

Alles passiert im Browser; es wird nichts hochgeladen. Ein erneuter Import
desselben Themenbereichs ersetzt den alten Satz — der Lernfortschritt bleibt
erhalten, solange die Fragen dieselben sind.

**Doppelte Fragen bleiben absichtlich erhalten.** Moodle zieht pro Versuch eine
andere Auswahl und Reihenfolge der Antworten, also sind das faktisch eigene
Karten.

### Unterstützte Fragetypen

| Moodle | in der Kartei |
|---|---|
| `answersselect`, `multichoice` | Einfach- und Mehrfachauswahl |
| `truefalse` | Wahr/Falsch |
| `shortanswer` | freie Eingabe (mehrere Schreibweisen zählen) |
| `gapselect` | Lückentext mit Auswahl je Lücke |
| `ddwtos` | Lückentext mit gemeinsamem Wortvorrat |
| `match` | Zuordnung |

## Sicherung

**Verwalten → Sicherung speichern** legt Fortschritt, importierte Fragensätze
und Einstellungen als JSON ab. Das ist der Weg auf ein anderes Gerät oder
zurück nach dem Leeren der Browserdaten.

## Entwicklung

```
npm install                                   # nur playwright, für die Tests
node src/build-data.js <seite.html> KV > data/kv.json   # Fragen auslesen
npm run build                                 # lernkartei.html bauen
npm test                                      # Browser-Tests
```

| Datei | Zweck |
|---|---|
| `src/parser.js` | liest eine Moodle-Seite; steckt auch in der App |
| `src/app.template.html` | Oberfläche und Lernlogik |
| `src/build-data.js` | führt den Parser in Chromium aus, schreibt `data/*.json` |
| `src/build.js` | fügt Vorlage + Parser + Fragen zu `lernkartei.html` |
| `test/*.test.js` | Playwright-Tests (Lernen, Import, Sicherung) |

Der Parser läuft bewusst im Browser statt in Node: die App muss ihn ohnehin
mitbringen, damit der Import ohne Server funktioniert — so gibt es nur eine
Fassung, die für beides gilt.

Den Import-Test braucht eine Quelldatei:
`QUIZ_HTML=/pfad/zur/seite.html node test/import.test.js`
