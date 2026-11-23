import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv from 'ajv';
import formats from 'ajv-formats';
import { normalizeInput, scrape } from '../src/index.js';
import { publicUrl, assertPublic, productRows } from '../src/fns.js';

const root = 'https://store.example/';
const product = (id = 1) => ({id,title:`Product ${id}`,body_html:'<p>Hello &amp; world</p>',options:[{name:'Color'}],variants:[{id:id*10,price:'0.00',available:true,requires_shipping:false,option1:'Blue'},{id:id*10+1,price:'12.50',available:false}],images:[{id:99,src:'/image.jpg?width=500'}]});
const response = (body,status=200,headers={}) => ({body:typeof body==='string'?body:JSON.stringify(body),status,headers});
const xml = (urls,kind='url') => `<${kind==='url'?'urlset':'sitemapindex'}>${urls.map((url)=>`<${kind}><loc>${url.replaceAll('&','&amp;')}</loc></${kind}>`).join('')}</${kind==='url'?'urlset':'sitemapindex'}>`;
function fixture(overrides={}) {
    return {
        [`${root}robots.txt`]:response(`# Shopify\nSitemap: ${root}sitemap.xml`),
        [`${root}sitemap.xml`]:response(xml([`${root}sitemap_products_1.xml?from=1&to=2`,`${root}sitemap_products_2.xml?from=3&to=4`],'sitemap')),
        [`${root}sitemap_products_1.xml?from=1&to=2`]:response(xml([`${root}products/a`,`${root}products/a`,`${root}products/b`])),
        [`${root}sitemap_products_2.xml?from=3&to=4`]:response(xml([`${root}products/b`,`${root}products/c`])),
        [`${root}meta.json`]:response({currency:'GBP'}),
        [`${root}products/a.json`]:response({product:product(1)}),
        [`${root}products/b.json`]:response({product:product(2)}),
        [`${root}products/c.json`]:response({product:product(3)}),...overrides,
    };
}
async function run(options={},extra={}) {
    const rows=[];const calls=[];const snapshots=[];const routes=fixture(extra.routes);
    const input=normalizeInput({startUrls:[{url:root}],maxRequestsPerCrawl:10,maxItems:0,maxTotalRequests:100,maxConcurrency:10,maxRequestRetries:3,...options});
    const io={get:async(url,opts)=>{calls.push(url);if(extra.get)return extra.get(url,opts,routes);assert(routes[url],`Missing fixture ${url}`);return routes[url];},push:async(row)=>{rows.push(row);},save:async(state)=>{snapshots.push(state);},...extra.io};
    const summary=await scrape(input,io);return {summary,rows,calls,snapshots,input};
}
test('nested sitemap pagination preserves query ranges, deduplicates overlap and saves typed variant rows',async()=>{
    const r=await run(); assert.equal(r.summary.status,'SUCCEEDED');assert.equal(r.summary.products,3);assert.equal(r.rows.length,6);assert.equal(r.summary.sitemapPages,3);assert.equal(new Set(r.rows.map(x=>x.variant_id)).size,6);
    assert(r.calls.includes(`${root}sitemap_products_2.xml?from=3&to=4`));assert.equal(r.calls.filter(x=>x.endsWith('meta.json')).length,1);
    const ajv=new Ajv({strict:false});formats(ajv);const validate=ajv.compile(JSON.parse(fs.readFileSync('.actor/dataset_schema.json')).fields);
    for(const row of r.rows)assert(validate(row),JSON.stringify(validate.errors));
    assert.equal(r.rows[0].price,0);assert.equal(r.rows[0].currency,'GBP');assert.equal(r.rows[0].additional.requires_shipping,false);assert.equal(r.rows[0].description,'Hello & world');
});
test('product limit and strict row limit hold under concurrent requests',async()=>{
    const a=await run({maxRequestsPerCrawl:1});assert.equal(a.summary.products,1);assert.equal(a.rows.length,2);assert.equal(a.summary.stopReason,'product_limit');
    const b=await run({maxItems:3});assert.equal(b.rows.length,3);assert.equal(b.summary.stopReason,'row_limit');
});
test('independent request and sitemap budgets produce visible partial failures',async()=>{
    const a=await run({maxTotalRequests:2});assert.equal(a.summary.requests,2);assert.equal(a.summary.status,'FAILED');assert.equal(a.summary.stopReason,'request_budget');
    const b=await run({maxSitemapPages:1});assert.equal(b.summary.sitemapPages,1);assert.equal(b.summary.stopReason,'sitemap_budget');assert.equal(b.summary.status,'FAILED');
});
test('blocked and malformed discovery cannot become empty successes; 404s never create failure dataset rows',async()=>{
    for(const r of [await run({}, {routes:{[`${root}robots.txt`]:response('blocked',403)}}),await run({}, {routes:{[`${root}sitemap.xml`]:response('<html>challenge</html>')}}),await run({}, {routes:{[`${root}products/a.json`]:response('missing',404)}})]) {assert.equal(r.summary.status,'FAILED');assert(r.summary.failures.length);assert(r.rows.every(row=>!row['#failed']));}
});
test('recognized empty product sitemap succeeds with explicit zero output',async()=>{
    const r=await run({}, {routes:{[`${root}sitemap.xml`]:response(xml([]))}});assert.equal(r.summary.status,'SUCCEEDED');assert.equal(r.rows.length,0);assert.equal(r.summary.recognizedSitemaps,1);
});
test('transient failures retry within budget; permanent failures do not',async()=>{
    let tries=0;const r=await run({maxRequestRetries:1},{get:async(url,_opts,routes)=>{if(url.endsWith('/products/a.json')&&tries++===0)return response('busy',503);return routes[url];}});assert.equal(r.summary.retries,1);assert.equal(r.rows.length,6);
});
test('currency lookup failure returns null, never guessed USD; shared lookup settles before rows',async()=>{
    const r=await run({}, {routes:{[`${root}meta.json`]:response('missing',404)}});assert(r.rows.every(row=>row.currency===null));assert.equal(r.summary.warnings.length,1);
});
test('unsafe input, DNS, and redirect targets rejected before network access',async()=>{
    for(const url of ['http://127.0.0.1/','http://[::1]/','http://169.254.169.254/','file:///x','https://a:b@store.example/'])assert.throws(()=>publicUrl(url));
    await assert.rejects(()=>assertPublic(root,async()=>[{address:'10.0.0.1'}]));
    const r=await run({}, {routes:{[`${root}robots.txt`]:response('',302,{location:'http://127.0.0.1/'})}});assert.equal(r.summary.status,'FAILED');assert.equal(r.calls.length,1);
});
test('omitted input uses aligned defaults, cleared list and invalid limits fail',()=>{
    assert.equal(normalizeInput({}).maxRequestsPerCrawl,1);for(const bad of [{startUrls:[]},{maxItems:-1},{maxTotalRequests:0},{maxConcurrency:1.5},{urls:[]}])assert.throws(()=>normalizeInput(bad));
});
test('missing optional fields, safe IDs, unavailable status, and zero/false survive mapping',()=>{
    const rows=productRows({id:'gid://shopify/Product/9007199254740993',title:'x',variants:[{id:'9007199254740994',price:0,requires_shipping:false}]},root,null);assert.equal(rows[0].id,'9007199254740993');assert.equal(rows[0].availability,'unknown');assert.equal(rows[0].additional.requires_shipping,false);assert.deepEqual(rows[0].images_urls,[]);
});
test('active cancellation aborts in-flight work and final summary/checkpoint survive teardown',async()=>{
    let cancel;let signalled=false;
    const r=await run({}, {io:{onCancel:(fn)=>{cancel=fn;}},get:async(url,{signal},routes)=>{if(url.endsWith('/products/a.json')){setTimeout(()=>cancel(),5);await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{signalled=true;reject(new Error('aborted'));},{once:true});});}return routes[url];}});
    assert(signalled);assert.equal(r.summary.status,'ABORTED');assert.equal(r.snapshots.at(-1).summary.status,'ABORTED');assert(r.snapshots.at(-1).pending.some(task=>task.url.endsWith('/a')));
});
test('dataset write failure preserves pending task and resumes without treating failed push as emitted',async()=>{
    const r=await run({}, {io:{push:async()=>{throw new Error('write failed');}}});assert.equal(r.summary.status,'FAILED');assert.equal(r.summary.stopReason,'write_failure');assert.equal(r.summary.rows,0);assert.equal(r.snapshots.at(-1).emitted.length,0);
    const resumed=await run({}, {io:{state:r.snapshots.at(-1)}});assert.equal(resumed.summary.rows,6);
});
test('HTML option exposes static DOM to hook; output filtering does not add technical rows',async()=>{
    const r=await run({fetchHtml:true,maxRequestsPerCrawl:1,extendOutputFunction:'({item, context}) => ({...item, title: context.$("h1").text()})'}, {routes:{[`${root}products/a`]:response('<h1>Static title</h1>')}});assert.equal(r.rows[0].title,'Static title');
    const filtered=await run({extendOutputFunction:'() => null'});assert.equal(filtered.summary.rows,0);assert.equal(filtered.summary.products,3);
});
test('platform abort callback drains teardown before returning and snapshots include active requests',async()=>{
    let cancel; let abortDone; let last; let notified;
    const done = new Promise(resolve => { notified = resolve; });
    const running = run({}, {io:{onCancel:fn=>{cancel=fn;},save:async state=>{last=state;}},get:async(url,{signal},routes)=>{
        if(url.endsWith('/products/a.json')) { setTimeout(()=>{abortDone=cancel();notified();},5); await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>setTimeout(()=>reject(new Error('aborted')),15),{once:true})); }
        return routes[url];
    }});
    await done; assert(last.pending.some(task=>task.url.endsWith('/a'))); await abortDone; assert(last.summary.finishedAt); assert.equal(last.summary.status,'ABORTED'); await running;
});
test('invalid extension source is persisted as a failure rather than skipping the summary',async()=>{
    const r=await run({extendOutputFunction:'not a function'});assert.equal(r.summary.status,'FAILED');assert.equal(r.snapshots.at(-1).summary.failures[0].stage,'runtime');
});
test('collection URLs preserve master store-wide discovery with an explicit scope warning',async()=>{
    const r=await run({startUrls:[{url:`${root}collections/accessories`}]});
    assert.equal(r.summary.status,'SUCCEEDED'); assert.equal(r.rows.length,6);
    assert(r.summary.warnings.some(w=>w.stage==='scope'&&w.message.includes('collection filtering is not applied')));
});
test('crawler-owned rotations count actual attempts without outer-loop retry amplification',async()=>{
    const r=await run({maxRequestsPerCrawl:1},{io:{managesAttempts:true,managesRetries:true},get:async(url,{onAttempt},routes)=>{
        onAttempt(); if(url.endsWith('/products/a.json')){onAttempt();onAttempt();} return routes[url];
    }});
    assert.equal(r.summary.retries,2); assert.equal(r.summary.requests,8); assert.equal(r.summary.products,1);
});
