import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Configuration, ProxyConfiguration, log } from '@crawlee/cheerio';
import { createCrawlerTransport } from '../src/crawler-transport.js';

test('real CheerioCrawler rotates blocked sessions, preserves healthy sessions and counts every navigation', async (t) => {
    log.setLevel(log.LEVELS.ERROR);
    let calls = 0;
    const server = http.createServer((_request, response) => {
        calls++;
        response.writeHead(calls === 1 ? 403 : 200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ product: { id: 1 }, calls }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
    const config = new Configuration({ persistStorage: false, purgeOnStart: false });
    const sessions = [];
    const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://127.0.0.1:8080'] });
    proxyConfiguration.newProxyInfo = async (id) => { sessions.push(id); return undefined; };
    // Test-only DNS validation seam. Runtime never accepts this override via input.
    const transport = await createCrawlerTransport({ input: { maxConcurrency: 1, maxRequestRetries: 2 }, proxyConfiguration, config, verifyUrl: async (url) => new URL(url) });
    let attempts = 0;
    try {
        const url = `http://127.0.0.1:${server.address().port}/product.json`;
        const first = await transport.get(url, { onAttempt: () => { attempts++; } });
        assert.equal(first.status, 200); assert.equal(JSON.parse(first.body).calls, 2);
        await transport.get(`${url}?again=1`, { onAttempt: () => { attempts++; } });
        assert.equal(attempts, 3); assert.equal(calls, 3);
        assert(sessions[0]); assert.notEqual(sessions[0], sessions[1]); assert.equal(sessions[1], sessions[2]);
    } finally { await transport.close(); }
});

test('real crawler obeys the attempt budget and aborts active requests', async (t) => {
    const server = http.createServer((request, response) => {
        if (request.url.includes('slow')) return;
        response.writeHead(403, { 'content-type': 'application/json' }); response.end('{}');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
    const config = new Configuration({ persistStorage: false, purgeOnStart: false });
    const transport = await createCrawlerTransport({ input: { maxConcurrency: 1, maxRequestRetries: 3 }, config, verifyUrl: async (url) => new URL(url) });
    let attempts = 0;
    try {
        const root = `http://127.0.0.1:${server.address().port}`;
        await assert.rejects(transport.get(`${root}/blocked`, { onAttempt: () => { if (attempts >= 2) throw new Error('Request budget exhausted'); attempts++; } }), /budget/);
        assert.equal(attempts, 2);
        const controller = new AbortController();
        const started = Date.now();
        const pending = transport.get(`${root}/slow`, { signal: controller.signal, onAttempt: () => setTimeout(() => controller.abort(), 25) });
        await assert.rejects(pending, /cancelled/);
        assert(Date.now() - started < 3000);
    } finally { await transport.close(); }
});

test('crawler leaves redirects for validation and bounds streamed response bodies', async (t) => {
    let calls = 0;
    const server = http.createServer((request, response) => {
        calls++;
        if (request.url === '/redirect') {
            response.writeHead(302, { location: '/must-not-follow', 'content-type': 'text/html' }); response.end();
        } else {
            response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(Buffer.alloc(9 * 1024 * 1024));
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
    const config = new Configuration({ persistStorage: false, purgeOnStart: false });
    const transport = await createCrawlerTransport({ input: { maxConcurrency: 1, maxRequestRetries: 1 }, config, verifyUrl: async (url) => new URL(url) });
    try {
        const root = `http://127.0.0.1:${server.address().port}`;
        assert.equal((await transport.get(`${root}/redirect`)).status, 302); assert.equal(calls, 1);
        await assert.rejects(transport.get(`${root}/oversized`), /8 MiB/); assert.equal(calls, 2);
    } finally { await transport.close(); }
});

test('startup cancellation during URL validation cannot enqueue new work', async () => {
    const controller = new AbortController();
    let release;
    const validating = new Promise((resolve) => { release = resolve; });
    const config = new Configuration({ persistStorage: false, purgeOnStart: false });
    const transport = await createCrawlerTransport({ input: { maxConcurrency: 1, maxRequestRetries: 1 }, config, verifyUrl: async () => validating });
    try {
        const pending = transport.get('https://store.example/', { signal: controller.signal, onAttempt: () => assert.fail('Cancelled startup made a request') });
        controller.abort(); release();
        await assert.rejects(pending, /cancelled/);
    } finally { await transport.close(); }
});
