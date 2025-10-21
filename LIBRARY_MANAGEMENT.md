# Bibliotheks-Verwaltung Dokumentation

## Überblick

Die Anwendung unterstützt jetzt mehrere Vokabel-Bibliotheken mit einer einheitlichen Auswahl-UI.

## Neue Dateien

### `/src/lib/data/hsk.ts`
- Parst HSK1 Vokabeldaten aus `hsk1.json`
- Exportiert `hskLevels` Array mit allen HSK-Levels
- Exportiert `totalHSKWords` für Statistiken

### `/src/lib/data/libraries.ts`
- Zentrale Verwaltung aller verfügbaren Bibliotheken
- Types: `LibraryType`, `LibraryInfo`, `ChapterInfo`
- Exportiert `availableLibraries` Array
- Funktionen:
  - `getChaptersForLibrary(libraryId)` - Gibt Kapitel für eine Bibliothek zurück
  - `getWordsForChapters(libraryId, chapterIds)` - Gibt Wörter für ausgewählte Kapitel zurück
  - `getAllChapterIdsForLibrary(libraryId)` - Gibt alle Kapitel-IDs zurück

## Repository-Erweiterungen

### Neue Funktionen in `repository.ts`
- `getAvailableLibraries()` - Liste aller verfügbaren Bibliotheken
- `getLibraryChapters(libraryId)` - Kapitel für eine Bibliothek
- `importLibraryChapters(libraryId, chapterIds)` - Importiert ausgewählte Kapitel
- `suspendLibraryChapters(libraryId, chapterIds)` - Pausiert ausgewählte Kapitel

## UI-Änderungen

### Neues Bibliotheks-Auswahl-Modal
Ersetzt das alte "Klett Kapitel" Modal mit:

1. **Bibliotheksauswahl**
   - Button-Gruppe zur Auswahl der Bibliothek (Klett / HSK)
   - Zeigt Gesamtwortzahl pro Bibliothek an

2. **Kapitelauswahl**
   - Dynamische Liste basierend auf gewählter Bibliothek
   - Checkboxen für jedes Kapitel
   - Zeigt Wortzahl pro Kapitel
   - "Alle auswählen" / "Zurücksetzen" Buttons

3. **Import-Aktion**
   - Zeigt ausgewählte Wortzahl
   - Button-Text passt sich an (übernehmen/pausieren)
   - Feedback nach Import

### Header-Änderungen
- Button zeigt "Bibliothek" statt "Klett Kapitel"
- Status-Zeile zeigt aktuell gewählte Bibliothek
- Zeigt Anzahl ausgewählter Kapitel und Wörter

## Verwendung

### Für Benutzer
1. Klick auf "Bibliothek" Button im Header
2. Bibliothek auswählen (Klett oder HSK)
3. Gewünschte Kapitel markieren
4. "Übernehmen" klicken
5. Nicht ausgewählte Kapitel werden automatisch pausiert

### Neue Bibliothek hinzufügen

1. **JSON-Datei erstellen** in `/src/lib/assets/`
   ```json
   {
     "version": 1,
     "chapter": "LibraryName",
     "words": [...]
   }
   ```

2. **Parser-Datei erstellen** in `/src/lib/data/`
   ```typescript
   import data from '$lib/assets/your-library.json';
   export const yourLibraryLevels = parseData(data);
   export const totalYourLibraryWords = ...;
   ```

3. **In libraries.ts registrieren**
   ```typescript
   export const availableLibraries: LibraryInfo[] = [
     // existing...
     {
       id: 'your-library',
       name: 'Your Library Name',
       totalWords: totalYourLibraryWords
     }
   ];
   ```

4. **getChaptersForLibrary() erweitern**
   ```typescript
   export function getChaptersForLibrary(libraryId: LibraryType): ChapterInfo[] {
     // existing cases...
     else if (libraryId === 'your-library') {
       return yourLibraryLevels.map(...);
     }
   }
   ```

5. **getWordsForChapters() erweitern**
   ```typescript
   export function getWordsForChapters(libraryId: LibraryType, chapterIds: string[]): WordEntry[] {
     // existing cases...
     else if (libraryId === 'your-library') {
       return yourLibraryLevels.filter(...).flatMap(...);
     }
   }
   ```

## Rückwärtskompatibilität

Die alte Klett-spezifische UI und Funktionen bleiben vorhanden:
- `getKlettChapterSummaries()`
- `importKlettChapters()`
- `suspendKlettChapters()`
- Klett-Modal als Fallback

Dies gewährleistet, dass bestehender Code weiterhin funktioniert.
