# PATH HIS — App Reference (single source of truth)

**Product:** PATH HIS — EMR & Assets platform for county EMR support, facility inventory, asset tracking, and reporting.  
**Stack:** Next.js 14 App Router, React client pages, Prisma + **MySQL on Aiven (cloud)**, cookie auth.  
**Counties:** Kakamega, Vihiga, Nyamira, Kisumu.

Use this doc as the primary context for new chats. Older docs in `docs/` are historical; prefer this file.

---

## 1. Architecture

```
Browser (client components)
  → middleware.ts (auth + RBAC)
  → app/*/page.tsx (mostly "use client")
  → fetch /api/*
  → lib/auth.ts + lib/prisma.ts
  → Aiven MySQL

Exceptions (RSC + Prisma direct):
  - app/articles/[slug]/page.tsx

Home page map metrics: client fetch via /api/home/metrics (components/home-map-section.tsx)
```

**Client cache:** `cachedFetch` in `lib/cache.ts` — 30s default TTL, stale-while-revalidate.

**Server cache:** `lib/server-cache.ts` — 30s/60s in-memory TTL on hot API routes.

**DB pool:** `lib/prisma.ts` caps `connection_limit=5` for Aiven. Many parallel client requests **queue** on the pool and feel slow.

---

## 2. Auth & RBAC

**Cookies:** `ndwh_role`, `ndwh_user`, `ndwh_email`, `ndwh_access` (JSON: `{ locations, modules }`).

| Role | Typical access |
|------|----------------|
| `superadmin` | All counties, all modules, users, asset types, uploads |
| `admin` | Scoped counties/modules from `ndwh_access` |
| `guest` | Read-only tickets (limited UI) |

**Modules:** `dashboard`, `tickets`, `assets`, `facility`, `reports`, `uploads`, `users`

**Key files:** `lib/auth.ts`, `middleware.ts`, `components/auth-provider.tsx`, `app/users/page.tsx`

**Default landing:** `getDefaultRedirect()` → dashboard → tickets → assets → home.

---

## 3. Routes & modules

| Route | Module | Purpose |
|-------|--------|---------|
| `/` | public / gated | Landing, map metrics, articles, module shortcuts |
| `/login` | — | Login |
| `/articles`, `/articles/[slug]` | public | News/updates (stored in `AppSetting`) |
| `/nyamira?location=` | dashboard | **County Dashboard** (all 4 counties; name is legacy) |
| `/uploads` | uploads | CBS/NDWH weekly facility upload compliance (superadmin) |
| `/facility-manager` | facility | Master facility list CRUD, bulk paste, Excel import |
| `/asset-manager` | assets | **Asset Command Center** — inventory, analytics, lost assets |
| `/asset-types` | superadmin | Custom asset type definitions (WiFi, UPS, etc.) |
| `/tickets` | tickets | Overview or per-county ticket CRUD |
| `/reports` | reports | Excel exports: facilities, full asset inventory, tickets |
| `/users` | superadmin | User accounts (JSON in `AppSetting`) |

**Sidebar:** `components/sidebar.tsx`

---

## 4. Asset Command Center (`/asset-manager`)

**Main file:** `components/asset-manager.tsx`

### Views (tabs at top)
- **Overview** — charts/KPIs via `/api/assets/summary` (`components/asset-command-dashboard.tsx`)
- **Inventory** — per-type tabs: server, router, simcard, tablet, mobilephone, LAN + custom types
- **Lost assets** — register + mark recovered (`components/asset-lost-register.tsx`)

### Built-in inventory
- APIs: `/api/assets/{servers,routers,simcards,tablets,mobile-phones,lan}`
- Import/export: `components/section-upload.tsx` (Excel templates, superadmin upload)
- County filter; when "All Locations", pick **county for import** separately

### Custom inventory
- Types: `/api/asset-types`, rows: `/api/assets/inventory?type={slug}&location=`
- UI: `components/custom-asset-inventory.tsx`, `components/dynamic-inventory-upload.tsx`

### Asset lifecycle (lost / recovered)
- Fields on all asset tables: `assetStatus`, `lostAt`, `recoveredAt`, `statusComment`, `storageLocation`
- API: `POST /api/assets/lifecycle` `{ assetKind, id, action, statusComment?, storageLocation? }`
- Actions: `mark_lost` (comment required), `mark_recovered` (storage location required), `mark_active`
- Lost rows hidden from inventory tabs; shown in Lost assets register

