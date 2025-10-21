# Import-Funktionalität Erweiterung

## Änderungen

### 1. Schema-Erweiterung (`src/lib/storage/schema.ts`)
- Neues Schema `chapterSchema` für einzelne Kapitel hinzugefügt
- Neues Schema `chaptersPackSchema` für kapitel-basierte JSON-Dateien hinzugefügt
- Export des Types `ChaptersPackPayload`

### 2. Repository-Erweiterung (`src/lib/storage/repository.ts`)
- `importWordPack()` unterstützt jetzt beide Formate:
  - **Format 1**: `{ version: 1, words: [...] }` (bisheriges Format)
  - **Format 2**: `{ version: 1, chapters: [{ chapter: 1, words: [...] }, ...] }` (neues Klett-Format)
- Die Funktion erkennt automatisch das Format und flacht das chapters-Array bei Bedarf ab

### 3. UI-Anpassungen (`src/routes/+page.svelte`)
- `handleImport()` zeigt jetzt an, ob ein Kapitel-Format importiert wurde
- `importExample` zeigt beide unterstützten Formate als Beispiel
- Hilfetext wurde aktualisiert, um beide Formate zu dokumentieren

### 4. Klett-Datenquelle (`src/lib/data/klett.ts`)
- Wechsel von `klett.json?raw` zu `klett2.json`
- Vereinfachte Parse-Logik, da `klett2.json` bereits valides JSON ist
- Unterstützung für das neue `{ version, chapters }` Format

## Unterstützte Import-Formate

### Format 1: Einfache Wortliste
```json
{
  "version": 1,
  "words": [
    {
      "id": "w-ni3hao3",
      "prompt": "Hallo",
      "promptLanguage": "de",
      "pinyin": "nǐhǎo",
      "characters": ["你", "好"],
      "alternatePinyin": ["ni3hao3"]
    }
  ]
}
```

### Format 2: Strukturierte Kapitel (wie Klett)
```json
{
  "version": 1,
  "chapters": [
    {
      "chapter": 1,
      "words": [
        {
          "id": "w-ni3hao3",
          "prompt": "Hallo",
          "promptLanguage": "de",
          "pinyin": "nǐhǎo",
          "characters": ["你", "好"],
          "alternatePinyin": ["ni3hao3"]
        }
      ]
    },
    {
      "chapter": 2,
      "words": [...]
    }
  ]
}
```

## Verwendung

Benutzer können nun beide Formate über den "Import"-Button in der Anwendung hochladen:

1. **Einfache Wortlisten**: Ideal für kleine, flache Vokabellisten
2. **Kapitel-basierte Dateien**: Ideal für strukturierte Lehrmaterialien wie Klett-Bücher

Die Anwendung erkennt automatisch das Format und importiert die Wörter entsprechend.
