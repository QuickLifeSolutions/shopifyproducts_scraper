import Apify from 'apify';
import { gotScraping } from 'got-scraping';
import { load } from 'cheerio';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as vm from 'vm';

export { stripHtml } from 'string-strip-html';

const { log } = Apify.utils;
const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const COLLECTION_PAGE_SIZE = 250;

const readJsonIfExists = async (relativePath) => {
    try {
        const absolute = path.join(projectRoot, relativePath);
        const contents = await readFile(absolute, 'utf8');
        return JSON.parse(contents);
    } catch (error) {
        if (error && error.code !== 'ENOENT') {
            log.debug('Unable to read metadata file', { relativePath, error: error.message });
        }
        return undefined;
    }
};

const gitCommand = async (args) => {
    try {
        const { stdout } = await execFileAsync('git', args, { cwd: projectRoot });
        return stdout.trim() || undefined;
    } catch (error) {
        log.debug('Git metadata unavailable', { args: args.join(' '), error: error.message });
        return undefined;
    }
};

export const enqueueProductRequest = async ({ url, requestQueue, fetchHtml }) => {
    if (!url) {
        return 0;
    }

    const trimmed = `${url}`.trim();

    if (!trimmed) {
        return 0;
    }

    const baseUrl = trimmed.replace(/\.json(\?.*)?$/i, '');
    const targetUrl = fetchHtml ? baseUrl : `${baseUrl}.json`;
    const userData = {
        url: baseUrl,
        label: fetchHtml ? 'HTML' : 'JSON',
    };

    const result = await requestQueue.addRequest({
        url: targetUrl,
        userData,
    });

    return result.wasAlreadyPresent ? 0 : 1;
};

export const enqueueCollectionProducts = async ({ collectionUrl, proxyConfiguration, requestQueue, fetchHtml }) => {
    if (!collectionUrl) {
        return 0;
    }

    const normalized = `${collectionUrl}`.trim();

    if (!normalized) {
        return 0;
    }

    const url = new URL(normalized);
    const basePath = url.pathname.replace(/\/$/, '');
    let enqueued = 0;
    const handles = new Set();

    for (let page = 1; ; page += 1) {
        const jsonUrl = new URL(normalized);
        jsonUrl.pathname = `${basePath}/products.json`;
        jsonUrl.search = '';
        jsonUrl.searchParams.set('limit', `${COLLECTION_PAGE_SIZE}`);
        jsonUrl.searchParams.set('page', `${page}`);

        const sessionId = `${url.hostname}-${page}-${Date.now()}`
            .replace(/[^a-z0-9._~]/gi, '-');

        let response;

        try {
            response = await gotScraping({
                url: jsonUrl.toString(),
                proxyUrl: proxyConfiguration?.newUrl(sessionId),
                timeout: {
                    response: 20000,
                    request: 15000,
                },
                retry: { limit: 0 },
            });
        } catch (error) {
            log.info('Failed to load collection page', { collectionUrl: normalized, page, error: error.message });
            break;
        }

        if (![200, 301, 302].includes(response.statusCode)) {
            log.info('Collection request returned unexpected status', { collectionUrl: normalized, statusCode: response.statusCode });
            break;
        }

        let payload;

        try {
            payload = JSON.parse(response.body || '{}');
        } catch (error) {
            log.info('Unable to parse collection response', { collectionUrl: normalized, page, error: error.message });
            break;
        }

        const products = Array.isArray(payload?.products) ? payload.products : [];

        if (!products.length) {
            break;
        }

        for (const product of products) {
            const handle = product?.handle;

            if (!handle || handles.has(handle)) {
                continue;
            }

            handles.add(handle);
            const productUrl = `${url.origin}/products/${handle}`;
            enqueued += await enqueueProductRequest({
                url: productUrl,
                requestQueue,
                fetchHtml,
            });
        }
        if (products.length < COLLECTION_PAGE_SIZE) {
            break;
        }
    }

    log.info('Enqueued collection products', { collectionUrl: normalized, enqueued });

    return enqueued;
};

