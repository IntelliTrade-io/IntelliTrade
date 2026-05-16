# IntelliConflict Map

Premium, self-hosted conflict monitor built with Next.js, Tailwind, a bundled SVG world map, and GDELT. It normalizes conflict-like signals into GeoJSON, serves them through a cache-backed API, and renders them in a dark glass-panel interface with density overlays, severity filtering, category toggles, search, cluster markers, zoom controls, and a detail drawer.

Requires Node `20.9+`.

## What it is

- Full-bleed bundled vector world map with a minimal dark basemap and no external tile provider.
- Backend `GET /api/conflicts` route with:
  - per-IP rate limiting
  - Supabase-first caching with schema versioning
  - filesystem fallback cache
  - GDELT ingestion with runtime validation and sports/noise post-filtering
  - calibrated severity scoring with `severityReasons` explainability
  - server-side headline translation via DeepL API Free
  - 3-state data status: live, stale (last available), offline
- Server-only Supabase and DeepL usage. Neither service role key nor DeepL API key must ever be exposed to the client.

## Architecture

- The basemap is fully bundled. No Mapbox, MapTiler, OSM, or raster tile services are required at runtime.
- World geometry lives in [data/world.topo.json](data/world.topo.json).
- The bundled basemap is derived from Natural Earth public-domain data. See [NOTICE.md](NOTICE.md) for attribution details.
- The frontend renders that dataset locally as SVG using D3 projection and zoom utilities.
- `24h` and `7d` render GEO 2.0 hotspots with grid-based clustering at low zoom.
- `30d` renders article-derived points at country centroid precision.
- Supabase cache, file cache fallback, GDELT integration, and cache schema versioning remain on the backend.

## Features

### Severity calibration
- Stronger keyword scoring: HIGH-SEVERITY terms (missile, airstrike, drone strike, shelling, etc.) give a significant score boost.
- Hotspot severity also gains a keyword boost from representative article headlines.
- Diplomacy/ceasefire terms actively dampen scores.
- Each event includes `severityReasons[]` explaining the score in the detail drawer.

### Sports / noise filtering
- GDELT query excludes football, soccer, FIFA, UEFA, and other sports terms by default.
- A post-filter pass (`isIrrelevantConflictNoise`) drops remaining sports and entertainment noise before normalization.

### Automatic headline translation
- Non-English headlines are translated to English (default: EN-US) using DeepL API Free.
- Translation is **server-side only** — no API key is ever sent to the browser.
- Translated results are cached server-side; already-English content is never re-sent to DeepL.
- Each translated headline shows `"Translated from XX"` in the detail drawer.
- Translation failure is silent — the original headline is used as fallback.

### Zoom controls
- `+` and `−` buttons on the map (bottom-right) for stepped zoom.
- A reset/home button returns to the default world view.
- Mouse wheel zoom is still supported.
- Zoom is animated (respects `prefers-reduced-motion`).

### Cluster markers
- At low zoom (≤ 2.2×), nearby events are grouped into cluster circles showing a count.
- Clicking a cluster zooms into that region and dissolves into individual markers.
- Cluster color reflects the maximum severity in the group.

### 3-state data status
- **Live**: fresh GDELT data loaded successfully.
- **Stale**: live refresh failed but cached real data from a previous successful load is shown. A notice is shown in the top-right bar.
- **Offline**: no usable data available at all. The basemap stays visible; a centered glass overlay reads: _"Server currently offline, map will be back online ASAP"_.
- In production, no sample/synthetic events are shown as real live data.

### Severity explanation
- The right-hand drawer shows bullet-point reasons for each event's severity score (e.g. "Contains severe term: missile", "Diplomacy term lowered severity").

### Summary rail
- Top of the left panel shows High / Medium / Low counts for the current filter.
- Last-updated time displayed below.

## Local run

PowerShell:

```powershell
cd C:\IntelliTrade\IntelliConflict-Map\IntelliConflict-Map
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

Quality checks:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

## DeepL translation setup

1. Sign up for a free DeepL developer account at https://www.deepl.com/pro#developer
2. Copy your API key (Free tier keys end in `:fx`).
3. Add to `.env.local`:

```env
DEEPL_API_KEY=your-key-here:fx
```

4. Optional overrides:

```env
DEEPL_TARGET_LANG=EN-US        # default
DEEPL_ENABLE_TRANSLATION=true  # set to "false" to disable
```

**Important:**
- Never set `DEEPL_API_KEY` as a `NEXT_PUBLIC_*` variable.
- Translation happens server-side only, during normalization of new GDELT payloads.
- Translated payloads are cached; subsequent cache hits do not call DeepL.
- Only non-English headlines are translated; English content is skipped automatically.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL Editor.
3. Run [supabase/schema.sql](supabase/schema.sql).
4. Copy `.env.example` to `.env.local`.
5. Set:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

6. Restart the Next.js dev server.

Important:

- This table is server-only. Do not use the anon key here.
- Keep RLS enabled. No client-facing policy is required for this cache table.
- Never place the service role key in `NEXT_PUBLIC_*` variables.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CACHE_TTL_SECONDS` | No | `900` | Cache TTL in seconds |
| `GDELT_REQUEST_TIMEOUT_MS` | No | `9000` | Upstream GDELT request timeout in ms |
| `GDELT_GEORES` | No | `2` | GEO 2.0 geographic precision (1–5) |
| `SUPABASE_URL` | Production | — | Enables Supabase cache |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | — | Server-only secret for Supabase cache |
| `DEEPL_API_KEY` | Optional | — | DeepL API Free key for headline translation |
| `DEEPL_TARGET_LANG` | No | `EN-US` | Target language for translations |
| `DEEPL_ENABLE_TRANSLATION` | No | `true` | Set to `false` to disable translation |

## Caching behavior

- Default TTL: 15 minutes.
- Cache keys are versioned (`CACHE_SCHEMA_VERSION`). Bump it when you change response semantics to invalidate stale entries.
- If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, Supabase cache is used; otherwise file cache under `.cache/`.
- Translated headlines are included in cached payloads — DeepL is not called on cache hits.
- In production, no sample/synthetic data is served as live data.

## GDELT approach

- Default conflict query includes strong conflict terms and excludes sports/noise terms.
- A post-filter `isIrrelevantConflictNoise()` drops remaining sports and entertainment articles.
- `24h` and `7d` use GDELT GEO 2.0 (hotspot/location aggregation).
- `30d` uses GDELT DOC (article-level, country centroid precision).
- Severity is scored with calibrated keyword weights, recency boost, and tone adjustment.
- `severityReasons[]` is included on each feature for UI explainability.
- Unreachable upstream: in production → empty dataset (offline state). In development → sample data fallback.

## API contract

`GET /api/conflicts`

Query params:
- `window=24h|7d|30d`
- `q=custom query string`
- `limit=integer`
- `severity=all|high|medium|low`

Source values in `meta.source`:
- `gdelt` — fresh live data
- `supabase_cache` / `file_cache` — served from cache
- `stale` — upstream failed, served from last in-memory good data
- `offline` — no data available
- `sample` — development only

## Troubleshooting

- **Empty map / offline overlay**: GDELT was unreachable and no stale data is available. The map shows the basemap with the offline message. Click "Retry now" or wait.
- **Stale data notice**: Live refresh failed but the app is serving the last available dataset. It will auto-refresh when connectivity is restored.
- **No High severity events**: Severity scoring requires strong conflict keywords. If only diplomatic/ceasefire content is in the feed, Medium and High events will be rare.
- **Sports content appearing**: Ensure you are on cache schema version 5+ (old cache entries may contain sports content). The cache will auto-expire.
- **Translation not working**: Check `DEEPL_API_KEY` is set server-side (not `NEXT_PUBLIC_*`). Set `DEEPL_ENABLE_TRANSLATION=true`.
- **Supabase cache not used**: Confirm both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env.local`, then restart.
- **429 from `/api/conflicts`**: Rate limit is 30 requests / 5 minutes / IP.
- **Basemap not visible**: Confirm `data/world.topo.json` exists and build succeeded.
