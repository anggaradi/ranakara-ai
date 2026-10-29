/**
 * RANAKARA-NLP v3.1 — device-local, zero-API inference.
 * Product entity recognizer: supervised instance-based char 2/3-gram TF-IDF 1-NN,
 * fitted on each seller's product names and labelled aliases.
 * Quantities and dates: transparent deterministic parser. Human confirmation required.
 * This is NOT a general-language model and is NOT trained on real customer chats.
 */

const clean = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const tokensOf = text => [...String(text).matchAll(/[\p{L}\p{N}]+/gu)].map(match => ({v:clean(match[0]),raw:match[0],start:match.index,end:match.index+match[0].length}));
const STOP = new Set('eh lagi cukup cukupnya cuma hanya saja aja tambahkan ditambah nambah ubah ganti aku saya tiang titiang bu pak kak pesan pesen pesankan order minta tolong mau ingin perlu ambil di antar dikirim kirim untuk pada tanggal hari besok lusa nanti pagi siang sore malam beserta sama dan serta juga yang biasa ada sejumlah sebanyak jadi total unit buah pcs bungkus box bisa kalau ya nggih ngih dong dulu tambahan tambah sekalian plus minta tolong sebelum setelah jam pukul berapa bukan tidak gak nggak jangan batal batalkan batalin dibatalin hapus coret cancel kurangi kurangin dikurangi potong turunin turunkan menjadi maksudnya ralat seharusnya isi gedenya lebih kurang kecil tadi tolongnya lusin kodi setengah lusin'.split(' '));
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

/**
 * Intent model: instance-based TF-IDF classifier trained on explicitly labelled,
 * hand-written sentence examples. Product-recognition ML remains catalogue-fitted.
 * Rule guards protect high-risk cancellation, negation, arithmetic and ambiguity.
 */
