# Shopify scraper audit

Scope: full repository remediation, private Actor verification, competitor/Store drafts. Production code, source/build tags, pricing, permissions and publication excluded. Example metadata only is authorized.

Baseline: `6d74af50fdc5a60ad94fe075a3c8ab93dd95942a`, clean clone, branch `codex/shopify-scraper-audit`, repository QuickLifeSolutions/shopifyproducts_scraper.

Production identity verified via authenticated API: `RTtOrCLuwbdkujaID`, `dainty_screw/shopify-products-scraper`, public; version 0.0 GIT_REPO points to repository #master. latest db5x776dAsp3qoJAN (0.0.4); beta QaBhADIYeamBY3Y3M. Initial example is unrelated helloWorld. See sanitized before snapshots.

Confirmed findings: Node 16/SDK2 obsolete; no lockfile/CI/tests; README input and dynamic-content claims false; USD hardcoded; zero price and false shipping lost; undefined arrays crash; discovery errors swallowed; mixed sitemap/product queue; no independent discovery budget; failure rows pollute billable dataset; inconsistent defaults; no output/dataset/KV schemas; unsafe URL/redirect boundaries.

Implemented: Node 22/24-compatible SDK3 HTTP/Cheerio runtime, clean lockfile installation/CI, independent request/sitemap/product/row budgets, serialized durable emission, same-store URL/DNS/redirect validation, retries/backoff, true currency/zero/false preservation, trusted-hook migration notes, failures in RUN_SUMMARY rather than billable dataset, checkpointing and graceful-abort drain. Automatic/custom proxy selection preserved; an SDK local direct-fallback behavior now fails explicitly.

Local: 15 focused regressions pass; clean npm ci, lint, maintained-input/default consistency, all four applicable Apify schemas and npm audit pass (0 vulnerabilities). Real apify run executed: Windows telemetry PATH resolved; local CLI proxy credentials returned 'User not found' and the fixed code reports proxy_error rather than falling back. Earlier direct diagnostic runs are not proxy-readiness evidence. Network blocking is reported separately from validation.

Private Actor: `EcVXdeCli75Lqff51`, `dainty_screw/shopify-products-audit-20261123`, confirmed private. 256 MB, 120–180 seconds/run, bounded HTTP attempts and retries, per-run event-charge cap $0.10 (not a compute/proxy cap). No paid competitor runs. Initial broad smoke tests used default 3 retries; later focused tests used zero retries. Actual usage is being collected.

Hosted evidence so far: build 1.0.2 / sFLAatt7pIsWhOb3d, run gLY78jcLYfE17u1bP SUCCEEDED with 1 product/3 variants, 8 sitemap pages, 11 HTTP attempts, no failures, 17.740 seconds application time. Earlier 403/429 partial failures remain documented. Build 1.0.3 / bk1HNNiotpHcawrZj, graceful-abort run SoBQscna77gVWeiK4 retained 4 variant rows and 1266 pending URLs; final ABORTED summary includes finishedAt. This exposed and fixed a real SDK exit-before-teardown race.

Release build 1.0.4 / KaF4VddJZBbzVivY6 adds the last terminal-save guard and selects an observed successful product from the original example store. Exact release prefill, empty API input and strict row cap: verification underway. GitHub CI/push: pending. Production source/build/tags/pricing/permissions/publication: unchanged. API example-only update: pending tested release sample.

Store: truthful README and SEO/listing/task drafts prepared in STORE-AND-COMPETITORS.md; not published. Input, output, typed dataset and KV schemas implemented and CLI/hosted validated. Web-server schema not applicable (batch-only). Default Store API search query shopify, limit20 on 2026-11-23 recorded in store-search.json; this is an observation, not a ranking claim. No authenticated quality-score or publisher-verification assertion.

Remaining limitations: public endpoints can block or throttle; no browser rendering/challenge solver, collection filtering, complete stock, video or paid enrichment. SDK2 internal hooks/state need migration/fresh storage. Hard kills retain a push/checkpoint duplicate window; deduplicate by store hostname + product ID + variant ID. Proxy-side DNS resolution/rebinding cannot be ruled out.

Owner rebuild/input reset: merge this feature branch into master; rebuild production Actor RTtOrCLuwbdkujaID version 0.0 from its existing Git source; after review promote the resulting build to latest. Do not use unqualified apify push. Open Input > JSON, replace the entire body with examples/input.json, save, and start a new run on the rebuilt build. Update saved tasks individually; rebuilds do not reset their inputs. No customer task updates are authorized/performed.
