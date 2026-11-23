import { load } from 'cheerio';
import { Actor } from 'apify';
import { setTimeout as delay } from 'node:timers/promises';
import * as fns from './fns.js';

function extension(source, fallback) {
    if (!source?.trim()) return fallback;
    // Explicit owner-supplied code, never scraped content. This is not a sandbox.
    const fn = new Function(`"use strict"; return (${source});`)();
    if (typeof fn !== 'function') throw new Error('Extension must evaluate to a function');
    return fn;
}
export async function scrape(input, io) {
    const state = io.state ?? { version: 1, pending: input.startUrls.map(({ url }) => ({ url, label: /\/products\/[^/]+/.test(new URL(url).pathname) ? 'PRODUCT' : 'ROBOTS', root: url })), seen: [], emitted: [], currencies: {}, checked: [], summary: { status: 'RUNNING', stopReason: null, requests: 0, sitemapPages: 0, products: 0, rows: 0, retries: 0, failures: [], startedAt: new Date().toISOString() } };
    if (state.version !== 1) throw new Error('Unsupported checkpoint version; use fresh storage');
    const summary = state.summary; summary.status = 'RUNNING'; summary.stopReason = null;
    for (const { url } of input.startUrls) {
        if (/\/collections\//.test(new URL(url).pathname) && !/\/products\//.test(new URL(url).pathname)) {
            (summary.warnings ??= []).push({ stage: 'scope', url, message: 'Collection URL accepted for legacy store-wide sitemap discovery; collection filtering is not applied.' });
        }
    }
    const seen = new Set(state.seen); const emitted = new Set(state.emitted); const checked = new Set(state.checked);
    const currencyLoads = new Map();
    const controller = new AbortController(); let cancelled = false; let terminal = false;
    const active = new Set();
    let finish;
    const completed = new Promise((resolve) => { finish = resolve; });
    let writes = Promise.resolve();
    const save = () => { state.seen = [...seen]; state.emitted = [...emitted]; state.checked = [...checked]; const snapshot = structuredClone({ ...state, pending: [...state.pending, ...active] }); writes = writes.catch(() => {}).then(() => io.save(snapshot)); return writes; };
    const cancel = async () => { if (terminal) return completed; cancelled = true; summary.status = 'ABORTED'; summary.stopReason = 'cancelled'; controller.abort(); await save(); await completed; };
    io.onCancel?.(cancel);
    let extendOutput = ({ item }) => item;
    let extendScraper = () => {};
    const helpers = { fns, input, customData: input.customData, Apify: Actor };
    const enqueue = (url, label, root) => {
        const u = fns.publicUrl(url);
        if (!fns.sameStore(u.href, root)) throw new Error('Cross-store discovered URL rejected');
        if (u.protocol === 'http:' && new URL(root).protocol === 'https:') throw new Error('HTTPS downgrade rejected');
        if (label === 'PRODUCT') { u.search = ''; u.pathname = u.pathname.replace(/\.json$/, '').replace(/\/$/, ''); }
        const key = `${label}:${u.href}`;
        if (seen.has(key) || state.pending.some((p) => `${p.label}:${p.url}` === key)) return;
        if (state.pending.length >= 100000) throw new Error('Discovery queue safety limit reached (100000 URLs)');
        state.pending.push({ url: u.href, label, root });
    };
    const request = async (url, root) => {
        let current = url;
        for (let redirect = 0; redirect <= 5; redirect++) {
            let response;
            const maxRetries = io.managesRetries ? 0 : input.maxRequestRetries;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                if (cancelled) throw new Error('cancelled');
                let actualAttempts = 0;
                const onAttempt = () => {
                    if (cancelled) throw new Error('cancelled');
                    if (summary.requests >= input.maxTotalRequests) { summary.stopReason = 'request_budget'; throw new Error('Request budget exhausted'); }
                    summary.requests++;
                    if (io.managesAttempts && actualAttempts++) summary.retries++;
                    io.onRequest?.({ url: current, attempt: io.managesAttempts ? actualAttempts : attempt + 1, requests: summary.requests });
                };
                if (!io.managesAttempts) onAttempt();
                try {
                    response = await io.get(current, { signal: controller.signal, onAttempt });
                    if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
                    break;
                } catch (error) {
                    if (cancelled || attempt === maxRetries || summary.stopReason) throw error;
                    summary.retries++;
                    await delay(Math.min(4000, 500 * (2 ** attempt)), undefined, { signal: controller.signal });
                }
            }
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const next = fns.publicUrl(new URL(response.headers.location, current).href).href;
                if (!fns.sameStore(next, root) || (new URL(current).protocol === 'https:' && new URL(next).protocol !== 'https:')) throw new Error('Unsafe redirect rejected');
                current = next; continue;
            }
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            return response;
        }
        throw new Error('Too many redirects');
    };
    // Serialize durable output separately from concurrent fetches so caps cannot race.
    let output = Promise.resolve();
    const emit = (product, task, context) => {
        const work = output.then(async () => {
            if (cancelled || (input.maxRequestsPerCrawl && summary.products >= input.maxRequestsPerCrawl) || (input.maxItems && summary.rows >= input.maxItems)) return false;
            const rows = fns.productRows(product, task.url, state.currencies[new URL(task.root).origin]);
            for (const item of rows) {
                if (cancelled || (input.maxItems && summary.rows >= input.maxItems)) break;
                const key = `${new URL(task.root).hostname.replace(/^www\./, '')}:${item.id}:${item.variant_id}`;
                if (emitted.has(key)) continue;
                const result = await extendOutput({ ...helpers, data: { product }, product, item, context, request: { url: task.url } });
                const values = (Array.isArray(result) ? result : [result]).filter((v) => v != null);
                for (const value of values) {
                    if (input.maxItems && summary.rows >= input.maxItems) break;
                    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Output extension must return object(s) or null');
                    try { await io.push(value); } catch (error) { summary.stopReason = 'write_failure'; throw error; }
                    summary.rows++;
                }
                emitted.add(key);
            }
            summary.products++;
            return true;
        });
        output = work.catch(() => {}); return work;
    };
    const handle = async (task) => {
        const { root } = task;
        if (task.label === 'ROBOTS') {
            const r = await request(new URL('/robots.txt', task.url).href, root);
            if (input.checkForBanner && !/shopify/i.test(r.body)) throw new Error('robots.txt does not identify Shopify; disable checkForBanner only for a known Shopify store');
            const maps = [...r.body.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
            if (!maps.length) throw new Error('No sitemap declared in robots.txt');
            for (const map of maps) enqueue(map, 'SITEMAP', root);
        } else if (task.label === 'SITEMAP') {
            if (summary.sitemapPages >= input.maxSitemapPages) { summary.stopReason = 'sitemap_budget'; return false; }
            summary.sitemapPages++;
            const r = await request(task.url, root); const $ = load(r.body, { xmlMode: true });
            if (!$('sitemapindex, urlset').length) throw new Error('Unrecognized sitemap XML (possibly blocked/challenge response)');
            if ($('urlset').length) summary.recognizedSitemaps = (summary.recognizedSitemaps ?? 0) + 1;
            for (const el of $('sitemap > loc')) {
                const url = $(el).text().trim();
                if (/sitemap_products/i.test(url)) enqueue(url, 'SITEMAP', root);
            }
            for (const el of $('url > loc')) {
                const url = $(el).text().trim();
                if (!/\/products\/[^/]+/.test(url)) continue;
                let include = true;
                await extendScraper({ ...helpers, label: 'FILTER_SITEMAP_URL', url, isProduct: true, isSitemap: false, filter: (v) => { include = include && Boolean(v); } });
                if (include) enqueue(url, 'PRODUCT', root);
            }
        } else {
            const origin = new URL(root).origin;
            if (!checked.has(origin) && !currencyLoads.has(origin)) currencyLoads.set(origin, (async () => {
                try { const meta = JSON.parse((await request(`${origin}/meta.json`, root)).body); state.currencies[origin] = /^[A-Z]{3}$/.test(meta.currency) ? meta.currency : null; }
                catch (error) { if (cancelled || summary.stopReason) throw error; state.currencies[origin] = null; (summary.warnings ??= []).push({ stage: 'currency', message: 'Public store currency unavailable; currency is null' }); }
                checked.add(origin);
            })());
            await currencyLoads.get(origin);
            const context = {};
            await extendScraper({ ...helpers, label: 'PRENAVIGATION', crawlingContext: context, requestAsBrowserOptions: {} });
            if (input.fetchHtml) context.$ = load((await request(task.url, root)).body);
            const jsonUrl = new URL(task.url); jsonUrl.pathname = `${jsonUrl.pathname.replace(/\.json$/, '').replace(/\/$/, '')}.json`;
            const json = JSON.parse((await request(jsonUrl.href, root)).body);
            await extendScraper({ ...helpers, label: 'POSTNAVIGATION', crawlingContext: context });
            return emit(json.product ?? json, task, context);
        }
        return true;
    };
    try {
        await save();
        extendOutput = extension(input.extendOutputFunction, ({ item }) => item);
        extendScraper = extension(input.extendScraperFunction, () => {});
        await extendScraper({ ...helpers, label: 'SETUP' });
        await extendScraper({ ...helpers, label: 'RUN' });
        while (state.pending.length && !cancelled && !summary.stopReason) {
            if (input.maxRequestsPerCrawl && summary.products >= input.maxRequestsPerCrawl) { summary.stopReason = 'product_limit'; break; }
            if (input.maxItems && summary.rows >= input.maxItems) { summary.stopReason = 'row_limit'; break; }
            const size = state.pending[0].label === 'PRODUCT' ? Math.min(input.maxConcurrency, input.maxRequestsPerCrawl ? input.maxRequestsPerCrawl - summary.products : input.maxConcurrency) : 1;
            const batch = state.pending.splice(0, size);
            for (const task of batch) active.add(task);
            await Promise.all(batch.map(async (task) => {
                try { const done = await handle(task); if (!cancelled && done !== false) seen.add(`${task.label}:${task.url}`); else state.pending.unshift(task); }
                catch (error) {
                    if (cancelled || summary.stopReason) { state.pending.unshift(task); if (!cancelled && summary.stopReason === 'write_failure') summary.failures.push({ stage: 'write', message: error.message.slice(0, 400) }); }
                    else { summary.failures.push({ url: task.url, stage: task.label, message: error.message.slice(0, 400) }); seen.add(`${task.label}:${task.url}`); }
                }
                finally { active.delete(task); }
            }));
            await save();
        }
        await output;
        if (!cancelled) {
            if (!summary.stopReason && input.maxItems && summary.rows >= input.maxItems) summary.stopReason = 'row_limit';
            if (!summary.stopReason && input.maxRequestsPerCrawl && summary.products >= input.maxRequestsPerCrawl) summary.stopReason = 'product_limit';
            if (!summary.stopReason) summary.stopReason = 'exhausted';
            summary.status = summary.failures.length || ['request_budget', 'sitemap_budget', 'write_failure'].includes(summary.stopReason) ? 'FAILED' : 'SUCCEEDED';
            if (!summary.products && !summary.recognizedSitemaps && summary.status === 'SUCCEEDED') { summary.status = 'FAILED'; summary.failures.push({ stage: 'discovery', message: 'No recognized product sitemap or product result' }); }
            await extendScraper({ ...helpers, label: 'FINISHED' });
        }
    } catch (error) { summary.status = cancelled ? 'ABORTED' : 'FAILED'; summary.failures.push({ stage: 'runtime', message: error.message.slice(0, 400) }); }
    finally { terminal = true; summary.finishedAt = new Date().toISOString(); summary.elapsedMillis = Date.now() - Date.parse(summary.startedAt); try { await save(); await io.close?.(); } finally { finish(); } }
    return summary;
}
