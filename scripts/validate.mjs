import fs from 'node:fs';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import formats from 'ajv-formats';
import { DEFAULTS, normalizeInput } from '../src/index.js';
const read = (p) => JSON.parse(fs.readFileSync(p));
const ajv = new Ajv({strict:false,allErrors:true}); formats(ajv);
const schema = read('INPUT_SCHEMA.json'); const validate = ajv.compile(schema);
for (const name of ['input','api-input','prefill']) {
    const input = read(`examples/${name}.json`); assert(validate(input), JSON.stringify(validate.errors)); assert.deepEqual(normalizeInput(input),normalizeInput(DEFAULTS));
}
assert.deepEqual(normalizeInput({}), DEFAULTS);
for (const [key,value] of Object.entries(DEFAULTS)) { assert.deepEqual(schema.properties[key].default,value,key); assert.deepEqual(schema.properties[key].prefill,value,key); }
const actor = read('.actor/actor.json');
for (const ref of [actor.input,actor.output,actor.storages.dataset,actor.storages.keyValueStore]) assert(fs.existsSync(new URL(`../.actor/${ref}`,import.meta.url)));
ajv.compile(read('.actor/dataset_schema.json').fields);
ajv.compile(read('.actor/key_value_store_schema.json').collections.summary.jsonSchema);
console.log('Input examples, runtime defaults, references and typed schemas passed');
