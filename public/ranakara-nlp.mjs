/**
 * RANAKARA-NLP v2 — device-local, zero-API inference.
 * Product entity recognizer: supervised instance-based char 2/3-gram TF-IDF 1-NN,
 * fitted on each seller's product names and labelled aliases.
 * Quantities and dates: transparent deterministic parser. Human confirmation required.
 * This is NOT a general-language model and is NOT trained on real customer chats.
 */

const clean = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const tokensOf = text => [...String(text).matchAll(/[\p{L}\p{N}]+/gu)].map(match => ({v:clean(match[0]),raw:match[0],start:match.index,end:match.index+match[0].length}));
const STOP = new Set('aku saya tiang titiang bu pak kak pesan pesen pesankan order minta tolong mau ingin perlu ambil di antar dikirim kirim untuk pada tanggal hari besok lusa nanti pagi siang sore malam beserta sama dan serta juga yang biasa ada sejumlah sebanyak jadi total unit buah pcs bungkus box bisa kalau ya nggih ngih dong dulu tambahan tambah sekalian plus minta tolong sebelum setelah jam pukul berapa'.split(' '));
const MONTHS = new Set('januari februari maret april mei juni juli agustus september oktober november desember jan feb mar apr mei jun jul agu sep okt nov des'.split(' '));
const TIMEWORDS = new Set('senin selasa rabu kamis jumat sabtu minggu kemarin besok lusa pagi siang sore malam pukul jam'.split(' '));