### Analytics API
- `GET /api/assets/summary?location=all|{county}` — aggregated via `lib/asset-summary.ts` (Prisma `groupBy`, ~15 queries)
- Previously slow (100+ sequential counts); optimized 2026-05

---

## 5. Facility Manager (`/facility-manager`)

- Master facilities: `GET /api/facilities?system=NDWH|CBS&location=&isMaster=true`
- Merged picker: `lib/master-facilities.ts` (NDWH + CBS deduped by name)
- Facility row fields: `serverType`, `routerType`, `simcardCount`, `hasLAN` (summary-level, not per-device)
- Detailed assets may also exist in `*Asset` tables; UI merges both (`isFromInventory` phantom rows)

---

## 6. County Dashboard (`/nyamira`)

- **Single county:** `components/nyamira-dashboard.tsx` → **`GET /api/dashboard/county?location=`** (one bundled call)
- **All counties overview:** `components/overview-dashboard.tsx` — **many parallel calls per county** (performance hotspot)
- Tickets analytics, server distribution, CBS/NDWH comparison charts

---

## 7. Tickets (`/tickets`)

- `GET/POST/PATCH /api/tickets`, bulk, critical servers
- County required on tickets (`location`, `subcounty`)
- Guest view: `components/guest-tickets-view.tsx`
- Overview (no `?location`): `components/tickets-overview.tsx`

---

## 8. Reports (`/reports`)

**File:** `components/reports.tsx`

| Export | Data source |
|--------|-------------|
| Facility master | `/api/facilities?system=NDWH&isMaster=true` per county |
| Full asset inventory | `lib/report-asset-export.ts` — all built-in + custom types, status columns, **Lost Assets** sheet |
| Tickets | `/api/tickets?location=` per county |

NDWH/CBS compliance CSV/text reports were **removed** from this page (compliance lives under `/uploads`).

---

## 9. Uploads (`/uploads`)

Separate **NDWH/CBS upload monitoring** — weekly facility list paste, comparison history.  
Not the same as Asset Manager Excel import.

---

## 10. Data model (Prisma)

**File:** `prisma/schema.prisma`

| Model | Purpose |
|-------|---------|
| `Facility` | Master/reported facilities (NDWH/CBS), location, inventory summary fields |
| `ServerAsset`, `RouterAsset`, `SimcardAsset`, `TabletAsset`, `MobilePhoneAsset`, `LanAsset` | Detailed per-device rows + lifecycle |
| `AssetTypeDefinition`, `AssetTypeField`, `InventoryAsset` | Custom asset types (dynamic fields in JSON `attributes`) |
| `Ticket` | EMR support tickets |
| `ComparisonHistory` | CBS/NDWH weekly upload comparisons |
| `CriticalServerIssue` | Critical server issues panel |
| `AppSetting` | Key-value: **users**, **articles**, assignees, etc. |

**Not in Prisma tables:** Users and articles are JSON blobs in `AppSetting`.

---

## 11. API catalog (quick)

| Prefix | Notes |
|--------|-------|
| `/api/auth/*` | login, logout, me |
| `/api/users` | superadmin |
| `/api/facilities`, `/import` | facility CRUD/import |
| `/api/comparisons` | upload history |
| `/api/tickets/*` | tickets + critical servers |
| `/api/assets/*` | all asset CRUD, summary, lifecycle |
| `/api/asset-types/*` | custom type admin |
| `/api/dashboard/county` | bundled county dashboard |
| `/api/articles/*` | articles CRUD |
| `/api/geography/subcounties` | only cached route (1h) |

Most routes: `dynamic = 'force-dynamic'`, `revalidate = 0`, `no-store`.

---

## 12. Performance (known behavior)

### Why it feels slow
1. **Cloud DB latency** — every API hits Aiven MySQL (often 400ms–2s+ per query).
2. **Client fetch waterfalls** — pages fire many sequential/parallel `/api` calls.
3. **Pool limit 5** — concurrent requests wait for connections.
4. **No client cache** — `cachedFetch` intentionally always fresh.

