# Shopify scraper audit — final handoff

Implementation and branch push completed. **Fresh-run Store readiness remains blocked by intermittent Shopify 403/429 responses.** No production code deployed or Store changes published.

## Identity and deployment

- Repository: https://github.com/QuickLifeSolutions/shopifyproducts_scraper. Clean baseline `6d74af50fdc5a60ad94fe075a3c8ab93dd95942a`; branch `codex/shopify-scraper-audit`.
- Runtime commit: [c1b8bec](https://github.com/QuickLifeSolutions/shopifyproducts_scraper/commit/c1b8becd18e1aca5b359ac6a6a151dc8e6ec3b47), following d02135a. Subsequent changes are handoff documentation/evidence/CI, not scraper runtime.
- Production **RTtOrCLuwbdkujaID**, `dainty_screw/shopify-products-scraper`, public. Version 0.0 remains GIT_REPO `https://github.com/QuickLifeSolutions/shopifyproducts_scraper#master`. Latest remains **db5x776dAsp3qoJAN / 0.0.4**; beta remains **QaBhADIYeamBY3Y3M / 0.1.13**. FULL_PERMISSIONS unchanged. No production source, tags, pricing, permissions, default-run settings or listing publication changes.
- Private test Actor **EcVXdeCli75Lqff51**, `dainty_screw/shopify-products-audit-20261123`, created private and retained for review. Version 1.0 uses uploaded files. Final [build 1.0.5](https://console.apify.com/actors/EcVXdeCli75Lqff51/builds/1.0.5), **riDkJuKlUUCV7KmUZ**, SUCCEEDED. Twelve runtime/build/schema files exactly match uploaded source; SHA-256 evidence is in runtime-manifest.json.

## Implemented fixes

Retained JavaScript HTTP/Cheerio extraction; upgraded obsolete Node 16/SDK2 packaging to Node 22/24-compatible SDK3. Added lockfile, clean installation and read-only Linux CI. Targeted transitive security overrides remove the eight initial dependency findings without forced SDK downgrades. Replaced mixed discovery/product queue usage with bounded sitemap traversal and concurrent product work. Preserved sitemap range queries, deduplicated overlaps, and introduced separate HTTP-attempt, sitemap, product and row budgets. Serialized durable output prevents concurrent limit races.

Corrected zero price, false shipping, missing arrays/options, currency provenance and unknown availability; added stable variant IDs and absolute image URLs. Enabled TLS validation and public-address/same-store/redirect checks, body/queue bounds, retries and backoff. Technical failures now appear in RUN_SUMMARY rather than billable product rows. Checkpoints retain pending/emitted work. A real cloud abort exposed SDK exit before teardown; the fix drains active work and saves the final summary. Trusted extension hooks remain available with explicit SDK2 internal-hook/state migration notes.

## Local and CI verification

- Clean `npm ci --ignore-scripts`, **15 regression tests**, lint, maintained-default/reference validation, all four applicable schemas via `apify validate-schema`, and npm audit pass. **Zero dependency vulnerabilities.** GitHub CI uses clean `npm ci` with scripts enabled on Linux Node 22 and 24.
- [CI for runtime c1b8bec](https://github.com/QuickLifeSolutions/shopifyproducts_scraper/actions/runs/45216132211): both matrix jobs passed. Final evidence-commit CI is linked in the final response.
- Regressions cover nested/range sitemap pagination, overlaps, concurrent caps, work budgets, retries, malformed/blocked/recognized-empty responses, URL/DNS/redirect safety, currency/zero/false/missing fields, static-HTML hooks, filtering, write failure/resume, cancellation drain and invalid-hook summary persistence.
- Real `apify run` executed with isolated storage. Local CLI proxy status returns `User not found`. The old SDK silently fell back to direct access; the fix now fails explicitly with persisted **proxy_error**. Local default proxy extraction remains blocked by local credentials/access. Windows telemetry PATH was corrected by adding Windows PowerShell.
- Early direct/fallback diagnostic data produced real rows; three retained public rows validate against the final dataset schema. This verifies extraction, **not proxy readiness**. Raw logs remain ignored in audit/private; storage is ignored.

## Hosted evidence

Runs used 256 MB, 120–180 second timeouts and explicit request budgets. Initial broad smoke used three retries; focused tests used zero. Per-run event-charge cap $0.10 does not cap all compute/proxy usage. No paid competitor runs/enrichment. Cloud logs verify automatic Apify proxy; existing group/country selection remains unchanged. Custom/residential overrides are preserved by code but were not separately cloud-tested.

| Test and run | Build | Status | Rows | HTTP / sitemap pages | Finding |
| --- | --- | --- | --- | --- | --- |
| [Bounded catalog gLY78jcLYfE17u1bP](https://console.apify.com/actors/runs/gLY78jcLYfE17u1bP) | 1.0.2 | SUCCEEDED | 3 | 11 / 8 | One product, no failures, pagination traversed, product limit honored |
| [Exact prefill qgNHEFS4fdzyIykfP](https://console.apify.com/actors/runs/qgNHEFS4fdzyIykfP) | 1.0.5 | FAILED | 0 | 20 / 8 | 403/429; request budget; readiness gate blocked |
| [Empty API input 53k026XUtfUrV0F7S](https://console.apify.com/actors/runs/53k026XUtfUrV0F7S) | 1.0.5 | FAILED | 3 | 17 / 8 | Valid rows retained; earlier blocked products keep FAILED status |
| [One-row probe XH6hh4W9QCMQQJbdA](https://console.apify.com/actors/runs/XH6hh4W9QCMQQJbdA) | 1.0.5 | FAILED | 0 | 20 / 8 | Source-blocked before extraction; non-vacuous cloud row-cap verification blocked |
| [Abort after output SoBQscna77gVWeiK4](https://console.apify.com/actors/runs/SoBQscna77gVWeiK4) | 1.0.3 | ABORTED | 4 | 29 / 3 | Four emitted IDs and 1,266 pending URLs; finalized checkpoint |
| [Final-build abort C8byE5lvDQB4Zm5MO](https://console.apify.com/actors/runs/C8byE5lvDQB4Zm5MO) | 1.0.5 | ABORTED | 0 | 6 / 3 | Real product HTTP activity, 1,282 pending URLs and final finishedAt |

The successful catalog saved distinct Pixel Kitchen Torch variants at **39.99 USD**; 17.740 s application time, with platform wall time recorded separately. Final empty-input run saved three distinct typed variants in 17.088 s application time but retained four earlier 403 failures. Saved rows, summaries, actual output links and identities validate via scripts/verify-evidence.mjs and scripts/verify-rows.mjs. A SUCCEEDED label alone was never treated as extraction evidence.

Final-build abort: platform notification **16:25:23.484Z**, final summary timestamp **16:25:24.741Z**, about **1.26 s notification-to-final-summary**. Actual SDK shutdown preserved ABORTED in both summary and checkpoint. API command overhead is separate. Initial pre-fix abort lacked final teardown metadata and is retained as regression evidence.

All **12 runs and five successful builds**, including blocked probes, are in cloud-evidence.json/build-evidence.json. Later probes changed build/input or exercised distinct required gates; blocked gates were not converted into empty successes. An API request using a build ID was rejected; supported numbered builds/tags were used afterward. Further source probes stopped after these gates were recorded.

## Observed costs

Latest observed **2026-11-23T16:29:45.9664225Z**: runs **$0.022830567**, builds **$0.005446889**, total **$0.028277456** (about **$0.0283**). Latest API usage, not a promise of settled billing. Per-run usage components and timing remain in the evidence. No production test runs were started.

## Defaults, schemas, Store and live metadata

- Runtime DEFAULTS, schema default/prefill, README JSON, examples/input.json, examples/api-input.json and examples/prefill.json align. Fresh default: original store root, **one product, three rows, 20 HTTP attempts, 20 sitemap pages, concurrency one, zero retries**, automatic Apify proxy. Explicitly cleared sources fail; explicit URLs/proxy overrides are preserved.
- **Input:** repaired. **Actor output:** dataset + actual RUN_SUMMARY links. **Dataset:** typed fields and overview view. **KV:** exact RUN_SUMMARY collection/content type/JSON schema. CLI and hosted builds validate all four. **Web server:** not applicable; batch-only Actor, no fabricated HTTP/Standby interface. Internal CHECKPOINT is not advertised as a user output.
- Production **exampleRunInput only** was changed from helloWorld to the maintained supported input, then read back exactly. Before/after identity, default-run settings, source, tags, permissions, title/description/SEO metadata compare unchanged. No pricing mutation performed. Example metadata does not deploy fixes; live old code retains its previous limit semantics until rebuilt.
- Unsupported rendering, unrestricted access, real-time monitoring and universal extraction claims are removed from the repository README. Production Store documentation remains unchanged until owner deployment/publication.
- Production dedicated seoTitle/seoDescription were null. Truthful listing/SEO/category/task drafts and competitor matrix are in STORE-AND-COMPETITORS.md; none published. No task created/published. Full-permission setting is recorded, not changed.
- Compared public autofacts/shopify and dhrumil/shopify-products-scraper listings, distinguishing advertising from observed behavior. No private-provider or performance-superiority claims. Store API search `shopify`, limit20, on 2026-11-23 did not observe this Actor in that sample; store-search.json is an observation, not a ranking/eligibility conclusion.

## Remaining gates and limitations

1. **Blocked:** reliable fresh schema-prefill output and non-vacuous one-row cloud-cap verification. Those probes encountered 403/429 before useful rows. Empty-input execution returned useful rows but remained a partial failure. Local concurrent cap fixtures and positive cloud three-row bounds pass; successful one-row cloud verification is not claimed. Further challenge/browser/proxy-strategy work requires a separate product/cost decision. No silent proxy downgrade/upgrade.
2. **Blocked:** local default proxy extraction; local credentials/access rejected. Automatic proxy works in cloud and produced actual rows. No credentials committed.
3. SDK2 crawler/requestQueue internals and old storage require migration/fresh storage. Hooks execute trusted owner code with Actor privileges, not sandboxed; custom objects can change row types/billing volume.
4. No collection/keyword search, JavaScript rendering, complete stock, video/subscription extraction or paid enrichment. Public currency/availability can be absent; null/unknown is retained.
5. Hard kill/timeout durability is checkpoint-based. Dataset push and KV save are not transactional; consumers should deduplicate normalized hostname + id + variant_id. DNS rebinding and proxy-side resolution remain residual risks. No promise that forced termination always writes a final summary.
6. Publisher verification, dashboard quality recommendations, icons and public-task status remain owner review items. Prepared Store drafts are not published changes.

## Exact owner rebuild and input-reset steps

1. Review and merge **codex/shopify-scraper-audit into master**.
2. In production **RTtOrCLuwbdkujaID**, keep existing version **0.0** Git source `https://github.com/QuickLifeSolutions/shopifyproducts_scraper#master`. Build that version after merge. Do not use unqualified `apify push` or incidentally change source, pricing or permissions.
3. Verify the new production build/run and accept the recorded source-access limitation; deliberately promote the successful reviewed build to **latest**. This audit did neither production build nor promotion.
4. Open production **Input → JSON**, replace the entire body with **examples/input.json**, save and start a **new run** on the rebuilt build. Rebuilding does not reset stored Actor/task/previous-run input.
5. Update each saved task's Input → JSON individually with intended URLs/limits/proxy settings. Remove old urls/useProxy/waitForSelector/helloWorld fields. No customer tasks overwritten.
6. Local reproduction: Node 22/24; npm ci; npm test; npm run lint; npm run validate; apify validate-schema; npm audit --audit-level=moderate. Supply valid proxy credentials; use fresh CRAWLEE_STORAGE_DIR/APIFY_LOCAL_STORAGE_DIR and `apify run --purge --input-file examples/input.json`. Explicit direct diagnostics set proxyConfig.useApifyProxy=false and do not verify proxies.

## Git handoff

Branch is pushed; no merge/production deployment. Runtime CI passed both matrix jobs. Final evidence commit/CI is linked in the final response; its workflow also validates saved hosted summaries, rows, output links, cancellation checkpoints and upload manifest. Private Actor and storages retained as authorized review evidence; no schedules created. Later README/evidence/CI edits do not change the tested runtime or build inputs.
