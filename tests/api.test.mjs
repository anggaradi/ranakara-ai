import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/extract-order.mjs';
const post=(x={},auth='')=>new Request('https://example.com/.netlify/functions/extract-order',{method:'POST',headers:{'authorization':auth,'content-type':'application/json'},body:JSON.stringify(x)});

test('refuses anonymous use of paid AI',async()=>{
 const res=await handler(post({text:'30 canang'},''));assert.equal(res.status,401);const body=await res.json();assert.match(body.error,/login/i);
});
test('requires POST',async()=>{const res=await handler(new Request('https://example.com/.netlify/functions/extract-order'));assert.equal(res.status,405);});
test('returns configuration error without environment variables',async()=>{
 const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 const res=await handler(post({text:'30 canang'},'Bearer sampletoken'));assert.equal(res.status,503);
 if(old)process.env.OPENAI_API_KEY=old;
});

test('authenticates server-side, calls real API route and rejects hallucinated catalog id',async()=>{
  const origFetch=globalThis.fetch;
  const originals={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY,OPENAI_API_KEY:process.env.OPENAI_API_KEY};
  process.env.SUPABASE_URL='https://project.supabase.co';process.env.SUPABASE_ANON_KEY='anon-key';process.env.OPENAI_API_KEY='dummy-test-only';
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'user-123'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(url==='https://api.openai.com/v1/responses')return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items:[{catalog_id:'nonexistent',product_name:'unknown',quantity:5,confidence:'low',source_text:'random'}],delivery:{date_iso:null,time_text:'pagi',raw_text:'pagi'},notes:'',questions:['Produk tidak ditemukan']})}]}]}),{status:200});
    throw new Error('Unexpected fetch URL '+url);
  };
  try{
    const res=await handler(post({text:'5 produk tidak ada katalog',catalog:[{id:'p1',name:'Canang sari',aliases:['canang']}],referenceDate:'2026-10-29'},'Bearer test-jwt'));
    assert.equal(res.status,200);
    const result=await res.json();assert.equal(result.result.items[0].catalog_id,null);
    assert.equal(calls.length,2);
    const aiBody=JSON.parse(calls[1].opts.body);
    assert.equal(aiBody.text.format.type,'json_schema');assert.equal(aiBody.store,false);
    assert.match(calls[1].opts.headers.authorization,/Bearer dummy-test-only/);
  } finally {
    globalThis.fetch=origFetch;
    for(const [k,v] of Object.entries(originals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
});
