# IntelliConflict Map

Premium, self-hosted conflict monitor built with Next.js, Tailwind, a bundled SVG world map, and GDELT. It normalizes conflict-like signals into GeoJSON, serves them through a cache-backed API, and renders them in a dark glass-panel interface with density overlays, severity filtering, category toggles, search, and a detail drawer.

Requires Node `20.9+`.

## What it is

- Full-bleed bundled vector world map with a minimal dark basemap and no external tile provider.
- Backend `GET /api/conflicts` route with:
  - per-IP rate limiting
  - Supabase-first caching
  - filesystem fallback cache
  - cache schema versioning
  - GDELT ingestion with runtime validation
  - deterministic severity scoring
  - sample-data fallback when GDELT is unreachable and no fresh cache is available
- Server-only Supabase usage. The service role key must never be exposed to the client.

## Architecture

- The basemap is fully bundled. No Mapbox, MapTiler, OSM, or raster tile services are required at runtime.
- World geometry lives in [data/world.topo.json](data/world.topo.json).
- The bundled basemap is derived from Natural Earth public-domain data. See [NOTICE.md](NOTICE.md) for attribution details.
- The frontend renders that dataset locally as SVG using D3 projection and zoom utilities.
- `24h` and `7d` still render GEO 2.0 hotspots.
- `30d` still renders article-derived points.
- Supabase cache, file cache fallback, GDELT integration, and cache schema versioning remain unchanged on the backend.

## Local run

PowerShell:

```powershell
cd C:\IntelliTrade\IntelliConflict-Map\IntelliConflict-Map
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

Build artifacts such as `.next/` and installed dependencies such as `node_modules/` are local-only and should not be committed.

Quality checks:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

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

- This table is server-only. Do not use anon key here.
- Keep RLS enabled. No client-facing policy is required for this cache table.
- Never place the service role key in `NEXT_PUBLIC_*` variables.

## Environment variables

- `CACHE_TTL_SECONDS`
  Cache TTL in seconds. Default: `900`.
- `GDELT_REQUEST_TIMEOUT_MS`
  Upstream request timeout in milliseconds. Default: `9000`.
- `GDELT_GEORES`
  Optional GEO 2.0 geographic match precision. Valid range: `1` to `5`. Default: `2`.
- `SUPABASE_URL`
  Enables Supabase cache when set with the service role key.
- `SUPABASE_SERVICE_ROLE_KEY`
  Server-only secret for Supabase cache writes and reads.

No tile, glyph, or basemap-provider env vars are required.

## Caching behavior

- Default cache TTL: 15 minutes.
- Cache keys are versioned. If you change response semantics, bump `CACHE_SCHEMA_VERSION`.
- This avoids stale file cache and Supabase cache conflicts after schema or normalization changes.
- If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exist, the app uses Supabase first.
- Otherwise it falls back to filesystem cache files under:
  `C:\IntelliTrade\IntelliConflict-Map\IntelliConflict-Map\.cache\conflicts_{version}_{window}_{hash}.json`
- Cached sample responses remain marked as sample mode in API output so the UI can show the badge.

## Bundled basemap

- The world basemap is rendered locally from [data/world.topo.json](data/world.topo.json).
- The bundled basemap is Natural Earth-derived. See [NOTICE.md](NOTICE.md) for the attribution notice.
- Interaction is intentionally bounded:
  - world-fit default view
  - drag to pan
  - wheel to zoom
  - moderate regional zoom only
- The density toggle uses lightweight SVG glow circles instead of a tile-engine heatmap.
- Density rendering is adaptive and may simplify automatically at higher point counts to keep SVG performance responsive.
- The basemap is intentionally simplified to emphasize country context and conflict readability rather than roads or terrain.

## Data and attribution notes

- Visible attribution includes `Data: GDELT`.
- The bundled world map is derived from Natural Earth data and ships with the repo. See [NOTICE.md](NOTICE.md).
- No external basemap tile requests occur at runtime.

## GDELT approach

- Conflict query defaults to:
  `war OR conflict OR clashes OR artillery OR drone strike OR missile OR bombing OR airstrike OR shelling OR incursion OR insurgent OR militia OR battlefield OR ceasefire OR uprising OR explosion OR attack`
- `24h` and `7d` use the GDELT GEO 2.0 endpoint in point-data GeoJSON mode.
- GEO 2.0 `pointdata` is treated as location-aggregated hotspots, not one marker per article.
- Hotspots can include up to five representative article links extracted from popup HTML or structured link fields when GDELT provides them.
- Hotspot severity is driven by relative mention intensity plus optional negative tone, not article keyword scoring.
- `30d` uses the GDELT DOC endpoint and maps articles at country-centroid precision.
- DOC-derived points are marked in the UI as approximate country-level locations and rendered softer than exact GEO points.
- The drawer labels DOC-derived items as article-derived signals and shows `Approximate location (country-level)` when centroid mapping is used.
- `GDELT_GEORES` defaults to `2`, which biases the GEO query toward more precise geographic matches.
- Malformed but reachable upstream payloads degrade to an empty dataset.
- Unreachable upstream requests switch to sample mode when no cache is available.

## API contract

`GET /api/conflicts`

Query params:

- `window=24h|7d|30d`
- `q=custom query string`
- `limit=integer`
- `severity=all|high|medium|low`

Response shape:

```json
{
  "meta": {
    "window": "24h",
    "generatedAt": "2026-03-13T12:00:00.000Z",
    "source": "gdelt",
    "aggregation": "location",
    "count": 12,
    "cache": {
      "hit": false,
      "ageSeconds": 0,
      "ttlSeconds": 900
    }
  },
  "stats": {
    "topCountries": [{ "name": "Ukraine", "count": 4 }],
    "topThemes": [{ "name": "Airstrikes", "count": 3 }],
    "severityBuckets": { "low": 1, "medium": 6, "high": 5 }
  },
  "geojson": {
    "type": "FeatureCollection",
    "features": []
  }
}
```

## Troubleshooting

- Empty map
  Check browser network requests to `/api/conflicts`. If GDELT returned a valid but empty result set, the API will respond with zero features instead of sample mode.
- Sample mode badge showing
  GDELT was unreachable at request time and no fresh cache entry was available. Wait for the cache to expire or refresh later.
- Hotspot markers show no direct source button
  GEO 2.0 hotspots are aggregated location signals. Open the drawer to inspect `Top articles` when GDELT exposes representative links.
- Basemap not visible
  Confirm [data/world.topo.json](data/world.topo.json) exists and the app built successfully. No tile provider setup is required.
- Supabase cache not being used
  Confirm both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env.local`, then restart the server.
- 429 responses from `/api/conflicts`
  The local API applies `30 requests / 5 minutes / IP`.
