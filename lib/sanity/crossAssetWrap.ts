// Deterministic parser for the "Cross-Asset Wrap" section of a daily blog post.
//
// The cofounder's posts end with a Portable Text section headed
// "Cross-Asset Wrap:" followed by one bullet per asset, e.g.
//   "🪙 Gold: Gold is trading around $4,000 ... [USD] [REAL YIELDS]"
// This module turns that section into the four paragraphs (gold/silver/oil/
// bitcoin) that feed the marketContext documents behind the price pages.
//
// Pure and deterministic. No LLM, no network, no Studio type imports.

export type PortableTextSpan = {
  _type: string;
  text?: string;
  marks?: string[];
};

export type PortableTextBlock = {
  _type: string;
  style?: string;
  listItem?: string;
  children?: PortableTextSpan[];
};

export type WrapAsset = "gold" | "silver" | "oil" | "bitcoin";

export type ParseCrossAssetWrapResult =
  | {
      ok: true;
      entries: { gold: string; silver: string; oil: string; bitcoin: string };
      ignoredLabels: string[];
    }
  | { ok: false; reason: "no-heading" }
  | { ok: false; reason: "invalid"; missing: string[]; errors: string[] };

const REQUIRED_ASSETS: WrapAsset[] = ["gold", "silver", "oil", "bitcoin"];

// Join a block's span texts in document order.
export function blockText(block: PortableTextBlock): string {
  if (!block || !Array.isArray(block.children)) return "";
  return block.children
    .map((child) => (child && typeof child.text === "string" ? child.text : ""))
    .join("");
}

// Normalize a heading's full text: unicode dashes -> "-", collapse whitespace,
// trim, strip ONE trailing colon (ASCII or fullwidth), lowercase.
function normalizeHeadingText(raw: string): string {
  let t = raw.replace(/[‐-―]/g, "-");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/[:：]$/, "").trim();
  return t.toLowerCase();
}

// Normalize a bullet's label (text before the first colon): strip all leading
// characters that are not Unicode letters (emoji, variation selectors, the ₿
// currency symbol, whitespace), collapse whitespace, trim, lowercase.
function normalizeLabel(raw: string): string {
  return raw
    .replace(/^[^\p{L}]+/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// A block is the wrap heading when it is NOT a list item and its normalized
// full text is exactly "cross-asset wrap". Works for h2/h3/normal styles.
export function isWrapHeading(block: PortableTextBlock | undefined): boolean {
  if (!block) return false;
  if (block.listItem !== undefined && block.listItem !== null) return false;
  return normalizeHeadingText(blockText(block)) === "cross-asset wrap";
}

// Index of the first wrap heading, or -1 if the post has none.
export function findWrapHeadingIndex(blocks: PortableTextBlock[]): number {
  for (let i = 0; i < blocks.length; i++) {
    if (isWrapHeading(blocks[i])) return i;
  }
  return -1;
}

function mapLabelToAsset(rawLabel: string): WrapAsset | null {
  const n = normalizeLabel(rawLabel);
  if (n === "gold") return "gold";
  if (n === "silver") return "silver";
  if (n === "oil" || n === "brent" || n === "oil (brent)" || n.startsWith("oil")) return "oil";
  if (n === "crypto" || n === "bitcoin" || n === "btc") return "bitcoin";
  return null; // stocks/equities and anything else are ignored
}

function truncate(s: string, max = 80): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

export function parseCrossAssetWrap(
  body: PortableTextBlock[] | undefined | null
): ParseCrossAssetWrapResult {
  const blocks = Array.isArray(body) ? body : [];
  const headingIdx = findWrapHeadingIndex(blocks);
  if (headingIdx === -1) return { ok: false, reason: "no-heading" };

  const found: Partial<Record<WrapAsset, string>> = {};
  const ignoredLabels: string[] = [];
  const errors: string[] = [];
  const malformed: string[] = [];
  const seen = new Set<WrapAsset>();

  // Consume consecutive list-item blocks after the heading; stop at the first
  // non-list block (empty spacer / CTA / disclaimer).
  for (let i = headingIdx + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || block.listItem === undefined || block.listItem === null) break;

    const fullText = blockText(block);
    const colonIdx = fullText.indexOf(":");
    if (colonIdx === -1) {
      // Malformed bullet: only matters if a required asset ends up missing.
      malformed.push(truncate(fullText));
      continue;
    }

    const label = fullText.slice(0, colonIdx);
    const paragraph = fullText.slice(colonIdx + 1).trim();
    const asset = mapLabelToAsset(label);
    if (!asset) {
      ignoredLabels.push(normalizeLabel(label));
      continue;
    }
    if (seen.has(asset)) {
      errors.push(`Duplicate entry for ${asset}`);
      continue;
    }
    seen.add(asset);
    if (paragraph.length === 0) {
      errors.push(`Empty paragraph for ${asset}`);
      continue;
    }
    found[asset] = paragraph;
  }

  const missing = REQUIRED_ASSETS.filter((asset) => !found[asset]);
  if (missing.length > 0 || errors.length > 0) {
    const allErrors = [...errors];
    for (const text of malformed) allErrors.push(`Bullet without a label colon: "${text}"`);
    return { ok: false, reason: "invalid", missing, errors: allErrors };
  }

  return {
    ok: true,
    entries: {
      gold: found.gold as string,
      silver: found.silver as string,
      oil: found.oil as string,
      bitcoin: found.bitcoin as string,
    },
    ignoredLabels,
  };
}
