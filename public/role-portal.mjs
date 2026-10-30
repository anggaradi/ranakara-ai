/** RANAKARA buyer/seller experience split. Role choice is NOT authentication. */
import {ChatOrderAssistant} from './chat-order-assistant.mjs';
import {cleanCatalog,normalizeCart,changeCart,fromAI,formatBuyerMessage} from './buyer-core.mjs';
import {makeSeed} from './engine.mjs';
import {applyGlobalReference} from './global-catalog.mjs';
const ROLE_KEY='ranakara_role_view_v1';
const CART_KEY='ranakara_buyer_request_v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=[];let cart=[];let search='';let expanded=false;
let assistant=null;let messages=[];let loaded=false;
const role=()=>document.documentElement.dataset.ranakaraRole;
function chooseRole(next){
  // A view switch is not an authorization boundary: end cloud session before leaving seller.
  if(next==='choose' && role()==='seller' && sessionStorage.getItem('ranakara_cloud_session')){
    if(!confirm('Keluar dari akun penjual dan ganti tampilan?'))return;
    sessionStorage.removeItem('ranakara_cloud_session');
    try{localStorage.removeItem(ROLE_KEY);}catch{}
    window.location.reload();return;
  }
  if(next==='buyer'||next==='seller'){
    try{localStorage.setItem(ROLE_KEY,next);}catch{}
    document.documentElement.dataset.ranakaraRole=next;
    if(next==='buyer')loadBuyer();
  }else{
    try{localStorage.removeItem(ROLE_KEY);}catch{}
    document.documentElement.dataset.ranakaraRole='choose';
  }
  window.scrollTo(0,0);
}
function status(message,isError=false){const el=$('#rp-status');el.textContent=message;el.classList.toggle('rp-error',isError);}
function loadRequest(){
  try{const v=JSON.parse(sessionStorage.getItem(CART_KEY)||'{}');cart=normalizeCart(v.cart,catalog);$('#rp-date').value=v.date||'';$('#rp-time').value=v.time||'';$('#rp-note').value=v.note||'';}
  catch{cart=[];}
}
function saveRequest(){
  try{sessionStorage.setItem(CART_KEY,JSON.stringify({cart,date:$('#rp-date').value,time:$('#rp-time').value,note:$('#rp-note').value}));}catch{}
}
function showCatalog(){
  const q=search.trim().toLocaleLowerCase('id-ID');
  const matches=catalog.filter(p=>[p.name,...p.aliases].some(x=>x.toLocaleLowerCase('id-ID').includes(q)));
  const shown=q||expanded?matches:matches.slice(0,8);
  $('#rp-products').innerHTML=shown.length?shown.map(p=>{
    const count=cart.find(x=>x.id===p.id)?.quantity||0;
    return `<article class="rp-product"><div><strong>${esc(p.name)}</strong><small>${esc((p.aliases||[]).slice(0,2).join(' · ')||'Produk katalog upakara')}</small></div><button type="button" class="rp-add" data-portal-action="add" data-product-id="${esc(p.id)}" aria-label="Tambah ${esc(p.name)}">${count?`Tambah lagi (${count})`:'+ Tambah'}</button></article>`;
  }).join(''):'<div class="rp-empty">Produk tidak ditemukan. Coba kata lain atau tanyakan langsung kepada penjual.</div>';
  $('#rp-more').hidden=!!q||expanded||matches.length<=8;
}
function showCart(){
  const root=$('#rp-cart-list');
  const count=cart.reduce((n,x)=>n+x.quantity,0);
  $('#rp-cart-count').textContent=`${count} unit`;
  root.innerHTML=!cart.length?'<div class="rp-cart-empty">Belum ada pilihan. Mulai dengan menekan <strong>Tambah</strong> pada produk.</div>':cart.map(x=>{
    const p=catalog.find(p=>p.id===x.id);
    return `<div class="rp-cart-item"><div><strong>${esc(p.name)}</strong><small>Jumlah: ${x.quantity} unit</small></div><div class="rp-stepper"><button type="button" data-portal-action="decrease" data-product-id="${esc(x.id)}" aria-label="Kurangi ${esc(p.name)}">−</button><span aria-label="${x.quantity} unit">${x.quantity}</span><button type="button" data-portal-action="add" data-product-id="${esc(x.id)}" aria-label="Tambah ${esc(p.name)}">+</button></div></div>`;
  }).join('');
  $('#rp-copy').disabled=!cart.length;
}
function render(){if(!loaded)return;showCatalog();showCart();}
function startChat(){
  if(!catalog.length)return;
  assistant=new ChatOrderAssistant({catalog,mode:'buyer'});
  messages=[{role:'assistant',text:assistant.hello().messages.join('\n'),choices:[]}];
  renderChat();
}
function renderChat(){
  if(!assistant)return;
  $('#rp-chat-log').innerHTML=messages.map((m,i)=>`<div class="rp-chat-bubble ${m.role==='user'?'rp-chat-user':'rp-chat-ai'}"><span>${m.role==='user'?'Anda':'RANAKARA AI'}</span><p>${esc(m.text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}</p>${i===messages.length-1?m.choices.map(c=>`<button type="button" class="rp-chip" data-portal-action="chat-choice" data-value="${esc(c.value)}">${esc(c.label)}</button>`).join(''):''}</div>`).join('');
  const summary=assistant.getSummary();
  const parsed=fromAI(summary,catalog);
  $('#rp-chat-results').innerHTML=parsed?`<div class="rp-ready"><strong>Draf dapat digunakan</strong><p>${summary.items.map(x=>`${esc(x.name)}: ${x.quantity}`).join(' · ')}${summary.dateLabel?`<br>Tanggal: ${esc(summary.dateLabel)}`:''}</p><button type="button" class="rp-primary" data-portal-action="use-ai">Masukkan ke permintaan saya</button></div>`:'';
  $('#rp-chat-log').scrollTop=$('#rp-chat-log').scrollHeight;
}
function sendChat(text){
  if(!assistant)return;
  const safe=String(text||'').trim().slice(0,1500);
  if(safe)messages.push({role:'user',text:safe,choices:[]});
  try{
    const response=assistant.send(safe);
    messages.push({role:'assistant',text:(response.messages||[]).join('\n')||'Mohon jelaskan nama produk, jumlah, dan tanggal yang dimaksud.',choices:response.choices||[]});
  }catch(e){messages.push({role:'assistant',text:'Pesan belum dapat dipahami. Coba tulis nama upakara, jumlah, dan tanggal secara sederhana.',choices:[]});}
  if(messages.length>60)messages=messages.slice(-60);
  renderChat();
}
async function loadBuyer(){
  if(loaded){render();return;}
  try{
    const res=await fetch('/global-catalog.json',{cache:'no-store'});
    if(!res.ok)throw Error('Katalog gagal diunduh');
    // Use the SAME catalog/aliases as seller AI Studio; raw public JSON lacks common shorthand (e.g. 'canang').
    const reference=await res.json();
    catalog=cleanCatalog({products:applyGlobalReference(makeSeed(),reference).workspace.products});
    if(!catalog.length)throw Error('Katalog belum berisi produk');
    loaded=true;loadRequest();$('#rp-date').min=new Date(Date.now()+8*3600000).toISOString().slice(0,10);startChat();render();status('Permintaan masih berupa draf. Tidak ada pembayaran atau pengiriman otomatis.');
  }catch(err){
    $('#rp-products').innerHTML=`<div class="rp-empty">Katalog belum dapat dibuka. Periksa koneksi lalu <button type="button" data-portal-action="retry">coba lagi</button>.</div>`;
    status('Katalog belum termuat. Permintaan belum dapat dibuat.',true);
  }
}
document.addEventListener('click',async e=>{
  const choice=e.target.closest('[data-role-choice]');
  if(choice){chooseRole(choice.dataset.roleChoice);return;}
  const el=e.target.closest('[data-portal-action]');if(!el)return;
  const action=el.dataset.portalAction;
  if(action==='choose-role'){chooseRole('choose');return;}
  if(role()!=='buyer')return;
  if(action==='retry'){await loadBuyer();return;}
  if(action==='focus-chat'){document.querySelector('#rp-chat-input')?.focus();document.querySelector('#rp-chat-title')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(action==='chat-example'){sendChat(el.dataset.example);document.querySelector('#rp-chat-input')?.focus();return;}
  if(action==='show-more'){expanded=true;showCatalog();return;}
  if(action==='add'||action==='decrease'){
    cart=changeCart(cart,el.dataset.productId,action==='add'?1:-1,catalog);
    saveRequest();render();status('Daftar pilihan diperbarui. Belum dikirim ke penjual.');return;
  }
  if(action==='chat-choice'){sendChat(el.dataset.value);return;}
  if(action==='reset-chat'){startChat();return;}
  if(action==='use-ai'){
    const result=fromAI(assistant?.getSummary(),catalog);
    if(!result){status('Draf AI masih perlu klarifikasi.',true);return;}
    if(cart.length&&!confirm('Ganti daftar pilihan yang sekarang dengan hasil AI?'))return;
    cart=result.cart;
    if(result.date)$('#rp-date').value=result.date;
    if(result.time)$('#rp-time').value=result.time;
    saveRequest();render();status('Hasil AI masuk ke daftar. Periksa sebelum menyalin pesan.');return;
  }
  if(action==='copy-order'){
    const chosenDate=$('#rp-date').value;
    if(chosenDate && chosenDate < new Date(Date.now()+8*3600000).toISOString().slice(0,10)){status('Tanggal yang dipilih sudah lewat. Silakan pilih tanggal hari ini atau berikutnya.',true);return;}
    const text=formatBuyerMessage({cart,catalog,date:$('#rp-date').value,time:$('#rp-time').value,note:$('#rp-note').value});
    if(!text){status('Pilih setidaknya satu upakara terlebih dahulu.',true);return;}
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.left='-10000px';document.body.append(t);t.select();if(!document.execCommand('copy'))throw Error('Salin gagal');t.remove();}
      status('Pesan berhasil disalin. Tempel lalu kirim kepada penjual melalui kanal pilihan Anda. Pesanan BELUM terkirim melalui RANAKARA.');
    }catch{status('Browser tidak mengizinkan menyalin otomatis. Coba gunakan koneksi HTTPS atau izin clipboard browser.',true);}
  }
});
document.addEventListener('input',e=>{
  if(role()!=='buyer')return;
  if(e.target.id==='rp-search'){search=e.target.value;showCatalog();}
  if(['rp-date','rp-time','rp-note'].includes(e.target.id))saveRequest();
});
document.addEventListener('change',e=>{
  if(role()!=='buyer')return;
  if(['rp-date','rp-time','rp-note'].includes(e.target.id))saveRequest();
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='rp-chat-form')return;
  e.preventDefault();
  if(role()!=='buyer')return;
  const field=$('#rp-chat-input');sendChat(field.value);field.value='';field.focus();
});
if(role()==='buyer')loadBuyer();