function grams(s) {
  const value = `^${clean(s)}$`;const result=new Map();
  for(const n of [2,3])for(let i=0;i<=value.length-n;i++){
    const g=value.slice(i,i+n);if(/\s/.test(g) && !/\w/.test(g))continue;
    result.set(g,(result.get(g)||0)+1);
  }
  return result;
}
function fit(catalog) {
  const examples=[];
  for(const product of catalog){
    for(const [i,name] of [product.name,...(product.aliases||[])].entries()){
      if(clean(name).length<3)continue;
      examples.push({id:product.id,name:product.name,phrase:name,gram:grams(name),full:i===0});
    }
  }
  const df=new Map(); for(const e of examples)for(const k of e.gram.keys())df.set(k,(df.get(k)||0)+1);
  const n=examples.length;
  const idf=g=>Math.log(1+(n+1)/((df.get(g)||0)+1))+0.5;
  const vector=map=>{
    const m=new Map();let sq=0;for(const [k,c] of map){const v=(1+Math.log(c))*idf(k);m.set(k,v);sq+=v*v;}
    const norm=Math.sqrt(sq)||1;for(const [k,v] of m)m.set(k,v/norm);return m;
  };
  for(const e of examples)e.vec=vector(e.gram);
  return {examples,vector};
}
function bestMatch(candidate, model) {
  const norm=clean(candidate);if(norm.length<3)return null;
  const v=model.vector(grams(norm));let scores=new Map();
  for(const ex of model.examples){let sum=0;
    for(const [k,w] of v)sum+=w*(ex.vec.get(k)||0);
    // Character TF-IDF nearest exemplar; do not invent a label when score is uncertain.
    if(sum>(scores.get(ex.id)||0))scores.set(ex.id,sum);
  }
  const ranked=[...scores.entries()].sort((a,b)=>b[1]-a[1]);
  if(!ranked.length)return null;
  const [id,score]=ranked[0],margin=score-(ranked[1]?.[1]||0);
  // Short terms are inherently risky; require exact match for <=4 characters.
  const limit=norm.length<=4?0.995:0.66;
  if(score<limit)return null;
  const certain=margin>=0.055;
  return {id:certain?id:null,score,margin,ambiguous:!certain,raw:candidate};
}
function mentions(text, catalog) {
  const t=tokensOf(text),model=fit(catalog),candidates=[];
  if(!model.examples.length)return {found:[],tokens:t};
  for(let i=0;i<t.length;i++){
    if(!t[i].v||/^\d+$/.test(t[i].v)||STOP.has(t[i].v)||MONTHS.has(t[i].v)||TIMEWORDS.has(t[i].v))continue;
    for(let j=i;j<Math.min(t.length,i+4);j++){
      if(/^\d+$/.test(t[j].v)||MONTHS.has(t[j].v))break;
      if(j>i && (STOP.has(t[j].v)||TIMEWORDS.has(t[j].v)))break;
      const phrase=text.slice(t[i].start,t[j].end);
      const result=bestMatch(phrase,model);
      if(result)candidates.push({...result,start:i,end:j,phrase});
    }
  }
  // Non-overlap, prefer high score and longer exact labels to partial substrings.
  candidates.sort((a,b)=>b.score-a.score||(b.end-b.start)-(a.end-a.start)||a.start-b.start);
  const found=[],used=new Set();
  for(const c of candidates){if(found.length>=20)break;let conflict=false;for(let k=c.start;k<=c.end;k++)if(used.has(k))conflict=true;
    if(conflict)continue;for(let k=c.start;k<=c.end;k++)used.add(k);found.push(c);
  }
  return {found:found.sort((a,b)=>a.start-b.start),tokens:t};
}
const wordNumbers=new Map([['satu',1],['dua',2],['tiga',3],['empat',4],['lima',5],['enam',6],['tujuh',7],['delapan',8],['sembilan',9],['sepuluh',10],['sebelas',11],['dua belas',12],['dua puluh',20],['tiga puluh',30],['empat puluh',40],['lima puluh',50],['seratus',100]]);
function parseNumbers(text,tokens) {
  const excludes=[...text.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[.:]\d{2}\b/g)].map(m=>[m.index,m.index+m[0].length]);
  const quantities=[];
  for(let i=0;i<tokens.length;i++){
    const w=tokens[i];
    if(excludes.some(([s,e])=>w.start>=s&&w.end<=e))continue;
    if(/^\d+$/.test(w.v)){
      const value=Number(w.v);
      if(value>0&&value<=100000&&!(MONTHS.has(tokens[i+1]?.v)||TIMEWORDS.has(tokens[i-1]?.v)))quantities.push({at:i,end:i,value});
    }else if(wordNumbers.has(`${w.v} ${tokens[i+1]?.v}`)){
      quantities.push({at:i,end:i+1,value:wordNumbers.get(`${w.v} ${tokens[i+1].v}`)});i++;
    }else if(wordNumbers.has(w.v))quantities.push({at:i,end:i,value:wordNumbers.get(w.v)});
  }
  return quantities;
}
const validISO=value=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;
};
function extractTime(text) {
  let date_iso=null;let raw_text='';let time_text=null;
  const iso=text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const ddmmyyyy=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if(iso){raw_text=iso[0];if(validISO(iso[1]))date_iso=iso[1];}
  else if(ddmmyyyy){raw_text=ddmmyyyy[0];const possible=`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`;if(validISO(possible))date_iso=possible;}
  else {const rel=text.match(/\b(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|besok|lusa|hari ini|nanti)\b/i);raw_text=rel?.[0]||'';}
  const clock=text.match(/\b(?:pukul|jam)\s*\d{1,2}(?:[.:]\d{2})?\b/i);
  const vague=text.match(/\b(?:pagi|siang|sore|malam)\b/i);
  time_text=clock?.[0]||vague?.[0]||null;
  return {date_iso,time_text,raw_text};
}
function matchQuantity(product,quantity,allMentions,tokens) {
  const isBetween=tokenIndex=>allMentions.some(p=>p!==product&&((p.start>Math.min(tokenIndex,product.start)&&p.start<Math.max(tokenIndex,product.start))|| (p.end>Math.min(tokenIndex,product.start)&&p.end<Math.max(tokenIndex,product.start))));
  let gap=quantity.at>product.end?quantity.at-product.end:product.start-quantity.end;
  if(gap<0)gap=0;
  if(gap>5||isBetween(quantity.at))return Infinity;
  const s=Math.min(quantity.at,product.start),e=Math.max(quantity.end,product.end);
  const middle=tokens.slice(s,e+1).map(x=>x.v);
  let penalty=middle.some(x=>x==='dan'||x==='serta'||x==='atau')?2:0;
  // Allow natural format '20 canang' and 'canang 20'.
  return gap+penalty;
}
export function extractLocalOrder({text,catalog,referenceDate}={}) {
  if(typeof text!=='string'||text.trim().length<4||text.length>2500)throw new Error('Teks pesanan harus 4–2.500 karakter.');
  if(!Array.isArray(catalog)||catalog.length<1||catalog.length>60)throw new Error('Katalog harus berisi 1–60 produk.');
  const safeCatalog=catalog.map(p=>({id:String(p.id||''),name:String(p.name||''),aliases:Array.isArray(p.aliases)?p.aliases.slice(0,10).map(String):[]}));
  const {found,tokens}=mentions(text,safeCatalog);const quantities=parseNumbers(text,tokens);const allocated=new Map(),taken=new Set();
  const possibles=[];
  for(let i=0;i<found.length;i++)for(let q=0;q<quantities.length;q++){
    const cost=matchQuantity(found[i],quantities[q],found,tokens);
    if(Number.isFinite(cost))possibles.push({i,q,cost});
  }
  possibles.sort((a,b)=>a.cost-b.cost);
  for(const {i,q} of possibles){if(!allocated.has(i)&&!taken.has(q)){allocated.set(i,quantities[q].value);taken.add(q);}}
  const questions=[];
  const rows=found.map((m,i)=>{
    const product=safeCatalog.find(p=>p.id===m.id);
    const quantity=allocated.get(i)??null;
    if(m.ambiguous)questions.push(`Nama produk “${m.phrase}” mirip dengan beberapa item katalog; pilih produk yang benar.`);
    if(quantity===null)questions.push(`Berapa jumlah produk “${m.phrase}”?`);
    return {catalog_id:m.id,product_name:product?.name||m.phrase,quantity,confidence:m.id&&m.score>=0.88&&m.margin>=0.12?'high':m.id&&m.score>=0.72?'medium':'low',source_text:m.phrase};
  });
  // Multiple mentions of one product often indicate amendments or a possible duplicate.
  const ids=new Set();for(const item of rows){if(item.catalog_id&&ids.has(item.catalog_id)){
    item.quantity=null;questions.push(`Produk “${item.product_name}” disebut berulang; pastikan jumlah akhirnya.`);
  }else if(item.catalog_id)ids.add(item.catalog_id);}
  if(rows.length===0)questions.push('Belum ada produk yang dapat dikenali dari katalog. Pilih produk secara manual atau tambah alias.');
  if(quantities.some((q,i)=>!taken.has(i)))questions.push('Ada angka yang belum dapat dipasangkan ke produk katalog; periksa apakah ada produk yang belum dikenali.');
  const delivery=extractTime(text);
  if(!delivery.date_iso)questions.push('Tanggal pemenuhan pesanan belum pasti; pilih tanggal setelah mengonfirmasi pelanggan.');
  if(!delivery.time_text)questions.push('Apakah ada jam pengambilan/pengiriman yang perlu dikonfirmasi?');
  return {items:rows,delivery,notes:'',questions:[...new Set(questions)]};
}
export const LOCAL_MODEL_NAME='RANAKARA-NLP v2 · TF-IDF char n-gram + 1-NN (browser)';
