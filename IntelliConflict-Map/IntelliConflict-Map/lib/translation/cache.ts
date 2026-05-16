export type CachedTranslation = {
  displayTitle: string;
  wasTranslated: boolean;
  translatedFrom?: string;
};

// Bounded in-memory cache keyed by "originalText::targetLang"
// Survives within a server process lifetime — translations cached once are reused
const store = new Map<string, CachedTranslation>();
const MAX_ENTRIES = 3000;

export function getCachedTranslation(
  text: string,
  targetLang: string
): CachedTranslation | undefined {
  return store.get(`${text}::${targetLang}`);
}

export function setCachedTranslation(
  text: string,
  targetLang: string,
  entry: CachedTranslation
): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest entry (Map preserves insertion order)
    const firstKey = store.keys().next().value;
    if (firstKey) {
      store.delete(firstKey);
    }
  }
  store.set(`${text}::${targetLang}`, entry);
}

export function translationCacheSize(): number {
  return store.size;
}
