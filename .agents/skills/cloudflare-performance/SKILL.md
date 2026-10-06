---
name: cloudflare-performance
description: Make an EmDash + Astro site fast on Cloudflare Workers. Use when a page feels slow, when setting up or auditing edge caching, image optimization, CSS inlining, LCP/front-end delivery, D1/KV performance, D1 cross-region cold-load latency (read replication, Sessions API, query coalescing, why not Smart Placement), D1 indexes/rows-read cost, scroll-reveal content gated behind JS, parallelizing cold-render data fetches, Workers observability setup (including raising trace sampling to catch rare slow requests), or measuring real Core Web Vitals (LCP/CLS/FCP) vs curl TTFB. Diagnoses "why is this site slow" with wrangler tail, server-timing, curl, and headless-browser measurement. Covers the exact gotchas these sites hit and fixed, a known-good Core Web Vitals baseline to regress against, and how to benchmark against a known-fast reference site.
---

# Cloudflare Performance for EmDash + Astro

This site (`landing-page`) runs EmDash on Astro's Cloudflare adapter: D1 (content), R2 (media), KV (object cache), Worker Loader (sandboxed plugins). "Page feels slow" has several distinct root causes that look identical from the outside but need different fixes — a hanging plugin hook, dead-weight plugins loaded on cold start, missing edge cache, images never optimizing, render-blocking CSS, or D1 round-trip cost. They split into two layers: **backend/edge** (what the Worker and caches do before the HTML leaves the edge) and **front-end delivery** (what the browser must fetch and run before it paints). Diagnose which layer, and which cause, before changing config.

## Diagnose first, always

Don't guess. Do both of these before touching any config:

1. **Tail live logs** while reproducing the slowness:
   ```bash
   # pnpm/wrangler need Node 22.13+; this machine's default node is often older.
   source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && \
     pnpm --dir <site-dir> exec wrangler tail <worker-name> --format pretty
   ```
   Watch for `PluginBridge.storageGet - Exception Thrown` / `"Worker's code had hung"` —
   that means a plugin hook is hanging, not a caching problem. See "Broken plugin hooks" below.

2. **Time distinct pages, not repeats.** Hitting the same URL twice always looks fast once
   any cache is warm — that tells you nothing about what a real visitor navigating page to
   page experiences.
   ```bash
   for p in "/pages/about" "/posts/some-slug" "/category/some-cat" "/tag/some-tag"; do
     echo "=== $p ==="
     curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
       "https://<domain>${p}?cb=$(date +%s%N)"
   done
   ```
   Then compare a **repeat** request to the same URL — if repeat is dramatically faster,
   the gap is cold-render cost (D1 + no object cache), not a hang.

3. **Check headers** (`cf-cache-status`, `cache-control`) with `curl -s -D - -o /dev/null`.
   `BYPASS`/`MISS` on every request to the same URL means the HTML route cache isn't
   covering that path — go fix the route rule, not the Worker code.

4. **Read `server-timing` to split cold vs warm and attribute the cost.** EmDash emits a
   rich `Server-Timing` header on cache MISS. The `rt.*` sub-phases (`rt.db`, `rt.plugins`,
   `rt.market`, `rt.sandbox`, `rt.hooks`, ...) are populated **only on a cold isolate** — on
   a warm call `rt;dur=0` and they're absent. `db.total` + `db.count` tell you D1 cost and
   how many queries ran (the count jumps on cold start because bootstrap fires extra
   queries). `render` is page-render time. This is how you tell "slow because cold-start
   plugin bootstrap" from "slow because D1 query" from "slow render" without guessing.
   ```bash
   curl -s -D - -o /dev/null "https://<domain>/?cb=$RANDOM" | grep -i server-timing
   ```