### Worst hotspots (remaining)
| Area | Issue |
|------|--------|
| `reports` asset export | 6 types × N counties sequential |
| `tickets.tsx` | Duplicate facilities fetch on location change |

### Phase 1 optimizations (2026-05-22)
| Area | Change |
|------|--------|
| `overview-dashboard.tsx` | Single `/api/dashboard/overview` bundle (was ~12+ calls) |
| `app/page.tsx` | Map metrics deferred to client `/api/home/metrics` |
| `asset-manager.tsx` `loadAssets` | Parallel `Promise.all` per county |
| `/api/facilities`, `/api/assets/summary` | Server-side 30s/60s cache (`lib/server-cache.ts`) |
| `lib/cache.ts` | Client `cachedFetch` with 30s TTL + stale-while-revalidate |

### Good patterns
| Area | Pattern |
|------|---------|
| `nyamira-dashboard.tsx` | Single `/api/dashboard/county` bundle |
| `/api/assets/summary` | Prisma `groupBy` aggregation (`lib/asset-summary.ts`) |

### Performance tooling (added 2026-05)
| File | Role |
|------|------|
| `components/performance-provider.tsx` | Intercepts all `/api/*` fetch; records round-trip ms |
| `components/performance-panel.tsx` | Bottom-right **Perf** widget (dev + superadmin) |
| `lib/performance.ts` | Client timing store |
| `lib/server-timing.ts` | `X-Response-Time-Ms` + `Server-Timing` headers on API responses |
| `lib/prisma.ts` | Logs Prisma queries ≥200ms in dev |

**Panel shows:** page nav/DOM/load time, each API call (round-trip + server ms when header present), slow/failed counts.

Enable for any user: `localStorage.setItem('ndwh_perf_panel', '1')`

### Dev commands
```bash
npm run dev:clean    # rm -rf .next && next dev  (fix webpack cache corruption)
npm run build        # production build check
```

If webpack errors (`PackFileCacheStrategy`, missing chunks): **delete `.next`** and restart dev.

---

## 13. Key file index

| Path | Role |
|------|------|
| `app/layout.tsx` | Theme, Auth, Performance providers |
| `middleware.ts` | Auth gate |
| `lib/auth.ts` | Roles, modules, cookies |
| `lib/prisma.ts` | DB client + pool limits (Node.js only — no `$extends`; use `$on('query')` in dev for slow queries) |
| `lib/asset-inventory.ts` | Asset types, API paths, report rows |
| `lib/asset-lifecycle.ts` | Lost/recovered workflow |
| `lib/asset-summary.ts` | Dashboard aggregation |
| `lib/overview-stats.ts` | Overview dashboard stats from bundled API |
| `lib/server-cache.ts` | Server-side in-memory API cache |
| `lib/cache.ts` | Client cachedFetch with TTL |
| `app/api/dashboard/overview/route.ts` | Bundled overview data (facilities + tickets + servers) |
| `app/api/home/metrics/route.ts` | Home map county/subcounty metrics |
| `components/home-map-section.tsx` | Client home map loader |
| `lib/report-asset-export.ts` | Report Excel builders |
| `lib/master-facilities.ts` | NDWH+CBS merged facility list |
| `components/asset-manager.tsx` | Asset Command Center shell |
| `components/facility-manager.tsx` | Facility Manager |
| `components/tickets.tsx` | Tickets |
| `components/reports.tsx` | Reports |

---

## 14. Environment

- `DATABASE_URL` — Aiven MySQL connection string
- Auth fallbacks: `SUPERADMIN_*`, `ADMIN_*`, `GUEST_*` env vars (see `lib/auth.ts`)
- `PERF_LOG_PRISMA=1` — log all slow Prisma queries in production (optional)

---

## 15. Changelog (recent)

- **Asset Command Center:** Overview analytics, lost/recovered lifecycle, import for all built-in types
- **Reports:** Facility + asset + tickets only (NDWH/CBS compliance removed from reports page)
- **Summary API:** Rewritten with `groupBy` (was 50–66s, now seconds)
- **Performance panel:** Fetch + page load timing for debugging cloud latency
- **Phase 1 performance:** Overview bundle API, home metrics client fetch, parallel asset loads, server + client caching

---

*Last updated: 2026-05-22. Update this file when adding modules, routes, or changing data flows.*
