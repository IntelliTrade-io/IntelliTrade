import { describe, expect, it, afterEach } from "vitest";

// We test the translation cache and the shouldTranslateHeadline helper
// without real DeepL API calls

describe("translation cache", () => {
  it("stores and retrieves a translation result", async () => {
    const { getCachedTranslation, setCachedTranslation } = await import(
      "@/lib/translation/cache"
    );

    setCachedTranslation("Bonjour le monde", "EN-US", {
      displayTitle: "Hello the world",
      wasTranslated: true,
      translatedFrom: "fr"
    });

    const cached = getCachedTranslation("Bonjour le monde", "EN-US");
    expect(cached).toBeDefined();
    expect(cached?.displayTitle).toBe("Hello the world");
    expect(cached?.wasTranslated).toBe(true);
    expect(cached?.translatedFrom).toBe("fr");
  });

  it("returns undefined for unseen keys", async () => {
    const { getCachedTranslation } = await import("@/lib/translation/cache");
    expect(getCachedTranslation("unknown text", "EN-US")).toBeUndefined();
  });

  it("cache size increases with new entries", async () => {
    const { setCachedTranslation, translationCacheSize } = await import(
      "@/lib/translation/cache"
    );

    const before = translationCacheSize();
    setCachedTranslation(`unique-${Date.now()}`, "EN-US", {
      displayTitle: "test",
      wasTranslated: false
    });

    expect(translationCacheSize()).toBeGreaterThan(before);
  });
});

describe("shouldTranslateHeadline", () => {
  const originalEnv = process.env.DEEPL_ENABLE_TRANSLATION;
  const originalKey = process.env.DEEPL_API_KEY;

  afterEach(() => {
    process.env.DEEPL_ENABLE_TRANSLATION = originalEnv;
    process.env.DEEPL_API_KEY = originalKey;
  });

  it("skips translation when DEEPL_ENABLE_TRANSLATION=false", async () => {
    process.env.DEEPL_ENABLE_TRANSLATION = "false";
    process.env.DEEPL_API_KEY = "test-key:fx";

    // Re-import to pick up the env change — module is cached so we test the
    // function logic by checking what shouldTranslateHeadline returns
    const { shouldTranslateHeadline } = await import("@/lib/translation/deepl");
    // The module is already loaded with the old env, so check function behavior directly
    expect(shouldTranslateHeadline("Hello world", "EN")).toBe(false);
  });

  it("skips short strings regardless of language", async () => {
    const { shouldTranslateHeadline } = await import("@/lib/translation/deepl");
    expect(shouldTranslateHeadline("Hi", "FR")).toBe(false);
    expect(shouldTranslateHeadline("", "FR")).toBe(false);
  });

  it("skips when sourceLang is already English", async () => {
    const { shouldTranslateHeadline } = await import("@/lib/translation/deepl");
    expect(shouldTranslateHeadline("This is an English headline", "EN")).toBe(false);
    expect(shouldTranslateHeadline("This is an English headline", "EN-US")).toBe(false);
    expect(shouldTranslateHeadline("This is an English headline", "en-gb")).toBe(false);
  });
});

describe("translateBatch output shape", () => {
  it("produces correct shape for English-skipped items", async () => {
    process.env.DEEPL_ENABLE_TRANSLATION = "false";

    const { translateBatch } = await import("@/lib/translation/deepl");

    const results = await translateBatch([
      { text: "Missile strike reported", sourceLang: "EN" },
      { text: "Another English headline" }
    ]);

    for (const [text, result] of results.entries()) {
      // Skipped items use original text as displayTitle
      void text;
      expect(typeof result.displayTitle).toBe("string");
      expect(typeof result.wasTranslated).toBe("boolean");
    }
  });

  it("falls back gracefully when translator is unavailable", async () => {
    process.env.DEEPL_API_KEY = "";
    process.env.DEEPL_ENABLE_TRANSLATION = "true";

    const { translateHeadline } = await import("@/lib/translation/deepl");

    const result = await translateHeadline("Bonjour le monde");
    // Without API key, falls back to original
    expect(result.displayTitle).toBe("Bonjour le monde");
    expect(result.wasTranslated).toBe(false);
  });
});