5. **Front-end timing needs a real browser, not curl.** curl measures the HTML document
   only (TTFB, bytes). It can't measure First Contentful Paint, which is what "feels fast"
   actually depends on — that's gated by render-blocking CSS, fonts, and the LCP image, all
   client-side. Use a headless browser and read the Navigation + Paint Timing APIs:
   ```js
   const nav = performance.getEntriesByType('navigation')[0];
   const fcp = performance.getEntriesByType('paint').find(p => p.name==='first-contentful-paint');
   // report: nav.responseStart (doc TTFB), fcp.startTime (FCP), nav.loadEventEnd,
   //         external stylesheet count, preload<as=image> presence, slowest resources
   ```
   This is also the **only** way to measure a site fronted by a Cloudflare WAF / managed
   challenge: plain curl gets a `403 "Attention Required! | Cloudflare"` block page (which
   returns in ~50ms and looks deceptively "fast" — it's the block, not the site). A real
   browser passes the challenge (sets the clearance cookie), so navigate once to clear it,
   then reload and measure. Watch the first post-challenge load — it includes the challenge
   round trip (inflated FCP); the *reload* is the clean number.

### Comparing against a known-fast reference site

When benchmarking one EmDash site against another, the delivery methods may not be
symmetric (one open to curl, one behind a WAF). Note that in your report and compare
*shapes*, not just absolute ms — absolute TTFB from an agent's network location carries
latency to whatever Cloudflare colo served it, and cache-busted samples land on different
colos (DUS/AMS/MAD/CDG...), so a handful of samples is noisy. For a latency delta that
survives the noise, hammer enough cache-busted requests to see the bimodal split (warm
cluster vs cold cluster) and report median + p95 per cluster, not a single mean.

## 1. Broken plugin hooks (check this before anything else)

A single misbehaving plugin hook (`page:metadata`, `page:fragments`, etc.) that hangs
instead of failing fast can add 1-2s+ to **every single page render**, site-wide, with no
caching fix able to help. Symptom in `wrangler tail`:
```
PluginBridge.storageGet - Exception Thrown
✘ The Workers runtime canceled this request because it detected that your Worker's
  code had hung and would never generate a response.
(error) [page:metadata] Plugin "<id>" error: Storage collection not declared: <name>
```
The request still returns 200 (EmDash catches hook errors), but the render pays the full
stall before EmDash's own hook timeout gives up. Fix: disable or update the offending
plugin from `/_emdash/admin/plugins`. This is an admin-console action, not a code fix —
don't try to patch around a third-party plugin's broken manifest in site code.

### 1b. Dead-weight plugins loaded on every cold start

A subtler cousin: a sandboxed/marketplace plugin that is *installed and active* but does
nothing useful still gets its bundle fetched from R2, instantiated in the sandbox, and its
hooks resolved on **every cold isolate** — pure cold-start overhead. `wrangler tail` makes
this visible. On this site the tail showed, on each cold render:
```
EmDash: Loaded marketplace plugin audit-log:0.1.0 with capabilities: [content:read]
[hooks] Plugin "audit-log" declares content:beforeSave hook without content:write capability — skipping
[hooks] Plugin "audit-log" declares media:afterUpload hook without media:read capability — skipping
```
So it paid to load a plugin whose hooks were then **skipped as miscapability'd** —
~150-200ms of wasted cold-init work (measured from the gap between consecutive plugin
load-log timestamps). Fix: disable it in `/_emdash/admin/plugins` if unused, or grant it
the capabilities its hooks actually need so the load isn't wasted. After disabling, the
tail should show only the plugins you actually rely on (here, just `webhook-notifier`).

**Clearing up a red herring while you're here:** `marketplace: "https://marketplace.emdashcms.com"`
in `astro.config.mjs` does **not** mean page loads phone the marketplace. The `rt.market`
`server-timing` entry is cold-init-only (populated once per fresh isolate, empty on warm
calls) and only does a D1 plugin-state read + R2 bundle load — confirmed via `wrangler tail`
showing zero outbound fetch to the marketplace host during page renders. The marketplace
URL is contacted only when an admin installs/updates a plugin.

## 2. Edge-cache HTML (Workers Cache)

Astro's `Astro.cache.set(cacheHint)` calls throughout EmDash's query helpers are no-ops
until you actually configure a cache provider. Without this, every page re-runs the full
Worker every time, even for anonymous, cacheable content.

```js
// astro.config.mjs
import { cacheCloudflare } from "@astrojs/cloudflare/cache";

export default defineConfig({
  adapter: cloudflare(),
  cache: { provider: cacheCloudflare() },
  routeRules: {
    "/": { maxAge: 300, swr: 86400 },
    "/posts/**": { maxAge: 300, swr: 86400 },
    // ...every public route pattern, using the same [param]/[...rest] syntax as file routing
  },
});
```

**Gotcha:** enabling `cache.provider` changes the *default* behavior for every route, not
just the ones you list. Any route without an explicit `routeRules` entry — including
routes injected by integrations (EmDash's own CMS media route, Astro's own `/_image`
endpoint) — gets downgraded to a conservative `Cache-Control: max-age=0, must-revalidate`,
even if that route already set its own long-lived header. You must add explicit rules for
those too, or you'll regress something that used to cache correctly:

```js
routeRules: {
  // ...page rules above...
  "/_emdash/api/media/file/[...key]": { maxAge: 31536000 }, // immutable ULID filenames
  "/_image": { maxAge: 31536000 }, // deterministic per unique href+w+h+format query
},
```
Without the `/_image` rule specifically, every responsive image variant recomputes via
Cloudflare Images on *every* request (1-2s each) instead of being cached after the first.

Verify: `curl -s -D - -o /dev/null <url> | grep cf-cache-status` — first hit `MISS`,
repeat hits `HIT`.

## 2a. Never bake per-user state into a cached page (the auth-header trap)

The Cloudflare edge cache (section 2) keys entries by **URL only** — no `Vary`, no
cookie awareness. So any page whose SSR output differs by *who is viewing* (a header that
reads `Astro.locals.user` to show "Sign in" vs "My account / Sign out", a greeting, a
cart count) will have **one** variant stored and served to everyone. Whichever request
populates the cache first wins:

- anonymous populates it → logged-in users get the "Sign in" header (and any sign-in-page
  SSR gate `if (Astro.locals.user) redirect("/")` throws them into a loop: the auth page
  thinks they're logged in and bounces to `/`, but cached `/` shows "Sign in", so they
  click again — forever);
- a logged-in request populates it → anonymous visitors get "My account / Sign out".

This looks exactly like an auth/session bug and sends you debugging cookies for hours.
It is not. **Confirm it is caching** in one shot: fetch `/` with a valid session cookie
and check the body + `cf-cache-status`:

```bash
curl -s -b "$SESSION_JAR" -D - -o /tmp/x.html "https://<domain>/" | grep -i cf-cache-status
grep -oE 'Sign in|My account' /tmp/x.html   # logged-in cookie but body says "Sign in" + HIT = cache poisoning
```
If a logged-in request returns `HIT` with the anonymous header, that's this bug.

**Why the obvious fixes don't work:**
- `Astro.cache.set(false)` in a page/middleware only stops *storing* this response; it
  cannot stop the edge *serving* an entry it already holds — and on a HIT the Worker never
  runs at all, so your bypass code never executes. (The `cacheCloudflare` provider is
  header-only: it emits `Cloudflare-CDN-Cache-Control`; the serve/store is the edge's, in
  front of the Worker, keyed by URL. There is no cookie-aware cache-key hook in the
  provider or route-rule schema.)
- Dropping the route from `routeRules` fixes correctness but kills the cache for everyone,
  including anonymous visitors — the opposite of what you want.

**Two fixes that actually work:**
1. **Cache the shell, hydrate auth client-side (no dashboard, keeps full cache — preferred).**
   Render the header *auth-agnostic* at SSR: emit both states in the DOM (anonymous shown,
   logged-in `hidden`), never reading `Astro.locals.user`. A tiny client script calls
   `/api/auth/get-session` and swaps blocks. The SSR HTML is then byte-identical for all
   visitors, so it caches safely and is correct for everyone. Verify the cached `/` body is
   identical for an anonymous vs a cookie-bearing request. (This is what this site does —
   see `src/layouts/Base.astro`.) Note `get-session` returns Better Auth's string `role`,
   NOT EmDash's numeric role, so you can't gate an Admin link client-side; link admins
   straight to `/_emdash/admin` instead.
2. **Bypass-on-cookie at the edge (needs a Cloudflare zone/dashboard).** Add a Cache Rule
   that bypasses cache (or adds the session cookie to the cache key) when the request
   carries your session cookie. Anonymous stays cached; logged-in always misses to the
   Worker. This is the standard WordPress/Drupal pattern, but it lives in Cloudflare
   config, not Astro code, and isn't available on a bare `*.workers.dev` deploy.

Rule of thumb: **if the HTML changes per user, it must not be in a URL-keyed shared cache.**
Push the per-user part to a client fetch, or bypass the cache for authenticated requests.

## 3. Image optimization actually running

EmDash's `<Image>` (`emdash/ui`) delegates to Astro's configured image service
(`astro:assets`). On Cloudflare with an `IMAGES` binding this means real WebP/AVIF +
responsive `srcset` — **but only for authorized origins**:

```js
image: {
  layout: "constrained",
  responsiveStyles: true,
  remotePatterns: [
    { protocol: "https", hostname: "<canonical-domain>" },
    { protocol: "https", hostname: "<workers.dev-host>" },
  ],
},
```
Without `remotePatterns` covering the site's own media origin, the image service silently
passes every image through unchanged — no error, no warning, just full-size raw PNGs
forever. This is the most common reason "images aren't optimizing" despite everything
else being wired up correctly.

Also set `priority` (eager load + high fetch priority) on the first/above-fold image on
every page — EmDash's `<Image>` defaults every image to `loading="lazy"`, including the
one visible the instant the page loads. That delays the browser from even starting the
LCP fetch. Thread a `priority` prop through any card/list component to the first item.

**LCP image preload is a safe, non-blocking add on top of `priority`.** `priority` gets
you `loading="eager"` + `fetchpriority="high"` on the `<img>`, which is most of the win.
A `<link rel="preload" as="image">` in the `<head>` is the remaining increment: it starts
the fetch during HTML parse, slightly before the parser reaches the `<img>`. A preload
does **not** block rendering or page load — it's a "fetch this early" hint, not a
dependency; HTML/CSS/text all paint without waiting on it (worst case: text paints on
time, image fills in). Only external `<link rel="stylesheet">` is render-blocking, not
image preloads. Note: Astro's `priority` is *supposed* to also emit the preload link, but
whether it does depends on the Astro version — verify in the live HTML
(`grep 'rel="preload".*as="image"'`); if it's missing, add it manually in the layout for
the known hero image. A reference EmDash site (everybittexas.com) ships exactly this: an
`as="image"` preload of the Cloudflare-transformed WebP hero.

**When you add the preload by hand, resolve the image ONCE for both the `<img>` and the
preload — or you get a double download.** A responsive `<img>` has a `srcset`; the browser
picks one variant. If your hand-written `<link rel="preload" as="image">` points at a
different URL (or omits `imagesrcset`/`imagesizes`), the browser preloads one variant then
downloads another for the `<img>` — two fetches, worse than no preload. Fix: call Astro's
`getImage()` (the same `astro:assets` service `<Image>` uses) once in the page frontmatter,
then feed that single result to BOTH the hero `<img>` attrs and the preload link
(`href` + `imagesrcset` + `imagesizes` + `fetchpriority="high"`). The variants match by
construction, so it stays a single fetch. Gotcha: pass the media object's own cached
width/height to `getImage()` — Astro's `inferSize` (which fetches the image to read
dimensions) fails during edge SSR. Fall back to plain `<Image>` when the image can't be
resolved so the placeholder branch still renders. Scope it to the hero only; leave
below-the-fold images on lazy `<Image>`.

