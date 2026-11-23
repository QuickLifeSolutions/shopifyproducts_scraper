import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { CheerioCrawler, GotScrapingHttpClient, NonRetryableError, RequestQueue } from '@crawlee/cheerio';
import { assertPublic } from './fns.js';

const MAX_BYTES = 8 * 1024 * 1024;

// Keep the crawler's headers, TLS handling and session token intact. Only bound
// the response stream; do not substitute a separate bare HTTP client.
class BoundedHttpClient extends GotScrapingHttpClient {
    async stream(request, handleRedirect) {
        const result = await super.stream(request, handleRedirect);
        let received = 0;
        const bounded = new Transform({
            transform(chunk, _encoding, callback) {
                received += chunk.length;
                callback(received > MAX_BYTES ? new NonRetryableError('Response exceeds 8 MiB safety limit') : null, chunk);
            },
        });
        result.stream.on('error', (error) => bounded.destroy(error));
        bounded.on('error', () => result.stream.destroy());
        result.stream.pipe(bounded);
        return { ...result, stream: bounded };
    }
}

export async function createCrawlerTransport({ input, proxyConfiguration, config, verifyUrl = assertPublic }) {
    // Each transport owns an isolated queue. Durable crawl state belongs to the
    // scraper checkpoint, so an old unresolved transport queue is never replayed.
    const requestQueue = await RequestQueue.open(`http-${randomUUID()}`, config ? { config } : undefined);
    const pending = new Map();
    let running;
    let closing = false;
    let fatal;
    let closed;

    const settle = (key, error, response) => {
        const operation = pending.get(key);
        if (!operation) return;
        pending.delete(key);
        operation.signal?.removeEventListener('abort', operation.abort);
        if (error) operation.reject(error); else operation.resolve(response);
    };

    const crawler = new CheerioCrawler({
        requestQueue,
        keepAlive: true,
        maxConcurrency: input.maxConcurrency,
        maxRequestRetries: input.maxRequestRetries,
        maxSessionRotations: input.maxRequestRetries,
        useSessionPool: true,
        sessionPoolOptions: { persistStateKey: 'HTTP_TRANSPORT_SESSION_POOL_V1', maxPoolSize: Math.max(1, input.maxConcurrency), sessionOptions: { maxErrorScore: 0.5 } },
        persistCookiesPerSession: false, // Same as master: do not invent cookie persistence.
        ignoreSslErrors: false,
        proxyConfiguration,
        httpClient: new BoundedHttpClient(),
        navigationTimeoutSecs: 20,
        requestHandlerTimeoutSecs: 30,
        additionalMimeTypes: ['text/plain', 'application/octet-stream'],
        autoscaledPoolOptions: { maybeRunIntervalSecs: 0.1 },
        preNavigationHooks: [async ({ request }, options) => {
            const operation = pending.get(request.uniqueKey);
            if (!operation || operation.signal?.aborted || closing) throw new NonRetryableError('Request cancelled');
            await verifyUrl(request.url);
            try { operation.onAttempt?.(); } catch (error) { throw new NonRetryableError(error.message); }
            // Redirects are handled and validated by the scraper. Internal
            // session rotations and retries still pass through this hook.
            options.followRedirect = false;
            options.throwHttpErrors = false;
            options.retry = { limit: 0 };
            options.signal = operation.signal;
        }],
        requestHandler: async ({ request, response, body }) => {
            settle(request.uniqueKey, null, { status: response.statusCode, headers: response.headers, body: body.toString('utf8') });
        },
        failedRequestHandler: async ({ request }, error) => {
            // Never expose a proxy URL or full error context in saved summaries.
            const status = request.errorMessages?.join(' ').match(/(?:received|status code|HTTP|response code)[ :]*(\d{3})/i)?.[1];
            settle(request.uniqueKey, new Error(error instanceof NonRetryableError ? error.message : (status ? `HTTP ${status} after crawler retries` : 'Crawler request failed after retries; inspect sanitized crawler logs')));
        },
    }, config);

    return {
        crawler,
        async get(url, { signal, onAttempt } = {}) {
            if (closing || signal?.aborted) throw new Error('Request cancelled');
            if (fatal) throw fatal;
            await verifyUrl(url);
            if (closing || signal?.aborted) throw new Error('Request cancelled');
            const key = randomUUID();
            const result = new Promise((resolve, reject) => {
                const abort = () => {
                    // Reject immediately; the underlying got signal tears down
                    // the active socket while the crawler drains during close.
                    settle(key, new Error('Request cancelled'));
                };
                pending.set(key, { resolve, reject, signal, onAttempt, abort });
                signal?.addEventListener('abort', abort, { once: true });
            });
            // Return the result promise immediately so cancellation during a
            // remote enqueue always has an attached rejection handler.
            requestQueue.addRequest({ url, uniqueKey: key }).then(() => {
                if (!running) running = crawler.run().catch((error) => {
                    fatal = error;
                    for (const id of pending.keys()) settle(id, error);
                });
            }).catch((error) => settle(key, error));
            return result;
        },
        close() {
            return closed ??= (async () => {
            closing = true;
            crawler.stop('HTTP transport finished; draining crawler.');
            for (const id of pending.keys()) settle(id, new Error('Request cancelled'));
            if (running) await running;
            await requestQueue.drop();
            })();
        },
    };
}
