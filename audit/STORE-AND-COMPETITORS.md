# Store readiness and competitor comparison

Reviewed 2026-11-23. Competitor capabilities below are advertised in public listings, not verified by paid competitor runs. No inference about private backend providers. Prices are observations at review time, not permanent quotes.

| Capability | autofacts/shopify | dhrumil/shopify-products-scraper | This branch |
| --- | --- | --- | --- |
| Sources | Advertises stores, collections, product URL, keyword search | Advertises stores and collection URLs | Store product sitemaps and direct products; collections/search unsupported |
| Row/unit | Advertises products with all variants | Advertises structured products/categories | One variant per row; explicit product and row caps |
| Extra data | Advertises public real inventory, video, barcode, subscription plans | Advertises category information | Public JSON fields only; stock unknown when absent; no video/subscription/enrichment promises |
| Proxy/reliability | Listing claims public-store coverage | Listing claims broad store coverage/speed | Existing automatic/custom proxy preserved; actual cloud partial blocking recorded separately |
| Costs | Page displayed from $0.70/1,000 products | Page displayed from $3/1,000 starter products | Production settings unchanged; per-dataset-row event means variants are billable rows; compare equivalent outputs, not raw row counts |
| Diagnostics | Public listing only examined | Public listing only examined | Typed default rows plus RUN_SUMMARY, independent work budgets, resumable checkpoint and graceful abort tests |

Sources: [autofacts listing](https://apify.com/autofacts/shopify), [dhrumil listing](https://apify.com/dhrumil/shopify-products-scraper). No performance superiority claimed; no equivalent-input competitor benchmark was purchased.

## Prepared listing changes (not published)

- Title draft: Shopify Products Scraper — Variants, Prices & SKUs.
- Description draft: Extract public Shopify product variants from store sitemaps or product URLs. Collect prices, SKUs, descriptions and images, with bounded work and failure summaries. HTTP-only; availability depends on the store.
- SEO title draft: Shopify Product Variant Scraper | Prices, SKUs & Images.
- SEO description draft: Export public Shopify product variants to JSON, CSV or Excel. Use store roots or product URLs, configurable proxies and limits, with clear partial-failure reports.
- Categories draft: E-commerce, Automation. Apply only after owner review.
- README now removes invented dynamic-rendering, unrestricted-access and universal-coverage claims and invalid sample fields. No real-time monitoring promise: schedules/integrations are separate user setup.
- No icon/banner regeneration, pricing edits, permissions edits, published task or Store publication performed.
- Suggested saved task draft: one-product price snapshot using examples/input.json, 256 MB, 120 seconds; not created or published. It is not a scheduled monitor.

## Schema inventory

| Schema | Repository | Production |
| --- | --- | --- |
| Input | Repaired defaults/prefill, bounds and descriptions; synchronized maintained examples | Existing deployed build unchanged; owner rebuild required |
| Actor output | Dataset + actual RUN_SUMMARY links | Owner rebuild required |
| Dataset | Nonempty fields JSON Schema and overview view | Owner rebuild required |
| KV store | Exact RUN_SUMMARY collection, content type and JSON schema | Owner rebuild required |
| Web server | Not applicable: batch-only Actor, no HTTP/Standby service | No fabricated OpenAPI endpoint |

Current official references: [input](https://docs.apify.com/actors/development/actor-definition/input-schema), [output](https://docs.apify.com/actors/development/actor-definition/output-schema), [dataset](https://docs.apify.com/storage/dataset-schema), [KV](https://docs.apify.com/storage/key-value-store-schema), [publishing](https://docs.apify.com/actors/publishing), [permissions](https://docs.apify.com/actors/running/permissions).

Authenticated Actor metadata shows production FULL_PERMISSIONS and null dedicated seoTitle/seoDescription. Permission settings are unchanged; review a future move to limited permissions against any custom hooks before applying it. SEO drafts above remain unpublished. Runtime/schema readiness does not certify Store ranking or quality scores. Publisher verification, account-only quality recommendations, icon quality and public-task status were not independently audited through Console. These remain owner review items; no dashboard findings are invented. Search observations are recorded in STATUS when collected and are not ranking claims.

Product gaps requiring a separate scope decision: browser rendering/challenge handling, collection/keyword filtering, accurate public stock enumeration, subscription/video extraction and full multi-currency contextual pricing. No paid provider added.
