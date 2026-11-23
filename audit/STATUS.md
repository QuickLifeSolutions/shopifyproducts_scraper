# Shopify crawler/session correction — final handoff

**Implemented, tested and pushed on `codex/shopify-crawler-session-fix`. No production code deployed.** This supersedes the bare-HTTP transport in the [initial audit](INITIAL-AUDIT.md); retained initial evidence remains historical.

## Findings and correction

The previous audit replaced CheerioCrawler with a custom HTTP transport. Keeping automatic Apify proxy selection did not preserve crawler session/token reuse or blocked-response recovery. That was too broad a change. This branch restores a modern **SDK3 CheerioCrawler transport**, including proxy assignment using session IDs, healthy-session/header-token reuse, blocked-session retirement, request retries, and the original `persistCookiesPerSession: false`. SDK3/Node24 are retained; this is not a byte-for-byte restoration of SDK2/Node16.

The actor still uses the audited extraction/aggregation code: typed variant rows, observed currency (EUR for AYBL), unknown availability when absent, zero/false preservation, serialized output caps, separate request/sitemap/product/row budgets, safe URL/DNS/redirect/body boundaries, and checkpoints. Every Crawlee navigation/retry/session rotation is counted against maxTotalRequests. The transport uses an isolated temporary queue and drains before the abort callback completes. Startup cancellation cannot enqueue work after cancellation or leave an unhandled enqueue-result rejection.

**Collection compatibility restored:** collection URLs are accepted for the same store-wide sitemap discovery used by master. RUN_SUMMARY explicitly warns that collection filtering is not applied. This does not add accessories-only filtering.

## Separate master failure: platform API permissions

