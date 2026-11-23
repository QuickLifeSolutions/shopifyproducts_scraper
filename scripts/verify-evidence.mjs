import fs from 'node:fs';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import formats from 'ajv-formats';
const read = (path) => JSON.parse(fs.readFileSync(path));
const ajv = new Ajv({ strict: false, allErrors: true }); formats(ajv);
const summarySchema = ajv.compile(read('.actor/key_value_store_schema.json').collections.summary.jsonSchema);
const rowSchema = ajv.compile(read('.actor/dataset_schema.json').fields);
for (const run of read('audit/cloud-evidence.json')) {
    assert(summarySchema(run.summary), `${run.id}: ${JSON.stringify(summarySchema.errors)}`);
    if (run.output?.products) assert.equal(run.output.products, `https://api.apify.com/v2/datasets/${run.datasetId}/items`);
    if (run.output?.summary) assert.equal(run.output.summary, `https://api.apify.com/v2/key-value-stores/${run.keyValueStoreId}/records/RUN_SUMMARY`);
    assert(run.summary.requests <= 100);
}
for (const file of ['final-catalog-rows', 'defaults-empty-rows', 'local-direct-sample-rows']) {
    const rows = read(`audit/${file}.json`); assert(rows.length > 0);
    for (const row of rows) assert(rowSchema(row), JSON.stringify(rowSchema.errors));
    assert.equal(new Set(rows.map((row) => `${new URL(row.url).hostname.replace(/^www\./, '')}:${row.id}:${row.variant_id}`)).size, rows.length);
}
for (const file of ['cancellation-checkpoint', 'cancellation-release-checkpoint']) {
    const checkpoint = read(`audit/${file}.json`); assert.equal(checkpoint.status, 'ABORTED'); assert(checkpoint.pending > 0); assert(checkpoint.finishedAt);
}
assert(read('audit/runtime-manifest.json').every((file) => file.uploadedMatches));
console.log('Saved hosted summaries, output links, typed rows, cancellation checkpoints and upload manifest passed');