## 3a. Browser Cache-Control for optimized images (edge ≠ browser)

Enabling `cache.provider: cacheCloudflare()` + a `routeRules` `maxAge` (section 2) makes the
Workers **edge** cache store `/_image` variants and `/_emdash/api/media/file/*` for a year —
verify with `curl -sD- -o/dev/null <img-url> | grep cf-cache-status` → `HIT` with an `age:`.
But on the Astro Cloudflare adapter the response that reaches the **browser** still carries
the conservative default `cache-control: public, max-age=0, must-revalidate`
(withastro/astro#13164, #16692 — the adapter only injects immutable `Cache-Control` for
`/_astro/*` static assets, not for `/_image` or the CMS media route). The symptom:

```bash
curl -sD- -o/dev/null "<domain>/_image?...&f=webp" | grep -i cache-control
# cache-control: public, max-age=0, must-revalidate   <-- browser won't cache
```

So the edge serves images fast, but **every repeat view and every client-side navigation
re-requests each image over the network and pays a revalidation round trip**, even though
the bytes never change. Measured on this site: 4 homepage images, ~160 KB re-fetched on every
navigation; after the fix, `imgNetworkKB: 0` and `imgFromBrowserCache: 4/4` on repeat views,
and a home revisit dropped from ~3.3s to ~480ms (warm).