const INTENT_EXAMPLES = {
  create: [
    'pesan pejati', 'saya mau pesan canang', 'tolong buatkan daksina', 'order lima unit',
    'beli sepuluh canang', 'butuh pejati untuk besok', 'minta dibuatkan kwangen',
    'ambil dua buah', 'titip pesan untuk besok', 'buatkan lima puluh buah',
    'ada pesanan dari pelanggan', 'tolong siapkan tiga paket', 'pesen canang sari',
    'mau beli perlengkapan upacara', 'tolong bikinin kwangen'
  ],
  add: [
    'tambah lagi lima', 'tambahkan lima unit', 'ditambah dua saja', 'nambah tiga ya',
    'tambahi tiga paket', 'plus empat buah', 'tambahan lima unit', 'masih kurang lima lagi',
    'ikut tambah sepuluh', 'tambahin lima', 'sekalian tambahin tiga', 'boleh tambah dua',
    'naikkan jumlahnya lima lagi', 'naikin pesanan tiga', 'buat tambahannya lima'
  ],
  subtract: [
    'kurangi lima', 'tolong kurangin dua', 'dikurangi tiga unit', 'potong lima unit',
    'jumlahnya dikit lagi kurangi dua', 'turunkan lima', 'turunin tiga',
    'potong jumlahnya dua', 'kurangin pesanannya sepuluh', 'berkurang lima',
    'mohon dikurangi empat', 'saya mau mengurangi dua', 'kurang lima lagi',
    'buat berkurang tiga', 'minus lima'
  ],
  replace: [
    'ubah jadi tujuh', 'sekarang jadi delapan', 'ganti ke tiga belas',
    'ralat jumlahnya enam', 'maksudnya lima belas', 'koreksi jadi enam',
    'seharusnya tujuh', 'total pesanan sekarang dua belas',
    'ganti pesanannya', 'bukan sepuluh tapi lima', 'jadi sembilan saja',
    'tolong ubah menjadi empat', 'betulkan jadi lima', 'revisi jumlah ke tujuh',
    'jumlah terakhir delapan'
  ],
  cancel: [
    'batalkan pesanan', 'pesanan dibatalkan', 'saya batal', 'tidak jadi pesan',
    'nggak jadi pesan', 'gak jadi ambil', 'jangan dibuat', 'tidak usah pesan',
    'hapus yang itu', 'coret pesanan ini', 'cancel semuanya',
    'stop pesanannya', 'tidak jadi membeli', 'saya tidak mau lagi',
    'pesanan tolong dibatalkan'
  ],
  inquiry: [
    'berapa harga canang', 'apakah tersedia pejati', 'masih ada stok',
    'bisa pesan untuk besok', 'minta info harga', 'berapa lama pembuatannya',
    'boleh tanya produk', 'ini ready tidak', 'berapa biaya satuan',
    'ada pilihan produk', 'bisa dikirim tidak', 'apakah bisa pesan dulu',
    'mau tanya ketersediaan', 'boleh lihat harga', 'minta daftar harga'
  ]
};
const INTENT_CLASSES=Object.keys(INTENT_EXAMPLES);
const INTENT_TRAIN=INTENT_CLASSES.flatMap(label=>INTENT_EXAMPLES[label].map((phrase)=>({id:label,name:label,aliases:[],phrase})));
// Normalize content words that are incidental to action classification.
function intentText(input) {
  return clean(input).replace(/\b\d+\b/g,' angka ')
    .replace(/\b(pejati|canang|sari|kwangen|daksina|gebogan|segehan|upakara)\b/g,' produk ');
}
const intentCorpus=INTENT_TRAIN.map(e=>({...e,gram:grams(intentText(e.phrase))}));
function buildIntentModel(){
  const df=new Map();for(const ex of intentCorpus)for(const key of ex.gram.keys())df.set(key,(df.get(key)||0)+1);
  const idf=key=>Math.log(1+(intentCorpus.length+1)/((df.get(key)||0)+1))+0.5;
  const vector=map=>{
    const v=new Map();let n=0;
    for(const [key,count] of map){const weight=(1+Math.log(count))*idf(key);v.set(key,weight);n+=weight*weight;}
    for(const [key,weight] of v)v.set(key,weight/(Math.sqrt(n)||1));return v;
  };
  return {vector,examples:intentCorpus.map(ex=>({...ex,vec:vector(ex.gram)}))};
}
const INTENT_MODEL=buildIntentModel();
export function classifyIntent(utterance){
  const vector=INTENT_MODEL.vector(grams(intentText(utterance)));
  const byLabel=new Map(INTENT_CLASSES.map(k=>[k,0]));
  for(const ex of INTENT_MODEL.examples){let s=0;for(const [k,w] of vector)s+=w*(ex.vec.get(k)||0);
    if(s>byLabel.get(ex.id))byLabel.set(ex.id,s);
  }
  const rank=[...byLabel.entries()].sort((a,b)=>b[1]-a[1]);
  const [label,score]=rank[0];
  return {label,score:Math.round(score*1000)/1000,margin:Math.round((score-(rank[1]?.[1]||0))*1000)/1000};
}

const BOUNDARY=new Set(['eh','dan','serta','lalu','kemudian','terus','tapi','tetapi']);
const REVISION=new Set(['tambah','tambahkan','ditambah','nambah','tambahin','tambahi','plus','kurangi','kurangin','dikurangi','potong','turunin','turunkan','jadi','menjadi','ubah','ganti','ralat','maksudnya','seharusnya','batalkan','batal','cancel','hapus','coret','stop']);
const CANCELLATION=/(?:\b(?:batal|batalkan|batalin|dibatalkan|dibatalin|cancel|hapus|coret|stop|jangan|tidak\s+usah|gak\s+usah|nggak\s+usah|tidak\s+jadi|gak\s+jadi|nggak\s+jadi|ga\s+jadi|tidak\s+pesan|gak\s+pesan|nggak\s+pesan|ga\s+pesan|belum\s+pesan|tidak\s+mau|gak\s+mau|nggak\s+mau|bukan)\b)/i;
const ADDITION=/(?:\b(?:tambah|tambahkan|ditambah|nambah|tambahin|tambahi|plus|naikkan|naikin|tambahan)\b)/i;
const SUBTRACTION=/(?:\b(?:kurangi|kurangin|dikurangi|potong|turunin|turunkan|minus|berkurang)\b)/i;
const REPLACEMENT=/(?:\b(?:jadi|menjadi|ubah|ganti|ralat|maksudnya|seharusnya|revisi|koreksi|total)\b)/i;
// A colloquial final amount is an amendment, not a newly named catalogue product.
const FINAL_AMOUNT=/(?:\b(?:cukup|cukupnya|cuma|hanya)\b)/i;
const QUESTION=/(?:\b(?:berapa|apakah|bisa|boleh|harga|stok|ready|tersedia|tanya|biaya)\b|\?)/i;
const safeExcerpt=s=>String(s).slice(0,100).replace(/\b(?:\+62|62|0)8\d{7,11}\b/g,'[nomor telepon]').replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[email]');

