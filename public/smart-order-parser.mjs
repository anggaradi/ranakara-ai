/**
 * RANAKARA Smart Order Parser v4.1 (standalone experimental component)
 * No external dependencies. Not yet integrated with the existing application.
 * Purpose: parse sequential corrections and inventory operations, refuse ambiguity.
 * IMPORTANT: never auto-confirm or change stock; human verification required.
 */

const SMALL = {nol:0, kosong:0, satu:1, se:1, sebuah:1, dua:2, tiga:3, empat:4, lima:5, enam:6, tujuh:7, delapan:8, sembilan:9, sepuluh:10, sebelas:11, belas:10, puluh:10, ratus:100, ribu:1000, seratus:100, seribu:1000, lusin:12, selusin:12};
const UNIT_WORDS = new Set(['buah','pcs','pc','biji','pak','paket','set','unit','porsi','ikat','lembar','bungkus']);
const STOP_TIME = /\b(?:jam|pukul|pkl|tanggal|tgl|tahun|bulan|rp|rupiah|harga|nomor|no|telepon|wa|whatsapp|kontak|alamat)\s*$/i;
const TIME_NUM = /^(?:[01]?\d|2[0-3])[.:][0-5]\d$/;

export function normalizeText(s) {
  return String(s ?? '').normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function interpretNumberWords(s) {
  const words=s.trim().split(/\s+/);
  const atoms=[];
  for(const word of words){
    if (word==='setengah') return null; // fractional counts are not accepted automatically
    if (word==='belas' || word==='puluh' || word==='ratus' || word==='ribu') atoms.push(word);
    else if (Object.hasOwn(SMALL,word)) atoms.push(word);
    else return null;
  }
  if(!atoms.length) return null;
  if(atoms.length===1) {
    const atom=atoms[0];
    if(atom==='ratus'||atom==='ribu'||atom==='puluh'||atom==='belas') return null;
    return SMALL[atom];
  }
  // Indonesian number words: 250 = dua ratus + lima puluh, not (205)*10.
  let total=0, group=0, units=0;
  for(const token of atoms){
    if(token==='puluh'){group+=(units||1)*10; units=0;}
    else if(token==='belas'){group+=10+units;units=0;}
    else if(token==='ratus'){group+=(units||1)*100;units=0;}
    else if(token==='ribu'){total+=(group+units||1)*1000;group=0;units=0;}
    else if(token==='seratus'){group+=100;}
    else if(token==='seribu'){total+=1000;}
    else if(token==='lusin' || token==='selusin') units=(units||1)*12;
    else units+=SMALL[token];
  }
  return total+group+units;
}

// Record every number with offsets, including Indonesian written-out numbers.
export function extractNumbers(segment) {
  const text=normalizeText(segment);
  const matches=[];
  // Mask non-quantity spans first; individual fragments of times and dates are not units.
  const blocked=[...text.matchAll(/\b(?:\d{1,2}:\d{2}|\d{1,2}\.\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|rp\s*\d[\d.,]*|(?:wa|whatsapp|kontak)\s*\d{7,14})\b/g)]
    .map(m=>[m.index,m.index+m[0].length]);
  const masked=(a,b)=>blocked.some(([x,y])=>a<y && b>x);
  const numeric=/\b\d{1,6}(?:[.,]\d{1,3})?\b/g;
  for(const m of text.matchAll(numeric)){
    const raw=m[0];
    const pre=text.slice(Math.max(0,m.index-30),m.index);
    const suffix=text.slice(m.index+raw.length,m.index+raw.length+36);
    if(masked(m.index,m.index+raw.length))continue;
    if(STOP_TIME.test(pre) || TIME_NUM.test(raw)) continue;
    if(/^\s*(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|hari|minggu|bulan|tahun|\-an)\b/.test(suffix))continue;
    if(/^\s*[-]an\b/.test(suffix))continue;
    if(/^\s*(?:ribu|juta|rb)\b/.test(suffix) && /(?:rp|harga|biaya)\s*$/i.test(pre))continue;
    if(raw.includes(':')||raw.includes('.'))continue;
    if(raw.includes(',') && !raw.match(/^\d+,0+$/)) continue; // fractional/decimal needs manual confirmation
    const value=Number(raw.replace(',','.'));
    if(!Number.isInteger(value) || value<0 || value>100000)continue;
    matches.push({value,start:m.index,end:m.index+raw.length,raw});
  }
  const wordTokens=[...text.matchAll(/[a-z]+/g)];
  let index=0;
  while(index<wordTokens.length){
    const token=wordTokens[index];
    if(!Object.hasOwn(SMALL,token[0]) && token[0]!=='setengah') {index++;continue;}
    const pre=text.slice(Math.max(0,token.index-24),token.index);
    if(STOP_TIME.test(pre)){index++;continue;}
    if(masked(token.index,token.index+token[0].length)){index++;continue;}
    let end=index;
    while(end+1<wordTokens.length &&
      Object.hasOwn(SMALL,wordTokens[end+1][0]) &&
      text.slice(wordTokens[end][1]??wordTokens[end].index+wordTokens[end][0].length, wordTokens[end+1].index).trim()==='')end++;
    // Word token index data: match[0] length rather than [1] capture.
    const atoms=wordTokens.slice(index,end+1).map(x=>x[0]).join(' ');
    const after=text.slice(wordTokens[end].index+wordTokens[end][0].length);
    if(/^\s*(?:hari|minggu|bulan|tahun)\b/.test(after)){index=end+1;continue;}
    const value=interpretNumberWords(atoms);
    if(value!==null && Number.isInteger(value) && value>=0 && value<=100000){
      matches.push({value,start:token.index,end:wordTokens[end].index+wordTokens[end][0].length,raw:atoms});
    }
    index=end+1;
  }
  return matches.sort((a,b)=>a.start-b.start);
}

function canonicalCatalog(catalog){
  if(!Array.isArray(catalog)||!catalog.length) throw new TypeError('catalog must be a non-empty array');
  return catalog.map((it,i)=>{
    const name=normalizeText(typeof it==='string'?it:it?.name);
    if(!name) throw new TypeError(`catalog item #${i+1} lacks name`);
    const id=String(typeof it==='string'?name:it.id??name);
    const aliases=[name,...(typeof it==='string'?[]:it.aliases||[])].map(normalizeText).filter(Boolean);
    return {id,name,aliases:[...new Set(aliases)]};
  });
}

function escapeRx(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function findProducts(clause,catalog){
  const all=[];
  for(const item of catalog)for(const alias of item.aliases){
    const rx=new RegExp(`(^|[^a-z])(${escapeRx(alias).replace(/\s+/g,'\\s+')})(?=nya\\b|[^a-z]|$)`,'g');
    for(const m of clause.matchAll(rx)) {
      const start=m.index+m[1].length;
      const end=start+m[2].length;
      all.push({id:item.id,name:item.name,alias,start,end});
    }
  }
  all.sort((a,b)=>a.start-b.start||b.end-a.end);
  const keep=[];
  for(const x of all){if(keep.some(p=> x.start<p.end && x.end>p.start))continue;keep.push(x)}
  return keep;
}

const CUES = /\b(eh+|ealah|ups|tapi|tetapi|namun|maaf|ralat|revisi|koreksi|sebenarnya|maksudnya|maksud saya|mksdnya|ternyata|jadinya|jadi|berarti|lalu|terus|kemudian|habis itu|setelah itu|oh iya|oh ya|tambah|tambahin|tambahkan|ditambah|kurangi|kurangin|dikurangi|kurang|potong|batal|batalkan|hapus)\b|[,;!\n]+/g;
function segmentMessage(text) {
  const parts=[];let start=0;let pending='';
  for(const m of text.matchAll(CUES)){
    const p=text.slice(start,m.index).trim();
    // 'pejati jadi 7' is one replacement phrase; keep the product with the number.
    if (/^(?:jadi|jadinya)$/.test(m[0]) && p && !extractNumbers(p).length) continue;
    if(p){parts.push({text:p,transition:pending});pending='';}
    pending+=(pending?' ':'')+m[0].trim();
    start=m.index+m[0].length;
  }
  const last=text.slice(start).trim();
  if(last)parts.push({text:last,transition:pending});
  else if(pending && parts.length)parts.push({text:'',transition:pending});
  return parts;
}
function opOf(segment){
  const content=segment.text;
  const all=(segment.transition+' '+content).trim();
  if(/\b(?:batal(?:kan)?|cancel|hapus|tidak jadi|gak jadi|ga jadi|nggak jadi|jangan jadi)\b/.test(all))return 'cancel';
  if(/\b(?:kurangi|kurangin|dikurangi|kurang|potong|minus|dikurang|ambil\s+\d+\s*(?:lebih sedikit)?)\b/.test(all))return 'decrease';
  if(/\b(?:tambah|tambahin|ditambah|plus|nambah|tambahkan|lagi)\b/.test(all)&&!/\b(?:bukan|jangan)\b/.test(all))return 'increase';
  if(/\b(?:eh+|ups|maaf|ralat|revisi|koreksi|sebenarnya|maksudnya|maksud saya|mksdnya|ternyata|jadi|jadinya|berarti|tapi|tetapi|namun|cukup|cuma|hanya|aja|saja|sebenarnya|yang benar|ubah|ganti|bukannya)\b/.test(all))return 'replace';
  return 'set';
}
function dangerOf(segment) {
  const s=(segment.transition+' '+segment.text).toLowerCase();
  return /\b(?:atau|antara|kira-kira|kirakira|sekitar|kurang lebih|mungkin|barangkali|boleh|bisa|apakah|berapa|lusin|kodi|gross)\b/.test(s) || /\d+\s*(?:-|sampai|hingga|s\/d)\s*\d+/.test(s);
}
function closestQty(product, products, numbers, clause){
  const nextProduct=products.find(p=>p.start>product.start);
  const prevProduct=[...products].reverse().find(p=>p.start<product.start);
  const leftBound=prevProduct?prevProduct.end:0;
  const rightBound=nextProduct?nextProduct.start:clause.length;
  const forward=numbers.filter(n=>n.start>=product.end&&n.start<rightBound);
  const backward=numbers.filter(n=>n.end<=product.start&&n.end>leftBound);
  // Assign an amount to the nearest product phrase. '30 canang dan 5 pejati'
  // uses the number just BEFORE canang; 5 is attached to pejati.
  const candidates=[...forward,...backward].map(n=>{
    const gap=(n.start>=product.end?clause.slice(product.end,n.start):clause.slice(n.end,product.start));
    const direction=n.start>=product.end?'forward':'backward';
    const wordDistance=(gap.match(/[a-z]+/g)||[]).length;
    const connectorPenalty=/\b(?:dan|sama|serta|plus|kemudian)\b/.test(gap)?8:0;
    return {n,dir:direction,cost:wordDistance+connectorPenalty+(direction==='backward'?0.1:0)};
  }).sort((a,b)=>a.cost-b.cost);
  if(!candidates.length)return null;
  const selected=candidates[0];
  // Several numbers equally close to the same product are unsafe to interpret.
  return {value:selected.n.value,token:selected.n,ambiguous: !!(candidates[1] && candidates[1].cost===selected.cost)};
}

/** @typedef {{id:string,name:string,quantity:number|null,status:'draft'|'cancelled'|'needs_review'}} DraftItem */
/**
 * @param {string} message - customer informal input (minimize PII first)
 * @param {Array<{id?:string,name:string,aliases?:string[]}|string>} catalog - actual tenant catalog
 * @returns {{status:string,items:DraftItem[],questions:string[],events:Array,engine:string}}
 */
export function parseOrder(message,catalog) {
  const text=normalizeText(message);
  const products=canonicalCatalog(catalog);
  const segments=segmentMessage(text);
  // Conservative global deferral: a conditional, unclear scope or non-integer change
  // must never be silently converted into a final quantity.
  const unsafeContext=/\b(?:kalau|jika|bila|andaikan|seandainya|tergantung|sementara|belum pasti|cek dulu|mungkin|separuh|setengah|dibagi dua|dua kali lipat|semuanya|seluruhnya|batal semua|batalkan semua|jangan diproses|harga|rupiah|ribu rupiah|keduanya|masing-masing|tambahnya|kurangnya|rp\s*\d|nanti.*?mungkin)\b/.test(text);
  const byId=new Map();
  const questions=[];const events=[];
  let lastId=null;
  for(const seg of segments){
    let matches=findProducts(seg.text,products);
    const nums=extractNumbers(seg.text);
    const op=opOf(seg);
    const ambiguous=dangerOf(seg);
    if(!matches.length){
      if((op==='cancel'||op==='replace') && !nums.length && lastId){
        matches=[{...products.find(x=>x.id===lastId),start:-1,end:-1,inferred:true}];
      } else if(nums.length && lastId){matches=[{...products.find(x=>x.id===lastId),start:-1,end:-1,inferred:true}];}
      else if(nums.length){questions.push(`Jumlah ${nums.map(n=>n.value).join('/')} belum terkait produk.`);continue;}
      else continue;
    }
    for(const product of matches){
      const prev=byId.get(product.id);
      let found=product.inferred?(nums.length===1?{value:nums[0].value,token:nums[0]}:nums.length?{ambiguous:true}:null):closestQty(product,matches,nums,seg.text);
      if(ambiguous || found?.ambiguous || (nums.length>1 && matches.length===1)) {
        questions.push(`Konfirmasi jumlah ${product.name} pada: “${seg.text}”.`);
        byId.set(product.id,{id:product.id,name:product.name,quantity:prev?.quantity??null,status:'needs_review'});
        events.push({product:product.id,operation:'needs_review',source:seg.text});
        lastId=product.id;
        continue;
      }
      if(op==='cancel'){
        // A cancellation that refers to an unrecognized noun must not be silently
        // assigned to the last-mentioned product.
        if(product.inferred && /[a-z]/.test(seg.text.replace(/\b(?:aja|saja|ya|nggih|tolong|dong|deh)\b/g,''))){
          questions.push(`Sasaran pembatalan tidak jelas: “${seg.text}”.`);
          byId.set(product.id,{id:product.id,name:product.name,quantity:prev?.quantity??null,status:'needs_review'});
          lastId=product.id;continue;
        }
        byId.set(product.id,{id:product.id,name:product.name,quantity:0,status:'cancelled'});
        events.push({product:product.id,operation:'cancel',source:seg.text});
        lastId=product.id;continue;
      }
      if(!found){
        questions.push(op==='replace'?`Koreksi ${product.name} belum mencantumkan jumlah baru.`:`Berapa jumlah ${product.name}?`);
        byId.set(product.id,{id:product.id,name:product.name,quantity:prev?.quantity??null,status:'needs_review'});
        lastId=product.id;continue;
      }
      let quantity=found.value;
      if(op==='increase' || op==='decrease'){
        if(!prev && op==='increase' && !product.inferred){
          // An increment naming a new product is a new line item, not an increment of the previous item.
          quantity=found.value;
        } else if(!prev || prev.quantity===null){
          questions.push(`Jumlah awal ${product.name} belum diketahui untuk operasi ${op==='increase'?'tambah':'kurang'} ${found.value}.`);
          byId.set(product.id,{id:product.id,name:product.name,quantity:prev?.quantity??null,status:'needs_review'});
          lastId=product.id;continue;
        } else {
          quantity=op==='increase'?prev.quantity+found.value:prev.quantity-found.value;
        }
      } else if(op==='set' && prev){
        // Repeated identical product without 'correction' or 'addition' cue: do not silently overwrite.
        questions.push(`Apakah ${found.value} ${product.name} mengganti pesanan sebelumnya (${prev.quantity}) atau menambahnya?`);
        byId.set(product.id,{id:product.id,name:product.name,quantity:prev.quantity,status:'needs_review'});
        lastId=product.id;continue;
      }
      if(quantity<0 || quantity>100000){
        questions.push(`Hasil jumlah ${product.name} tidak wajar (${quantity}).`);
        byId.set(product.id,{id:product.id,name:product.name,quantity:prev?.quantity??null,status:'needs_review'});
        lastId=product.id;continue;
      }
      if(op==='replace' && lastId && lastId!==product.id && !prev){
        questions.push(`Apakah ${found.value} ${product.name} mengganti ${products.find(x=>x.id===lastId)?.name} atau item tambahan?`);
        byId.set(product.id,{id:product.id,name:product.name,quantity,status:'needs_review'});
      } else byId.set(product.id,{id:product.id,name:product.name,quantity,status:'draft'});
      events.push({product:product.id,operation:op,quantityBefore:prev?.quantity??null,quantityAfter:quantity,source:seg.text,transition:seg.transition});
      lastId=product.id;
    }
  }
  if(segments.some(s=>/\b(?:tambah|kurangi|kurangin|tambahin|ditambah)\s+(?:lagi|saja|aja)?\s*$/.test((s.transition+" "+s.text).trim()) && !extractNumbers(s.text).length))
    questions.push('Ada perintah perubahan jumlah tanpa angka yang jelas.');
  const mentionedAliases=new Map();
  for(const s of segments)for(const m of findProducts(s.text,products)){
    if(!mentionedAliases.has(m.id))mentionedAliases.set(m.id,new Set());
    mentionedAliases.get(m.id).add(m.alias);
  }
  for(const [id,aliases] of mentionedAliases){
    const aa=[...aliases];
    if(aa.some((a,i)=>aa.some((b,j)=>i!==j && a!==b && (a.includes(b)||b.includes(a)))))
      questions.push(`Pastikan dua penyebutan nama/varian ${products.find(p=>p.id===id)?.name} benar-benar merujuk produk yang sama.`);
  }
  if(unsafeContext){
    questions.push('Pesan mengandung kondisi/keraguan, jumlah pecahan, harga, atau cakupan global; periksa maksud sebelum konfirmasi.');
    // Never expose a guessed amount from a conditional/uncertain sentence as final.
    for(const item of byId.values()){item.quantity=null; item.status='needs_review';}
  }
  if(!byId.size && !questions.length)questions.push('Produk dan jumlah belum terbaca. Mohon perjelas pesanan.');
  return {engine:'RANAKARA Smart Order Parser v4.1 (experimental)' ,status:questions.length?'needs_review':'draft',items:[...byId.values()],questions,events};
}

/**
 * Optional future interface: a separately hosted/pretrained semantic model may
 * propose structured changes for hard-to-parse input. Always validate its output
 * against catalog and require human verification. No network/API calls here.
 */
export function validateSuggestedDraft(suggestion,catalog){
  const products=canonicalCatalog(catalog), ids=new Set(products.map(p=>p.id));
  if(!suggestion || !Array.isArray(suggestion.items))return {valid:false,reason:'items must be an array'};
  for(const item of suggestion.items){
    if(!ids.has(String(item.id)))return {valid:false,reason:`unknown product id ${item.id}`};
    if(!Number.isInteger(item.quantity)||item.quantity<0||item.quantity>100000)return {valid:false,reason:'invalid quantity'};
  }
  return {valid:true,items:suggestion.items.map(x=>({id:String(x.id),quantity:x.quantity}))};
}

/**
 * Optional provider-agnostic semantic layer for generalization to unseen phrasing.
 * modelExtractor must be a trusted async function implemented in your secure backend.
 * It should return `{ items: [{ id, quantity }] }`; never expose API secrets in browser.
 * Semantic outputs ALWAYS require human verification, even when the model agrees.
 * This function does not make any network request itself.
 */
export async function parseOrderHybrid(message,catalog,modelExtractor){
  const local=parseOrder(message,catalog);
  if(typeof modelExtractor!=='function')return {...local,semanticModel:'not_configured'};
  try {
    const suggestion=await modelExtractor({
      message:String(message),
      catalog:canonicalCatalog(catalog).map(p=>({id:p.id,name:p.name,aliases:p.aliases})),
      localDraft:local.items.map(p=>({id:p.id,quantity:p.quantity,status:p.status}))
    });
    const validated=validateSuggestedDraft(suggestion,catalog);
    if(!validated.valid)return {...local,semanticModel:'invalid_response',questions:[...local.questions,`Model semantik mengembalikan draf tidak valid: ${validated.reason}`],status:'needs_review'};
    const left=Object.fromEntries(local.items.map(p=>[p.id,p.quantity]));
    const right=Object.fromEntries(validated.items.map(p=>[p.id,p.quantity]));
    const disagreement=JSON.stringify(Object.entries(left).sort())!==JSON.stringify(Object.entries(right).sort());
    return {...local,semanticModel:'suggestion_only',modelSuggestion:validated.items,
      status:'needs_review',questions:[...local.questions,disagreement?'Model semantik dan parser lokal berbeda; periksa setiap item dan jumlah sebelum menyimpan.':'Periksa draf hasil model semantik sebelum menyimpan.']};
  } catch (error){
    return {...local,semanticModel:'unavailable',status:'needs_review',questions:[...local.questions,'Model semantik tidak tersedia. Gunakan verifikasi manual.']};
  }
}