**Fix — set the header in the site's own Worker entry (`src/worker.ts`), no plugin:** wrap the
re-exported EmDash handler's `fetch` and rewrite `Cache-Control` to
`public, max-age=31536000, immutable` for **only** those two path shapes, **only** on
successful GETs. Both are safe to cache immutably: media filenames are content-addressed ULIDs,
and each `/_image` variant is keyed by its full `href+w+h+f` query, so a given URL always
yields identical bytes.

```ts
// src/worker.ts
import emdashWorker, { PluginBridge } from "@emdash-cms/cloudflare/worker";
export { PluginBridge };

const IMMUTABLE = "public, max-age=31536000, immutable";
const isImg = (p: string) => p === "/_image" || p.startsWith("/_emdash/api/media/file/");
const baseFetch = emdashWorker.fetch;

export default {
  ...emdashWorker,
  fetch: baseFetch ? async (req, env, ctx) => {
    const res = await baseFetch(req, env, ctx);
    if (req.method !== "GET" || !res.ok) return res;        // never widen non-200 / non-GET
    let p: string; try { p = new URL(req.url).pathname; } catch { return res; }
    if (!isImg(p)) return res;                               // leave HTML + admin/API untouched
    const headers = new Headers(res.headers);               // clone — original may be locked
    headers.set("cache-control", IMMUTABLE);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } : undefined,
} satisfies ExportedHandler;
```

**Critical safety:** gate on `res.ok` and `method === "GET"`, and allow-list exactly the two
image path prefixes. Do NOT broaden the match — EmDash admin/API responses are deliberately
`private, no-store` and must stay that way; widening the cache on those would be a cache-poisoning
/ data-leak bug. Verify after deploy that `/_emdash/admin` still has no public `Cache-Control`
and HTML pages are still `no-cache`.

This does **not** speed up the first transform of an uncached variant (that's the edge cache's
job, section 2/3) — it only stops the browser re-fetching bytes it already has. If EmDash ever
ships a long-lived browser `Cache-Control` on these routes itself, delete the wrapper.

## 3b. Inline all CSS (kill render-blocking stylesheets)

By default Astro emits component CSS as external `<link rel="stylesheet">` files. Those
are **render-blocking**: the browser must fetch each one before it can paint, adding a
round trip (or several) to the critical path of every page — even when the HTML itself is
served instantly from the edge cache (section 2). For a content site whose total CSS is
small (tens of KB), inlining it straight into each page's `<head>` is a clear win:

```js
// astro.config.mjs
export default defineConfig({
  build: {
    inlineStylesheets: "always",
  },
});
```

After this, the page paints directly from the HTML document with zero stylesheet fetches.
Verify by rebuilding and confirming **no** `.css` files land in `dist/client/_astro/`
(`find dist/client/_astro -name '*.css' | wc -l` → `0`), and that the live HTML has no
`<link rel="stylesheet">` (`curl ... | grep 'rel="stylesheet"'` → nothing). Before this
change, this site shipped 3 blocking stylesheets (`Base.css`, `index.css`,
`reading-time.css`); after, all CSS is inlined.

Trade-off: inlined CSS isn't shared/cached across pages the way an external file is, so
each HTML response carries its own copy. For a site with a handful of KB of CSS and
edge-cached HTML this is the right call. If the CSS ever grows large (hundreds of KB) or
is near-identical across every page, revisit — `"auto"` (Astro's default heuristic:
inline small sheets, link large ones) becomes the better setting at that scale.

The reference fast EmDash site (everybittexas.com) ships **0 external stylesheets** — all
CSS inlined — which is the single biggest reason its First Contentful Paint is so tight
(~400-570ms warm) despite the same EmDash/Astro/Cloudflare stack.

## 4. Real favicon, not just a CMS setting