/**
 * Log useful metadata at startup so local CLI runs surface helpful context.
 *
 * @param {{ input: any }} params
 */
export const logRunMetadata = async ({ input }) => {
    const env = Apify.getEnv() || {};
    const pkg = await readJsonIfExists('package.json');
    const {
        startUrls = [],
        maxConcurrency = 20,
        maxRequestsPerCrawl,
        fetchHtml = false,
        limitToStartUrls,
    } = input ?? {};

    const [gitBranch, gitCommit] = await Promise.all([
        gitCommand(['rev-parse', '--abbrev-ref', 'HEAD']),
        gitCommand(['rev-parse', '--short', 'HEAD']),
    ]);

    let sampleStartUrl;

    if (Array.isArray(startUrls) && startUrls.length) {
        const firstStartUrl = startUrls[0];
        sampleStartUrl = typeof firstStartUrl === 'string'
            ? firstStartUrl
            : firstStartUrl?.url;
    }

    const metadata = {
        actorRunId: env.actorRunId,
        actorId: env.actorId,
        taskId: env.actorTaskId,
        userId: env.userId,
        gitBranch,
        gitCommit,
        nodeVersion: process.version,
        apifySdkVersion: Apify.version || pkg?.dependencies?.apify,
        packageName: pkg?.name,
        packageVersion: pkg?.version,
        startUrlsCount: Array.isArray(startUrls) ? startUrls.length : 0,
        sampleStartUrl,
        fetchHtml,
        maxConcurrency,
        maxRequestsPerCrawl: maxRequestsPerCrawl ?? null,
        limitToStartUrls: typeof limitToStartUrls === 'boolean' ? limitToStartUrls : undefined,
    };

    const sanitized = Object.fromEntries(
        Object.entries(metadata)
            .filter(([, value]) => value !== null && value !== undefined && value !== ''),
    );

    log.info('Run metadata', sanitized);
};

/**
 * Remove the GUID from the string if present
 *
 * @param {string} str
 */
