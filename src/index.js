import { Actor, log } from 'apify';
import { download, publicUrl } from './fns.js';
import { scrape } from './scraper.js';
export { scrape } from './scraper.js';

export const DEFAULTS = { startUrls: [{ url: 'https://smylelabs.com/' }], maxRequestsPerCrawl: 1, maxItems: 3, maxTotalRequests: 20, maxSitemapPages: 20, maxConcurrency: 1, maxRequestRetries: 0, proxyConfig: { useApifyProxy: true }, checkForBanner: true, fetchHtml: false, debugLog: false, customData: {}, extendOutputFunction: 'async ({ item }) => item', extendScraperFunction: 'async () => {}' };
export function normalizeInput(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Input must be an object');
    for (const key of ['urls', 'waitForSelector', 'useProxy']) if (key in raw) throw new Error(`Unsupported input ${key}; use startUrls/proxyConfig; JavaScript rendering is not supported`);
    const input = { ...DEFAULTS, ...raw };
    if (!Array.isArray(input.startUrls) || !input.startUrls.length || input.startUrls.length > 100) throw new Error('startUrls must contain 1–100 public store or product URLs');
    input.startUrls = [...new Set(input.startUrls.map((s) => publicUrl(typeof s === 'string' ? s : s?.url).href))].map((url) => ({ url }));
    for (const source of input.startUrls) {
        const url = new URL(source.url);
        if (/\/collections\//.test(url.pathname) && !/\/products\//.test(url.pathname)) throw new Error('Collection filtering is not supported; use a store root or direct product URL');
        if (/\/products\//.test(url.pathname)) { url.pathname = url.pathname.replace(/\.json$/, '').replace(/\/$/, ''); url.search = ''; source.url = url.href; }
    }
    for (const [key, min, max] of [['maxRequestsPerCrawl', 0, 100000], ['maxItems', 0, 1000000], ['maxTotalRequests', 1, 100000], ['maxSitemapPages', 1, 10000], ['maxConcurrency', 1, 50], ['maxRequestRetries', 0, 5]]) if (!Number.isSafeInteger(input[key]) || input[key] < min || input[key] > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
    for (const key of ['checkForBanner', 'fetchHtml', 'debugLog']) if (typeof input[key] !== 'boolean') throw new Error(`${key} must be boolean`);
    if (!input.proxyConfig || typeof input.proxyConfig !== 'object' || Array.isArray(input.proxyConfig)) throw new Error('proxyConfig must be an object');
    return input;
}
export async function entry() {
    let input;
    try { input = normalizeInput((await Actor.getInput()) ?? {}); }
    catch (error) { await Actor.setValue('RUN_SUMMARY', { status: 'FAILED', stopReason: 'invalid_input', failures: [{ message: error.message }] }); throw error; }
    if (input.debugLog) log.setLevel(log.LEVELS.DEBUG);
    let proxyConfiguration;
    try {
        proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfig);
        if (!proxyConfiguration && (Actor.isAtHome() || input.proxyConfig.useApifyProxy || input.proxyConfig.proxyUrls?.length)) throw new Error('Requested proxy is unavailable; provide valid Apify proxy credentials or custom proxy URLs. No automatic direct fallback is allowed.');
    } catch (error) { await Actor.setValue('RUN_SUMMARY', { status: 'FAILED', stopReason: 'proxy_error', failures: [{ message: 'Proxy initialization failed; verify proxy credentials, access and selected groups.' }] }); throw error; }
    log.info('Starting Shopify HTTP scraper', { proxyMode: proxyConfiguration?.usesApifyProxy ? 'Apify' : proxyConfiguration ? 'custom' : 'direct', groups: input.proxyConfig.apifyProxyGroups ?? [], country: input.proxyConfig.apifyProxyCountry ?? null });
    const previous = await Actor.getValue('CHECKPOINT');
    if (previous && JSON.stringify(previous.input) !== JSON.stringify(input)) throw new Error('Input differs from checkpoint; reset storage or start a fresh run');
    const summary = await scrape(input, {
        state: previous?.state,
        get: (url, options) => download(url, { ...options, proxyConfiguration }),
        push: (row) => Actor.pushData(row),
        onRequest: (details) => { const url = new URL(details.url); log.info('Fetching public resource', { ...details, url: `${url.origin}${url.pathname}` }); },
        save: async (state) => { await Actor.setValue('CHECKPOINT', { input, state }); await Actor.setValue('RUN_SUMMARY', state.summary); },
        onCancel: (cancel) => { Actor.on('aborting', cancel); Actor.on('migrating', cancel); process.once('SIGINT', cancel); process.once('SIGTERM', cancel); },
    });
    log.info('Scrape finished', summary);
    if (summary.status === 'FAILED') throw new Error(`Scrape failed: ${summary.stopReason}; see RUN_SUMMARY (${summary.failures.length} failures)`);
}
