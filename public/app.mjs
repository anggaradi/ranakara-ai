import { makeId, makeSeed, computePlan, rounded, isPositive, isISODate, validateOrder, normalizeAIOutput } from './engine.mjs';
import { extractLocalOrder, LOCAL_MODEL_NAME } from './ranakara-nlp.mjs';
import { ChatOrderAssistant } from './chat-order-assistant.mjs';
import { mergeCatalogReference } from './catalog-import.mjs';
import { createCleanWorkspace, applyGlobalReference } from './global-catalog.mjs';
import { previewApprovedRecipeCSV,applyApprovedRecipePreview,invalidateRecipeApproval,auditActiveRecipeCoverage } from './recipe-bom-import.mjs';
import { inspectPublicRecipeLibrary,applyPublicRecipeDefaults,copyPublicRecipeToWorkspace } from './global-recipe-library.mjs';

const config=window.RANAKARA_CONFIG||{};
// Guard against placeholder strings: non-empty placeholders are NOT a valid connection.
const CLOUD=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl||'') && /^(sb_publishable_|eyJ)/.test(config.supabaseAnonKey||'');
const base=(config.supabaseUrl||'').replace(/\/$/,'');
const KEY='ranakara_demo_v1', SESSION_KEY='ranakara_cloud_session';
let recipeReference=null, recipeReferenceError='';
let publicRecipeLibrary=null, publicCatalogReference=null, publicRecipeError='';
let data, session=null, draft=null, currentPage='dashboard', working=false, booting=false, cloudReady=false, cloudError='', globalCatalogError='';
const uiState={plannerQuery:'',plannerStatus:'all',catalogQuery:'',catalogFilter:'all',materialQuery:'',orderText:'',recipeHubQuery:'',recipeHubFilter:'all'};
// Chat history is intentionally in memory only (no localStorage or Supabase writes).
let orderChat=null;
let chatHistory=[];
let chatDraftActive=false;
function chatCatalog(){return data.products.map(p=>({id:p.id,name:p.name,aliases:p.aliases||[]}));}
function ensureOrderChat(){
  if(!orderChat && data.products.length){
    orderChat=new ChatOrderAssistant({catalog:chatCatalog()});
    chatHistory=[{role:'assistant',text:orderChat.hello().messages.join(' '),choices:[]}];
  } else if(orderChat){orderChat.catalog=chatCatalog();}
  return orderChat;
}
function chatReply(input){
  const assistant=ensureOrderChat();
  const text=String(input??'').trim().slice(0,1500);
  if(!assistant){
    if(text)chatHistory.push({role:'user',text});
    chatHistory.push({role:'assistant',text:'Katalog produk belum tersedia, sehingga AI belum bisa mengenali pesanan. Tambahkan atau muat katalog terlebih dahulu di Katalog & Bahan, lalu coba lagi. Pesanan belum berubah.',choices:[]});
    return {messages:['Katalog produk belum tersedia.'],choices:[],summary:null};
  }
  if(text)chatHistory.push({role:'user',text});
  let result;
  try{result=assistant.send(text);}
  catch(error){
    console.error('Chat parser error:',error);
    result={messages:['Maaf, pesan belum dapat diproses karena kesalahan analisis lokal. Pesanan tidak disimpan. Coba tulis nama produk dan jumlah lebih jelas, atau gunakan draf manual.'],choices:[],summary:assistant.getSummary()};
  }
  const replies=result.messages?.filter(Boolean)||[];
  chatHistory.push({role:'assistant',text:replies.join('\n\n')||'Pesan diterima, tetapi saya belum yakin dengan isinya. Tuliskan nama produk, jumlah, dan tanggal yang Anda maksud.',choices:result.choices||[]});
  // Keep bounded conversation in memory while preserving the latest context within the assistant.
  if(chatHistory.length>100)chatHistory=chatHistory.slice(-100);
  // Chat completion is a draft confirmation, NOT storage. Saving uses existing mutate() and validateOrder().
  if(result.summary?.confirmed && !chatDraftActive){
    const items=result.summary.items.filter(item=>item.quantity>0&&Number.isInteger(item.quantity))
      .map(item=>({productId:item.id,quantity:item.quantity,rawName:item.name,confidence:'chat · diverifikasi'}));
    chatDraftActive=true;
    draft={items,delivery:{date_iso:result.summary.date||'',time_text:result.summary.time||'',raw_text:''},
      notes:'Disusun melalui AI Order Chat; diperiksa operator sebelum simpan.',questions:[],customer:'',
      requires_clarification:false,critical_questions:[],clarificationVerified:false,clarificationNote:''};
    // Reset the single-input legacy text for the next order, not the live chat transcript.
    uiState.orderText='';
  }
  return result;
}
function resetOrderChat(){orderChat=null;chatHistory=[];chatDraftActive=false;ensureOrderChat();draft=null;}
function chatBubble(item){
  const message=esc(item.text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>');
  const chips=item.role==='assistant' && item.choices?.length?
    `<div class="ran-chat-choices">${item.choices.map(c=>`<button type="button" class="button secondary small" data-chat-choice="${esc(c.value)}">${esc(c.label)}</button>`).join('')}</div>`:'';
  return `<div class="ran-chat-bubble ${item.role==='user'?'ran-chat-from-user':'ran-chat-from-ai'}"><span class="ran-chat-who">${item.role==='user'?'Pesan Anda':'RANAKARA · Balasan otomatis'}</span><div>${message}</div>${chips}</div>`;
}
function chatPanel(){
  ensureOrderChat();
  const summary=orderChat?.getSummary();
  const items=summary?.items||[];
  const status=summary?.confirmed?'Sudah dikonfirmasi · belum disimpan':summary?.pending?'Menunggu klarifikasi':summary?.canConfirm?'Siap dikonfirmasi':'Draf percakapan';
  return `<section class="ran-chat-layout" aria-label="AI Order Chat">
    <div class="card ran-chat-main">
      <div class="flex-between"><h3>AI Order Chat · balasan dua arah</h3><span class="badge">NLP lokal · tanpa API LLM</span></div>
      <p class="hint">Setiap pesan dibalas otomatis: pesanan terbaca, koreksi, atau alasan mengapa masih perlu klarifikasi. Ini asisten untuk operator, <strong>bukan chat WhatsApp pelanggan</strong>. Jangan masukkan nomor telepon atau alamat pribadi.</p>
      <div class="ran-chat-log" id="ran-chat-log" role="log" aria-live="polite" aria-label="Riwayat percakapan">${chatHistory.map((m,i)=>chatBubble(i===chatHistory.length-1?m:{...m,choices:[]})).join('')}</div>
      <form id="ran-chat-form" class="ran-chat-compose"><label class="sr-only" for="ran-chat-input">Ketik pesan atau jawaban</label><textarea id="ran-chat-input" rows="2" maxlength="1500" placeholder="Misalnya: Bu pesan 20 canang eh 10 untuk Jumat"></textarea><button type="submit" class="button primary">Kirim pesan</button></form>
      <div class="button-row"><button type="button" class="button secondary small" data-action="chat-new">Mulai pesanan baru</button><button type="button" class="button secondary small" data-action="chat-example">Isi contoh chat</button></div>
    </div>
    <aside class="card ran-chat-side">
      <h3>Ringkasan percakapan</h3><span class="badge">${esc(status)}</span>
      <div class="ran-chat-summary"><strong>Produk dan jumlah</strong><p>${items.length?items.map(i=>`${esc(i.name)} × ${i.quantity===null?'belum pasti':esc(i.quantity)}`).join('<br/>'):'Belum ada produk'}</p>
      <strong>Tanggal diperlukan</strong><p>${esc(summary?.dateLabel||'Belum ditentukan')}</p>
      <strong>Waktu pengambilan (opsional)</strong><p>${esc(summary?.time?summary.time+' WITA':'Belum ditentukan')}</p></div>
      <div class="notice info"><strong>Belum ada transaksi otomatis.</strong> Ketik <b>konfirmasi</b> setelah detail lengkap. Draf kemudian muncul di formulir verifikasi di bawah dan hanya disimpan saat Anda menekan <b>Konfirmasi & simpan pesanan</b>.</div>
    </aside>
  </section>`;
}

try { data=JSON.parse(localStorage.getItem(KEY))||makeSeed(); } catch {data=makeSeed();}
if(!data || !Array.isArray(data.products)||!Array.isArray(data.orders)||!Array.isArray(data.materials))data=makeSeed();
const $=sel=>document.querySelector(sel);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const printNum=x=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(x||0);
const dateLabel=x=>x?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${x}T00:00:00Z`)):'Belum ditentukan';
const badge=s=>({new:'Baru',in_progress:'Diproses',completed:'Selesai',cancelled:'Dibatalkan'}[s]||s);
const toast=(message,error=false)=>{const t=$('#toast');t.textContent=message;t.className=`toast show ${error?'error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4800);};
const persistLocal=()=>{localStorage.setItem(KEY,JSON.stringify(data));};

async function authFetch(path,{method='GET',body,token=session?.access_token,timeoutMs=12000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(`${base}${path}`,{method,signal:controller.signal,headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json',...(token?{'Authorization':`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const content=await res.text();let parsed;try{parsed=content?JSON.parse(content):null;}catch{parsed={message:content};}
    if(!res.ok)throw new Error(parsed?.msg||parsed?.message||parsed?.error_description||parsed?.error||`HTTP ${res.status}`);
    return parsed;
  }catch(err){
    if(err?.name==='AbortError')throw new Error('Koneksi Supabase melewati batas waktu 12 detik. Periksa jaringan, Project URL, dan API key.');
    if(err instanceof TypeError)throw new Error('Gagal menghubungi Supabase (Failed to fetch). Periksa koneksi, Project URL, atau kebijakan browser. NLP lokal tetap bisa diuji tanpa login.');
    throw err;
  }finally{clearTimeout(timer);}
}
async function tryRefresh(){
  if(!session?.refresh_token)return false;
  try {const result=await authFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},token:null});session=result;sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));return true;}catch{return false;}
}
async function ensureSession(){
  if(!session)return false;
  try {await authFetch('/auth/v1/user');return true;}catch{if(await tryRefresh())return true;session=null;sessionStorage.removeItem(SESSION_KEY);return false;}
}
// The master reference is a public static file (Cloudflare Pages); only a copy of it
// is merged into each PRIVATE Supabase workspace. Customer orders never enter the file.
async function mergeGlobalCatalog(){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    let response;
    try{response=await fetch('/global-catalog.json',{signal:controller.signal,cache:'no-store'});}
    finally{clearTimeout(timer);}
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const reference=await response.json();
    const result=applyGlobalReference(data,reference);
    publicCatalogReference=reference;
    if(result.changed)data=result.workspace;
    globalCatalogError='';
    return result.changed;
  }catch(err){
    globalCatalogError='Katalog referensi global belum dapat dimuat ('+(err?.message||'gangguan jaringan')+'). Coba refresh; data usaha tetap terpisah.';
    console.warn('Reference catalog unavailable:',err);
    return false;
  }
}
// Shared reference is static read-only content deployed with the app.
// Approved public BOMs can seed only empty private recipes; no account ever uploads
// its private measurements, order history or stock to the public file.
async function loadPublicRecipeLibrary(){
 try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
   let response;
   try{response=await fetch('/global-recipes.json',{signal:controller.signal,cache:'no-store'});}
   finally{clearTimeout(timer);}
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const library=await response.json();
   if(!publicCatalogReference)throw new Error('Katalog global belum berhasil dimuat.');
   inspectPublicRecipeLibrary(library,publicCatalogReference);
   publicRecipeLibrary=library;recipeReference={products:library.products};publicRecipeError='';
   const seeded=applyPublicRecipeDefaults(data,library,publicCatalogReference);
   if(seeded.changed)data=seeded.workspace;
   return seeded.changed;
 }catch(err){
   publicRecipeError=err?.message||'Pustaka global tidak tersedia';
   console.warn('Global recipe library unavailable:',err);
   return false;
 }
}
async function loadCloud(){
  if(!session?.user?.id)return;
  const rows=await authFetch(`/rest/v1/workspaces?select=data&user_id=eq.${encodeURIComponent(session.user.id)}`);
  const exists=rows.length && Array.isArray(rows[0].data?.products);
  data=exists?rows[0].data:createCleanWorkspace();
  const previous=structuredClone(data);
  const changedCatalog=await mergeGlobalCatalog();
  const changedRecipes=await loadPublicRecipeLibrary();
  if(!exists || changedCatalog || changedRecipes){
    try{await saveCloud();}catch(err){data=previous;throw err;}
  }
}
async function saveCloud(){
  if(!session?.user?.id)throw new Error('Belum login.');
  const payload={user_id:session.user.id,data,updated_at:new Date().toISOString()};
  const endpoint=`/rest/v1/workspaces?on_conflict=user_id`;
  const headers={apikey:config.supabaseAnonKey,'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'};
  // A failed network request must not leave the app indefinitely waiting.
  const timedSend=async()=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try{return await fetch(`${base}${endpoint}`,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});}
    catch(err){if(err?.name==='AbortError')throw new Error('Penyimpanan Supabase melewati batas waktu 12 detik.');if(err instanceof TypeError)throw new Error('Tidak dapat menyimpan ke Supabase (Failed to fetch). Periksa koneksi cloud; perubahan dibatalkan untuk mencegah data tidak sinkron.');throw err;}
    finally{clearTimeout(timer);}
  };
  let response=await timedSend();
  if(response.status===401 && await tryRefresh()){headers.Authorization=`Bearer ${session.access_token}`;response=await timedSend();}
  if(!response.ok)throw new Error(`Cloud save gagal (HTTP ${response.status}). Jalankan schema.sql dan periksa RLS.`);
}
async function mutate(modifier){
  if(booting){toast('Sinkronisasi akun masih berlangsung. Coba lagi sebentar.',true);return false;}
  if(session&&!cloudReady){toast('Workspace cloud belum berhasil disinkronkan. Muat ulang setelah memeriksa koneksi.',true);return false;}
  if(working)return;
  const backup=structuredClone(data);
  try {working=true;modifier();render();if(session)await saveCloud();else persistLocal();toast(session?'Perubahan tersimpan di cloud.':'Perubahan tersimpan di browser demo.');return true;}
  catch(err){data=backup;render();toast(err.message||'Gagal menyimpan.',true);return false;}
  finally{working=false;}
}
function banner(){
  const warning=[globalCatalogError,publicRecipeError].filter(Boolean).map(x=>`<div class="notice">${esc(x)}</div>`).join('');
  if(data.sample)return warning+`<div class="notice"><b>Data CONTOH.</b> Stok dan takaran resep pada katalog ini hanya ilustrasi untuk demo, bukan standar sarana upacara. Sesuaikan semua nilai dengan data UMKM sebelum digunakan atau diklaim dalam proposal.</div>`;
  return warning;
}
function tableEmpty(message='Belum ada data.') {return `<div class="empty">${esc(message)}</div>`;}
function plan(){return computePlan(data.orders,data.products,data.materials);}
// UI-only derived state: no additional API calls and no changes to Supabase schema.
const localToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Makassar'});
function orderDeadlineKind(o,today=localToday()){
  if(!['new','in_progress'].includes(o.status)||!o.dueDate)return 'none';
  if(o.dueDate<today)return 'late';
  const days=Math.round((Date.parse(o.dueDate+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  return days<=3?'soon':'later';
}
function orderSearchText(o){
  return [o.customer||'',o.id||'',...(o.items||[]).map(i=>data.products.find(p=>p.id===i.productId)?.name||''),o.dueDate||''].join(' ').toLocaleLowerCase('id-ID');
}
function applyPlannerFilters(){
  if(currentPage!=='planner')return;
  let shown=0;
  for(const el of document.querySelectorAll('[data-order-row]')){
    const okStatus=uiState.plannerStatus==='all'||el.dataset.status===uiState.plannerStatus;
    const okQuery=(el.dataset.search||'').includes(uiState.plannerQuery.toLocaleLowerCase('id-ID').trim());
    const visible=okStatus&&okQuery;
    el.hidden=!visible;
    if(visible)shown++;
  }
  const counter=$('#planner-result-count');if(counter)counter.textContent=`${shown} dari ${data.orders.length} pesanan`;
  const empty=$('#planner-empty-filter');if(empty)empty.hidden=shown!==0 || data.orders.length===0;
}
function applyCatalogFilters(){
  if(currentPage!=='catalog')return;
  let shown=0;
  for(const el of document.querySelectorAll('[data-product-card]')){
    const okQuery=(el.dataset.search||'').includes(uiState.catalogQuery.toLocaleLowerCase('id-ID').trim());
    const okRecipe=uiState.catalogFilter==='all'||(uiState.catalogFilter==='ready'?el.dataset.recipeReady==='yes':el.dataset.recipeReady==='no');
    el.hidden=!(okQuery&&okRecipe);
    if(!el.hidden)shown++;
  }
  const counter=$('#catalog-result-count');if(counter)counter.textContent=`Menampilkan ${shown} dari ${data.products.length} produk`;
  const empty=$('#catalog-empty-filter');if(empty)empty.hidden=shown!==0 || data.products.length===0;
}
function applyMaterialFilters(){
  if(currentPage!=='catalog')return;
  let shown=0;
  for(const el of document.querySelectorAll('[data-material-row]')){
    const ok=(el.dataset.search||'').includes(uiState.materialQuery.toLocaleLowerCase('id-ID').trim());
    el.hidden=!ok;if(ok)shown++;
  }
  const counter=$('#material-result-count');if(counter)counter.textContent=`Menampilkan ${shown} dari ${data.materials.length} bahan`;
  const empty=$('#material-empty-filter');if(empty)empty.hidden=shown!==0 || data.materials.length===0;
}
function dashboard(){
  const p=plan(),today=localToday();
  const active=data.orders.filter(o=>['new','in_progress'].includes(o.status));
  const recent=[...data.orders].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,5);
  const stages=[['new','Baru'],['in_progress','Diproses'],['completed','Selesai'],['cancelled','Dibatalkan']];
  const due=[...active].filter(o=>['late','soon'].includes(orderDeadlineKind(o,today))).sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||'')).slice(0,5);
  const countDueLate=active.filter(o=>orderDeadlineKind(o,today)==='late').length;
  const countShort=p.rows.filter(x=>x.shortage>0).length;
  const missing=p.missingRecipes.length;
  return `${banner()}
  <section class="hero hero-premium"><div><div class="eyebrow">WORKSPACE PRODUKSI · BALI</div><h2>Pesanan lebih rapi.<br>Produksi lebih siap.</h2><p>Dari pesan pelanggan menjadi pesanan terverifikasi dan perhitungan bahan. Semua angka di bawah berasal dari data workspace ini.</p><div class="hero-steps"><span>01 Baca pesan</span><span>02 Verifikasi</span><span>03 Siapkan bahan</span></div></div><button class="button primary hero-action" data-nav="studio">+ Proses pesanan</button></section>
  <div class="stats stats-interactive">
    <button class="stat stat-action" data-order-filter="all"><small>Seluruh pesanan</small><strong>${data.orders.length}</strong><em>Lihat daftar pesanan <span aria-hidden="true">›</span></em></button>
    <button class="stat stat-action" data-order-filter="new"><small>Pesanan baru</small><strong>${data.orders.filter(o=>o.status==='new').length}</strong><em>Perlu ditindaklanjuti <span aria-hidden="true">›</span></em></button>
    <button class="stat stat-action" data-order-filter="in_progress"><small>Sedang diproses</small><strong>${data.orders.filter(o=>o.status==='in_progress').length}</strong><em>Pantau progres <span aria-hidden="true">›</span></em></button>
    <button class="stat stat-action" data-nav="planner"><small>Jenis bahan kurang</small><strong>${countShort}</strong><em>Lihat kebutuhan produksi <span aria-hidden="true">›</span></em></button>
  </div>
  <div class="dashboard-grid">
    <div class="card"><div class="flex-between"><div><h3>Alur pesanan</h3><p class="hint">Distribusi berdasarkan status aktual.</p></div><span class="badge">${data.orders.length} total</span></div>
      <div class="pipeline-list">${stages.map(([status,label])=>{const count=data.orders.filter(o=>o.status===status).length;const ratio=data.orders.length?count/data.orders.length*100:0;return `<button class="pipeline-item" data-order-filter="${status}" aria-label="Tampilkan ${count} pesanan status ${label}"><span>${label}</span><span class="pipeline-track"><span class="pipeline-fill ${status}" style="width:${ratio}%"></span></span><strong>${count}</strong></button>`;}).join('')}</div>
      <div class="insight-row"><span>${data.products.length} produk di katalog</span><button class="text-action" data-nav="catalog">Kelola katalog →</button></div>
    </div>
    <div class="card"><div class="flex-between"><div><h3>Perlu perhatian</h3><p class="hint">Tenggat hari ini hingga 3 hari mendatang dan yang terlambat.</p></div><span class="badge ${countDueLate?'badge-alert':''}">${due.length} ditampilkan</span></div>
      ${due.length?`<div class="attention-list">${due.map(o=>`<button class="attention-item" data-order-filter="${o.status}"><span><strong>${esc(o.customer||'Tanpa nama')}</strong><small>${dateLabel(o.dueDate)} · ${o.items.length} jenis produk</small></span><span class="status-chip ${orderDeadlineKind(o,today)==='late'?'cancelled':'in_progress'}">${orderDeadlineKind(o,today)==='late'?'Lewat tenggat':'Segera'}</span></button>`).join('')}</div>`:tableEmpty('Belum ada pesanan aktif dengan tenggat dekat.')}
      ${missing?`<div class="notice" style="margin-top:13px">${missing} jenis produk pada pesanan aktif belum memiliki resep. <button class="text-action" data-nav="catalog">Periksa resep →</button></div>`:''}
    </div>
  </div>
  <div class="section-header"><h2>Aktivitas terakhir</h2><button class="button secondary small" data-nav="planner">Semua pesanan</button></div>
  <div class="card">${recent.length?`<div class="table-wrap"><table><thead><tr><th>Pelanggan / Pesanan</th><th>Tenggat</th><th>Status</th></tr></thead><tbody>${recent.map(o=>`<tr><td><strong>${esc(o.customer||'Tanpa nama')}</strong><br><span class="muted">${o.items.map(i=>`${esc(data.products.find(p=>p.id===i.productId)?.name||'Produk')} × ${Number(i.quantity)}`).join(', ')}</span></td><td>${dateLabel(o.dueDate)}</td><td><span class="status-chip ${esc(o.status)}">${badge(o.status)}</span></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('Belum ada pesanan. Mulai dari AI Order Studio.')}</div>`;
}
function recipeReferencePanel(){
 const list=recipeReference?.products||[];
 if(!list.length)return `<div class="card"><h3>Referensi resep belum dimuat</h3><p class="hint">${esc(recipeReferenceError||'Klik tombol Lengkapi 34 resep untuk membuka daftar bahan.')}</p><button class="button secondary" data-action="open-recipe-reference">Coba muat kembali</button></div>`;
 const productOptions=list.map(x=>`<option value="${esc(x.productId)}" ${x.productId===uiState.recipeProductId?'selected':''}>${esc(x.productName)} (${x.ingredients.length} bahan, ${x.components.length} komponen)</option>`).join('');
 const selected=uiState.recipeProductId||list[0].productId;
 const item=list.find(x=>x.productId===selected)||list[0];
 const current=data.products.find(p=>p.id===item.productId)||data.products.find(p=>p.name.toLocaleLowerCase('id')===item.productName.toLocaleLowerCase('id'));
 const actual=(id,name)=>data.materials.find(m=>m.id===id)||data.materials.find(m=>m.name.toLocaleLowerCase('id')===name.toLocaleLowerCase('id'));
 const configured=item.ingredients.filter(x=>{let m=actual(x.id,x.name);return current?.recipe?.some(r=>r.materialId===m?.id);}).length;
 const globalApproved=item.status==='approved';
 const globalStatus=globalApproved?`<span class="status-chip completed">Takaran referensi publik terverifikasi</span>`:`<span class="status-chip in_progress">Referensi bahan · belum ada takaran publik</span>`;
 const privateStatus=current?.recipeApproval?.status==='approved'?'Disahkan pada workspace UMKM':current?.recipe?.length?'Takaran privat, belum disahkan':'Belum ada resep privat';
 const globalUse=globalApproved?`<button class="button secondary" type="button" data-action="apply-global-recipe" data-id="${esc(item.productId)}">Gunakan takaran referensi pada akun ini</button>`:'';
 return `<div class="card" id="bulk-recipe-card" style="margin-bottom:18px;border:2px solid #a9c3a5"><div class="flex-between"><div><h2 style="margin:0">Pustaka resep — 34 jenis upakara</h2><p class="hint">${list.filter(x=>x.ingredients.length).length} produk memiliki daftar bahan langsung dalam referensi; produk lain memerlukan pengkajian. Semua takaran harus diisi sesuai resep UMKM.</p></div><button class="button secondary" data-action="close-recipe-reference">Tutup</button></div>
 <label style="display:block;margin:12px 0">Pilih produk<select id="recipe-reference-product">${productOptions}</select></label><div class="notice"><b>${esc(item.productName)}</b> · ${globalStatus} · ${configured}/${item.ingredients.length} bahan memiliki takaran di workspace. <b>${esc(privateStatus)}.</b> ${globalUse}<p class="hint">Takaran referensi publik hanya muncul jika telah disetujui untuk dipublikasikan. Edit resep di akunmu tidak mengubah akun lain. Jumlah kosong tidak dihitung oleh Material Planner.</p></div>
 ${item.components.length?`<div class="notice"><b>Komponen banten bertingkat (belum dihitung otomatis):</b><ul>${item.components.map(x=>`<li>${esc(x.name)}</li>`).join('')}</ul><small>Jangan menambahkan takaran komponen dan bahan turunannya sekaligus tanpa metode penghitungan yang jelas.</small></div>`:''}
 ${item.ingredients.length?`<form id="bulk-recipe-form" data-product="${esc(item.productId)}"><div class="table-wrap"><table><thead><tr><th>Bahan referensi</th><th>Jumlah / 1 produk</th><th>Status</th></tr></thead><tbody>${item.ingredients.map(x=>{const m=actual(x.id,x.name);const old=current?.recipe?.find(r=>r.materialId===m?.id);return `<tr><td><strong>${esc(x.name)}</strong><br><small>${esc(m?.unit||x.unit||'satuan belum tersedia')}</small>${x.source?`<br><small><a href="${esc(x.source)}" target="_blank" rel="noopener noreferrer">Sumber</a></small>`:''}</td><td>${m?`<input class="small-input" type="number" step="0.001" min="0" max="100000" data-recipe-mat="${esc(m.id)}" value="${old?.amount??''}" placeholder="Isi takaran aktual" aria-label="Takaran ${esc(x.name)}" />`:'<span class="muted">Bahan belum ada di katalog</span>'}</td><td>${old?'Sudah ada':'Belum diisi'}</td></tr>`;}).join('')}</tbody></table></div><p class="hint">Kosong = takaran belum diketahui; isi 0 hanya jika bahan memang tidak digunakan pada varian UMKM. Angka 0 tidak disimpan sebagai kebutuhan.</p><button class="button primary" type="submit">Simpan takaran produk ini</button></form>`:'<div class="notice">Rincian bahan langsung belum tersedia dari sumber yang dipakai. Tambahkan resep manual setelah konfirmasi pengrajin.</div>'}</div>`;
}
async function openRecipeReference(productId){
 try{if(!recipeReference){const res=await fetch('/recipe-reference.json',{cache:'no-store'});if(!res.ok)throw Error(`HTTP ${res.status}`);recipeReference=await res.json();if(!Array.isArray(recipeReference.products)||recipeReference.products.length!==34)throw Error('Data referensi tidak lengkap');}uiState.recipePanel=true;uiState.recipeProductId=productId&&recipeReference.products.some(p=>p.productId===productId)?productId:(uiState.recipeProductId||recipeReference.products[0].productId);render();document.querySelector('#bulk-recipe-card')?.scrollIntoView({block:'start',behavior:'smooth'});}
 catch(e){recipeReferenceError=e.message;uiState.recipePanel=true;render();toast('Referensi resep gagal dimuat: '+e.message,true);}
}
function recipeHubView(){
 const list=publicRecipeLibrary?.products||[];
 const publicCount=list.filter(x=>x.status==='approved').length;
 const coverage=auditActiveRecipeCoverage(data);
 const localApproved=coverage.readyProducts;
 const total=list.length||34;
 const percent=total?Math.round(publicCount/total*100):0;
 const cards=list.map(item=>{
   const local=data.products.find(p=>p.id===item.productId)||data.products.find(p=>p.name.toLocaleLowerCase('id-ID')===item.productName.toLocaleLowerCase('id-ID'));
   const localReady=local?.recipeApproval?.status==='approved'&&Boolean(local.recipe?.length)&&local.recipeApproval.fingerprint===local.recipe.map(r=>`${r.materialId}:${r.amount}`).sort().join('|');
   const globalReady=item.status==='approved';
   const status=globalReady?'public':localReady?'local':'pending';
   const name=item.productName;
   const search=[name,item.productId,...(local?.aliases||[])].join(' ').toLocaleLowerCase('id-ID');
   const note=globalReady?'Takaran global dapat digunakan':localReady?'Disahkan hanya untuk akun ini':item.ingredients.length?`${item.ingredients.length} bahan referensi · takaran belum publik`:'Komponen perlu dikaji pengrajin';
   const tag=globalReady?'Publik terverifikasi':localReady?'Privat disahkan':'Perlu takaran';
   return `<button type="button" class="ran-recipe-tile" data-hub-recipe-card data-hub-search="${esc(search)}" data-hub-state="${status}" data-action="open-recipe-reference" data-id="${esc(item.productId)}" aria-label="Buka resep ${esc(name)}"><span class="ran-recipe-symbol" aria-hidden="true">${globalReady?'✦':localReady?'✓':'❋'}</span><span class="ran-recipe-tile-copy"><strong>${esc(name)}</strong><small>${esc(note)}</small><em class="ran-recipe-tag ${status}">${tag}</em></span><span class="ran-recipe-arrow" aria-hidden="true">↗</span></button>`;
 }).join('');
 return `<section class="ran-hub" aria-label="Pusat Resep Upakara">
   <div class="ran-hub-hero"><div class="ran-hub-header"><span class="ran-hub-eyebrow">Pustaka Resep Global · 34 Upakara</span><h2>Warisan bahan Bali.<br><em>Takaran yang bisa ditelusuri.</em></h2><p>${total} jenis upakara tersedia di katalog bersama. Resep numerik hanya digunakan ketika ada pengesahan pengrajin dan izin publikasi.</p><div class="ran-hub-actions"><button type="button" class="button primary" data-action="open-recipe-reference">Jelajahi pustaka resep ↗</button><a class="button secondary" href="/template_resep_34.csv" download>Unduh template takaran</a></div></div><div class="ran-hub-art" aria-hidden="true"><span>❋</span><small>Bali · budaya · produksi</small></div></div>
   <div class="ran-hub-stats" aria-label="Ringkasan kelengkapan resep"><div><small>Jenis upakara</small><strong>${total}</strong><span>Katalog bersama</span></div><div><small>Resep publik disahkan</small><strong>${publicCount}<span> / ${total}</span></strong><span>Otomatis tersedia untuk akun baru</span></div><div><small>Resep privat disahkan</small><strong>${localApproved}<span> / ${data.products.length}</span></strong><span>Hanya tersimpan di workspace ini</span></div></div>
   <div class="ran-hub-progress"><div class="ran-hub-progress-head"><b>Kesiapan resep global untuk produksi</b><strong>${percent}%</strong></div><div class="ran-hub-progress-track" role="progressbar" aria-label="Progres resep global disahkan" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div><p>${publicCount===0?'Belum ada takaran numerik yang diizinkan untuk publikasi. Rujukan bahan tersedia sebagai referensi, bukan BOM final.':`${publicCount} resep global telah disahkan untuk disalin pengguna baru.`} Angka dari resep privat tidak otomatis dibagikan ke akun lain.</p></div>
   <div class="ran-hub-guide"><span class="ran-hub-guide-icon" aria-hidden="true">ⓘ</span><div><strong>Agar Material Planner menghitung secara final</strong><p>Isi takaran per unit sesuai produksi pengrajin, validasi satuan dan banten komposit, lalu sahkan resep. Publikasi global membutuhkan izin berbagi takaran tersendiri. Tanpa angka lengkap, perhitungan tetap DRAF.</p></div></div>
   <div class="ran-hub-directory" id="ran-recipe-directory"><div class="ran-hub-directory-title"><div><h3>Temukan resep upakara</h3><p>Ketuk produk untuk melihat daftar bahan, referensi, dan takaran yang tersedia.</p></div><span class="ran-hub-count" id="ran-hub-count">${list.length} produk</span></div><div class="ran-hub-toolbar"><label>Cari jenis upakara<input id="ran-hub-search" type="search" value="${esc(uiState.recipeHubQuery)}" placeholder="Cari pejati, daksina, kwangen..." autocomplete="off" /></label><label>Status<select id="ran-hub-filter"><option value="all" ${uiState.recipeHubFilter==='all'?'selected':''}>Semua</option><option value="public" ${uiState.recipeHubFilter==='public'?'selected':''}>Publik disahkan</option><option value="local" ${uiState.recipeHubFilter==='local'?'selected':''}>Disahkan privat</option><option value="pending" ${uiState.recipeHubFilter==='pending'?'selected':''}>Belum tersedia publik</option></select></label></div>${list.length?`<div class="ran-recipe-grid">${cards}</div><p class="ran-hub-nothing" id="ran-hub-empty" hidden>Tidak ada resep sesuai pencarian. Coba nama lain atau ubah filter.</p>`:`<p class="ran-hub-nothing">Pustaka tidak termuat. Pastikan file global-recipes.json tersedia lalu refresh halaman.</p>`}</div>
   <div class="ran-hub-foot"><div><strong>Sudah punya takaran yang disetujui?</strong><span>Impor resep privat untuk akun ini. Publikasi ke seluruh akun dilakukan terpisah oleh pengelola.</span></div><button type="button" class="button primary" data-action="import-approved-recipe">Impor resep pengrajin</button><input id="approved-recipe-csv" type="file" accept=".csv,text/csv" hidden /></div>
 </section>`;
}
function applyRecipeHubFilters(){
 if(currentPage!=='catalog')return;
 const query=uiState.recipeHubQuery.toLocaleLowerCase('id-ID').trim();let count=0;
 document.querySelectorAll('[data-hub-recipe-card]').forEach(el=>{
   const state=el.dataset.hubState;
   const filter=uiState.recipeHubFilter;
   const filterOk=filter==='all'||(filter==='pending'?state!=='public':state===filter);
   el.hidden=!(filterOk&&(el.dataset.hubSearch||'').includes(query));
   if(!el.hidden)count++;
 });
 const el=$('#ran-hub-count');if(el)el.textContent=`${count} produk`;
 const empty=$('#ran-hub-empty');if(empty)empty.hidden=count!==0;
}

function catalogView(){
 const choices=data.materials.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.unit)})</option>`).join('');
 const globalSummary=publicRecipeLibrary?inspectPublicRecipeLibrary(publicRecipeLibrary,publicCatalogReference):null;
 return `${banner()}${recipeHubView()}${uiState.recipePanel?recipeReferencePanel():''}<details class="ran-admin"><summary><span><strong>Pengelolaan katalog dan bahan</strong><small>Tambah produk, impor katalog, dan kelola stok. Dibuka hanya bila diperlukan.</small></span><span class="ran-admin-arrow" aria-hidden="true">⌄</span></summary><div class="ran-admin-body"><div class="ran-admin-actions"><button type="button" class="button secondary" data-action="open-recipe-reference">Lengkapi resep per produk</button><button type="button" class="button secondary" data-action="download-json">Backup workspace JSON</button><button type="button" class="button primary" data-action="import-reference">Impor katalog JSON</button><input id="catalog-import-file" type="file" accept=".json,application/json" hidden /></div><div class="col-2-equal"><div class="card"><h3>Tambah material</h3><form id="material-form" class="stacked-form"><label>Nama bahan<input name="name" required maxlength="100" placeholder="Misalnya janur" /></label><div class="field-row"><label>Satuan<input name="unit" required maxlength="20" placeholder="lembar / gram / pcs" /></label><label>Stok tersedia<input type="number" min="0" step="0.001" name="stock" value="0" required /></label></div><button class="button primary" type="submit">+ Simpan material</button></form></div>
 <div class="card"><h3>Tambah produk</h3><form id="product-form" class="stacked-form"><label>Nama produk<input name="name" maxlength="100" required placeholder="Misalnya canang sari" /></label><label>Alias / singkatan (pisahkan koma)<input name="aliases" maxlength="350" placeholder="canang, cnng" /></label><button class="button primary" type="submit">+ Simpan produk</button></form></div></div></div></details>
 <div class="section-header"><h2>Produk & resep produksi</h2><span class="badge">${data.products.length} produk</span></div>
 <div class="card catalog-browser"><div class="toolbar"><label class="search-field">Cari jenis upakara atau alias<input id="catalog-search" type="search" value="${esc(uiState.catalogQuery)}" placeholder="Cari kwangen, daksina, segehan..." autocomplete="off" /></label><label class="filter-field">Status resep<select id="catalog-filter"><option value="all" ${uiState.catalogFilter==='all'?'selected':''}>Semua produk</option><option value="ready" ${uiState.catalogFilter==='ready'?'selected':''}>Ada komposisi</option><option value="missing" ${uiState.catalogFilter==='missing'?'selected':''}>Perlu dilengkapi</option></select></label></div><p id="catalog-result-count" class="hint" role="status"></p>
 ${data.products.length?`<div class="catalog-items">${data.products.map(p=>`<details class="recipe-block catalog-item" data-product-card data-search="${esc([p.name,...(p.aliases||[])].join(' ').toLocaleLowerCase('id-ID'))}" data-recipe-ready="${p.recipe.length?'yes':'no'}"><summary><span><strong>${esc(p.name)}</strong><small>Alias: ${esc((p.aliases||[]).join(', ')||'—')}</small></span><span class="recipe-summary-meta"><span class="status-chip ${p.recipe.length?'completed':'in_progress'}">${p.recipeApproval?.status==='approved'?`✓ ${p.recipe.length} bahan disetujui`:p.recipe.length?`${p.recipe.length} bahan · BELUM DISAHKAN`:'Resep kosong'}</span><span class="chevron" aria-hidden="true">⌄</span></span></summary><div class="recipe-details"><div class="flex-between"><p class="hint">Komposisi per 1 unit produk; gunakan takaran terverifikasi UMKM.</p><button class="button danger small" data-action="delete-product" data-id="${esc(p.id)}">Hapus produk</button></div><div style="margin:12px 0">${p.recipe.length?p.recipe.map(r=>{const m=data.materials.find(x=>x.id===r.materialId);return `<span class="recipe-pill">${printNum(r.amount)} ${esc(m?.unit||'?')} ${esc(m?.name||'Bahan hilang')} <button class="button secondary small" data-action="delete-recipe" data-id="${esc(p.id)}" data-material="${esc(r.materialId)}" title="Hapus bahan dari resep">×</button></span>`;}).join(''):'<span class="muted">Belum ada komposisi bahan</span>'}</div><form class="recipe-form field-row three" data-product="${esc(p.id)}"><label>Bahan<select name="materialId" required>${choices}</select></label><label>Jumlah / 1 produk<input type="number" step="0.001" min="0.001" name="amount" required placeholder="Contoh: 2" /></label><label>Aksi<button type="submit" class="button secondary">+ Tambah ke resep</button></label></form></div></details>`).join('')}</div><div id="catalog-empty-filter" class="empty" hidden>Tidak ada produk yang sesuai filter.</div>`:tableEmpty('Tambahkan produk lebih dulu.')}</div>
 <div class="section-header"><h2>Daftar bahan</h2><span class="badge">${data.materials.length} bahan</span></div><div class="card"><label class="search-field">Cari bahan<input type="search" id="material-search" value="${esc(uiState.materialQuery)}" placeholder="Cari janur, beras, bunga..." autocomplete="off" /></label><p id="material-result-count" class="hint" role="status"></p>${data.materials.length?`<div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Satuan</th><th>Stok tersedia</th><th>Aksi</th></tr></thead><tbody>${data.materials.map(m=>`<tr data-material-row data-search="${esc([m.name,m.unit].join(' ').toLocaleLowerCase('id-ID'))}"><td><strong>${esc(m.name)}</strong></td><td>${esc(m.unit)}</td><td><input class="small-input stock-input" data-material="${esc(m.id)}" type="number" min="0" step="0.001" value="${m.stock}" aria-label="Stok ${esc(m.name)}" /></td><td><button class="button secondary small" data-action="save-stock" data-id="${esc(m.id)}">Update</button> <button class="button danger small" data-action="delete-material" data-id="${esc(m.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div><div id="material-empty-filter" class="empty" hidden>Tidak ada bahan yang cocok.</div>`:tableEmpty('Belum ada bahan.')}</div>`;
}
function draftItem(row,i){return `<div class="draft-item" data-index="${i}"><label>Produk<select class="draft-product"><option value="">Pilih produk...</option>${data.products.map(p=>`<option value="${esc(p.id)}" ${p.id===row.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>Jumlah<input class="draft-qty" type="number" min="1" max="100000" step="1" value="${esc(row.quantity)}" /></label><div><div class="label-caption">Kepercayaan AI</div><span class="badge">${esc(row.confidence||'manual')}</span></div><button class="button danger small" data-action="remove-draft" data-index="${i}">Hapus</button>${row.rawName?`<div class="hint" style="grid-column:1/-1">Teks produk dari AI: <strong>${esc(row.rawName)}</strong>${row.sourceText?' · '+esc(row.sourceText):''}</div>`:''}</div>`;}
function classicStudio(){return `<div class="two-col"><div class="card"><div class="flex-between"><h3>01 / Pesan pelanggan</h3><span class="badge">${esc(LOCAL_MODEL_NAME)} · lokal</span></div><p class="hint">Tempel pesan tanpa nomor telepon, alamat, atau identitas pribadi. Untuk chat pelanggan nyata, minta izin dan minimalkan data.</p><label>Isi pesan<textarea id="order-text" maxlength="2500" placeholder="Bu, pesan 30 canang sama 12 pejati untuk Jumat pagi. Tolong konfirmasi jam pengambilan.">${esc(uiState.orderText)}</textarea></label><div class="button-row" style="margin-top:14px"><button class="button primary" id="ai-button" data-action="extract">✦ Analisis NLP Lokal</button><button class="button secondary" data-action="manual-draft">+ Buat draf manual</button><button class="button secondary" data-action="sample-message">Isi contoh pesan</button></div>${!(session&&cloudReady)?`<div class="notice" style="margin-top:15px"><b>AI lokal tersedia tanpa internet.</b> Analisis pesanan berjalan di browser tanpa OpenAI. ${session?'Sinkronisasi Supabase sedang bermasalah, jadi penyimpanan cloud belum tersedia.':'Tanpa login, pesanan yang dikonfirmasi hanya tersimpan pada browser ini (mode demo).'} </div>`:''}<div class="test-box"><b>Kenapa harus verifikasi?</b><p class="hint">AI tidak otomatis menyimpan pesanan, mengubah stok, atau menentukan tanggal yang tidak pasti. Setiap hasil diperiksa oleh pengguna.</p></div></div>
 <div class="card"><div class="flex-between"><h3>02 / Hasil ekstraksi & konfirmasi</h3><span class="badge">Human-in-the-loop</span></div>${draft?`${draft.questions.length?`<div class="notice"><strong>Perlu klarifikasi</strong><div style="margin-top:8px">${draft.questions.map(q=>`<p class="question">• ${esc(q)}</p>`).join('')}</div></div>`:''}${draft.requires_clarification?`<div class="notice error" style="margin-top:12px"><strong>⚠ Klarifikasi wajib sebelum simpan</strong><p class="hint">AI menemukan ketidakpastian jumlah atau produk. Hubungi pelanggan, perbaiki pilihan produk dan jumlah di bawah, lalu dokumentasikan hasilnya.</p><label>Catatan hasil klarifikasi pelanggan (wajib)<textarea id="clarification-note" maxlength="280" placeholder="Contoh: pelanggan menegaskan Kwangen 8 unit">${esc(draft.clarificationNote||'')}</textarea></label><label style="display:flex;gap:8px;align-items:start;margin-top:10px"><input type="checkbox" id="clarification-checked" ${draft.clarificationVerified?'checked':''} /> <span>Saya telah mengonfirmasi produk dan jumlah kepada pelanggan, serta memeriksa draf di bawah.</span></label></div>`:''}<div id="draft-list" class="draft-list">${draft.items.map(draftItem).join('')}</div><div style="margin-top:10px"><button class="button secondary small" data-action="add-draft-item">+ Tambah produk</button></div><div class="field-row" style="margin-top:16px"><label>Nama pesanan (opsional)<input id="draft-customer" maxlength="90" placeholder="Contoh: Pesanan pelanggan A" /></label><label>Tanggal selesai<input id="draft-date" type="date" value="${esc(draft.delivery.date_iso)}" required /></label></div><div class="field-row" style="margin-top:13px"><label>Waktu / catatan jam<input id="draft-time" maxlength="80" value="${esc(draft.delivery.time_text)}" placeholder="Misalnya pagi; belum dikonfirmasi" /></label><label>Catatan produksi<input id="draft-notes" maxlength="500" value="${esc(draft.notes)}" placeholder="Catatan produksi" /></label></div><div class="button-row" style="margin-top:18px"><button class="button primary" data-action="confirm-order">✓ Konfirmasi & simpan pesanan</button><button class="button secondary" data-action="clear-draft">Batal</button></div><p class="hint">Tanggal wajib dipastikan oleh pengguna sebelum pesanan disimpan. Jika pilihan produk belum ditemukan, pilih produk katalog secara manual.</p>`:tableEmpty('Belum ada draf. Masukkan chat dan jalankan AI, atau buat draf manual untuk pengujian.')} </div></div>`;}

function studio(){
  return `${chatPanel()}${chatDraftActive&&draft?`<section class="ran-chat-verification"><h3>Verifikasi hasil chat sebelum disimpan</h3><p class="hint">Periksa nama produk, jumlah, tanggal, serta catatan. Pesanan belum tersimpan sampai tombol hijau pada formulir ditekan.</p>${classicStudio()}</section>`:`<details class="ran-classic-studio"><summary>Opsi alternatif: analisis sekali jalan / draf manual (versi lama)</summary>${classicStudio()}</details>`}`;
}

function planner(){
 const p=plan();const coverage=auditActiveRecipeCoverage(data);const orderList=[...data.orders].sort((a,b)=>(a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31'));
 return `${banner()}<div class="stats stats-compact"><div class="stat"><small>Pesanan aktif</small><strong>${p.activeCount}</strong><em>Baru & diproses</em></div><div class="stat"><small>Material tercatat</small><strong>${p.rows.length}</strong><em>Jenis bahan</em></div><div class="stat"><small>Perlu pembelian</small><strong>${p.rows.filter(x=>x.shortage>0).length}</strong><em>Kekurangan stok</em></div><div class="stat"><small>Resep belum lengkap</small><strong>${p.missingRecipes.length}</strong><em>Perlu diverifikasi</em></div></div>
 <div class="section-header"><h2>Rencana kebutuhan bahan</h2><button class="button secondary small" data-action="download-csv">Unduh CSV</button></div>
 <div class="card">${!coverage.activeCoverageComplete?`<div class="notice error"><strong>⚠ HASIL MRP MASIH DRAF — TIDAK BOLEH DIGUNAKAN UNTUK BELANJA FINAL.</strong><p class="hint">Pesanan aktif mempunyai resep yang belum tercatat sebagai terverifikasi: ${esc(coverage.unverifiedActive.join(", "))}. Angka di bawah bersifat parsial dan dapat kurang dari kebutuhan sesungguhnya. Lengkapi pengesahan pengrajin melalui Impor Resep Disetujui.</p></div>`:`<div class="notice"><strong>Resep pesanan aktif terverifikasi.</strong> Periksa bahwa stok dan jumlah pesanan aktual sudah diperbarui.</div>`}<p class="hint">Perhitungan: Σ(jumlah produk × bahan per unit). Kekurangan = max(0, kebutuhan − stok). Hanya pesanan Baru dan Diproses dihitung; stok tidak otomatis dikurangi.</p>${p.missingRecipes.length?`<div class="notice error">Perencanaan belum lengkap. Resep perlu ditambahkan untuk: ${esc(p.missingRecipes.join(', '))}</div>`:''}${p.rows.length?`<div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Kebutuhan</th><th>Stok</th><th>Kekurangan</th><th>Status</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${printNum(r.required)} ${esc(r.unit)}</td><td>${printNum(r.stock)} ${esc(r.unit)}</td><td class="${r.shortage>0?'error-text':''}">${printNum(r.shortage)} ${esc(r.unit)}</td><td><span class="status-chip ${r.shortage>0?'in_progress':'completed'}">${r.shortage>0?'Beli / siapkan':'Cukup'}</span></td></tr>`).join('')}</tbody></table></div><div id="material-empty-filter" class="empty" hidden>Tidak ada bahan yang cocok.</div>`:tableEmpty('Belum ada bahan.')}</div>
 <div class="section-header"><h2>Manajemen pesanan</h2><span class="badge">${data.orders.length} tercatat</span></div>
 <div class="card"><div class="toolbar"><label class="search-field">Cari pelanggan, produk, ID, atau tanggal<input id="planner-search" type="search" value="${esc(uiState.plannerQuery)}" placeholder="Ketik nama atau produk..." autocomplete="off" /></label><label class="filter-field">Filter status<select id="planner-filter"><option value="all" ${uiState.plannerStatus==='all'?'selected':''}>Semua status</option><option value="new" ${uiState.plannerStatus==='new'?'selected':''}>Baru</option><option value="in_progress" ${uiState.plannerStatus==='in_progress'?'selected':''}>Diproses</option><option value="completed" ${uiState.plannerStatus==='completed'?'selected':''}>Selesai</option><option value="cancelled" ${uiState.plannerStatus==='cancelled'?'selected':''}>Dibatalkan</option></select></label></div><p id="planner-result-count" class="hint" role="status"></p>
 ${orderList.length?`<div class="table-wrap"><table id="planner-orders-table"><thead><tr><th>Pesanan</th><th>Tenggat</th><th>Item</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${orderList.map(o=>`<tr data-order-row data-status="${esc(o.status)}" data-search="${esc(orderSearchText(o))}"><td><strong>${esc(o.customer||'Tanpa nama')}</strong><br><span class="muted">${esc(o.id.slice(0,18))}</span></td><td>${dateLabel(o.dueDate)}<br><span class="muted">${esc(o.dueTime||'—')}</span></td><td>${o.items.map(i=>`${esc(data.products.find(p=>p.id===i.productId)?.name||'Produk dihapus')} × ${Number(i.quantity)}`).join('<br>')}</td><td><select data-status-id="${esc(o.id)}" aria-label="Status pesanan ${esc(o.customer||o.id)}"><option value="new" ${o.status==='new'?'selected':''}>Baru</option><option value="in_progress" ${o.status==='in_progress'?'selected':''}>Diproses</option><option value="completed" ${o.status==='completed'?'selected':''}>Selesai</option><option value="cancelled" ${o.status==='cancelled'?'selected':''}>Dibatalkan</option></select></td><td><button class="button danger small" data-action="delete-order" data-id="${esc(o.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div><div id="planner-empty-filter" class="empty" hidden>Tidak ada pesanan yang sesuai pencarian atau filter.</div>`:tableEmpty('Belum ada pesanan. Buat dari AI Order Studio.')}</div>`;
}
function guide(){return `<div class="two-col"><div class="card"><h3>Status kesiapan teknis</h3><div class="metric-row"><span>Mode data</span><strong>${session?'Supabase + RLS':CLOUD?'Demo lokal (belum login)':'Demo lokal browser'}</strong></div><div class="metric-row"><span>AI NLP lokal</span><strong class="success-text">Model TF-IDF kNN tersedia di browser</strong></div><div class="metric-row"><span>Katalog dan stok</span><strong>Fungsional</strong></div><div class="metric-row"><span>Perhitungan bahan</span><strong>Deterministik</strong></div><div class="metric-row"><span>URL hosting</span><strong>${esc(location.hostname)}</strong></div><div class="notice info" style="margin-top:20px">Model NLP lokal tidak memakai OpenAI API, tetapi kemampuannya terbatas pada pencocokan produk ke katalog dan parser jumlah/tanggal. Jalankan evaluasi berlabel pada pesan baru dan catat hasilnya sebelum mengisi formulir lomba.</div><div class="button-row"><button class="button secondary" data-action="download-json">↓ Backup data JSON</button>${!session?'<button class="button danger" data-action="reset-demo">Reset data demo</button>':''}</div></div><div class="card"><h3>Checklist technical gate</h3><p class="hint">Mengikuti Panduan Peserta AI Web Innovation Challenge Bali DigiFest 2026.</p><div class="mini-list"><div><span>Website aktif & dapat diuji</span><span>Periksa URL Cloudflare</span></div><div><span>Model NLP lokal benar-benar berjalan</span><span>Uji input baru</span></div><div><span>Data pesanan tersimpan</span><span>Uji reload</span></div><div><span>Repository & README</span><span>Lampirkan GitHub</span></div><div><span>AI / Technology Disclosure</span><span>Dokumen tersedia</span></div><div><span>Proposal PDF maks. 5 halaman isi</span><span>Susun setelah MVP valid</span></div></div><hr class="divider" /><p class="hint">Data contoh bahan hanya ilustrasi. Tidak ada integrasi WhatsApp langsung, OCR screenshot, forecasting permintaan, atau pemotongan stok otomatis pada versi ini.</p></div></div>`;}
function render(){
 const titles={dashboard:'Ringkasan Operasional',studio:'AI Order Studio',catalog:'Katalog Produk & Bahan',planner:'Rencana Produksi',guide:'Panduan & Verifikasi'};
 $('#page-title').textContent=titles[currentPage];
 $('#connection-status').textContent=booting?'Menyambungkan cloud…':session?(cloudReady?'Cloud terhubung':'Cloud perlu diperiksa'):CLOUD?'Demo lokal · belum login':'Mode demo lokal · periksa config.js';
 $('#connection-status').className=`pill ${session&&cloudReady?'good':'warn'}`;
 $('#auth-button').textContent=session?'Keluar':'Masuk / Daftar';
 document.querySelectorAll('[data-nav]').forEach(e=>{const selected=e.dataset.nav===currentPage;e.classList.toggle('selected',selected);if(selected)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
 $('#app-content').innerHTML=({dashboard,studio,catalog:catalogView,planner,guide}[currentPage])();
 applyPlannerFilters();applyCatalogFilters();applyMaterialFilters();applyRecipeHubFilters();
}
function safeRender(){
  try{render();}
  catch(err){
    console.error('RANAKARA rendering error:',err);
    const main=$('#app-content');
    if(main)main.innerHTML='<div class="notice error"><strong>Halaman tidak dapat ditampilkan.</strong> Silakan muat ulang. Jika masih gagal, buka Developer Tools → Console dan catat pesan error.</div>';
  }
}
function readDraftFromUI(){
 if(!draft)return;
 draft.items=[...document.querySelectorAll('#draft-list .draft-item')].map(el=>({
   ...draft.items[Number(el.dataset.index)], productId:el.querySelector('.draft-product').value,
   quantity:el.querySelector('.draft-qty').value
 }));
 draft.delivery.date_iso=$('#draft-date')?.value||'';
 draft.delivery.time_text=$('#draft-time')?.value||'';
 draft.notes=$('#draft-notes')?.value||'';
 draft.customer=$('#draft-customer')?.value||'';
 if(draft.requires_clarification){
   draft.clarificationVerified=Boolean($('#clarification-checked')?.checked);
   draft.clarificationNote=String($('#clarification-note')?.value||'').trim().slice(0,280);
 }
}
async function extract(){
 // AI inference is 100% local and MUST NOT depend on cloud auth/network.
 // Cloud is required only if the user decides to save to Supabase.
 const text=$('#order-text')?.value?.trim();if(!text||text.length<4){toast('Masukkan teks pesanan minimal 4 karakter.',true);return;}
 if(!data.products.length){toast('Tambahkan produk di katalog terlebih dahulu.',true);return;}
 const button=$('#ai-button');button.disabled=true;button.textContent='Memproses NLP lokal…';
 try{
   // True local machine-learning inference: no external OpenAI/API call.
   // TF-IDF char-n-gram nearest neighbor fitted from user catalogue and aliases.
   const result=extractLocalOrder({text,catalog:data.products.map(p=>({id:p.id,name:p.name,aliases:p.aliases})),referenceDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Makassar'})});
   draft=normalizeAIOutput(result,data.products);draft.customer='';
   draft.requires_clarification=Boolean(result.requires_clarification);
   draft.critical_questions=Array.isArray(result.critical_questions)?result.critical_questions:[];
   draft.clarificationVerified=false;draft.clarificationNote='';render();
   toast(`Analisis NLP lokal selesai. Mohon verifikasi hasil (${LOCAL_MODEL_NAME}).`);
 }catch(err){toast(err.message||'Model lokal gagal memproses teks.',true);button.disabled=false;button.textContent='✦ Analisis NLP Lokal';}
}

async function clickAction(button){
 const a=button.dataset.action,id=button.dataset.id;
 if(a==='apply-global-recipe'){
   if(!publicRecipeLibrary||!publicCatalogReference){toast('Pustaka global belum dimuat.',true);return;}
   const item=publicRecipeLibrary.products.find(x=>x.productId===id);
   if(!item||item.status!=='approved'){toast('Belum ada takaran global yang terverifikasi untuk produk ini.',true);return;}
   const current=data.products.find(p=>p.id===id)||data.products.find(p=>p.name.toLocaleLowerCase('id-ID')===item.productName.toLocaleLowerCase('id-ID'));
   if(!confirm(`Gunakan resep publik ${item.productName} di akun ini? Resep privat produk ini akan DIGANTI, tetapi stok, pesanan, dan resep produk lain tidak diubah.`))return;
   let next;
   try{next=copyPublicRecipeToWorkspace(data,publicRecipeLibrary,publicCatalogReference,id);}
   catch(err){toast(err.message,true);return;}
   await mutate(()=>{data.products=next.products;});return;
 }
 if(a==='import-approved-recipe'){const el=$('#approved-recipe-csv');if(el)el.click();return;}
 if(a==='open-recipe-reference')return openRecipeReference(id);
 if(a==='close-recipe-reference'){uiState.recipePanel=false;render();return;}
 if(a==='chat-new'){resetOrderChat();render();return;}
 if(a==='chat-example'){const field=$('#ran-chat-input');if(field){field.value='Bu pesan 20 canang, eh 10 aja untuk Jumat';field.focus();}return;}
 if(a==='extract'){chatDraftActive=false;return extract();}
 if(a==='sample-message'){uiState.orderText='Pesan 10 pejati, eh tambah 5 lagi. Untuk besok pagi.';const field=$('#order-text');if(field){field.value=uiState.orderText;field.focus();}return;}
 if(a==='manual-draft'){chatDraftActive=false;draft={items:[{productId:'',quantity:1,rawName:'',confidence:'manual'}],delivery:{date_iso:'',time_text:'',raw_text:''},notes:'',questions:[],customer:''};render();toast('Draf manual dibuat; ini bukan keluaran AI.');return;}
 if(a==='add-draft-item'){readDraftFromUI();draft.items.push({productId:'',quantity:1,rawName:'',confidence:'manual'});render();return;}
 if(a==='remove-draft'){readDraftFromUI();draft.items.splice(Number(button.dataset.index),1);render();return;}
 if(a==='clear-draft'){if(chatDraftActive)resetOrderChat();else {draft=null;chatDraftActive=false;}render();return;}
 if(a==='confirm-order'){
   readDraftFromUI();
   if(draft.requires_clarification&&(!draft.clarificationVerified||(draft.clarificationNote||'').length<8)){
     toast('Pesanan berisiko ambigu. Konfirmasi produk dan jumlah dengan pelanggan, isi catatan (minimal 8 karakter), lalu centang verifikasi.',true);return;
   }
   const items=draft.items.map(i=>({productId:i.productId,quantity:Number(i.quantity)}));
   const dueDate=draft.delivery.date_iso;const problems=validateOrder({items,dueDate},data.products);
   if(dueDate && dueDate<localToday())problems.push('Tanggal selesai sudah lewat. Pilih tanggal hari ini atau setelahnya.');
   if(problems.length){toast(problems.join(' '),true);return;}
   const saved=await mutate(()=>{data.orders.push({id:makeId('order'),customer:draft.customer||'Pesanan tanpa nama',items,dueDate,dueTime:draft.delivery.time_text,notes:[draft.notes,draft.clarificationNote?`Klarifikasi pelanggan: ${draft.clarificationNote}`:''].filter(Boolean).join(' | ').slice(0,500),status:'new',createdAt:new Date().toISOString()});});
   if(saved){resetOrderChat();uiState.orderText='';uiState.plannerStatus='all';uiState.plannerQuery='';currentPage='planner';render();}return;
 }
 if(a==='save-stock'){
   const input=document.querySelector(`.stock-input[data-material="${CSS.escape(id)}"]`);const value=Number(input?.value);
   if(!Number.isFinite(value)||value<0){toast('Stok harus angka ≥ 0.',true);return;}
   await mutate(()=>{data.materials.find(m=>m.id===id).stock=rounded(value);});return;
 }
 if(a==='delete-material'){
   if(data.products.some(p=>p.recipe.some(r=>r.materialId===id))){toast('Hapus material dari seluruh resep produk terlebih dahulu.',true);return;}
   if(confirm('Hapus bahan ini?'))await mutate(()=>{data.materials=data.materials.filter(m=>m.id!==id);});return;
 }
 if(a==='delete-product'){
   if(data.orders.some(o=>o.items.some(i=>i.productId===id))){toast('Produk sudah dipakai dalam pesanan. Pertahankan untuk riwayat.',true);return;}
   if(confirm('Hapus produk ini?'))await mutate(()=>{data.products=data.products.filter(p=>p.id!==id);});return;
 }
 if(a==='delete-recipe'){await mutate(()=>{const p=data.products.find(p=>p.id===id);p.recipe=p.recipe.filter(r=>r.materialId!==button.dataset.material);invalidateRecipeApproval(p);p.globalRecipeOptOut=true;});return;}
 if(a==='delete-order'){if(confirm('Hapus pesanan ini secara permanen?'))await mutate(()=>{data.orders=data.orders.filter(o=>o.id!==id);});return;}
 if(a==='reset-demo'){
   if(session){toast('Tidak tersedia saat mode cloud.',true);return;}
   if(confirm('Reset seluruh data demo browser?')){data=makeSeed();draft=null;persistLocal();render();toast('Data demo direset.');}return;
 }
 if(a==='download-csv'){
   const cov=auditActiveRecipeCoverage(data);if(!cov.activeCoverageComplete){toast('MRP belum final. CSV akan bertanda DRAF; lengkapi resep '+cov.unverifiedActive.join(', '),true);}
   const rows=[['STATUS',cov.activeCoverageComplete?'FINAL_VERIFIKASI_RESEP':'DRAF_TIDAK_LENGKAP','','',''],['Bahan','Kebutuhan','Stok','Kekurangan','Satuan'],...plan().rows.map(r=>[r.name,r.required,r.stock,r.shortage,r.unit])];
   return download(cov.activeCoverageComplete?'ranakara-kebutuhan-bahan-final.csv':'ranakara-kebutuhan-bahan-DRAF.csv','\ufeff'+rows.map(a=>a.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');
 }
 if(a==='import-reference'){const uploader=$('#catalog-import-file');if(!uploader){toast('Buka halaman Katalog terlebih dahulu.',true);return;}uploader.click();return;}
 if(a==='download-json')return download('ranakara-backup.json',JSON.stringify(data,null,2),'application/json');
}
function download(name,content,mime){const file=new Blob([content],{type:mime});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function handleForm(form){
 const obj=Object.fromEntries(new FormData(form));
 if(form.id==='bulk-recipe-form'){
   const reference=recipeReference?.products?.find(x=>x.productId===form.dataset.product);
   const p=data.products.find(x=>x.id===form.dataset.product)||data.products.find(x=>x.name.toLocaleLowerCase('id')===reference?.productName.toLocaleLowerCase('id'));
   if(!reference||!p){toast('Produk referensi tidak ditemukan di workspace.',true);return;}
   const changes=[];for(const input of form.querySelectorAll('[data-recipe-mat]')){
     const raw=input.value.trim();if(!raw)continue;
     const amount=Number(raw);if(!Number.isFinite(amount)||amount<0||amount>100000){toast('Takaran harus antara 0 dan 100000.',true);return;}
     changes.push({id:input.dataset.recipeMat,amount:rounded(amount)});
   }
   if(!changes.length){toast('Belum ada takaran yang diisi untuk produk ini.',true);return;}
   if(!confirm(`Simpan ${changes.length} takaran untuk ${p.name}? Takaran lama pada bahan yang sama akan diperbarui.`))return;
   await mutate(()=>{invalidateRecipeApproval(p);p.globalRecipeOptOut=true;for(const ch of changes){const i=p.recipe.findIndex(r=>r.materialId===ch.id);if(ch.amount===0){if(i>=0)p.recipe.splice(i,1);}else if(i>=0)p.recipe[i].amount=ch.amount;else p.recipe.push({materialId:ch.id,amount:ch.amount});}});
   return;
 }
 if(form.id==='material-form'){
   const stock=Number(obj.stock);if(!Number.isFinite(stock)||stock<0){toast('Stok tidak valid.',true);return;}
   await mutate(()=>{data.materials.push({id:makeId('m'),name:obj.name.trim(),unit:obj.unit.trim(),stock:rounded(stock)});});return;
 }
 if(form.id==='product-form'){
   const name=obj.name.trim();if(data.products.some(p=>p.name.toLowerCase()===name.toLowerCase())){toast('Produk dengan nama itu sudah ada.',true);return;}
   await mutate(()=>{data.products.push({id:makeId('p'),name,aliases:obj.aliases.split(',').map(x=>x.trim()).filter(Boolean).slice(0,10),recipe:[]});});return;
 }
 if(form.classList.contains('recipe-form')){
   const amount=Number(obj.amount);if(!isPositive(amount)||amount>100000){toast('Jumlah bahan harus positif.',true);return;}
   await mutate(()=>{const p=data.products.find(p=>p.id===form.dataset.product);invalidateRecipeApproval(p);p.globalRecipeOptOut=true;const prev=p.recipe.find(r=>r.materialId===obj.materialId);if(prev)prev.amount=rounded(amount);else p.recipe.push({materialId:obj.materialId,amount:rounded(amount)});});return;
 }
}
async function signIn(email,password){
 const result=await authFetch('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},token:null});
 session=result;sessionStorage.setItem(SESSION_KEY,JSON.stringify(result));
 booting=true;cloudReady=false;cloudError='';safeRender();
 try{
   await loadCloud();cloudReady=true;
   $('#auth-dialog').close();draft=null;orderChat=null;chatHistory=[];chatDraftActive=false;currentPage='dashboard';toast('Berhasil masuk. Workspace tersimpan di Supabase.');
 }catch(err){cloudError=err.message||'Sinkronisasi gagal';console.error('Cloud sync:',err);toast('Login berhasil, tetapi data cloud belum terhubung: '+cloudError,true);}
 finally{booting=false;safeRender();}
}
async function signUp(email,password){
 const response=await authFetch('/auth/v1/signup',{method:'POST',body:{email,password},token:null});
 $('#auth-message').textContent=response.session?'Pendaftaran berhasil. Silakan masuk.':'Pendaftaran dikirim. Jika konfirmasi email diaktifkan, periksa inbox sebelum login.';
}
$('#auth-button').addEventListener('click',async()=>{
 if(session){if(!confirm('Keluar dari workspace cloud?'))return;try{await authFetch('/auth/v1/logout',{method:'POST'});}catch{}session=null;cloudReady=false;booting=false;sessionStorage.removeItem(SESSION_KEY);data=JSON.parse(localStorage.getItem(KEY)||'null')||makeSeed();draft=null;orderChat=null;chatHistory=[];chatDraftActive=false;safeRender();await mergeGlobalCatalog();await loadPublicRecipeLibrary();persistLocal();safeRender();toast('Keluar dari akun cloud.');return;}
 if(!CLOUD){toast('Isi public/config.js terlebih dahulu dengan Supabase URL dan anon key.',true);return;}
 $('#auth-message').textContent='';$('#auth-dialog').showModal();
});
$('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();const email=$('#auth-email').value.trim(),password=$('#auth-password').value;const msg=$('#auth-message');msg.textContent='Memproses login…';try{await signIn(email,password);}catch(err){msg.textContent=`Gagal masuk: ${err.message}`;}});
$('#register-button').addEventListener('click',async()=>{const msg=$('#auth-message');msg.textContent='Memproses pendaftaran…';try{await signUp($('#auth-email').value.trim(),$('#auth-password').value);}catch(err){msg.textContent=`Gagal mendaftar: ${err.message}`;}});
document.addEventListener('click',async ev=>{
 const chip=ev.target.closest('[data-chat-choice]');
 if(chip){ev.preventDefault();chatReply(chip.dataset.chatChoice);render();const log=$('#ran-chat-log');if(log)log.scrollTop=log.scrollHeight;return;}
 const filter=ev.target.closest('[data-order-filter]');if(filter){uiState.plannerStatus=filter.dataset.orderFilter;uiState.plannerQuery='';currentPage='planner';render();return;}
 const nav=ev.target.closest('[data-nav]');if(nav){currentPage=nav.dataset.nav;render();return;}
 const action=ev.target.closest('[data-action]');if(action){ev.preventDefault();await clickAction(action);}
});
document.addEventListener('submit',async ev=>{
 const form=ev.target;
 if(form.id==='ran-chat-form'){
   ev.preventDefault();
   const text=$('#ran-chat-input')?.value||'';
   chatReply(text);render();
   const field=$('#ran-chat-input');if(field)field.focus({preventScroll:true});
   const log=$('#ran-chat-log');if(log)log.scrollTop=log.scrollHeight;
   return;
 }
 if(form.matches('#material-form,#product-form,.recipe-form,#bulk-recipe-form')){ev.preventDefault();await handleForm(form);}
});
document.addEventListener('input',ev=>{
 if(ev.target.id==='order-text'){uiState.orderText=ev.target.value;return;}
 if(ev.target.id==='planner-search'){uiState.plannerQuery=ev.target.value;applyPlannerFilters();return;}
 if(ev.target.id==='catalog-search'){uiState.catalogQuery=ev.target.value;applyCatalogFilters();return;}
 if(ev.target.id==='ran-hub-search'){uiState.recipeHubQuery=ev.target.value;applyRecipeHubFilters();return;}
 if(ev.target.id==='material-search'){uiState.materialQuery=ev.target.value;applyMaterialFilters();return;}
});
document.addEventListener('change',async ev=>{
 if(ev.target.id==='approved-recipe-csv'){
   const file=ev.target.files?.[0];if(!file)return;
   try{
     if(file.size>1_500_000)throw Error('File CSV terlalu besar (maks. 1,5 MB).');
     if(!recipeReference){const res=await fetch('/recipe-reference.json',{cache:'no-store'});if(!res.ok)throw Error('Referensi resep tidak dapat dimuat.');recipeReference=await res.json();}
     const parsed=previewApprovedRecipeCSV(await file.text(),data,recipeReference);
     if(!parsed.ready.length){const first=parsed.pending.filter(x=>x.reason!=='Belum ada takaran/persetujuan yang diisi').slice(0,2).map(x=>x.name+': '+x.reason).join(' | ');throw Error('Belum ada satu produk pun yang memenuhi syarat impor. '+(first||'Isi CSV berdasarkan takaran pengrajin.'));}
     const rejected=parsed.pending.filter(x=>x.reason!=='Belum ada takaran/persetujuan yang diisi');
     if(rejected.length)throw Error('Ada '+rejected.length+' produk berisi data tidak lengkap: '+rejected.slice(0,2).map(x=>x.name+': '+x.reason).join(' | ')+'. Sempurnakan file sebelum mengimpor.');
     const msg=`Siap mengimpor ${parsed.ready.length} resep produk yang memiliki persetujuan lengkap. ${parsed.pending.length} produk belum terisi akan tetap seperti sebelumnya. Resep lama pada produk yang diimpor akan DIGANTI, sedangkan stok & pesanan tidak diubah. Pastikan backup data sudah dibuat. Lanjut?`;
     if(!confirm(msg))return;
     const next=applyApprovedRecipePreview(data,parsed);
     const saved=await mutate(()=>{data.products=next.products;});
     if(saved)toast(`${parsed.ready.length} resep disetujui berhasil tersimpan di ${session?'Supabase':'browser'}.`);
   }catch(err){toast('Impor resep: '+(err.message||'Data tidak valid'),true);}
   finally{ev.target.value='';}
   return;
 }
 if(ev.target.id==='planner-filter'){uiState.plannerStatus=ev.target.value;applyPlannerFilters();return;}
 if(ev.target.id==='catalog-filter'){uiState.catalogFilter=ev.target.value;applyCatalogFilters();return;}
 if(ev.target.id==='ran-hub-filter'){uiState.recipeHubFilter=ev.target.value;applyRecipeHubFilters();return;}
 if(ev.target.id==='catalog-import-file'){
   const file=ev.target.files?.[0]; if(!file)return;
   try{
     if(file.size>2_000_000)throw new Error('File JSON terlalu besar (maksimal 2 MB).');
     const incoming=JSON.parse(await file.text());
     const merged=mergeCatalogReference(data,incoming);const {counts}=merged;
     const summary=`Tambah ${counts.newProducts} produk & ${counts.newMaterials} bahan; lewati ${counts.productsSkipped} produk dan ${counts.materialsSkipped} bahan yang sudah ada. Resep dan stok lama dipertahankan. Takaran resep produk baru masih kosong.`;
     if(!confirm(summary+'\n\nLanjut impor? Disarankan backup data terlebih dahulu.'))return;
     const saved=await mutate(()=>{data.products=merged.products;data.materials=merged.materials;});
     if(saved)toast('Katalog referensi berhasil digabungkan. Isi komposisi bahan per unit dari data UMKM.');
   }catch(err){toast('Impor gagal: '+(err?.message||'Format tidak valid'),true);}
   finally{ev.target.value='';}
   return;
 }
 if(ev.target.id==='recipe-reference-product'){uiState.recipeProductId=ev.target.value;render();return;}
 if(ev.target.matches('[data-status-id]')){const {statusId}=ev.target.dataset;const value=ev.target.value;await mutate(()=>{const order=data.orders.find(x=>x.id===statusId);if(order)order.status=value;});}
});
// CRITICAL: Paint the app immediately. Never block the initial render on Supabase.
safeRender();
(async()=>{
 if(!CLOUD){await mergeGlobalCatalog();await loadPublicRecipeLibrary();persistLocal();safeRender();return;}
 try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}
 catch{session=null;sessionStorage.removeItem(SESSION_KEY);}
 if(!session){await mergeGlobalCatalog();await loadPublicRecipeLibrary();persistLocal();safeRender();return;}
 booting=true;safeRender();
 try{
   if(await ensureSession()){await loadCloud();cloudReady=true;cloudError='';}
   else{toast('Sesi login kedaluwarsa. Silakan masuk kembali.',true);await mergeGlobalCatalog();await loadPublicRecipeLibrary();persistLocal();}
 }catch(err){
   cloudReady=false;cloudError=err.message||'Kesalahan tidak dikenal';
   console.error('RANAKARA cloud bootstrap failed:',err);
   toast('Koneksi cloud bermasalah: '+cloudError,true);
 }finally{booting=false;safeRender();}
})();