function chooseAction(clause){
  const s=clean(clause);
  if(CANCELLATION.test(s))return {label:'cancel',method:'guard'};
  if(SUBTRACTION.test(s))return {label:'subtract',method:'guard'};
  if(ADDITION.test(s))return {label:'add',method:'guard'};
  if(REPLACEMENT.test(s)||FINAL_AMOUNT.test(s))return {label:'replace',method:'guard'};
  if(QUESTION.test(s))return {label:'inquiry',method:'guard'};
  const p=classifyIntent(s);
  // The learned classifier may assist with paraphrases, but uncertain text is NOT
  // allowed to silently cancel or change an order.
  if(p.score>=0.70&&p.margin>=0.15&&p.label!=='create')return {label:p.label,method:'ml',score:p.score};
  return {label:'create',method:'default',score:p.score};
}

function splitClauses(text){
  const t=tokensOf(text);if(!t.length)return [];
  const spans=[];let start=0;
  for(let i=1;i<t.length;i++){
    const word=t[i].v;const between=text.slice(t[i-1].end,t[i].start);
    const prior=t[i-1].v;
    const earlier=t.slice(start,i).map(x=>x.v);
    const completeReplacementPhrase=word==='jadi'&&earlier.some(w=>['ubah','ganti','ralat','revisi','koreksi'].includes(w));
    const cue=REVISION.has(word)&&!completeReplacementPhrase&&!(['tidak','gak','nggak','ga','belum','bukan'].includes(prior)&&word==='jadi');
    if(/[;,!?]/.test(between)||BOUNDARY.has(word)||cue){
      if(i>start)spans.push(text.slice(t[start].start,t[i-1].end));
      start=BOUNDARY.has(word)?i+1:i;
    }
  }
  if(start<t.length)spans.push(text.slice(t[start].start,t[t.length-1].end));
  return spans.map(x=>x.trim()).filter(x=>x.length>1||/^\d$/.test(x));
}

