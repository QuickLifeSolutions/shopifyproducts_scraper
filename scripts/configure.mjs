import fs from 'node:fs';
import { DEFAULTS } from '../src/index.js';
const write = (name, data) => fs.writeFileSync(name, `${JSON.stringify(data, null, 2)}\n`);
const schema = JSON.parse(fs.readFileSync('INPUT_SCHEMA.json'));
for (const [key, value] of Object.entries(DEFAULTS)) {
    schema.properties[key] ??= { title: key, type: typeof value === 'number' ? 'integer' : 'object', editor: typeof value === 'number' ? 'number' : 'json', description: key };
    schema.properties[key].default = value; schema.properties[key].prefill = value;
}
schema.properties.startUrls.description = 'Public Shopify store roots or direct product URLs. Collection filtering and remote URL-list imports are not supported. The bounded example discovers one product and saves at most three variant rows from the original example store.';
schema.properties.startUrls.minItems = 1; schema.properties.startUrls.maxItems = 100;
schema.properties.maxRequestsPerCrawl.title = 'Maximum products';
schema.properties.maxRequestsPerCrawl.description = 'Global product limit, across all stores. One product can emit multiple variant rows. Zero removes the product cap; request and sitemap budgets still apply.';
for (const [key, min, max, desc] of [['maxRequestsPerCrawl',0,100000,null],['maxItems',0,1000000,'Global dataset row cap; zero means no row cap. Can truncate variants of the final product.'],['maxTotalRequests',1,100000,'Total HTTP attempt budget, including robots, sitemaps, currency, HTML, products, redirects and retries. Exhaustion is a visible partial failure.'],['maxSitemapPages',1,10000,'Maximum fetched sitemap documents, independent of product/row limits.'],['maxConcurrency',1,50,'Maximum concurrent product requests; discovery stays sequential.'],['maxRequestRetries',0,5,'Retries per HTTP request after network errors, HTTP 429 or 5xx responses.']]) {
    Object.assign(schema.properties[key], { minimum: min, maximum: max }); if (desc) schema.properties[key].description = desc;
}
schema.properties.fetchHtml.description = 'Additionally fetch static product HTML for context.$ in the output hook. No JavaScript execution or dynamic rendering. Uses extra requests.';
schema.properties.proxyConfig.description = 'Automatic Apify proxy by default; explicit residential groups/country or custom proxy URLs are preserved. Cloud runs require a proxy. Proxies do not guarantee site access.';
schema.properties.extendScraperFunction.description = 'Trusted owner JavaScript hooks: SETUP, RUN, FILTER_SITEMAP_URL, PRENAVIGATION, POSTNAVIGATION, FINISHED. HTTP options are informational; SDK2 crawler/requestQueue internals are no longer exposed.';
schema.properties.extendOutputFunction.description = 'Trusted owner JavaScript, not sandboxed. Receives item, product, data, context, fns, input, customData, request and modern Apify Actor. Return object(s) or null; changes can override the default dataset contract.';
write('INPUT_SCHEMA.json', schema);
write('examples/input.json', DEFAULTS);
write('examples/api-input.json', DEFAULTS);
write('examples/prefill.json', Object.fromEntries(Object.entries(schema.properties).map(([k,v]) => [k, v.prefill ?? v.default]).filter(([,v]) => v !== undefined)));
const stringNull = { type: ['string', 'null'] };
const properties = Object.fromEntries(['url','id','variant_id','title','sku'].map((k) => [k,{type:'string'}]));
properties.url.format = 'uri';
for (const k of ['color','size','material','display_name','description','currency','product_type','brand','created_at','updated_at','published_at']) properties[k] = stringNull;
properties.availability = { enum: ['in stock','out of stock','unknown'] };
properties.price = { type: ['number','null'] };
for (const k of ['images_urls','video_urls']) properties[k] = { type: 'array', items: {type:'string',format:'uri'} };
properties.additional = { type:'object', required:['variant_attributes','scraped_at','requires_shipping','stock_count'], properties:{variant_attributes:{type:'string'},scraped_at:{type:'string',format:'date-time'},requires_shipping:{type:['boolean','null']},stock_count:{type:['number','null']},tags:{type:'array',items:{type:'string'}}} };
write('.actor/dataset_schema.json', { actorSpecification:1, fields:{type:'object',required:Object.keys(properties),properties}, views:{ overview:{title:'Product variants',transformation:{fields:['title','variant_id','sku','price','currency','availability','url']},display:{component:'table',properties:{title:{label:'Product',format:'text'},variant_id:{label:'Variant ID',format:'text'},sku:{label:'SKU',format:'text'},price:{label:'Price',format:'number'},currency:{label:'Currency',format:'text'},availability:{label:'Availability',format:'text'},url:{label:'Product URL',format:'link'}}}}} });
write('.actor/output_schema.json', {actorOutputSchemaVersion:1,title:'Products and run diagnostics',properties:{products:{type:'string',title:'Product variants',template:'{{links.apiDefaultDatasetUrl}}/items'},summary:{type:'string',title:'Run summary',template:'{{links.apiDefaultKeyValueStoreUrl}}/records/RUN_SUMMARY'}}});
write('.actor/key_value_store_schema.json', {actorKeyValueStoreSchemaVersion:1,title:'Run diagnostics',collections:{summary:{title:'Run summary',key:'RUN_SUMMARY',contentTypes:['application/json'],jsonSchema:{type:'object',required:['status','stopReason','failures'],properties:{status:{enum:['RUNNING','SUCCEEDED','FAILED','ABORTED']},stopReason:{type:['string','null']},requests:{type:'integer',minimum:0},rows:{type:'integer',minimum:0},failures:{type:'array',items:{type:'object'}}}}}}});
