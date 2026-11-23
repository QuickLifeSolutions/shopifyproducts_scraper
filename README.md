# Shopify Products Scraper

Extract public Shopify product variants for catalog analysis and price monitoring. Supply store roots to traverse their product sitemaps, or supply individual product URLs. Each default dataset row represents **one variant**, including product/variant IDs, SKU, price, observed currency, images, description and available variant attributes.

This is an HTTP scraper. It does not execute JavaScript, log in, solve challenges, guarantee access to every store, or discover private inventory. Some storefronts block public product JSON endpoints even when their sitemaps are accessible. Such failures remain visible in `RUN_SUMMARY`; partial rows are retained.

## Quick start

Use the maintained [example input](examples/input.json). The same input is used by runtime defaults, the Input form and [API example](examples/api-input.json). The small example discovers at most one product and saves at most three variants from the original example store; public availability can change.

```json
{
  "startUrls": [{ "url": "https://smylelabs.com/" }],
  "maxRequestsPerCrawl": 1,
  "maxItems": 3,
  "maxTotalRequests": 100,
  "maxSitemapPages": 20,
  "maxConcurrency": 1,
  "maxRequestRetries": 3,
  "proxyConfig": { "useApifyProxy": true },
  "checkForBanner": true,
  "fetchHtml": false,
  "debugLog": false,
  "customData": {},
  "extendOutputFunction": "async ({ item }) => item",
  "extendScraperFunction": "async () => {}"
}
```

For another catalog, replace `startUrls` with its store root, for example `[{"url":"https://artisaire.com/"}]`. Root discovery checks the Shopify marker and sitemap declarations in robots.txt, follows product sitemap pages (preserving range query parameters), and deduplicates products across overlapping pages. Locale product URLs may share an ID; default rows deduplicate by store hostname, product ID and variant ID. Collection filtering, keyword search and imported URL-list files are not supported. Collection URLs retain the legacy store-wide sitemap behavior and add a scope warning to RUN_SUMMARY; they do not restrict results to that collection.

An omitted input or `{}` uses the maintained example. An explicitly cleared `startUrls: []` fails validation. The old README fields `urls`, `useProxy` and `waitForSelector` are invalid; use `startUrls` and `proxyConfig`.

## Limits and proxy configuration

| Input | Default | Meaning |
| --- | --- | --- |
| `maxRequestsPerCrawl` | 1 | Global successfully processed product cap; one product may produce many variant rows. 0 removes this cap. |
| `maxItems` | 3 | Global dataset row cap; 0 removes this cap. May truncate the final product's variants. |
| `maxTotalRequests` | 100 | All actual HTTP navigation attempts, including robots, sitemaps, currency, HTML, redirects, crawler retries and session rotations. Always bounded. |
| `maxSitemapPages` | 20 | Independent sitemap document budget. |
| `maxConcurrency` | 1 | Concurrent product fetches; discovery is sequential. |
| `maxRequestRetries` | 3 | Crawlee request retries and session-rotation limit. Blocked sessions (including 403/429) are retired and retried with fresh sessions. All actual attempts share the HTTP budget; zero disables retries/rotations. |
| `checkForBanner` | true | Require a Shopify marker in robots.txt for root discovery. Does not apply to a direct product URL. |
| `fetchHtml` | false | Extra static HTML request exposing Cheerio `context.$` to hooks. No rendered browser. |

Requests use a session-aware CheerioCrawler: healthy requests reuse the session token/proxy session and blocked responses retire it. Cookie persistence remains disabled, as on master. Automatic Apify proxy is the existing default. Explicit `apifyProxyGroups`, `apifyProxyCountry` and custom `proxyUrls` are passed to the SDK unchanged. Cloud runs require Apify or custom proxy access. A requested proxy failure fails visibly; it never silently switches to a direct connection. Local direct diagnostics require explicitly setting `proxyConfig: {"useApifyProxy":false}`. A proxy is not an access guarantee. No residential upgrade, geography or paid enrichment is selected automatically.

Product, row and work limits are different: a product cap does not cap chargeable variant rows. Increase budgets deliberately for large catalogs. Reaching a product/row limit is a successful bounded result if there were no source/write failures; exhausting a request/sitemap budget is a visible partial failure.

## Output

Dataset exports support JSON, CSV, Excel and the other formats provided by Apify. The typed [dataset schema](.actor/dataset_schema.json) defines the default row contract. The output schema links to the dataset and `RUN_SUMMARY`.

| Fields | Meaning |
| --- | --- |
| `url`, `id`, `variant_id`, `title`, `sku` | Source product URL and stable identity; IDs are strings. |
| `price`, `currency` | Numeric price, including zero; public `meta.json` currency or null when unavailable. No conversion or guessed USD. |
| `availability` | `in stock`, `out of stock`, or `unknown`; only public variant flags/counts are used. |
| `color`, `size`, `material`, `display_name` | Published options where available; null otherwise. |
| `description`, `product_type`, `brand` | Public product metadata. Description is stripped to plain text. |
| `images_urls` | Absolute public image links, retaining query parameters. |
| `created_at`, `updated_at`, `published_at` | ISO timestamps when available, otherwise null. |
| `additional` | Variant title/options, scrape timestamp, barcode, tags, weight, shipping flag and public stock count, where present. False shipping and zero values are preserved. |
| `video_urls` | Compatibility field, currently an empty array. Video extraction is not implemented. |

