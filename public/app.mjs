import { makeId, makeSeed, computePlan, rounded, isPositive, isISODate, validateOrder, normalizeAIOutput } from './engine.mjs';

const config=window.RANAKARA_CONFIG||{};
const CLOUD=Boolean(config.supabaseUrl && config.supabaseAnonKey);
const base=(config.supabaseUrl||'').replace(/\/$/,'');
const KEY='ranakara_demo_v1', SESSION_KEY='ranakara_cloud_session';
let data, session=null, draft=null, currentPage='dashboard', working=false;
try { data=JSON.parse(localStorage.getItem(KEY))||makeSeed(); } catch {data=makeSeed();}
if(!data || !Array.isArray(data.products)||!Array.isArray(data.orders)||!Array.isArray(data.materials))data=makeSeed();
const $=sel=>document.querySelector(sel);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const printNum=x=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(x||0);
const dateLabel=x=>x?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${x}T00:00:00Z`)):'Belum ditentukan';
const badge=s=>({new:'Baru',in_progress:'Diproses',completed:'Selesai',cancelled:'Dibatalkan'}[s]||s);
const toast=(message,error=false)=>{const t=$('#toast');t.textContent=message;t.className=`toast show ${error?'error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4800);};
const persistLocal=()=>{localStorage.setItem(KEY,JSON.stringify(data));};

async function authFetch(path,{method='GET',body,token=session?.access_token}={}){
  const res=await fetch(`${base}${path}`,{method,headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json',...(token?{'Authorization':`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const content=await res.text();let parsed;try{parsed=content?JSON.parse(content):null;}catch{parsed={message:content};}
  if(!res.ok)throw new Error(parsed?.msg||parsed?.message||parsed?.error_description||parsed?.error||`HTTP ${res.status}`);
  return parsed;
}
async function tryRefresh(){
  if(!session?.refresh_token)return false;
  try {const result=await authFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},token:null});session=result;sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));return true;}catch{return false;}
}
async function ensureSession(){
  if(!session)return false;
  try {await authFetch('/auth/v1/user');return true;}catch{if(await tryRefresh())return true;session=null;sessionStorage.removeItem(SESSION_KEY);return false;}
}
async function loadCloud(){
  if(!session?.user?.id)return;
  const rows=await authFetch(`/rest/v1/workspaces?select=data&user_id=eq.${encodeURIComponent(session.user.id)}`);
  if(rows.length && rows[0].data?.products){data=rows[0].data;}else{data=makeSeed();await saveCloud();}
}
async function saveCloud(){
  if(!session?.user?.id)throw new Error('Belum login.');
  const payload={user_id:session.user.id,data,updated_at:new Date().toISOString()};
  const endpoint=`/rest/v1/workspaces?on_conflict=user_id`;
  const headers={apikey:config.supabaseAnonKey,'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'};
  const send=()=>fetch(`${base}${endpoint}`,{method:'POST',headers,body:JSON.stringify(payload)});
  let response=await send();
  if(response.status===401 && await tryRefresh()){headers.Authorization=`Bearer ${session.access_token}`;response=await send();}
  if(!response.ok)throw new Error(`Cloud save gagal (HTTP ${response.status}). Jalankan schema.sql dan periksa RLS.`);
}
async function mutate(modifier){
  if(working)return;
  const backup=structuredClone(data);
  try {working=true;modifier();render();if(session)await saveCloud();else persistLocal();toast(session?'Perubahan tersimpan di cloud.':'Perubahan tersimpan di browser demo.');return true;}
  catch(err){data=backup;render();toast(err.message||'Gagal menyimpan.',true);return false;}
  finally{working=false;}
}
function banner(){
  if(data.sample)return `<div class="notice"><b>Data CONTOH.</b> Stok dan takaran resep pada katalog ini hanya ilustrasi untuk demo, bukan standar sarana upacara. Sesuaikan semua nilai dengan data UMKM sebelum digunakan atau diklaim dalam proposal.</div>`;
  return '';
}
function tableEmpty(message='Belum ada data.') {return `<div class="empty">${esc(message)}</div>`;}
function plan(){return computePlan(data.orders,data.products,data.materials);}
function dashboard(){
  const p=plan();const active=data.orders.filter(o=>['new','in_progress'].includes(o.status));
  const recent=[...data.orders].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,6);
  return `${banner()}<div class="hero"><div><div class="eyebrow">PRODUCTION INTELLIGENCE FOR BALI</div><h2>Dari percakapan pelanggan menjadi keputusan produksi yang lebih terukur.</h2><p>Proses pesanan menggunakan AI, verifikasi informasi ambigu, dan hitung kebutuhan material berdasarkan katalog usahamu.</p></div><button class="button primary" data-nav="studio">+ Proses pesanan baru</button></div>
  <div class="stats"><div class="stat"><small>Seluruh pesanan</small><strong>${data.orders.length}</strong><em>Dalam workspace</em></div><div class="stat"><small>Perlu diproses</small><strong>${active.length}</strong><em>Status baru / diproses</em></div><div class="stat"><small>Jenis produk</small><strong>${data.products.length}</strong><em>Katalog saat ini</em></div><div class="stat"><small>Material kurang</small><strong>${p.rows.filter(x=>x.shortage>0).length}</strong><em>Berdasarkan kebutuhan aktif</em></div></div>
  <div class="two-col"><div class="card"><div class="flex-between"><h3>Pesanan terbaru</h3><button class="button secondary small" data-nav="planner">Lihat semua</button></div>${recent.length?`<div class="table-wrap"><table><thead><tr><th>Pesanan</th><th>Tenggat</th><th>Status</th></tr></thead><tbody>${recent.map(o=>`<tr><td><strong>${esc(o.customer||'Tanpa nama')}</strong><br><span class="muted">${o.items.map(i=>`${esc(data.products.find(p=>p.id===i.productId)?.name||'Produk') } × ${i.quantity}`).join(', ')}</span></td><td>${dateLabel(o.dueDate)}</td><td><span class="status-chip ${o.status}">${badge(o.status)}</span></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('Belum ada pesanan. Mulai dari AI Order Studio.')}</div>
  <div class="card"><h3>Kebutuhan bahan aktif</h3><p class="hint">Total untuk pesanan Baru + Diproses. Stok tidak otomatis dikurangi saat pesanan selesai.</p>${p.rows.length?p.rows.slice(0,6).map(r=>`<div class="metric-row"><div><strong>${esc(r.name)}</strong><br><span class="muted">Perlu ${printNum(r.required)} ${esc(r.unit)}</span></div><span class="${r.shortage>0?'error-text':'success-text'}">${r.shortage>0?'Kurang '+printNum(r.shortage):'Cukup'}</span></div>`).join(''):tableEmpty('Tambahkan bahan di katalog.')}${p.missingRecipes.length?`<div class="notice error">Belum ada resep: ${esc(p.missingRecipes.join(', '))}</div>`:''}</div></div>`;
}
function catalogView(){
 const choices=data.materials.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.unit)})</option>`).join('');
 return `${banner()}<div class="col-2-equal"><div class="card"><h3>Tambah material</h3><form id="material-form" class="stacked-form"><label>Nama bahan<input name="name" required maxlength="100" placeholder="Misalnya janur" /></label><div class="field-row"><label>Satuan<input name="unit" required maxlength="20" placeholder="lembar / gram / pcs" /></label><label>Stok tersedia<input type="number" min="0" step="0.001" name="stock" value="0" required /></label></div><button class="button primary" type="submit">+ Simpan material</button></form></div>
 <div class="card"><h3>Tambah produk</h3><form id="product-form" class="stacked-form"><label>Nama produk<input name="name" maxlength="100" required placeholder="Misalnya canang sari" /></label><label>Alias / singkatan (pisahkan koma)<input name="aliases" maxlength="350" placeholder="canang, cnng" /></label><button class="button primary" type="submit">+ Simpan produk</button></form></div></div>
 <div class="section-header"><h2>Daftar bahan</h2><span class="badge">${data.materials.length} bahan</span></div><div class="card">${data.materials.length?`<div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Satuan</th><th>Stok tersedia</th><th>Aksi</th></tr></thead><tbody>${data.materials.map(m=>`<tr><td><strong>${esc(m.name)}</strong></td><td>${esc(m.unit)}</td><td><input class="small-input stock-input" data-material="${esc(m.id)}" type="number" min="0" step="0.001" value="${m.stock}" aria-label="Stok ${esc(m.name)}" /></td><td><button class="button secondary small" data-action="save-stock" data-id="${esc(m.id)}">Update</button> <button class="button danger small" data-action="delete-material" data-id="${esc(m.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('Belum ada bahan.')}</div>
 <div class="section-header"><h2>Produk & resep produksi</h2><span class="badge">${data.products.length} produk</span></div><div class="card">${data.products.length?data.products.map(p=>`<div class="recipe-block"><div class="flex-between"><div><h3 style="margin:0">${esc(p.name)}</h3><div class="hint">Alias: ${esc((p.aliases||[]).join(', ')||'—')}</div></div><button class="button danger small" data-action="delete-product" data-id="${esc(p.id)}">Hapus produk</button></div><div style="margin:12px 0">${p.recipe.length?p.recipe.map(r=>{const m=data.materials.find(x=>x.id===r.materialId);return `<span class="recipe-pill">${printNum(r.amount)} ${esc(m?.unit||'?')} ${esc(m?.name||'Bahan hilang')} <button class="button secondary small" data-action="delete-recipe" data-id="${esc(p.id)}" data-material="${esc(r.materialId)}" title="Hapus bahan dari resep">×</button></span>`;}).join(''):'<span class="muted">Belum ada komposisi bahan</span>'}</div><form class="recipe-form field-row three" data-product="${esc(p.id)}"><label>Bahan<select name="materialId" required>${choices}</select></label><label>Jumlah / 1 produk<input type="number" step="0.001" min="0.001" name="amount" required placeholder="Contoh: 2" /></label><label>Aksi<button type="submit" class="button secondary">+ Tambah ke resep</button></label></form><hr class="divider" /></div>`).join(''):tableEmpty('Tambahkan produk lebih dulu.')}</div>`;
}
function draftItem(row,i){return `<div class="draft-item" data-index="${i}"><label>Produk<select class="draft-product"><option value="">Pilih produk...</option>${data.products.map(p=>`<option value="${esc(p.id)}" ${p.id===row.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>Jumlah<input class="draft-qty" type="number" min="1" max="100000" step="1" value="${esc(row.quantity)}" /></label><div><div class="label-caption">Kepercayaan AI</div><span class="badge">${esc(row.confidence||'manual')}</span></div><button class="button danger small" data-action="remove-draft" data-index="${i}">Hapus</button>${row.rawName?`<div class="hint" style="grid-column:1/-1">Teks produk dari AI: <strong>${esc(row.rawName)}</strong>${row.sourceText?' · '+esc(row.sourceText):''}</div>`:''}</div>`;}
function studio(){return `<div class="two-col"><div class="card"><div class="flex-between"><h3>01 / Pesan pelanggan</h3><span class="badge">NLP · Structured AI</span></div><p class="hint">Tempel pesan tanpa nomor telepon, alamat, atau identitas pribadi. Untuk chat pelanggan nyata, minta izin dan minimalkan data.</p><label>Isi pesan<textarea id="order-text" maxlength="2500" placeholder="Bu, pesan 30 canang sama 12 pejati untuk Jumat pagi. Tolong konfirmasi jam pengambilan."></textarea></label><div class="button-row" style="margin-top:14px"><button class="button primary" id="ai-button" data-action="extract" ${!session?'disabled':''}>✦ Analisis dengan AI</button><button class="button secondary" data-action="manual-draft">+ Buat draf manual</button></div>${!session?`<div class="notice" style="margin-top:15px">AI belum aktif: ${CLOUD?'masuk akun Supabase terlebih dahulu.':'isi Supabase public config, jalankan SQL, lalu masukkan server environment variables di Netlify.'} Tombol draf manual tetap bisa diuji.</div>`:''}<div class="test-box"><b>Kenapa harus verifikasi?</b><p class="hint">AI tidak otomatis menyimpan pesanan, mengubah stok, atau menentukan tanggal yang tidak pasti. Setiap hasil diperiksa oleh pengguna.</p></div></div>
 <div class="card"><div class="flex-between"><h3>02 / Hasil ekstraksi & konfirmasi</h3><span class="badge">Human-in-the-loop</span></div>${draft?`${draft.questions.length?`<div class="notice"><strong>Perlu klarifikasi</strong><div style="margin-top:8px">${draft.questions.map(q=>`<p class="question">• ${esc(q)}</p>`).join('')}</div></div>`:''}<div id="draft-list" class="draft-list">${draft.items.map(draftItem).join('')}</div><div style="margin-top:10px"><button class="button secondary small" data-action="add-draft-item">+ Tambah produk</button></div><div class="field-row" style="margin-top:16px"><label>Nama pesanan (opsional)<input id="draft-customer" maxlength="90" placeholder="Contoh: Pesanan pelanggan A" /></label><label>Tanggal selesai<input id="draft-date" type="date" value="${esc(draft.delivery.date_iso)}" required /></label></div><div class="field-row" style="margin-top:13px"><label>Waktu / catatan jam<input id="draft-time" maxlength="80" value="${esc(draft.delivery.time_text)}" placeholder="Misalnya pagi; belum dikonfirmasi" /></label><label>Catatan produksi<input id="draft-notes" maxlength="500" value="${esc(draft.notes)}" placeholder="Catatan produksi" /></label></div><div class="button-row" style="margin-top:18px"><button class="button primary" data-action="confirm-order">✓ Konfirmasi & simpan pesanan</button><button class="button secondary" data-action="clear-draft">Batal</button></div><p class="hint">Tanggal wajib dipastikan oleh pengguna sebelum pesanan disimpan. Jika pilihan produk belum ditemukan, pilih produk katalog secara manual.</p>`:tableEmpty('Belum ada draf. Masukkan chat dan jalankan AI, atau buat draf manual untuk pengujian.')} </div></div>`;}
function planner(){const p=plan();const orderList=[...data.orders].sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));return `${banner()}<div class="stats"><div class="stat"><small>Pesanan aktif</small><strong>${p.activeCount}</strong><em>Status baru & diproses</em></div><div class="stat"><small>Material tercatat</small><strong>${p.rows.length}</strong><em>Dari katalog bahan</em></div><div class="stat"><small>Bahan perlu dibeli</small><strong>${p.rows.filter(x=>x.shortage>0).length}</strong><em>Jenis bahan kekurangan stok</em></div><div class="stat"><small>Resep belum lengkap</small><strong>${p.missingRecipes.length}</strong><em>Produk tanpa komposisi</em></div></div>
 <div class="section-header"><h2>Material requirement planning</h2><button class="button secondary small" data-action="download-csv">↓ Ekspor CSV</button></div><div class="card"><p class="hint">Perhitungan: Σ(jumlah produk × penggunaan bahan per unit). Kekurangan = max(0, kebutuhan − stok). Hanya pesanan Baru dan Diproses yang dihitung. Stok tidak otomatis berkurang.</p>${p.missingRecipes.length?`<div class="notice error">Perencanaan belum lengkap karena resep belum tersedia untuk: ${esc(p.missingRecipes.join(', '))}</div>`:''}${p.rows.length?`<div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Kebutuhan</th><th>Stok</th><th>Kekurangan</th><th>Status</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${printNum(r.required)} ${esc(r.unit)}</td><td>${printNum(r.stock)} ${esc(r.unit)}</td><td class="${r.shortage>0?'error-text':''}">${printNum(r.shortage)} ${esc(r.unit)}</td><td><span class="status-chip ${r.shortage>0?'in_progress':'completed'}">${r.shortage>0?'Beli / siapkan':'Cukup'}</span></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('Belum ada bahan.')}</div>
 <div class="section-header"><h2>Manajemen pesanan</h2><span class="badge">${data.orders.length} tercatat</span></div><div class="card">${orderList.length?`<div class="table-wrap"><table><thead><tr><th>Pesanan</th><th>Tenggat</th><th>Item</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${orderList.map(o=>`<tr><td><strong>${esc(o.customer||'Tanpa nama')}</strong><br><span class="muted">${esc(o.id.slice(0,18))}</span></td><td>${dateLabel(o.dueDate)}<br><span class="muted">${esc(o.dueTime||'—')}</span></td><td>${o.items.map(i=>`${esc(data.products.find(p=>p.id===i.productId)?.name||'Produk dihapus')} × ${i.quantity}`).join('<br>')}</td><td><select data-status-id="${esc(o.id)}"><option value="new" ${o.status==='new'?'selected':''}>Baru</option><option value="in_progress" ${o.status==='in_progress'?'selected':''}>Diproses</option><option value="completed" ${o.status==='completed'?'selected':''}>Selesai</option><option value="cancelled" ${o.status==='cancelled'?'selected':''}>Dibatalkan</option></select></td><td><button class="button danger small" data-action="delete-order" data-id="${esc(o.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div>`:tableEmpty('Belum ada pesanan. Buat pesanan dari AI Order Studio.')}</div>`;}
function guide(){return `<div class="two-col"><div class="card"><h3>Status kesiapan teknis</h3><div class="metric-row"><span>Mode data</span><strong>${session?'Supabase + RLS':CLOUD?'Demo lokal (belum login)':'Demo lokal browser'}</strong></div><div class="metric-row"><span>AI online</span><strong class="${session?'success-text':'error-text'}">${session?'Dapat dipanggil (jika key server aktif)':'Belum aktif'}</strong></div><div class="metric-row"><span>Katalog dan stok</span><strong>Fungsional</strong></div><div class="metric-row"><span>Perhitungan bahan</span><strong>Deterministik</strong></div><div class="metric-row"><span>URL hosting</span><strong>${esc(location.hostname)}</strong></div><div class="notice info" style="margin-top:20px">Sukses login tidak membuktikan API AI sudah siap. Jalankan pengujian ekstraksi dengan input baru dan catat hasilnya sebelum mengisi formulir lomba.</div><div class="button-row"><button class="button secondary" data-action="download-json">↓ Backup data JSON</button>${!session?'<button class="button danger" data-action="reset-demo">Reset data demo</button>':''}</div></div><div class="card"><h3>Checklist technical gate</h3><p class="hint">Mengikuti Panduan Peserta AI Web Innovation Challenge Bali DigiFest 2026.</p><div class="mini-list"><div><span>Website aktif & dapat diuji</span><span>Periksa URL Netlify</span></div><div><span>AI benar-benar dipanggil</span><span>Uji input baru</span></div><div><span>Data pesanan tersimpan</span><span>Uji reload</span></div><div><span>Repository & README</span><span>Lampirkan GitHub</span></div><div><span>AI / Technology Disclosure</span><span>Dokumen tersedia</span></div><div><span>Proposal PDF maks. 5 halaman isi</span><span>Susun setelah MVP valid</span></div></div><hr class="divider" /><p class="hint">Data contoh bahan hanya ilustrasi. Tidak ada integrasi WhatsApp langsung, OCR screenshot, forecasting permintaan, atau pemotongan stok otomatis pada versi ini.</p></div></div>`;}
function render(){
 const titles={dashboard:'Ringkasan Operasional',studio:'AI Order Studio',catalog:'Katalog Produk & Bahan',planner:'Rencana Produksi',guide:'Panduan & Verifikasi'};
 $('#page-title').textContent=titles[currentPage];
 $('#connection-status').textContent=session?'Cloud terhubung':CLOUD?'Demo lokal · belum login':'Mode demo lokal';
 $('#connection-status').className=`pill ${session?'good':'warn'}`;
 $('#auth-button').textContent=session?'Keluar':'Masuk / Daftar';
 document.querySelectorAll('[data-nav]').forEach(e=>e.classList.toggle('selected',e.dataset.nav===currentPage));
 $('#app-content').innerHTML=({dashboard,studio,catalog:catalogView,planner,guide}[currentPage])();
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
}
async function extract(){
 if(!session){toast('Masuk ke akun cloud untuk menggunakan AI.',true);return;}
 const text=$('#order-text')?.value?.trim();if(!text||text.length<4){toast('Masukkan teks pesanan minimal 4 karakter.',true);return;}
 if(!data.products.length){toast('Tambahkan produk di katalog terlebih dahulu.',true);return;}
 const button=$('#ai-button');button.disabled=true;button.textContent='Memproses AI…';
 try{
   if(!await ensureSession()){render();throw new Error('Sesi habis. Silakan masuk kembali.');}
   const response=await fetch('/.netlify/functions/extract-order',{
     method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
     body:JSON.stringify({text,catalog:data.products.map(p=>({id:p.id,name:p.name,aliases:p.aliases})),referenceDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Makassar'})})
   });
   const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);
   draft=normalizeAIOutput(result.result,data.products);draft.customer='';render();toast(`Analisis AI selesai (${result.model}). Mohon periksa semua bidang.`);
 }catch(err){toast(err.message||'Gagal menjalankan AI.',true);button.disabled=false;button.textContent='✦ Analisis dengan AI';}
}
async function clickAction(button){
 const a=button.dataset.action,id=button.dataset.id;
 if(a==='extract')return extract();
 if(a==='manual-draft'){draft={items:[{productId:'',quantity:1,rawName:'',confidence:'manual'}],delivery:{date_iso:'',time_text:'',raw_text:''},notes:'',questions:[],customer:''};render();toast('Draf manual dibuat; ini bukan keluaran AI.');return;}
 if(a==='add-draft-item'){readDraftFromUI();draft.items.push({productId:'',quantity:1,rawName:'',confidence:'manual'});render();return;}
 if(a==='remove-draft'){readDraftFromUI();draft.items.splice(Number(button.dataset.index),1);render();return;}
 if(a==='clear-draft'){draft=null;render();return;}
 if(a==='confirm-order'){
   readDraftFromUI();const items=draft.items.map(i=>({productId:i.productId,quantity:Number(i.quantity)}));
   const dueDate=draft.delivery.date_iso;const problems=validateOrder({items,dueDate},data.products);
   if(problems.length){toast(problems.join(' '),true);return;}
   const saved=await mutate(()=>{data.orders.push({id:makeId('order'),customer:draft.customer||'Pesanan tanpa nama',items,dueDate,dueTime:draft.delivery.time_text,notes:draft.notes,status:'new',createdAt:new Date().toISOString()});});
   if(saved){draft=null;currentPage='planner';render();}return;
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
 if(a==='delete-recipe'){await mutate(()=>{const p=data.products.find(p=>p.id===id);p.recipe=p.recipe.filter(r=>r.materialId!==button.dataset.material);});return;}
 if(a==='delete-order'){if(confirm('Hapus pesanan ini secara permanen?'))await mutate(()=>{data.orders=data.orders.filter(o=>o.id!==id);});return;}
 if(a==='reset-demo'){
   if(session){toast('Tidak tersedia saat mode cloud.',true);return;}
   if(confirm('Reset seluruh data demo browser?')){data=makeSeed();draft=null;persistLocal();render();toast('Data demo direset.');}return;
 }
 if(a==='download-csv'){
   const rows=[['Bahan','Kebutuhan','Stok','Kekurangan','Satuan'],...plan().rows.map(r=>[r.name,r.required,r.stock,r.shortage,r.unit])];
   return download('ranakara-kebutuhan-bahan.csv','\ufeff'+rows.map(a=>a.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');
 }
 if(a==='download-json')return download('ranakara-backup.json',JSON.stringify(data,null,2),'application/json');
}
function download(name,content,mime){const file=new Blob([content],{type:mime});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function handleForm(form){
 const obj=Object.fromEntries(new FormData(form));
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
   await mutate(()=>{const p=data.products.find(p=>p.id===form.dataset.product);const prev=p.recipe.find(r=>r.materialId===obj.materialId);if(prev)prev.amount=rounded(amount);else p.recipe.push({materialId:obj.materialId,amount:rounded(amount)});});return;
 }
}
async function signIn(email,password){
 const result=await authFetch('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},token:null});
 session=result;sessionStorage.setItem(SESSION_KEY,JSON.stringify(result));
 await loadCloud();$('#auth-dialog').close();draft=null;currentPage='dashboard';render();toast('Berhasil masuk. Workspace tersimpan di Supabase.');
}
async function signUp(email,password){
 const response=await authFetch('/auth/v1/signup',{method:'POST',body:{email,password},token:null});
 $('#auth-message').textContent=response.session?'Pendaftaran berhasil. Silakan masuk.':'Pendaftaran dikirim. Jika konfirmasi email diaktifkan, periksa inbox sebelum login.';
}
$('#auth-button').addEventListener('click',async()=>{
 if(session){if(!confirm('Keluar dari workspace cloud?'))return;try{await authFetch('/auth/v1/logout',{method:'POST'});}catch{}session=null;sessionStorage.removeItem(SESSION_KEY);data=JSON.parse(localStorage.getItem(KEY)||'null')||makeSeed();draft=null;render();toast('Keluar dari akun cloud.');return;}
 if(!CLOUD){toast('Isi public/config.js terlebih dahulu dengan Supabase URL dan anon key.',true);return;}
 $('#auth-message').textContent='';$('#auth-dialog').showModal();
});
$('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();const email=$('#auth-email').value.trim(),password=$('#auth-password').value;const msg=$('#auth-message');msg.textContent='Memproses login…';try{await signIn(email,password);}catch(err){msg.textContent=`Gagal masuk: ${err.message}`;}});
$('#register-button').addEventListener('click',async()=>{const msg=$('#auth-message');msg.textContent='Memproses pendaftaran…';try{await signUp($('#auth-email').value.trim(),$('#auth-password').value);}catch(err){msg.textContent=`Gagal mendaftar: ${err.message}`;}});
document.addEventListener('click',async ev=>{
 const nav=ev.target.closest('[data-nav]');if(nav){currentPage=nav.dataset.nav;render();return;}
 const action=ev.target.closest('[data-action]');if(action){ev.preventDefault();await clickAction(action);}
});
document.addEventListener('submit',async ev=>{const form=ev.target;if(form.matches('#material-form,#product-form,.recipe-form')){ev.preventDefault();await handleForm(form);}});
document.addEventListener('change',async ev=>{
 if(ev.target.matches('[data-status-id]')){const {statusId}=ev.target.dataset;const value=ev.target.value;await mutate(()=>{const order=data.orders.find(x=>x.id===statusId);if(order)order.status=value;});}
});
(async()=>{
 if(CLOUD){try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(session){if(await ensureSession())await loadCloud();else toast('Sesi login kedaluwarsa. Masuk kembali.',true);}}catch(err){session=null;sessionStorage.removeItem(SESSION_KEY);toast('Cloud belum dapat diakses: '+err.message,true);}}
 render();
})();