EmDash renders a favicon from `siteSettings.favicon` if an admin sets one, but there's no
static fallback — an unconfigured site 404s on `/favicon.ico`. Ship one directly:
- `public/favicon.svg` — `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
- A raster fallback (`public/favicon.png` + `public/favicon.ico`) for browsers that don't
  fully trust SVG-only favicons. Rasterize with `sharp` if you don't have a design asset:
  ```js
  const sharp = require("<path-to>/node_modules/.pnpm/sharp@<version>/node_modules/sharp");
  sharp(svgBuffer, { density: 384 }).resize(32, 32).png().toBuffer()
    .then(buf => { fs.writeFileSync("public/favicon.png", buf); fs.writeFileSync("public/favicon.ico", buf); });
  ```
  (`sharp` is often already present as a transitive dependency but not hoisted — resolve
  its real path under `node_modules/.pnpm/` rather than `npm install`-ing a new copy.)

## 4b. Preconnect to cross-origin third-party resources

Any script/style/font/widget loaded from a *different* origin (an analytics tag, an
embedded search/chat widget, a font CDN) makes the browser pay a cold DNS + TLS handshake
the first time it reaches that resource's URL in the markup. On a real site that handshake
was the single longest leg of the request graph (~300ms) even though the resource itself
was small and deferred. A `<link rel="preconnect" href="https://<third-party-origin>"
crossorigin>` in `<head>` warms that connection in parallel with earlier work, so when the
resource is actually requested the socket is already open.

Key points:
- A preconnect (like a preload) is a hint, not a dependency — it never blocks paint. Pure
  upside for a known third-party origin that *will* be used on the page.
- Add `crossorigin` when the eventual fetch is CORS (e.g. a `type="module"` script or a
  font), so the warmed connection actually matches and gets reused.
- Only preconnect origins you're confident the page uses — each one holds a connection
  open, so don't spray preconnects at origins that might not be hit.
- Prefer emitting it from whatever *owns* the third-party resource (e.g. the plugin that
  injects the widget, deriving the origin from its own configured endpoint) rather than
  hardcoding the host in the site layout — that keeps it correct across config changes and
  benefits every site using that plugin. Hardcoding in the layout works as a quick test but
  goes stale if the endpoint changes (a stale preconnect is harmless, just ignored).
- Measure it in PageSpeed Insights / Lighthouse under the network-dependency-tree /
  "Maximum critical path latency" diagnostic — a correct preconnect shows the third-party
  leg shrink and the origin listed under "Preconnected origins".

## 5. Object cache (KV) in front of D1

Every page render does several D1 round trips (site settings, menus, content, taxonomy
terms, bylines). With no cache layer, each of those is a fresh query even on a warm
isolate. `objectCache` caches content/config reads in KV so most of that becomes a KV hit
instead of a D1 round trip:

```js
// astro.config.mjs
import { d1, r2, kvCache } from "@emdash-cms/cloudflare";

emdash({
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({ binding: "MEDIA" }),
  objectCache: kvCache({ binding: "CACHE" }),
});
```
```jsonc
// wrangler.jsonc
"kv_namespaces": [{ "binding": "CACHE", "id": "<namespace-id>" }],
```
Create the namespace with `wrangler kv namespace create CACHE` (needs your Cloudflare
account — this creates a real, billable-category resource, though KV's free tier covers
low-traffic sites comfortably). This is distinct from Workers Cache (section 2): a hit
here never runs the Worker's D1 queries, but it also doesn't skip the Worker like an
edge-cache HTML hit does — the two layers solve different problems and are meant to be
used together, not as alternatives.

**Measuring it correctly (two traps that make it look like a no-op):**

1. **It only helps WARM isolates.** The cache is epoch-keyed: the *first* render of a
   given key on a cold isolate is always a MISS and runs the full DB queries; only
   subsequent renders on that same warm isolate (or any render sharing already-cached
   settings/menus/taxonomy/entry keys) skip D1. So a benchmark of only cache-busted,
   cross-colo, cold-isolate requests will show ZERO improvement by construction — that's
   exactly the one case the cache can't help. To see the win, hit origin renders rapidly
   enough to reuse a warm isolate (`rt;dur=0` in `server-timing`) and compare `db.count`
   there.
2. **Watch `db.count`, NOT `cache.hit`/`cache.miss`.** The `server-timing` `cache.hit` /
   `cache.miss` counters measure EmDash's *in-request dedupe*, not this object cache — they
   stay flat regardless of whether KV is working, so they're useless for verifying it. The
   only observable signal of a working object cache is `db.count` (and `db.total`) dropping
   on warm renders. Measured on a real site: a warm render went from ~14 D1 queries to ~2–3
   once the cache was active, with `db.total` dropping from ~500ms to ~60ms.

If `db.count` never drops even on warm isolates, the cache is silently a no-op. Most likely
cause: the KV binding named in `kvCache({ binding })` isn't present at runtime — if
`createObjectCache` can't find `env[binding]` it throws, the runtime swallows it to a
null (passthrough) backend, and only warns in DEV. Confirm the binding shows in the
`wrangler deploy` output (`env.CACHE  KV Namespace`) and that `objectCacheConfig` is baked
into the build.

**Reality check on impact:** this speeds warm *origin* renders and cuts D1 load, but your
most common real traffic is edge-HTML HITs (section 2) that skip the Worker entirely and
never touch D1 or KV — those see no change. The object cache's payoff is the in-between
(cache-miss renders on warm isolates, and routes without edge rules), plus lower D1
row-read pressure as traffic grows. Treat it as D1-offload + tail-latency, not an FCP/LCP
win.

## 6. D1 geo-latency: read replicas + Sessions + coalescing (NOT Smart Placement)

The classic "4s on first load, instant on reload" complaint on a content site is almost
always **cross-region D1 latency on the cold path**, not slow SQL. EmDash makes several D1
round trips per cold SSR render; if the D1 primary is in one region and the visitor is in
another, every round trip pays a geography tax. The reload is fast because it's served from
the edge HTML cache (section 2) and never touches D1.

### Prove it's I/O, not SQL, before changing anything

Two cheap checks pin the root cause:

```bash
# 1. Where is the D1 primary, and is the SQL actually slow?
source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1
npx wrangler d1 execute <db-name> --remote --json --command "SELECT 1 AS ok;" | grep -E 'served_by_region|served_by_primary|sql_duration'
#  served_by_region: "EEUR", served_by_primary: true, sql_duration_ms: ~0.3
#  -> SQL is sub-millisecond; the DB lives in ONE region (here Frankfurt/EEUR).