`RUN_SUMMARY` contains status, stop reason, request/sitemap/product/row counts, retries, elapsed time, failures and optional currency warnings. Technical failures are never pushed as product rows. A recognized empty product sitemap may succeed with zero rows; an unknown/challenge response cannot.

Pricing settings are unchanged by this repository work. The production Actor currently charges through Apify's default-dataset-item event: a default row is a **variant**, not a whole product. Platform usage and proxy traffic can be charged separately. Check the Actor's current Pricing tab; `maxTotalChargeUsd` is not a universal compute/proxy cap. A hook returning multiple objects can create multiple chargeable rows.

## API

The request body is [examples/api-input.json](examples/api-input.json). Use an Apify token from your environment; never place credentials in URLs or committed files.

```bash
curl --request POST \
  --header "Authorization: Bearer $APIFY_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary @examples/api-input.json \
  'https://api.apify.com/v2/acts/dainty_screw~shopify-products-scraper/runs?timeout=120&memory=256&maxTotalChargeUsd=0.10'
```

This command targets production. Repository fixes are available there only after the owner merges and rebuilds; see [audit/STATUS.md](audit/STATUS.md) for the exact tested build and deployment status. To reproduce private tests, substitute the private Actor ID from that report and its exact tested build ID.

## Extensions and compatibility

Only execute JavaScript supplied by a trusted Actor owner. Extension functions are arbitrary code with the Actor's privileges, **not a sandbox**. `extendOutputFunction` receives `item`, `product`, `data`, `context`, `request`, `input`, `customData`, `fns` and the modern Apify `Actor` API as `Apify`. Return object(s) or null. Custom objects may no longer satisfy the default typed dataset contract. Preserve required fields when extending rows.

`extendScraperFunction` receives SETUP, RUN, FILTER_SITEMAP_URL, PRENAVIGATION, POSTNAVIGATION and FINISHED labels. The filter hook receives `url` and `filter(boolean)`. Navigation hooks expose static request context; they do not control a browser. SDK2's internal crawler, requestList and requestQueue objects are no longer exposed. Existing hooks using those internals require migration. Start with fresh storage when moving from SDK2; its FILTERED/STATS/request-queue state is not imported.

## Reliability and cancellation

Results are written before their emission keys are marked complete. `CHECKPOINT` retains pending work and emitted IDs, and `RUN_SUMMARY` survives graceful cancellation. In-flight HTTP work receives an abort signal. Use Apify's graceful abort rather than force-aborting when summaries matter.

Dataset pushes and KV checkpoints are not a cross-store transaction. A hard kill between a durable push and checkpoint save can duplicate a row after resurrection. Consumers should deduplicate using hostname + `id` + `variant_id`. A migration is checkpointed as ABORTED on the outgoing container and resumes on the new container. Custom hooks and storage writes cannot always be interrupted immediately. Request timeout is 20 seconds, response size is capped at 8 MiB, redirects at five, pending discovery at 100,000 URLs, and discovered/redirected targets must stay on the same store (www alias allowed). HTTPS downgrade, credentials, private/local addresses and unsafe ports are rejected. DNS is checked before requests; DNS rebinding and a proxy's independent resolution remain residual risks.

## Development

Use Node 22 or 24 and the committed lockfile:

```bash
npm ci
npm test
npm run lint
npm run validate
apify validate-schema
npm audit --audit-level=moderate
apify run --input-file examples/input.json
```

Local runs need working Apify proxy credentials, typically `APIFY_PROXY_PASSWORD`. SDK 3 uses the platform-provided proxy password without SDK 2's unnecessary `/v2/users/me` lookup, which can fail under limited run tokens. On Windows, include Windows PowerShell in PATH for SDK memory telemetry. Local data is isolated from cloud data. CI verifies a clean install, tests, lint, schemas and dependencies on Linux Node 22/24 without deploying anything.

Targeted overrides update `basic-ftp` to 6.2.6 (upstream transitive security fixes) and Crawlee's `minimatch` to 11.0.9 (security fixes; Node 22/24 supported). The scraper does not use FTP or Crawlee glob matching; local and cloud SDK startup verify integration. Revisit overrides when upstream dependencies adopt fixed versions.

## Rebuild and reset inputs

After owner review: merge `codex/shopify-crawler-session-fix` into `master`, build production version **0.0** from its existing Git source, then deliberately promote that successful build to `latest`. Do not deploy by running an unqualified `apify push`. Existing production source and tags remain unchanged during this audit.

For a fresh run, open production **Input → JSON**, replace the entire input with `examples/input.json`, save and start a **new** run using the rebuilt version. A rebuild does not reset saved inputs. For each existing saved task, open its Input → JSON and replace/update the stored input explicitly; do not overwrite customer tasks automatically. Old `urls`/`useProxy`/`waitForSelector` or helloWorld samples must be removed. For a local clean run use a fresh `CRAWLEE_STORAGE_DIR`/`APIFY_LOCAL_STORAGE_DIR` and `apify run --purge --input-file examples/input.json`.

Support: [GitHub issues](https://github.com/QuickLifeSolutions/shopifyproducts_scraper/issues) or [email](mailto:codemasterdevops@gmail.com).
