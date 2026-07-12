# Sanity Studio schema upgrade — `marketContext` enrichment

For the cofounder's Sanity Studio project (the studio code is not in this repo). Written 2026-07-12 alongside the price-page enrichment (AdSense plan §1 "prices-today enrichment").

## What changed on the site

The four `/…-price-today` pages now render `marketContext` **server-side** (the daily text is finally in the HTML Google crawls — it used to load client-side after hydration) and understand **three new optional fields** plus the existing `date`:

| Field | Renders as |
| --- | --- |
| `stats` — array of `{label, value}` | fact-box grid under the paragraphs (e.g. "52-week range" / "$1,980 – $2,450") |
| `weekRecap` — text | "The bigger picture" subsection — weekly/historical context |
| `relatedLinks` — array of `{label, href}` | "Related reading" list — link the day's blog post, the guides, other price pages |
| `date` (already exists) | "Context updated July 12, 2026 by the IntelliTrade desk" dateline + disclaimer |

Everything is optional. Existing docs render exactly as before; a field renders only when filled. No redeploy needed when he starts using them — the site already understands the fields.

## Studio schema snippet

Add these fields to the existing `marketContext` document type in the Studio's schema file, then deploy the Studio:

```js
// Add inside the marketContext document type's fields array:
{
  name: "stats",
  title: "Fact box",
  description:
    "Optional label/value rows shown as a grid, e.g. '52-week range' → '$1,980 – $2,450'. Factual figures only.",
  type: "array",
  of: [
    {
      type: "object",
      fields: [
        { name: "label", title: "Label", type: "string" },
        { name: "value", title: "Value", type: "string" },
      ],
      preview: {
        select: { title: "label", subtitle: "value" },
      },
    },
  ],
},
{
  name: "weekRecap",
  title: "The bigger picture",
  description:
    "Optional weekly/historical context paragraph — where the price has been, what changed this week, longer-run drivers.",
  type: "text",
  rows: 4,
},
{
  name: "relatedLinks",
  title: "Related reading",
  description:
    "Optional internal links: today's blog post, an evergreen guide, another price page. Use relative paths (/blog/…, /lotsizecalculator).",
  type: "array",
  of: [
    {
      type: "object",
      fields: [
        { name: "label", title: "Link text", type: "string" },
        {
          name: "href",
          title: "Path",
          type: "string",
          description: "Relative path like /blog/my-post — not a full URL.",
        },
      ],
      preview: {
        select: { title: "label", subtitle: "href" },
      },
    },
  ],
},
```

## Content guidance (same rules as BLOG_PROMPT.md)

- **Fact box**: verifiable numbers only (ranges, YTD change, ratio values). No projections, no levels framed as trade ideas.
- **Related reading**: 1–3 links; the day's market update post is the highest-value one — it builds the blog ↔ price-page internal-link mesh Google rewards.
- **The bigger picture**: this is the "historical context" AdSense enrichment — a couple of sentences on the month/year arc, not a repeat of the daily paragraph.
- Keep the `date` field accurate — the site shows it as the "context updated" dateline (freshness signal).
