import "server-only";

import {
  getCachedTranslation,
  setCachedTranslation,
  type CachedTranslation
} from "@/lib/translation/cache";

// Lazy-loaded to avoid importing at module level when env key is absent
let _translator: import("deepl-node").Translator | null = null;

const TARGET_LANG: import("deepl-node").TargetLanguageCode =
  (process.env.DEEPL_TARGET_LANG as import("deepl-node").TargetLanguageCode | undefined) ??
  "en-US";

const TRANSLATION_ENABLED =
  process.env.DEEPL_ENABLE_TRANSLATION !== "false" &&
  Boolean(process.env.DEEPL_API_KEY);

// Maximum parallel headlines translated per batch to stay within quota
const MAX_BATCH_SIZE = 30;

function getTranslator(): import("deepl-node").Translator | null {
  if (!TRANSLATION_ENABLED) return null;
  if (_translator) return _translator;

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) return null;

  // Dynamic require so tree-shaking works in test / client bundles
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const deepl = require("deepl-node") as typeof import("deepl-node");
  _translator = new deepl.Translator(apiKey);
  return _translator;
}

export function shouldTranslateHeadline(
  text: string,
  sourceLang?: string
): boolean {
  if (!TRANSLATION_ENABLED) return false;
  if (!text || text.length < 5) return false;
  // Skip if we already know source is English
  if (sourceLang && sourceLang.toUpperCase().startsWith("EN")) return false;
  return true;
}

export async function translateHeadline(
  text: string,
  sourceLang?: string
): Promise<CachedTranslation> {
  const fallback: CachedTranslation = {
    displayTitle: text,
    wasTranslated: false
  };

  if (!shouldTranslateHeadline(text, sourceLang)) {
    return fallback;
  }

  const cached = getCachedTranslation(text, TARGET_LANG);
  if (cached) return cached;

  const translator = getTranslator();
  if (!translator) return fallback;

  try {
    const result = await translator.translateText(text, null, TARGET_LANG);
    const detectedLang = result.detectedSourceLang?.toLowerCase() ?? "";
    const wasTranslated = Boolean(detectedLang) && !detectedLang.startsWith("en");
    const entry: CachedTranslation = {
      displayTitle: wasTranslated ? result.text : text,
      wasTranslated,
      translatedFrom: wasTranslated ? detectedLang : undefined
    };
    setCachedTranslation(text, TARGET_LANG, entry);
    return entry;
  } catch {
    // Translation failure must never surface as a user-facing error
    return fallback;
  }
}

export type TranslatableHeadline = {
  text: string;
  sourceLang?: string;
};

export type TranslatedHeadlines = Map<string, CachedTranslation>;

/**
 * Translate up to MAX_BATCH_SIZE unique headlines in parallel.
 * Returns a Map from original text → translation result.
 * Already-cached or English headlines are resolved instantly.
 */
export async function translateBatch(
  items: TranslatableHeadline[]
): Promise<TranslatedHeadlines> {
  const results: TranslatedHeadlines = new Map();
  const toTranslate = items
    .filter((item) => shouldTranslateHeadline(item.text, item.sourceLang))
    .filter((item) => !getCachedTranslation(item.text, TARGET_LANG))
    .slice(0, MAX_BATCH_SIZE);

  // Resolve cached / skip items immediately
  for (const item of items) {
    if (!shouldTranslateHeadline(item.text, item.sourceLang)) {
      results.set(item.text, { displayTitle: item.text, wasTranslated: false });
      continue;
    }
    const cached = getCachedTranslation(item.text, TARGET_LANG);
    if (cached) {
      results.set(item.text, cached);
    }
  }

  if (toTranslate.length === 0) return results;

  // Translate remaining in parallel
  await Promise.all(
    toTranslate.map(async (item) => {
      const entry = await translateHeadline(item.text, item.sourceLang);
      results.set(item.text, entry);
    })
  );

  return results;
}
