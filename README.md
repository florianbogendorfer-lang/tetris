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

Die fünf Fächer haben feste Farben: **rot – orange – gelb – hellgrün – grün**.
Über jeder Frage stehen sie als fünf Balken; jeder ist so weit in seiner Farbe
gefüllt, wie viele Fragen gerade darin liegen, der Rest bleibt blass in
derselben Farbe. Am Anfang ist Fach 1 voll rot und der Rest leer — mit der Zeit
läuft die Farbe nach rechts ins Grüne.

In der Übersicht steht darüber der **Gesamtfortschritt** als eine Zahl: Fach 1
zählt nichts, Fach 5 zählt voll, also 0 % am Anfang und 100 %, wenn alles sitzt.

## Gemischt oder einzeln üben

Voreingestellt ist **Alle** — alle Themenbereiche durcheinander. Das ist der
bessere Weg: KV, UV, PV und RECHT sind sich ähnlich, und in der Prüfung kommen
sie gemischt. Übt man blockweise, weiß man vorher schon, aus welcher Ecke die
Antwort kommt, und trainiert das Einordnen nie mit.

Deshalb steht der Themenbereich beim gemischten Üben **erst nach dem Prüfen**
über der Frage — vorher wäre er die halbe Antwort. Übt man eine einzelne
Kartei, steht er von Anfang an da.

Blockweise lohnt sich trotzdem für frischen Stoff: einmal allein durch, dann
zurück ins Gemischte.

## Prognose

Die **Prognose** ist die Trefferquote der letzten 30 beantworteten Fragen —
sind es weniger, wird aus den vorhandenen gerechnet. Der schlichte Quotient,
damit die Zahl von Hand nachzurechnen ist. Sie steht in der Übersicht neben dem
Gesamtfortschritt und beim Lernen in der Kopfzeile.

Sie rechnet über Sitzungen hinweg — die 30 Antworten sind nicht die dieser
Sitzung, sondern die letzten 30 überhaupt.

Dass die Prognose oft mehrere Antworten lang auf demselben Wert steht, liegt am
Fenster: fällt hinten dieselbe Antwort heraus, die vorne hereinkommt, ändert
sich nichts.

Die beiden Zahlen messen Verschiedenes: der Gesamtfortschritt den Bestand in
den Fächern (träge, wächst über Wochen), die Prognose die letzten 30 Antworten
(reagiert sofort).

Daneben zeichnet ein Liniendiagramm den Verlauf: auf der x-Achse die laufende
Nummer der beantworteten Frage, auf der y-Achse die Prognose von 0 bis 100 %.
Gezeigt werden die letzten 30 Werte, dieselben 30 Antworten, aus denen die
Prognose gerechnet wird. Ab zwei beantworteten Fragen ist eine Linie da.

Die gestrichelte Waagrechte ist die Ziellinie bei 80 %. Die Linie ist
**grün, wo sie darüber liegt, und rot darunter** — der Wechsel sitzt genau im
Schnittpunkt, nicht erst am nächsten Datenpunkt. Dafür wird sie zweimal
gezeichnet und jeweils an der Ziellinie beschnitten.

Darunter steht ein **Kästchen je Antwort** — grün richtig, rot falsch, in
derselben Breite und Reihenfolge wie das Diagramm. Ein Ausschlag der Linie
gehört so sichtbar zu einem roten Kästchen.

Verlauf und Kästchen liegen im `localStorage` und überstehen den Neustart.

## Bedienung

Antippen wählt aus, nochmal antippen nimmt zurück, **Prüfen** wertet. Das gilt
für jede Auswahlfrage, auch wenn nur eine Antwort stimmt: sonst würde die
Bedienung verraten, wie viele Antworten gesucht sind.

Die Antwortknöpfe sind mit `1`–`9`, danach `Q W E R T Z U I O P` beschriftet;
dieselbe Taste wählt die Antwort aus. Bei Lückentexten läuft die Nummerierung
über alle Lücken durch, damit jede Taste eindeutig bleibt. Die Lücken selbst
sind eingekreist nummeriert (①②③), damit sie nicht mit den Tasten kollidieren.
`Enter` prüft bzw. blättert weiter.

Wie viele Antworten richtig sind, wird **nicht** verraten — so wie in Moodle
auch. Wer es doch will, schaltet es unter *Verwalten → Einstellungen* ein.

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
| `ddwtos` | Lückentext; jede Lücke nimmt nur Wörter ihrer eigenen Gruppe |
| `match` | Zuordnung |

## Sicherung

**Verwalten → Sicherung speichern** legt Fortschritt, Prognose-Verlauf,
importierte Fragensätze und Einstellungen als JSON ab. Das ist der Weg auf ein anderes Gerät oder
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
| `test/*.test.js` | Playwright-Tests (Lernen, Verlauf, Import, Sicherung) |

Der Parser läuft bewusst im Browser statt in Node: die App muss ihn ohnehin
mitbringen, damit der Import ohne Server funktioniert — so gibt es nur eine
Fassung, die für beides gilt.

Den Import-Test braucht eine Quelldatei:
`QUIZ_HTML=/pfad/zur/seite.html node test/import.test.js`