const UNITS=new Map([['lusin',12],['kodi',20]]);
const ONES={nol:0,satu:1,se:1,dua:2,tiga:3,empat:4,lima:5,enam:6,tujuh:7,delapan:8,sembilan:9};
function readWordNumber(words,i){
  const token=words[i]?.v; if(!token)return null;
  if(token==='seratus'){
    const rest=readWordNumber(words,i+1);return {value:100+(rest?.value||0),end:rest?rest.end:i};
  }
  if(token==='sepuluh')return {value:10,end:i};
  if(token==='sebelas')return {value:11,end:i};
  const one=ONES[token];if(one===undefined||one===0)return null;
  let j=i,n=one;
  if(words[i+1]?.v==='ratus'){
    n=one*100;j=i+1;const rest=readWordNumber(words,j+1);if(rest&&rest.value<100){n+=rest.value;j=rest.end;}
  }else if(words[i+1]?.v==='puluh'){
    n=one*10;j=i+1;
    if(ONES[words[j+1]?.v]>0){n+=ONES[words[j+1].v];j++;}
  }else if(words[i+1]?.v==='belas'){n=one+10;j=i+1;}
  return {value:n,end:j};
}
function parseQuantities(raw,mentionsFound){
  const words=tokensOf(raw);const quantities=[],warnings=[];
  const protectedPositions=[];
  for(const m of raw.matchAll(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[.:]\d{2}\b|\b(?:pukul|jam)\s+\d{1,2}(?:[.:]\d{2})?\b/gi))protectedPositions.push([m.index,m.index+m[0].length]);
  const covered=new Set();for(const m of mentionsFound)for(let i=m.start;i<=m.end;i++)covered.add(i);
  for(let i=0;i<words.length;i++){
    const w=words[i];if(covered.has(i)||protectedPositions.some(([a,b])=>w.start>=a&&w.start<b))continue;
    let num;
    if(/^\d+$/.test(w.v))num={value:Number(w.v),end:i};
    else num=readWordNumber(words,i);
    if(!num||!Number.isSafeInteger(num.value)||num.value<1||num.value>100000)continue;
    if(words[i-1]?.v==='tanggal'||words[i-1]?.v==='tgl'||words[i-1]?.v==='pukul'||words[i-1]?.v==='jam')continue;
    let end=num.end,value=num.value;
    const unit=words[end+1]?.v;
    if(UNITS.has(unit)){value*=UNITS.get(unit);end++;}
    else if(new Set(['kotak','box','dus','paket','pak','pack','bungkus']).has(unit)){
      warnings.push(`Satuan kemasan “${unit}” belum memiliki faktor konversi ke unit produk; jumlah harus dikonfirmasi.`);
      i=end+1;continue;
    }
    if(value>100000)continue;
    quantities.push({start:i,end,value,source:raw.slice(w.start,words[end].end)});
    i=end;
  }
  return {words,quantities,warnings};
}
function alignProductQuantities(found,quantities){
  const assignments=new Map();const consumed=new Set();
  const combos=[];
  for(let pi=0;pi<found.length;pi++)for(let qi=0;qi<quantities.length;qi++){
    const p=found[pi],q=quantities[qi];
    const overlap=q.start<=p.end&&q.end>=p.start;
    if(overlap)continue;
    const distance=q.end<p.start?p.start-q.end:q.start-p.end;
    if(distance>5)continue;
    const crossedProduct=found.some((r,ri)=>ri!==pi&&(r.start>Math.min(p.start,q.start)&&r.start<Math.max(p.start,q.start)));
    if(crossedProduct)continue;
    combos.push({pi,qi,cost:distance});
  }
  combos.sort((a,b)=>a.cost-b.cost);
  for(const {pi,qi} of combos){if(assignments.has(pi)||consumed.has(qi))continue;assignments.set(pi,quantities[qi].value);consumed.add(qi);}
  return {assignments,consumed};
}
const isoValid=s=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;
  const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;
};
function shiftISO(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function parseDelivery(text,referenceDate){
  let date_iso=null,raw_text='',time_text=null;
  const iso=text.match(/\b20\d{2}-\d{2}-\d{2}\b/), slash=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if(iso){raw_text=iso[0];if(isoValid(raw_text))date_iso=raw_text;}
  else if(slash){raw_text=slash[0];const d=`${slash[3]}-${slash[2].padStart(2,'0')}-${slash[1].padStart(2,'0')}`;if(isoValid(d))date_iso=d;}
  else{
    const relative=text.match(/\b(?:lusa|besok|hari ini)\b/i);
    const weekday=text.match(/\b(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\b/i);
    raw_text=relative?.[0]||weekday?.[0]||'';
    if(relative&&isoValid(referenceDate))date_iso=shiftISO(referenceDate,clean(relative[0])==='lusa'?2:clean(relative[0])==='besok'?1:0);
  }
  const clock=text.match(/\b(?:pukul|jam)\s*\d{1,2}(?:[.:]\d{2})?\b/i),vague=text.match(/\b(?:pagi|siang|sore|malam)\b/i);
  time_text=clock?.[0]||vague?.[0]||null;
  return {date_iso,time_text,raw_text};
}

/**
 * Structured, conservative inference. All detected edits are reviewable, and a
 * cancellation is never turned into a new positive-quantity order.
 */
export function extractLocalOrder({text,catalog,referenceDate}={}){
  if(typeof text!=='string'||text.trim().length<4||text.length>2500)throw Error('Teks pesanan harus 4–2.500 karakter.');
  if(!Array.isArray(catalog)||catalog.length<1||catalog.length>120)throw Error('Katalog harus berisi 1–120 produk.');
  const safeCatalog=catalog.map(p=>({id:String(p.id??''),name:String(p.name??''),aliases:Array.isArray(p.aliases)?p.aliases.slice(0,15).map(String):[]}));
  // A bare question is not a confirmed purchase. In particular, "Pesan 3 canang?"
  // must not become a committed order without the seller asking for confirmation.
  if(/\?\s*$/.test(text) && !/[.!?][^?]*\?/.test(text)){
    const delivery=parseDelivery(text,referenceDate);
    return {items:[],delivery,notes:'',questions:['Pesan berbentuk pertanyaan; konfirmasi apakah pelanggan benar-benar membuat pesanan.'],intent_summary:['inquiry']};
  }
  const state=new Map(),questions=[],notes=[],clauses=splitClauses(text),resolved=[];
  let pendingCorrection=null; // {id, clauseIndex}: an explicitly rejected OLD quantity, awaiting a replacement.
  for(const [ci,clause] of clauses.entries()){
    // Detection uses the same catalogue-fitted product recognition as v2.2.
    const {found,tokens}=mentions(clause,safeCatalog);
    const {quantities,warnings}=parseQuantities(clause,found);
    questions.push(...warnings);
    const {assignments,consumed}=alignProductQuantities(found,quantities);
    const action=chooseAction(clause);
    // A numeric range is not a committed quantity. Never silently take the first number.
    const rangeInClause=/\b\d+\s*[-–]\s*\d+\b/.test(clause) && !/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(clause);
    const alternativeInClause=/\b\d+\s+(?:atau|ato)\s+\d+\b/i.test(clause);
    if(rangeInClause||alternativeInClause)questions.push(`Rentang/alternatif jumlah pada “${safeExcerpt(clause)}” belum pasti; pilih satu jumlah.`);
    // "jangan 12, cukup 8" rejects the PREVIOUS count, not the product itself.
    // Unlike "jangan dibuat" (genuine cancellation), a bare rejected quantity
    // is a pending correction. We never guess which product among several was meant.
    const rejectsQuantity=/^\s*(?:jangan|bukan)\s+(?:\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|dua\s+belas)\b/i.test(clause);
    if(rejectsQuantity){
      resolved.push({clause,action:'reject_old_quantity',method:'guard'});
      const namedTargets=[...new Set(found.filter(f=>f.id&&!f.ambiguous).map(f=>f.id))];
      const id=namedTargets.length===1?namedTargets[0]:namedTargets.length===0&&state.size===1?[...state.keys()][0]:null;
      const rejected=quantities.length===1?quantities[0].value:null;
      const row=id?state.get(id):null;
      if(!id){questions.push(state.size>1?'Jumlah yang ditolak tidak menyebut produk; tentukan produk yang dikoreksi.':'Jumlah yang ditolak belum memiliki produk aktif; klarifikasi pesanan.');pendingCorrection=null;continue;}
      if(rejected===null){questions.push(`Jumlah yang ditolak pada “${safeExcerpt(clause)}” belum jelas; konfirmasi jumlah akhir.`);pendingCorrection=null;continue;}
      if(!row||row.quantity!==rejected){
        // "10 kwangen, bukan 5 kwangen" does not negate the actual 10-unit order.
        questions.push(`Jumlah ${rejected} yang ditolak tidak sama dengan jumlah aktif “${row?.product_name||'produk'}”; konfirmasi maksud pelanggan.`);
        pendingCorrection=null;continue;
      }
      row.quantity=null;row.confidence='low';
      pendingCorrection={id,clauseIndex:ci};
      notes.push(`${row.product_name}: jumlah lama ${rejected} ditolak`);
      continue;
    }
    resolved.push({clause,action:action.label,method:action.method});
    const named=found.filter(f=>f.id&&!f.ambiguous);
    if(found.some(f=>!f.id||f.ambiguous))questions.push(`Produk pada frasa “${safeExcerpt(clause)}” tidak pasti; pilih manual.`);
    const available=new Set([...state.keys()].filter(id=>state.get(id)?.quantity!==null));
    const targets=[...new Set(named.map(m=>m.id))];
    if(action.label==='inquiry'){
      questions.push(`Pesan “${safeExcerpt(clause)}” mungkin hanya pertanyaan; konfirmasi sebelum membuat pesanan.`);
      continue;
    }
    if(action.label==='cancel'){
      if(targets.length){for(const id of targets){state.delete(id);notes.push(`Pembatalan produk: ${safeCatalog.find(p=>p.id===id)?.name||id}`);}}
      else if(available.size===1){const id=[...available][0];state.delete(id);notes.push(`Pembatalan produk: ${safeCatalog.find(p=>p.id===id)?.name||id}`);}
      else if(available.size>1){questions.push('Pembatalan tidak menyebut produk; tentukan produk yang dibatalkan.');}
      else {questions.push('Pesan mengandung pembatalan, bukan pesanan baru. Tidak ada item dibuat.');}
      continue;
    }
    const amendments=['add','subtract','replace'].includes(action.label);
    const compoundReplacement=(action.label==='replace'&&targets.length===1&&state.size===1&&!state.has(targets[0]));
    if(compoundReplacement){const previous=[...state.keys()][0];state.delete(previous);notes.push(`Ganti jenis produk: ${safeCatalog.find(p=>p.id===previous)?.name} → ${safeCatalog.find(p=>p.id===targets[0])?.name}`);}
    let addressed=false;
    for(let i=0;i<found.length;i++){
      const f=found[i];if(!f.id||f.ambiguous)continue;
      addressed=true;
      const product=safeCatalog.find(p=>p.id===f.id);
      const qty=(rangeInClause||alternativeInClause)?null:(assignments.get(i)??null);
      const old=state.get(f.id);
      if(action.label==='create'){
        if(old){questions.push(`Produk “${product.name}” disebut berulang tanpa instruksi perubahan yang jelas; periksa jumlah.`);old.quantity=null;old.confidence='low';}
        else state.set(f.id,{catalog_id:f.id,product_name:product.name,quantity:qty,confidence:f.score>=0.88?'high':'medium',source_text:f.phrase});
      }else if(action.label==='add'){
        if(!old){
          // If another product was already ordered, a named 'tambah 5 canang'
          // adds a new line; otherwise baseline is unknown and must stay null.
          const isAdditionalProduct=state.size>0&&qty!==null;
          state.set(f.id,{catalog_id:f.id,product_name:product.name,quantity:isAdditionalProduct?qty:null,confidence:'low',source_text:f.phrase});
          questions.push(isAdditionalProduct?`Konfirmasi item tambahan “${product.name}” sebanyak ${qty} unit.`:`Jumlah awal “${product.name}” belum diketahui; pastikan apakah ${qty??'jumlah tambahan'} adalah pesanan baru.`);
        }
        else if(qty===null||old.quantity===null){old.quantity=null;questions.push(`Penambahan “${product.name}” belum memiliki jumlah lengkap.`);}
        else{const next=old.quantity+qty;if(next>100000){old.quantity=null;questions.push(`Hasil penambahan “${product.name}” terlalu besar.`);}else{notes.push(`${product.name}: ${old.quantity} + ${qty} = ${next}`);old.quantity=next;old.confidence='medium';}}
      }else if(action.label==='subtract'){
        if(!old){questions.push(`Tidak ada jumlah awal “${product.name}” untuk dikurangi.`);}
        else if(qty===null||old.quantity===null){old.quantity=null;questions.push(`Pengurangan “${product.name}” belum jelas.`);}
        else{const next=old.quantity-qty;if(next<=0){state.delete(f.id);notes.push(`${product.name}: dikurangi ${qty} → habis/dibatalkan`);}else{notes.push(`${product.name}: ${old.quantity} - ${qty} = ${next}`);old.quantity=next;old.confidence='medium';}}
      }else if(action.label==='replace'){
        if(qty===null){questions.push(`Jumlah pengganti “${product.name}” belum diketahui.`);}
        else {state.set(f.id,{catalog_id:f.id,product_name:product.name,quantity:qty,confidence:'medium',source_text:f.phrase});notes.push(`${product.name}: jumlah akhir ${qty}`);}
      }
    }
    // A bare final number after "jangan 12" or "bukan 12" also resolves
    // the pending correction: "bukan 12, tapi 8". No product is fabricated.
    const pendingIsRecent=Boolean(pendingCorrection&&pendingCorrection.clauseIndex===ci-1&&state.has(pendingCorrection.id));
    const pendingBareFinal=pendingIsRecent&&!addressed&&quantities.length===1&&action.label==='create';
    if(pendingBareFinal)resolved[resolved.length-1].action='replace';
    if(!addressed&&quantities.length&&(amendments||pendingBareFinal)){
      const target=pendingIsRecent?pendingCorrection.id:state.size===1?[...state.keys()][0]:null;
      if(!target){questions.push(state.size>1?`Frasa “${safeExcerpt(clause)}” bisa merujuk lebih dari satu produk; tentukan target revisi.`:`Frasa “${safeExcerpt(clause)}” tidak memiliki produk/jumlah awal; klarifikasi dulu.`);continue;}
      const row=state.get(target),qty=quantities[0].value;
      if(quantities.length>1){questions.push(`Ada lebih dari satu jumlah pada frasa “${safeExcerpt(clause)}”; klarifikasi.`);continue;}
      if(row.quantity===null&&!(pendingIsRecent&&(action.label==='replace'||pendingBareFinal))){questions.push(`Jumlah awal “${row.product_name}” belum diketahui sehingga revisi tidak bisa dihitung.`);continue;}
      const previous=row.quantity;
      const effectiveAction=pendingBareFinal?'replace':action.label;
      const next=effectiveAction==='add'?previous+qty:effectiveAction==='subtract'?previous-qty:qty;
      if(next<=0){state.delete(target);notes.push(`${row.product_name}: revisi menghabiskan pesanan.`);}
      else if(next>100000){row.quantity=null;questions.push(`Jumlah revisi “${row.product_name}” di luar batas.`);}
      else {row.quantity=next;row.confidence='medium';notes.push(pendingIsRecent?`${row.product_name}: koreksi jumlah → ${next}`:`${row.product_name}: ${previous} ${effectiveAction==='add'?'+':effectiveAction==='subtract'?'-':'→'} ${qty} = ${next}`);pendingCorrection=null;}
    }
    if(action.label==='create'&&!pendingBareFinal&&named.length===0&&quantities.length){questions.push(`Produk dalam frasa “${safeExcerpt(clause)}” tidak ditemukan pada katalog.`);}
    if(action.label==='create'&&quantities.length>consumed.size&&named.length){questions.push(`Ada jumlah yang belum dapat dipasangkan dengan produk pada frasa “${safeExcerpt(clause)}”.`);}
  }
  const items=[...state.values()];
  for(const item of items)if(item.quantity===null)questions.push(`Berapa jumlah produk “${item.product_name}”?`);
  if(!items.length)questions.push('Tidak ada item pesanan aktif yang pasti. Jangan menyimpan sebagai pesanan baru sebelum diklarifikasi.');
  const delivery=parseDelivery(text,referenceDate);
  if(!delivery.date_iso)questions.push('Tanggal pemenuhan pesanan belum pasti; konfirmasi tanggal pelanggan.');
  if(delivery.date_iso&&delivery.raw_text&&/^(lusa|besok|hari ini)$/i.test(delivery.raw_text))questions.push(`Konfirmasi tanggal relatif “${delivery.raw_text}”: ${delivery.date_iso}.`);
  if(!delivery.time_text)questions.push('Apakah ada jam pengambilan/pengiriman yang perlu dikonfirmasi?');
  // No original input, phone numbers, or customer identifiers are recorded in output.
  return {items,delivery,notes:notes.length?`Revisi: ${notes.join('; ')}. Periksa kembali sebelum simpan.`:'',questions:[...new Set(questions)],intent_summary:resolved.map(x=>x.action)};
}
export const LOCAL_MODEL_NAME='RANAKARA-NLP v3.1 · TF-IDF 1-NN (produk + intent) + parser aman (browser)';