# 2. wrangler tail during a cache-busted cold request — compare wallTime vs cpuTime.
#    wallTime ~1300ms with cpuTime ~100ms means ~1200ms is pure I/O WAIT on D1,
#    not compute. That gap IS the cross-region round-trip cost.
```

If `cpuTime` is small and `wallTime` is large, the fix is geography/round-trips, below.
Index tuning (section 6a) and query rewrites do NOT help this — they speed SQL execution,
which was already <1ms.

### The three fixes that actually apply (all used together)

1. **Enable D1 read replication** — the main lever. Replicas are eventually-consistent
   read-only copies Cloudflare places near traffic, so anonymous reads resolve locally
   instead of crossing to the primary. There is no wrangler subcommand in current
   wrangler; set it via the REST API (needs a Cloudflare token/OAuth with `d1 write`):
   ```bash
   curl -s -X PATCH \
     "https://api.cloudflare.com/client/v4/accounts/<ACCT>/d1/database/<DB_ID>" \
     -H "Authorization: Bearer <CF_TOKEN>" -H "Content-Type: application/json" \
     --data '{"read_replication":{"mode":"auto"}}'
   #  -> "read_replication":{"mode":"auto"}, "success":true
   ```
   The primary does NOT move (`running_in_region` stays the original region) — replicas are
   additive. They warm **lazily per region** as real traffic arrives: right after enabling,
   some cold requests still fall through to the primary (~1.3s) while others hit a fresh
   replica (~0.4s). It evens out to consistently-fast over the first hours of traffic. Don't
   judge it on the first few cache-busted samples.

2. **`session: "auto"`** in `d1({ ... })` (astro.config.mjs) — routes reads through the D1
   Sessions API to the nearest replica, and preserves read-your-writes for authenticated
   admins via a bookmark cookie. This is a no-op without replicas (step 1); with them it's
   what actually sends a read to the local replica. Already the default on this template.

3. **`coalesce: true`** in `d1({ ... })` — batches all same-turn `SELECT`s into ONE
   `batch()` round trip instead of N serial ones. The cold homepage render issues several
   independent reads (core init + projects + posts + settings + post tags); coalescing
   collapses their round trips. Only takes effect with sessions enabled. Combine with
   section 8 (`Promise.all`) so the queries are actually issued in the same turn to coalesce.
   ```js
   database: d1({ binding: "DB", session: "auto", coalesce: true }),
   ```

Measured on this site after all three: warm edge HIT ~74ms; cold hitting a replica ~0.37s;
cold still routing to a not-yet-warm region's primary 1.3–2.2s (shrinking as replicas spread).

### Do NOT use Smart / Targeted Placement with read replicas

`placement: { mode: "smart" }` moves the Worker to run near its *backend* instead of near
the *visitor*. That's for a worker whose backend is a **single fixed location** it round-trips
to a lot. The moment you enable read replication (step 1), that's no longer true — the whole
point of replicas is to serve reads near the visitor. Pinning the Worker near the primary
would **defeat the replicas** (every visitor routes to the primary's region first) AND slow
the edge-cache fill + static-asset serving for everyone far from that region. The two
strategies are mutually exclusive; for a read-heavy public content site, **replication is the
right one** and Smart Placement is the wrong one. (An earlier version of this skill
recommended targeted placement — that predated enabling replication and is superseded.)

## 6a. Indexes and rows-read (cost, not the geo-latency fix)

Indexes do NOT fix cross-region latency (section 6) — they speed SQL execution and, on D1
specifically, cut **cost**: D1 bills by *rows read* (every row SQLite scans, not rows
returned), so a full table scan on a big table is billed for the whole table. An index lets
D1 jump to matching rows. Apply only when a query scans a large table:

- Index columns used in `WHERE`, `JOIN ... ON`, and multi-column filters (and `ORDER BY`
  columns like `published_at`). Multi-column index `(a, b)` is only used when the query
  filters on `a` (the leftmost column), optionally plus `b`.
- Check a query with `EXPLAIN QUERY PLAN <sql>`: `SCAN` = full scan (bad), `SEARCH ... USING
  INDEX` = good. Run `PRAGMA optimize` after creating indexes.
- Create indexes ONCE via D1 migrations, never on the request hot path (building an index
  writes a row per indexed row, billed at the higher write rate).

**But: don't hand-add indexes to EmDash's own tables.** EmDash ships and owns its schema
(80+ tables) through its own migrations; a manual index can conflict with a future migration.
If a specific EmDash query shows a `SCAN` on a large table, that's an upstream fix, not
site-code surgery.

**Prisma Optimize — not applicable here, don't reach for it.** It only works through Prisma
Client (this stack uses EmDash's Kysely-based D1 dialect, no Prisma), and Prisma has since
sunset Optimize in favor of Query Insights that's built into Prisma Postgres only — not D1.
Adding Prisma purely for indexing advice is a whole ORM + dependency for zero gain, and it
still wouldn't touch the geo-latency that's the actual cold-load cost.

## Local dev limitations (don't waste time debugging these as "bugs")

- `pnpm dev` / `pnpm preview` need `workerd`, which requires macOS 13.5+ or Linux. On an
  older macOS (common on a personal dev machine), these commands fail outright — this is
  an environment limitation, not a site bug. Use `pnpm deploy` (builds + `wrangler deploy`
  in one step) and test against the live Worker instead.
- `pnpm`/`wrangler` require Node 22.13+; if the shell's default `node` is older, every
  wrangler command fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Switch with nvm
  first (see the tail command at the top of this file).
- When running long-lived commands like `wrangler tail` via an agent's async terminal
  tooling, prefer a single command with `nvm use` chained via `&&` in one string — some
  terminal tools silently drop a leading `cd ...&&` prefix on compound commands.
- **A `git push` to `main` auto-deploys and OVERWRITES your manual `wrangler deploy`.**
  This Worker is connected to Cloudflare Workers Builds: every push to `main` triggers a
  fresh build from git ~1-2 minutes later, and that build becomes the live version. If
  `package.json` in git points at something the CI machine can't see (a local `file:`
  tarball, or an unpublished version range that resolves to an OLD npm release), CI ships
  the OLD dependency and silently replaces the good manual deploy. Symptom: "it worked
  right after I deployed, then broke again a couple of minutes after I pushed" - and a
  rebuild/cache clear on your machine changes nothing. Diagnose by comparing
  `wrangler deployments list` timestamps against your `git log` push times: a deploy you
  didn't run, ~2 minutes after each push, is CI. Fix: make git the source of truth - pin
  the dependency to something CI can install (an exact `github:owner/repo#<commit-sha>`
  for an unpublished plugin, or a published version), commit the lockfile, and verify
  with a clean `git clone` + `pnpm install --frozen-lockfile` that it resolves the
  right code. Never leave `file:/Users/...` in a committed `package.json`.
  Always verify behavior on the live domain AFTER the auto-deploy lands, not just after
  your own deploy.
