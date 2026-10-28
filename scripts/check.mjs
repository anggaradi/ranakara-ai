import fs from 'node:fs';
import path from 'node:path';
const required=['public/index.html','public/app.mjs','public/engine.mjs','public/styles.css','public/config.js','netlify/functions/extract-order.mjs','supabase/schema.sql','netlify.toml'];
for (const name of required) {
  const pathname=path.resolve(name);
  if (!fs.existsSync(pathname) || fs.statSync(pathname).size===0) throw new Error(`Missing/empty: ${name}`);
}
for (const js of ['public/app.mjs','public/engine.mjs','netlify/functions/extract-order.mjs']) {
  const { spawnSync }=await import('node:child_process');
  const result=spawnSync('node',['--check',js],{encoding:'utf8'});
  if (result.status!==0) throw new Error(`${js}: ${result.stderr}`);
}
const html=fs.readFileSync('public/index.html','utf8');
if (!html.includes('RANAKARA AI')) throw new Error('Site identity missing');
console.log('BUILD CHECK PASS — static public/ and server function syntax valid.');
console.log('NOTE: this is not live verification of Netlify, Supabase or OpenAI credentials.');
