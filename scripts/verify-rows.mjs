import fs from 'node:fs';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import formats from 'ajv-formats';
const ajv=new Ajv({strict:false,allErrors:true});formats(ajv);
const validate=ajv.compile(JSON.parse(fs.readFileSync('.actor/dataset_schema.json')).fields);
for(const path of process.argv.slice(2)){
    const rows=JSON.parse(fs.readFileSync(path));assert(Array.isArray(rows));assert(rows.length>0,`${path}: no rows`);
    const keys=new Set();for(const row of rows){assert(validate(row),JSON.stringify(validate.errors));const key=`${new URL(row.url).hostname.replace(/^www\./,'')}:${row.id}:${row.variant_id}`;assert(!keys.has(key),`duplicate ${key}`);keys.add(key);assert(row.title.trim());assert(!('#failed'in row));}
    console.log(`${path}: ${rows.length} useful typed rows, unique identities, no technical error rows`);
}
