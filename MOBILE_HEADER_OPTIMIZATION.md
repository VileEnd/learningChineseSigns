# Mobile Header Optimierung

## Änderungen

### 1. Kollabierender Header
- **Kompakter Modus auf Smartphones**: Der Header nimmt minimal Platz ein
- **Toggle-Button**: Benutzer können zwischen kompakt/erweitert wechseln
- **Auto-Collapse**: Header klappt automatisch ein beim:
  - Start einer neuen Übung (loadNextWord)
  - Eingabe von Pinyin (handlePinyinSubmit)
  - Zeichnen von Charakteren (handleQuizComplete)

### 2. Mobile-First Design

#### Kompakter Header (Mobile, eingeklappt)
- Höhe: ~40px (vs. 150-200px vorher)
- Zeigt nur: Toggle-Button, "Zettelkasten", Bibliotheksname, Kapitelauswahl
- Sticky Position: `top-2` (vs. `top-4` Desktop)
- Padding: `p-3` (vs. `p-5` Desktop)
- Border Radius: `rounded-2xl` (vs. `rounded-3xl` Desktop)

#### Voller Header (Mobile, erweitert)
- Titel: `text-xl` (vs. `text-3xl` Desktop)
- Alle Funktionen verfügbar
- Minimize-Button oben rechts

### 3. Icon-basierte Buttons auf Mobile
Alle Header-Buttons zeigen auf Mobile nur Icons:
- **Einstellungen**: Zahnrad-Icon
- **Hilfe**: Info-Icon
- **Import**: Upload-Icon
- **Bibliothek**: Buch-Icon + Badge
- **Export**: Download-Icon

Text wird auf Desktop angezeigt (`hidden md:inline`)

### 4. Responsive Größenanpassungen

#### Button-Größen
- Mobile: `px-3 py-1.5 text-xs gap-1.5`
- Desktop: `px-4 py-2 text-sm gap-2`

#### Suchfeld
- Mobile: `px-3 py-1.5 text-xs` + Placeholder "Wort suchen"
- Desktop: `px-4 py-2 text-sm` + Placeholder "Wort auf Deutsch suchen"

#### Titel
- Mobile: `text-xl`
- Desktop: `text-3xl`

#### Untertitel
- Mobile: `text-xs text-slate-500`
- Desktop: `text-sm text-slate-600`

#### Status-Zeile
- Mobile: Komplett ausgeblendet
- Desktop: Sichtbar

### 5. State Management
```typescript
let headerExpanded = true; // Startet erweitert
```

Automatisches Einklappen bei:
- `isMobileViewport && headerExpanded` = true
- User-Interaktion mit Lerninhalt

### 6. Accessibility
- ARIA-Labels für Toggle-Buttons
- `aria-expanded` für Bibliotheks-Button
- Keyboard-Navigation bleibt erhalten

## Platzersparnis

### Vorher (Mobile)
- Header: ~150-200px Höhe
- Nimmt 30-40% des Viewport ein
- Schreib-Canvas: ~60% verfügbar

### Nachher (Mobile, kompakt)
- Header: ~40px Höhe
- Nimmt nur ~8-10% des Viewport ein
- Schreib-Canvas: ~90% verfügbar

## Benutzerfluss

1. **App öffnen**: Header erweitert
2. **Übung starten**: Header klappt automatisch ein
3. **Bei Bedarf erweitern**: Pfeil-nach-unten Button
4. **Einstellungen ändern**: Automatisch wieder einklappen nach Aktion
5. **Neue Karte**: Bleibt eingeklappt

## Technische Details

### CSS-Klassen
- Responsive Padding/Margins mit Tailwind Breakpoints
- SVG-Icons inline für bessere Performance
- Conditional Rendering mit `{#if isMobileViewport && !headerExpanded}`

### Performance
- Keine zusätzlichen JS-Animationen
- CSS Transitions für smooth Toggling
- Sticky Positioning für besseres Scrollverhalten