export const removeGuid = (str) => {
    return +`${str}`.replace(/^gid:\/\/shopify\/[^/]+\//, '');
};

/**
 * Finds the first existing value (falsy or not) in the base object.
 *
 * @param {Array<Record<string, any>>} bases
 * @param {string[]} props
 */
export const coalesceProps = (bases, props) => {
    for (const prop of props) {
        for (const base of bases) {
            if (prop in base) {
                return base[prop];
            }
        }
    }
};

/**
 * Convert the property name to a snake_case format for consistency
 *
 * @param {string} str
 */
export const toSnakeCase = (str) => {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
};

/**
 * @param {string} date
 */
export const safeIsoDate = (date) => {
    try {
        return new Date(date).toISOString();
    } catch (e) {
        return null;
    }
};

/**
 *
 * @param {*} url
 */
export const categorizeUrl = (url) => {
    if (!url) {
        throw new Error('Found empty url');
    }

    const cleaned = `${url}`.split('#', 1)[0]?.trim();

    if (!cleaned) {
        return 'other';
    }

    const lower = cleaned.toLowerCase();

    if (/sitemap.*\.xml(\?.*)?$/.test(lower)) {
        return 'sitemap';
    }

    if (/\/products\//.test(lower)) {
        return 'product';
    }

    if (/\/collections\//.test(lower)) {
        return 'collection';
    }

    return 'other';
};

/**
 * Monkey-patch the handleRequestFunction failed... error
 *
 * @param {Apify.BasicCrawler} crawler
 */
export const patchLog = (crawler) => {
    const originalException = crawler.log.exception.bind(crawler.log);
    crawler.log.exception = (...args) => {
        if (!args?.[1]?.includes('handleRequestFunction')) {
            originalException(...args);
        }
    };
};

/**
 * Transform a input.startUrls, parse requestsFromUrl items as well,
 * into regular urls. Returns an async generator that should be iterated over.
 *
 * @example
 *   for await (const req of fromStartUrls(input.startUrls)) {
 *     await requestQueue.addRequest(req);
 *   }
 *
 * @param {any[]} startUrls
 * @param {string} [name]
 */
export const fromStartUrls = async function* (startUrls, name = 'INPUTURLS') {
    const rl = await Apify.openRequestList(name, startUrls);

    /** @type {Apify.Request | null} */
    let rq;

    // eslint-disable-next-line no-cond-assign
    while (rq = await rl.fetchNextRequest()) {
        yield rq;
    }
};

/**
 * Uses a BasicCrawler to get links from sitemaps XMLs
 *
 * @example
 *   const proxyConfiguration = await Apify.createProxyConfiguration();
 *   const requestList = await requestListFromSitemaps({
 *
 *      sitemapUrls: [
 *         'https://example.com/sitemap.xml',
 *      ]
 *   })
 *
 * @param {{
 *  proxyConfiguration?: Apify.ProxyConfiguration,
 *  requestQueue: Apify.RequestQueue,
 *  sitemapUrls: string[],
 *  timeout?: number,
 *  limit?: number,
 *  maxConcurrency?: number
 *  filter: (url: string) => Promise<boolean>,
 *  map: (url: string) => Apify.RequestOptions,
 * }} params
 */
export const requestListFromSitemaps = async ({
    proxyConfiguration,
    filter,
    map,
    limit = 0,
    requestQueue,
    timeout = 300,
    sitemapUrls,
    maxConcurrency = 1,
}) => {
    const urls = new Set();

    /** @param {string} url */
    const cleanup = (url) => `${url}`.replace(/[\n\r]/g, '').trim();

    let count = 1;

    const sitemapCrawler = new Apify.BasicCrawler({
        requestList: await Apify.openRequestList('SITEMAPS', sitemapUrls),
        requestQueue,
        useSessionPool: true,
        maxConcurrency,
        handleRequestTimeoutSecs: timeout,
        sessionPoolOptions: {
            persistStateKey: 'SITEMAPS_SESSION_POOL',
            sessionOptions: {
                maxErrorScore: 0.5,
            },
        },
        maxRequestRetries: 5,
        handleRequestFunction: async ({ request, session }) => {
            const response = await gotScraping({
                url: request.url,
                proxyUrl: proxyConfiguration?.newUrl(session.id),
                timeout: {
                    response: 10000,
                    request: 5000,
                },
                retry: { limit: 0 },
            });

            if (![200, 301, 302].includes(response.statusCode)) {
                throw new Error(`Status code ${response.statusCode}`);
            }

            log.debug(`Parsing sitemap ${request.url}`);

            const $ = load(response.body, { decodeEntities: true });

            const $locations = $('url loc');

            for (const el of $locations) {
                const url = cleanup($(el).text());

                log.debug(`Found sitemap url`, { url });

                if (await filter(url)) {
                    const limited = limit > 0
                        ? urls.size >= limit
                        : false;

                    if (!limited) {
                        urls.add(map(url));
                    } else {
                        break;
                    }
                }
            }

            // recursive sitemap
            for (const el of $('sitemap loc')) {
                const url = cleanup($(el).text());

                if (await filter(url)) {
                    log.debug(`Found subsitemap url`, { url });

                    await requestQueue.addRequest({
                        url,
                    });
                    count++;
                }
            }
        },
    });

    await sitemapCrawler.run();

    log.info(`Found ${urls.size} URLs from ${count} sitemap URLs`);

    return Apify.openRequestList('STARTURLS', [...urls.values()]);
};

/**
 * @param {Record<string, any>[]} arr
 */
export const mapIdsFromArray = (arr) => new Map([...arr].filter((s) => s).map((item) => ([removeGuid(item.id), item])));

/**
 * @param {any[]} arr
 */
export const uniqueNonEmptyArray = (arr) => [...new Set([...arr])].filter((s) => s);

/**
 * @param {string} url
 */
export const removeUrlQueryString = (url) => `${url}`.split('?', 2)[0];

/**
 *
 * @param {Record<string, any>} variant
 * @param {Record<string, any>} product
 * @returns {{ name: string, props: Record<string, any> }}
 */
export const getVariantAttributes = (variant, product) => {
    const { options } = product;

    if (/(Default|title)/i.test(`${options?.[0]?.name}`)) {
        return { name: 'Default', props: {} };
    }

    const name = [];
    const props = {};

    for (let i = 0; i < options.length; i++) {
        const prop = `option${i + 1}`;
        if (prop in variant) {
            props[toSnakeCase(options[i].name)] = variant[prop];
            name.push(`${options[i].name}: ${variant[prop]}`);
        }
    }

    return { name: name.join(' / '), props };
};

/**
 * Checks for robots to be of Shopify and parse the sitemap location
 *
 * @param {{
 *   filteredSitemapUrls: Set<string>,
 *   startUrls: Apify.RequestOptions[],
 *   proxyConfiguration: Apify.ProxyConfiguration,
 *   checkForBanner: boolean
 * }} params
 */
export const checkForRobots = async ({ checkForBanner = true, filteredSitemapUrls, startUrls, proxyConfiguration }) => {
    for await (const { url } of fromStartUrls(startUrls)) {
        const baseUrl = new URL(url);
        baseUrl.pathname = '/robots.txt';
        baseUrl.searchParams.forEach((key) => {
            baseUrl.searchParams.delete(key);
        });

        try {
            const response = await gotScraping({
                url: baseUrl.toString(),
                timeout: {
                    response: 20000,
                    request: 17000,
                },
                proxyUrl: proxyConfiguration?.newUrl(`${Math.random() * 10000}`.replace('.', '')),
                retry: { limit: 0 },
            });

            if (![200, 301, 302].includes(response.statusCode)) {
                throw new Error(`Status code ${response.statusCode}`);
            }

            const { body } = response;

            if (!body) {
                throw new Error('Body is empty');
            }

            if (checkForBanner && !body.includes('Shopify')) {
                throw new Error('Not a Shopify URL');
            }

            if (!body.includes('Sitemap: ')) {
                throw new Error('No sitemap URL');
            }

            const matches = body.match(/Sitemap: ([^$]+?)$/m);

            if (!matches?.[1]) {
                throw new Error('Failing to find sitemap URL');
            }

            filteredSitemapUrls.add(matches[1]);
        } catch (e) {
            log.exception(e, `Error fetching robots on ${url}`, { e, url });
        }
    }
};

/**
 * @typedef {ReturnType<typeof extendFunction> extends Promise<infer U> ? U : never} UnwrappedPromiseFn
 */

/**
 * Do a generic check when using Apify Proxy
 *
 * @typedef params
 * @property {any} [params.proxyConfig] Provided apify proxy configuration
 * @property {boolean} [params.required] Make the proxy usage required when running on the platform
 * @property {string[]} [params.blacklist] Blacklist of proxy groups, by default it's ['GOOGLE_SERP']
 * @property {boolean} [params.force] By default, it only do the checks on the platform. Force checking regardless where it's running
 * @property {string[]} [params.hint] Hint specific proxy groups that should be used, like SHADER or RESIDENTIAL
 *
 * @example
 *    const proxy = await proxyConfiguration({
 *       proxyConfig: input.proxy,
 *       blacklist: ['SHADER'],
 *       hint: ['RESIDENTIAL']
 *    });
 *
 * @param {params} params
 * @returns {Promise<Apify.ProxyConfiguration | undefined>}
 */
export const proxyConfiguration = async ({
    proxyConfig,
    required = true,
    force = Apify.isAtHome(),
    blacklist = ['GOOGLESERP'],
    hint = [],
}) => {
    const configuration = await Apify.createProxyConfiguration(proxyConfig);

    // this works for custom proxyUrls
    if (Apify.isAtHome() && required) {
        const usesApifyProxy = configuration?.usesApifyProxy;
        const hasCustomProxyUrls = (configuration?.proxyUrls || []).length > 0;
        const generatedProxyUrl = configuration?.newUrl?.();

        if ((!usesApifyProxy && !hasCustomProxyUrls) || !generatedProxyUrl) {
            throw new Error('\n=======\nYou must use Apify proxy or custom proxy URLs\n\n=======');
        }
    }

    // check when running on the platform by default
    if (force) {
        // only when actually using Apify proxy it needs to be checked for the groups
        if (configuration && configuration.usesApifyProxy) {
            if (blacklist.some((blacklisted) => (configuration.groups || []).includes(blacklisted))) {
                const message = [
                    '',
                    '=======',
                    'These proxy groups cannot be used in this actor. Choose other group or contact support@apify.com to give you proxy trial:',
                    '',
                    `*  ${blacklist.join('\n*  ')}`,
                    '',
                    '=======',
                ].join('\n');

                throw new Error(message);
            }

            // specific non-automatic proxy groups like RESIDENTIAL, not an error, just a hint
            if (hint.length && !hint.some((group) => (configuration.groups || []).includes(group))) {
                const hintMessage = [
                    '',
                    '=======',
                    'You can pick specific proxy groups for better experience:',
                    '',
                    `*  ${hint.join('\n*  ')}`,
                    '',
                    '=======',
                ].join('\n');

                Apify.utils.log.info(hintMessage);
            }
        }
    }

    return configuration;
};

/**
 * @template T
 * @typedef {T & { Apify: Apify, customData: any, request: Apify.Request }} PARAMS
 */

/**
 * Compile a IO function for mapping, filtering and outputing items.
 * Can be used as a no-op for interaction-only (void) functions on `output`.
 * Data can be mapped and filtered twice.
 *
 * Provided base map and filter functions is for preparing the object for the
 * actual extend function, it will receive both objects, `data` as the "raw" one
 * and "item" as the processed one.
 *
 * Always return a passthrough function if no outputFunction provided on the
 * selected key.
 *
 * @template RAW
 * @template {{ [key: string]: any }} INPUT
 * @template MAPPED
 * @template {{ [key: string]: any }} HELPERS
 * @param {{
 *  key: string,
 *  map?: (data: RAW, params: PARAMS<HELPERS>) => Promise<MAPPED>,
 *  output?: (data: MAPPED, params: PARAMS<HELPERS> & { data: RAW, item: MAPPED }) => Promise<void>,
 *  filter?: (obj: { data: RAW, item: MAPPED }, params: PARAMS<HELPERS>) => Promise<boolean>,
 *  input: INPUT,
 *  helpers: HELPERS,
 * }} params
 * @return {Promise<(data: RAW, args?: Record<string, any>) => Promise<void>>}
 */
export const extendFunction = async ({
    key,
    output,
    filter,
    map,
    input,
    helpers,
}) => {
    /**
     * @type {PARAMS<HELPERS>}
     */
    const base = {
        ...helpers,
        Apify,
        customData: input.customData || {},
    };

    const evaledFn = (() => {
        // need to keep the same signature for no-op
        if (typeof input[key] !== 'string' || input[key].trim() === '') {
            return new vm.Script('({ item }) => item');
        }

        try {
            return new vm.Script(input[key], {
                lineOffset: 0,
                produceCachedData: false,
                displayErrors: true,
                filename: `${key}.js`,
            });
        } catch (e) {
            throw new Error(`"${key}" parameter must be a function`);
        }
    })();

    /**
     * Returning arrays from wrapper function split them accordingly.
     * Normalize to an array output, even for 1 item.
     *
     * @param {any} value
     * @param {any} [args]
     */
    const splitMap = async (value, args) => {
        const mapped = map ? await map(value, args) : value;

        if (!Array.isArray(mapped)) {
            return [mapped];
        }

        return mapped;
    };

    return async (data, args) => {
        const merged = { ...base, ...args };

        for (const item of await splitMap(data, merged)) {
            if (filter && !(await filter({ data, item }, merged))) {
                continue;
            }

            const result = await (evaledFn.runInThisContext()({
                ...merged,
                data,
                item,
            }));

            for (const out of (Array.isArray(result) ? result : [result])) {
                if (output) {
                    if (out !== null) {
                        await output(out, { ...merged, data, item });
                    }
                    // skip output
                }
            }
        }
    };
};