- **Stale Vite cache serves OLD plugin code after you change a dependency.** When you
  bump/repack a workspace plugin (e.g. a local `emdash-*` tarball) and rebuild, `rm -rf
  dist .astro` is NOT enough: Vite caches the plugin's bundled modules under
  `node_modules/.vite`, so the Worker ships the PREVIOUS version of that plugin's code
  even though `node_modules/<plugin>/` on disk is the new one. Symptom: the installed
  source has your fix (`grep` finds it in `node_modules/<plugin>/...`) but the deployed
  Worker behaves like the old code (e.g. a new Set-Cookie / header never appears live).
  Fix: clear the Vite cache too before building —
  `rm -rf dist .astro node_modules/.vite` — then `pnpm build && wrangler deploy`.
  Verify the behavior at the edge (e.g. `curl -sD- -o/dev/null <auth-endpoint> | grep -i
  set-cookie`), not just that the source on disk contains the change.

## 7. Scroll-reveal must not gate content on JS

A "feels like the page waits to load everything" complaint on a list page
(`/posts`, `/projects`) is often NOT images and NOT the edge cache — it's a
scroll-reveal animation that starts content at `opacity: 0` and only reveals
it once an `IntersectionObserver` runs. The HTML, text, and card layout all
arrive fast (edge-cached), but every card sits invisible until JS boots and
the observer fires. On a slow connection, slow JS, or JS blocked entirely,
the grid stays blank the whole time.

Symptom: `curl` shows the HTML is complete and fast, but in a browser the
cards are blank until JS runs. Confirm by reading computed opacity right
after load, or by loading with JS disabled:

```js
// JS disabled context in Playwright — simulates slow/blocked JS
const ctx = await browser.newContext({ javaScriptEnabled: false });
// ...goto the page, then:
[...document.querySelectorAll('.post-card-wrapper')].map(el => getComputedStyle(el).opacity);
// All "0" = content is gated behind JS. Should be "1".
```

The culprit lives in the shared layout (`Base.astro`), not the page — a
global rule like:

```css
[data-reveal] { opacity: 0; transform: translateY(20px); transition: ...; }
[data-reveal].is-revealed { opacity: 1; transform: none; }
```

**Fix: gate the hidden start-state behind a `.js` flag set inline in `<head>`
before first paint.** Content renders visible by default; the fade only
applies once JS is confirmed live. No-JS and slow-JS both show content
immediately, and there's no flash because the class is set before paint.

```html
<!-- inline in <head>, runs before first paint -->
<script is:inline>
  document.documentElement.classList.add("js");
</script>
```
```css
.js [data-reveal] { opacity: 0; transform: translateY(20px); transition: ...; }
.js [data-reveal].is-revealed { opacity: 1; transform: none; }
```

Gotcha: bump the `prefers-reduced-motion` override to the same `.js`
specificity (`.js [data-reveal], [data-reveal] { opacity: 1; ... }`) or the
`.js`-scoped rule (0,2,0) outranks the media-query rule (0,1,0) and
reduced-motion visitors get the hidden-until-JS behavior back.

