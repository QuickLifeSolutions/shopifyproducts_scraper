import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { gotScraping } from 'got-scraping';
import { stripHtml } from 'string-strip-html';

export const safeIsoDate = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
export const removeGuid = (v) => String(v ?? '').replace(/^gid:\/\/shopify\/[^/]+\//, '');
export const uniqueNonEmptyArray = (values) => [...new Set(values.filter(Boolean))];
export const coalesceProps = (bases, keys) => keys.flatMap((key) => bases.map((base) => base?.[key])).find((v) => v !== undefined);
export const toSnakeCase = (s) => s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
export { stripHtml };
export function publicUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Only public HTTP(S) URLs on standard ports without credentials are supported');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host) || (!host.includes('.') && !host.includes(':'))) throw new Error('Private host rejected');
    if (ipaddr.isValid(host) && ipaddr.process(host).range() !== 'unicast') throw new Error('Private IP rejected');
    url.hash = ''; return url;
}
export async function assertPublic(value, resolver = lookup) {
    const url = publicUrl(value);
    const addresses = await resolver(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
    if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) throw new Error('Non-public DNS address rejected');
    return url;
}
export function sameStore(a, b) { return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, ''); }
export async function download(url, { proxyConfiguration, signal }) {
    await assertPublic(url);
    const stream = gotScraping.stream({ url, proxyUrl: await proxyConfiguration?.newUrl(), signal, throwHttpErrors: false, followRedirect: false, retry: { limit: 0 }, timeout: { request: 20000 }, https: { rejectUnauthorized: true } });
    let response;
    stream.on('response', (r) => { response = r; });
    const chunks = []; let size = 0;
    try {
        for await (const chunk of stream) {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) throw new Error('Response exceeds 8 MiB safety limit');
            chunks.push(chunk);
        }
    } finally { stream.destroy(); }
    return { status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') };
}
export function getVariantAttributes(variant, product) {
    const props = Object.create(null); const names = [];
    for (const [i, option] of (product.options ?? []).entries()) {
        const name = typeof option === 'string' ? option : option.name;
        if (!name || /^(title|default)$/i.test(name)) continue;
        const key = toSnakeCase(name);
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        props[key] = variant[`option${i + 1}`] ?? null; names.push(`${name}: ${props[key]}`);
    }
    return { name: names.join(' / ') || 'Default', props };
}
export function productRows(product, url, currency) {
    if (!product || typeof product.title !== 'string' || !product.id || !Array.isArray(product.variants) || !product.variants.length) throw new Error('Unrecognized product JSON: expected id, title and non-empty variants');
    const images = product.images ?? [];
    return product.variants.map((variant) => {
        if (!variant.id) throw new Error('Variant has no stable ID');
        const { name, props } = getVariantAttributes(variant, product);
        const stock = variant.inventory_quantity ?? variant.inventoryQuantity ?? null;
        const available = variant.available ?? variant.availableForSale ?? variant.available_for_sale;
        const price = variant.price === null || variant.price === undefined || variant.price === '' ? null : Number(variant.price);
        return {
            url, id: removeGuid(product.id), variant_id: removeGuid(variant.id), title: product.title,
            color: props.color ?? null, size: props.size ?? null, material: props.material ?? null,
            display_name: variant.display_name ?? variant.displayName ?? null,
            description: product.body_html || product.description ? stripHtml(product.body_html || product.description).result : null,
            sku: String(variant.sku || removeGuid(variant.id)),
            availability: typeof available === 'boolean' ? (available ? 'in stock' : 'out of stock') : (stock === null ? 'unknown' : (stock > 0 ? 'in stock' : 'out of stock')),
            price: Number.isFinite(price) ? price : null, currency: currency ?? null,
            product_type: product.product_type ?? product.productType ?? null, brand: product.vendor ?? null,
            images_urls: uniqueNonEmptyArray([images.find((image) => String(image.id) === String(variant.image_id))?.src, ...images.filter((image) => !image.variant_ids?.length).map((image) => image.src), product.image?.src].filter(Boolean).map((src) => new URL(src, url).href)),
            video_urls: [], created_at: safeIsoDate(product.created_at), updated_at: safeIsoDate(product.updated_at), published_at: safeIsoDate(product.published_at),
            additional: { variant_attributes: name, variant_title: variant.title ?? null, scraped_at: new Date().toISOString(), barcode: variant.barcode ?? null, taxcode: variant.taxcode ?? null, stock_count: stock, tags: Array.isArray(product.tags) ? product.tags : String(product.tags ?? '').split(/,\s*/).filter(Boolean), weight: variant.weight != null ? `${variant.weight} ${variant.weight_unit ?? ''}`.trim() : null, requires_shipping: variant.requires_shipping ?? variant.requiresShipping ?? null, ...props },
        };
    });
}