Read-only review of [owner's master run MrTyFWkhO6hLAuZPz](https://console.apify.com/actors/runs/MrTyFWkhO6hLAuZPz), build0.0.6/m27QC6sbrbKyNzgIs, found **UserClient.get → /v2/users/me → 403 insufficient-permissions** during SDK2 proxy initialization. That run logged LIMITED_PERMISSIONS and failed before scraping. SDK2 always calls UserClient.get when a token is present, even when a proxy password is already supplied; the installed SDK2 source was inspected to verify this. SDK3 uses the supplied proxy password without that unnecessary user-profile lookup.

Do not confuse that platform API403 with product endpoint403/429. Current Actor FULL_PERMISSIONS metadata does not retroactively change that run's token. No permission escalation or credential replacement was performed. The exact owner failure is summarized in session-followup/production-main-observation.json; this follow-up initiated no production runs.

## Comparison and cloud evidence

Private Actor **EcVXdeCli75Lqff51** (`dainty_screw/shopify-products-audit-20261123`) retained private. Matched comparison input: nl.aybl.com root, automatic Apify proxy, concurrency1, product cap3, retries3, 256MB and120s. The new versions also enforce maxTotalRequests60; master has no equivalent global attempt cap. Proxy selection was equivalent, not guaranteed identical exit IPs. Baseline was original master commit6d74af5.

| Test | Build | Result | Actual rows | HTTP attempts | Evidence |
| --- | --- | --- | --- | --- | --- |
| Unmodified master | 0.0.2 | TIMED-OUT | 0 | not reported | [6CgosrYc68hWVUhZA](https://console.apify.com/actors/runs/6CgosrYc68hWVUhZA) |
| Previous bare-HTTP feature | 1.0.5 | FAILED | 14 | 49 | [R4Jn69BrdftOSmPV1](https://console.apify.com/actors/runs/R4Jn69BrdftOSmPV1) |
| Restored crawler, same comparison input | 1.0.6 | FAILED | 9 | 25 | [woR4XSmcD5kmnI7Yj](https://console.apify.com/actors/runs/woR4XSmcD5kmnI7Yj) |
| Direct-product negative probe | 1.0.6 | FAILED | 0 | 5 | [rfaJHbyHkVnBUXfqz](https://console.apify.com/actors/runs/rfaJHbyHkVnBUXfqz) |
| Actual schema prefill | 1.0.6 | FAILED | 3 | 21 | [HSfziraXQFEGcGFhg](https://console.apify.com/actors/runs/HSfziraXQFEGcGFhg) |
| Initial one-row cap | 1.0.6 | FAILED | 1 | 13 | [kQ3rxGG2mMNqHVan6](https://console.apify.com/actors/runs/kQ3rxGG2mMNqHVan6) |
| Final-build empty API input | 1.0.7 | FAILED | 1 | 18 | [upvyEvHbnC3pzuJVW](https://console.apify.com/actors/runs/upvyEvHbnC3pzuJVW) |
| Final-build one-row cap with source-count hook | 1.0.7 | FAILED | 1 | 24 | [JHcloJaXh8majREYi](https://console.apify.com/actors/runs/JHcloJaXh8majREYi) |
| Final-build active abort | 1.0.7 | ABORTED | 0 | 2 | [D4gBegTPK84PX6c7U](https://console.apify.com/actors/runs/D4gBegTPK84PX6c7U) |

The restored comparison saved **nine valid EUR variant rows across three products**. The earlier feature saved14 variants across a different three-product subset; more variants are not proof of better coverage. Master timed out without useful data in this private bounded comparison, so it is not a working extraction control. No speed/accuracy superiority or sole root cause of storefront blocking is claimed.

The one-row final-build test saved exactly one variant while a trusted test hook recorded **source_variant_count=3** from the actual parsed product. This is non-vacuous hosted truncation evidence. The hook adds a verification-only field; it is not the default output. Prefill saved three useful rows; omitted/empty input saved one useful row on the final build. These runs remained **FAILED because earlier products were blocked**; neither is advertised as a clean reliable default run.

Final-build active abort D4gBegTPK84PX6c7U preserved ABORTED, finishedAt and one pending task through actual SDK/crawler shutdown. Detailed rows/summaries/metadata are in session-followup/cloud-evidence.json and associated *-rows.json files. Internal checkpoint proof is reduced to safe counts/status in abort-checkpoint.json. Hard kills and cross-store push/checkpoint duplicate windows remain limitations.

## Build and local verification

- Final private [build1.0.7](https://console.apify.com/actors/EcVXdeCli75Lqff51/builds/1.0.7), **RkUcEB1FJ5xNkSdZI**, SUCCEEDED. Thirteen runtime/build/schema files exactly match its uploaded source snapshot; hashes and equality checks are in session-followup/runtime-manifest.json. Runtime commit: **b5899f0705d047630261a485e23276da99ac5478**.
- **21 tests pass**, including real loopback HTTP tests for CheerioCrawler session reuse/retirement, retries, actual attempt accounting, cancellation, manual redirect handling and the8MiB streamed body cap. DNS validation is replaced only by an internal test dependency, never an input option.
- Clean npm ci, lint, maintained defaults/examples validation, all four Apify schemas and npm audit pass. **Zero dependency vulnerabilities.** [Runtime GitHub CI](https://github.com/QuickLifeSolutions/shopifyproducts_scraper/actions/runs/45223092900) passed Linux Node22/24; final evidence-only commit CI is linked in the final response.
- Actual `apify run` executed the new entry point with isolated storage and an **explicit direct diagnostic input**. It correctly retried the403 once, persisted FAILED and drained the crawler. No useful local rows in that probe. This is lifecycle/error-path evidence, not local proxy readiness. The previously rejected local proxy credentials were not repeatedly retried unchanged. Cloud Apify proxy supplied actual positive rows.
- Saved hosted rows validate against the typed dataset contract, with unique IDs and no technical error rows. The read-only CI evidence verifier now checks the follow-up records and real one-of-three variant cap.

## Defaults, schemas and production

Runtime, schema default/prefill, README and maintained input/API examples align: original Smyle store root, product cap1, row cap3, HTTP attempt budget100, sitemap budget20, concurrency1, retries3, automatic Apify proxy. The earlier20-attempt/zero-retry example was too restrictive for the restored crawler path. All explicit proxy groups/country/custom proxies remain preserved; no proxy type change or paid enrichment added.

Input/output/dataset/KV schemas remain valid; modern output links lead to actual dataset and RUN_SUMMARY. Web-server schema is not applicable to this batch Actor. Collection URL compatibility and warnings are documented. SDK2 custom crawler/requestQueue internals still require migration; arbitrary trusted hooks are not sandboxed.

Owner switched production back to **master/0.0.6**, latest **m27QC6sbrbKyNzgIs**, before the follow-up snapshot. The correction uses a different feature branch so pushing cannot incidentally update the previously selected feature branch. Production source, latest/beta build tags, run defaults and permissions compare unchanged against follow-up before/after snapshots. Pricing and Store publication were not mutated. **Only the explicitly authorized exampleRunInput metadata was updated** to the maintained body, read back and compared. Example metadata does not deploy code or reset saved inputs.

## Observed follow-up cost

Latest observation 2026-11-23T17:07:41.5622639Z: **$0.025011870 runs + $0.016863556 builds = $0.041875425** (nine private runs, four builds). This includes the unused default-template build created during private baseline setup. About **$0.0419 additional**, or **$0.0702 combined** with the original audit's $0.028277456. Latest API usage, not a guarantee of final settled billing. No competitor paid runs or production test runs.

## Remaining limitations and exact owner steps

Storefront403/429 blocking remains intermittent on both extraction paths. Useful prefill/empty-input rows and the one-row cap are now cloud-verified, but clean default-run reliability remains unresolved. Do not mark partial failures as successful empty runs or escalate permissions as a speculative workaround. Collection filtering, browser rendering/challenge solving, full stock enumeration and enrichment remain unsupported. Existing user hooks and state need SDK3 migration; forced termination is checkpoint-based, not exactly-once.

1. Review/merge **codex/shopify-crawler-session-fix into master**. Do not deploy the earlier codex/shopify-scraper-audit branch alone.
2. Keep production Actor **RTtOrCLuwbdkujaID**, version **0.0**, source `https://github.com/QuickLifeSolutions/shopifyproducts_scraper#master`. After merge, build that version; inspect the build and actual dataset rows. Deliberately promote the reviewed build to latest only after accepting the remaining source-blocking limitation. No production build/promotion was performed here.
3. Replace the entire production Input → JSON body with **examples/input.json**, save and start a new run on the new build. Rebuild does not reset saved Actor/task/run inputs. Update saved tasks individually with intended source/limits/proxy settings; no customer tasks were overwritten.
4. A collection URL is now accepted with a store-wide warning. For collection-only results, use individual product URLs until proper collection filtering is implemented; do not claim this feature exists.
5. Reproduce checks with Node22/24: npm ci; npm test; npm run lint; npm run validate; apify validate-schema; npm audit --audit-level=moderate. Actual local proxy runs still need valid proxy credentials. No unqualified apify push.

Private Actor and evidence are retained. Initial Store/competitor drafts remain unpublished; [STORE-AND-COMPETITORS.md](STORE-AND-COMPETITORS.md) and [INITIAL-AUDIT.md](INITIAL-AUDIT.md) retain the earlier assessment. Final commit/CI links are supplied in the final response. Subsequent handoff-only edits do not change the tested runtime.