This is a FCP/perceived-load fix, not a byte or TTFB fix — the measured win
is "content visible at 0ms" instead of "visible only after JS boots."

## 8. Parallelize independent data fetches (cold-render tail)

EmDash query helpers are `await`ed one per line, which reads naturally but
serializes independent DB round-trips. On a cold render (cache MISS, cold
isolate) each one adds to the tail. Two hot spots on this site:

- **`Base.astro`** (runs on EVERY page): `getSiteSettings()`,
  `getMenu("primary")`, `getMenu("social")`, `getEmDashCollection("pages")`
  were four serial awaits. None depend on each other.
- **Detail pages** (`posts/[slug]`, `projects/[slug]`): after the entry
  fetch (which must run first — it owns the 404 guard), `getSiteSettings()`,
  the recent-posts/projects rail, and `resolveHero()` were serial. All three
  are independent of each other.

Fix: batch each independent group with `Promise.all`. Keep anything that
genuinely depends on an earlier result (e.g. `getTermsForEntries` needs the
list of other posts first) after the batch.

```ts
const [siteSettings, menu, socialMenu, pagesResult] = await Promise.all([
  getSiteSettings(), getMenu("primary"), getMenu("social"), getEmDashCollection("pages"),
]);
```

Caveat (measured): this helps the cold-render wall-clock, but the dominant
cold cost is EmDash's own plugin/middleware bootstrap (17-18 D1 queries on a
cold isolate), which site code can't trim. Real users hit the `swr` edge
cache (~60-80ms TTFB) and never pay the cold path, so don't oversell this —
it's a tail-latency cleanup, not a headline FCP win. Verify the `?cb=`
cache-busted numbers are the only ones that look slow; normal navigation is
already fast.

## 9. Enable observability + keep compatibility_date current

From the official `cloudflare/skills` (`workers-best-practices`): enable
Workers Logs + Traces in `wrangler.jsonc` before production, so live errors
and slow renders land in a searchable dashboard instead of only ephemeral
`wrangler tail`. The top-level `enabled` alone does NOT turn on traces — set
each sub-key.

```jsonc
"observability": {
  "enabled": true,
  "logs":   { "enabled": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true, "head_sampling_rate": 0.01 }
}
```

**Temporarily raise trace sampling to CATCH a rare slow cold request.** At
`traces.head_sampling_rate: 0.01` (1%) a specific slow cold request almost never lands in a
trace, so you can't see its per-query D1 timing in the dashboard. When actively diagnosing,
bump it to `1` (100%), redeploy, reproduce, read the trace — then **put it back to a low
value (~0.05) and redeploy when done.** Workers Logs/Traces bill per event ingested beyond
the free tier, so 100% trace sampling left on steady traffic costs money. Treat the bump as a
diagnosis window, not a permanent setting — and leave a reminder to revert it, because it's
easy to forget while chasing the actual bug. (`wrangler tail` is the zero-cost alternative for
live, hands-on reproduction; dashboard traces are for catching intermittent cases after the
fact.)

Also keep `compatibility_date` current (bump periodically, redeploy, confirm
key pages still 200). Stale dates miss runtime fixes; this stack only needs
`nodejs_compat`, so bumps are low-risk but should still be smoke-tested.

## 10. Measure real Core Web Vitals, not curl TTFB

`curl` measures the HTML document only. "Feels fast" is Core Web Vitals
(LCP, CLS, INP) — all client-side. Per `cloudflare/skills` `web-perf`, use a
real browser and the Navigation/Paint/PerformanceObserver APIs. Chrome
DevTools MCP gives the richest trace; a headless Playwright browser reading
the timing APIs is a solid substitute when that MCP isn't installed.

Install the LCP + CLS observers BEFORE navigation (`buffered: true`), load
the page, wait ~2.5s for them to settle, then read:

```js
new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
  .observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver(l => { const es = l.getEntries(); window.__lcp = es[es.length-1].startTime; })
  .observe({ type: 'largest-contentful-paint', buffered: true });
// after load + settle:
const nav = performance.getEntriesByType('navigation')[0];
const fcp = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
// report nav.responseStart (TTFB), fcp.startTime, window.__lcp, window.__cls
```

Thresholds (good): TTFB <800ms, FCP <1.8s, LCP <2.5s, CLS <0.1, INP <200ms.

### Known-good baseline for this site (warm, 1280×800, measured)

Use this as the regression bar — if a change pushes any page past these,
investigate before shipping.

| Page            | TTFB | FCP   | LCP   | CLS | blocking CSS |
|-----------------|------|-------|-------|-----|--------------|
| Home `/`        | 61ms | 572ms | 572ms | 0   | 0            |
| Posts list      | 62ms | 408ms | 792ms | 0   | 0            |
| Projects list   | 57ms | 396ms | 580ms | 0   | 0            |
| Post detail     | 67ms | 516ms | 552ms | 0   | 0            |
| Project detail  | 65ms | 424ms | 1.34s | 0   | 0            |

All metrics are well inside "good". `blockingStylesheets: 0` everywhere
confirms section 3b (inline CSS) is holding. CLS 0 everywhere confirms images
carry `width`/`height`. The project-detail LCP (1.34s, full-width hero
transform) is the slowest LCP and still "good" — not worth chasing. Per the
`web-perf` skill: a site this far inside the thresholds has no perf issue to
fix; say so rather than inventing work.
