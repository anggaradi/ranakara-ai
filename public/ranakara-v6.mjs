/**
 * RANAKARA Smart Experience v6.
 * Additive UI layer: demo uses isolated synthetic data and real local NLP/MRP engines;
 * live operations only READ already-rendered content. No Supabase/localStorage writes.
 */
import { DEMO_MESSAGES, DEMO_RECIPE_NOTICE, newDemoWorkspace, analyseDemo, previewDemoPlan } from './ranakara-v6-demo-engine.mjs';

const main=document.querySelector('#app-content');
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false;
const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(n)||0);
const todayWita=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const el=(tag,cls='',value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=String(value);return node;};
const append=(parent,...children)=>{parent.append(...children);return parent;};
const button=(label,kind,fn)=>{const b=el('button','rv6-btn '+(kind||''),label);b.type='button';b.addEventListener('click',fn);return b;};
let modal=null,stage=0,scenario=null;
let demoText=DEMO_MESSAGES[0],demoWorkspace=newDemoWorkspace(),demoDraft=null,manualConfirm=false,demoDate='';
function notify(message){let live=document.querySelector('#rv6-live');if(!live){live=el('div','rv6-sr');live.id='rv6-live';live.setAttribute('role','status');live.setAttribute('aria-live','polite');document.body.append(live);}live.textContent=message;}
function navigate(page){(document.querySelector(`.sidebar [data-nav="${page}"]`)||document.querySelector(`.mobile-nav [data-nav="${page}"]`))?.click();}
function ensureModal(){
  if(modal)return;
  modal=document.createElement('dialog');modal.id='rv6-demo';modal.setAttribute('aria-labelledby','rv6-dialog-title');
  document.body.append(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
  modal.addEventListener('close',()=>{manualConfirm=false;});
}
function openDemo(){ensureModal();stage=0;demoText=DEMO_MESSAGES[0];demoWorkspace=newDemoWorkspace();demoDraft=null;manualConfirm=false;demoDate='';paintModal();modal.showModal();modal.querySelector('textarea')?.focus();}
function demoHeading(target){
  const top=el('div','rv6-demo-top');
  const brand=el('div');const title=el('h2','', 'Jelajahi RANAKARA AI');title.id='rv6-dialog-title';append(brand,el('span','rv6-kicker','MODE DEMO · TANPA LOGIN'),title);
  const close=button('×','rv6-close',()=>modal.close());close.setAttribute('aria-label','Tutup mode demo');append(top,brand,close);target.append(top);
  const desc=el('p','rv6-demo-desc','Gunakan mesin NLP lokal dan perhitungan bahan yang sama dengan aplikasi. Seluruh data di bawah adalah simulasi dan tidak disimpan.');target.append(desc);
  const steps=el('div','rv6-steps');['01 · Pesan','02 · AI','03 · Verifikasi','04 · Bahan'].forEach((s,i)=>{const item=el('span',`rv6-step ${i===stage?'active':i<stage?'done':''}`,s);steps.append(item);});target.append(steps);
}
function paintModal(){
  modal.replaceChildren();const shell=el('section','rv6-demo-shell');demoHeading(shell);
  const body=el('div','rv6-demo-body');shell.append(body);
  if(stage===0)paintDemoInput(body);
  if(stage===1)paintDemoAI(body);
  if(stage===2)paintDemoVerify(body);
  if(stage===3)paintDemoResult(body);
  modal.append(shell);
}
function paintDemoInput(body){
  body.append(el('h3','', 'Tempel pesan pelanggan'));
  body.append(el('p','rv6-muteline','Coba kalimat yang sudah disiapkan atau tulis pesanmu sendiri. Hasil AI dapat berbeda untuk pesan yang ambigu.'));
  const textarea=el('textarea','rv6-input');textarea.value=demoText;textarea.rows=4;textarea.maxLength=2500;textarea.setAttribute('aria-label','Pesan pelanggan untuk demo');
  textarea.addEventListener('input',()=>{demoText=textarea.value;});body.append(textarea);
  const picks=el('div','rv6-samples');DEMO_MESSAGES.forEach((msg,i)=>picks.append(button('Contoh '+(i+1),'rv6-chip',()=>{demoText=msg;textarea.value=msg;textarea.focus();})));body.append(picks);
  const foot=el('div','rv6-footer');foot.append(button('Analisis dengan NLP lokal →','rv6-primary',()=>{
    try{demoDraft=analyseDemo(demoText,demoWorkspace);stage=1;manualConfirm=false;paintModal();notify('Hasil ekstraksi AI tersedia untuk verifikasi.');}
    catch(e){notify('Analisis gagal: '+e.message);const error=el('p','rv6-error',e.message);body.querySelector('.rv6-error')?.remove();body.append(error);}
  }));body.append(foot);
}
function paintDemoAI(body){
  body.append(el('h3','', 'Hasil analisis NLP lokal'));
  body.append(el('p','rv6-muteline','Produk dan jumlah berikut adalah keluaran model, bukan pesanan yang sudah disetujui.'));
  const list=el('div','rv6-demo-products');
  demoDraft.items.forEach(item=>{const card=el('div','rv6-product');append(card,el('span','rv6-product-name',item.name),el('strong','',item.quantity===null?'Jumlah belum jelas':`${fmt(item.quantity)} unit`));card.append(el('small','',`Keyakinan model: ${item.confidence==='high'?'tinggi':item.confidence==='medium'?'sedang':'rendah'}`));list.append(card);});
  if(!demoDraft.items.length)list.append(el('p','rv6-error','Tidak ada produk katalog yang terbaca. Pilih contoh lain.'));body.append(list);
  if(demoDraft.notes)body.append(el('p','rv6-info',demoDraft.notes));
  if(demoDraft.questions.length){const q=el('div','rv6-warning');q.append(el('strong','',`Perlu klarifikasi (${demoDraft.questions.length})`));const ul=el('ul');demoDraft.questions.forEach(x=>ul.append(el('li','',x)));q.append(ul);body.append(q);}
  const foot=el('div','rv6-footer');append(foot,button('← Ubah pesan','rv6-secondary',()=>{stage=0;paintModal();}),button('Periksa hasil →','rv6-primary',()=>{stage=2;paintModal();}));body.append(foot);
}
function paintDemoVerify(body){
  body.append(el('h3','', 'Konfirmasi jumlah dan tanggal'));
  body.append(el('p','rv6-muteline','Ini adalah human-in-the-loop: kamu dapat mengoreksi hasil NLP sebelum simulasi kebutuhan bahan.'));
  const form=el('div','rv6-verify-list');
  demoDraft.items.forEach((item,i)=>{
    const itemRow=el('label','rv6-verify-row');const name=el('span','',item.name);
    const num=document.createElement('input');num.type='number';num.min='1';num.max='100000';num.step='1';num.value=item.quantity??'';num.placeholder='Isi jumlah';num.setAttribute('aria-label',`Jumlah ${item.name}`);
    num.addEventListener('input',()=>{const v=Number(num.value);item.quantity=num.value!==''&&Number.isSafeInteger(v)&&v>0&&v<=100000?v:null;});
    append(itemRow,name,num);form.append(itemRow);
  });body.append(form);
  const dateRow=el('label','rv6-date-label','Tanggal selesai (simulasi)');const date=document.createElement('input');date.type='date';date.min=todayWita();date.value=demoDate;date.addEventListener('change',()=>demoDate=date.value);dateRow.append(date);body.append(dateRow);
  const confirm=el('label','rv6-confirm');const check=document.createElement('input');check.type='checkbox';check.checked=manualConfirm;check.addEventListener('change',()=>manualConfirm=check.checked);confirm.append(check,el('span','', 'Saya sudah memeriksa jumlah, memilih tanggal, dan memahami bahwa pertanyaan AI yang ambigu harus dikonfirmasi kepada pelanggan.'));body.append(confirm);
  const error=el('p','rv6-error');error.hidden=true;body.append(error);
  const foot=el('div','rv6-footer');append(foot,button('← Hasil AI','rv6-secondary',()=>{stage=1;paintModal();}),button('Simulasikan kebutuhan →','rv6-primary',()=>{
    if(!manualConfirm){error.hidden=false;error.textContent='Centang konfirmasi terlebih dahulu.';return;}
    if(!demoDate||demoDate<todayWita()){error.hidden=false;error.textContent='Pilih tanggal hari ini atau setelahnya.';return;}
    const r=previewDemoPlan(demoDraft.items,demoWorkspace,demoDate);
    if(!r.ok){error.hidden=false;error.textContent=r.errors.join(' ');return;}
    scenario=r.plan;stage=3;paintModal();notify('Simulasi kebutuhan bahan selesai; tidak ada data pengguna yang berubah.');
  }));body.append(foot);
}
function paintDemoResult(body){
  body.append(el('h3','', 'Kebutuhan bahan — simulasi'));
  body.append(el('p','rv6-warning',DEMO_RECIPE_NOTICE));
  const summary=el('div','rv6-demo-summary');
  const shortages=scenario.rows.filter(r=>r.shortage>0);
  [['Pesanan simulasi','1'],['Jenis bahan kurang',String(shortages.length)],['Resep belum lengkap',String(scenario.missingRecipes.length)]].forEach(([k,v])=>{const card=el('div','rv6-summary-tile');append(card,el('small','',k),el('strong','',v));summary.append(card);});body.append(summary);
  const rows=el('div','rv6-demo-materials');scenario.rows.filter(r=>r.required>0).forEach(r=>{
    const div=el('div','rv6-material-row');
    const top=el('div','rv6-material-head');top.append(el('strong','',r.name),el('span','',`${fmt(r.required)} ${r.unit} perlu`));div.append(top);
    const bar=el('div','rv6-bar');const fill=el('span');fill.style.width=(r.required?Math.min(100,r.stock/r.required*100):100)+'%';bar.append(fill);div.append(bar);
    div.append(el('small',r.shortage>0?'rv6-critical':'rv6-ok',r.shortage>0?`Stok ${fmt(r.stock)} · kekurangan ${fmt(r.shortage)} ${r.unit}`:`Stok ${fmt(r.stock)} ${r.unit} · mencukupi`));rows.append(div);
  });body.append(rows);
  body.append(el('p','rv6-muteline','Simulasi tidak memengaruhi stok, pesanan, atau Supabase. Untuk perhitungan produksi sungguhan, isi resep terverifikasi milik UMKM.'));
  const foot=el('div','rv6-footer');append(foot,button('← Koreksi jumlah','rv6-secondary',()=>{stage=2;paintModal();}),button('Ulangi demo ↻','rv6-primary',()=>{stage=0;demoDraft=null;manualConfirm=false;demoDate='';scenario=null;paintModal();}));body.append(foot);
}
function addDemoTrigger(){const top=document.querySelector('.top-actions');if(!top||top.querySelector('#rv6-demo-trigger'))return;
  const b=button('✦ Demo Juri','rv6-demo-trigger',openDemo);b.id='rv6-demo-trigger';b.title='Coba simulasi aman tanpa login atau mengubah data';top.insertBefore(b,top.querySelector('#auth-button'));
}
function enhanceDashboard(){
  const hero=main?.querySelector('.hero-premium');if(!hero||hero.querySelector('.rv6-hero-demo'))return;
  const b=button('▶ Coba demo 2 menit','rv6-hero-demo',openDemo);const actions=hero.querySelector('.hero-steps');if(actions)actions.after(b);else hero.append(b);
  hero.querySelector('h2')?.setAttribute('data-v6-hero','');
}
function enhanceStudio(){
  const txt=main?.querySelector('#order-text');if(!txt||main.querySelector('.rv6-studio-flow'))return;
  const draftList=main.querySelector('#draft-list');
  const hasDraft=!!draftList;
  const q=hasDraft?main.querySelectorAll('.question').length:0;
  const entered=Boolean(txt.value.trim());
  const steps=el('div','rv6-studio-flow');
  append(steps,el('div',`rv6-flow-step ${entered?'rv6-active':''}`,'01  Tulis pesan'),el('div',`rv6-flow-step ${hasDraft?'rv6-active':''}`,'02  Analisis lokal'),el('div',`rv6-flow-step ${hasDraft?'rv6-current':''}`,'03  Verifikasi'),el('div','rv6-flow-step','04  Simpan'));
  const mainHeader=main.querySelector('.two-col')||main.firstElementChild;main.insertBefore(steps,mainHeader);
  if(hasDraft){
    const status=el('div','rv6-extraction-banner');append(status,el('strong','',`${draftList.querySelectorAll('.draft-item').length} item terdeteksi`),el('span','',q?`${q} hal perlu diklarifikasi sebelum menyimpan`:'Periksa produk, jumlah, dan tanggal sebelum menyimpan.'));
    const parent=draftList.closest('.card');parent?.insertBefore(status,draftList);
  }
  txt.addEventListener('input',()=>{const first=steps.querySelector('.rv6-flow-step');first.classList.toggle('rv6-active',Boolean(txt.value.trim()));});
}
function parseIdNumber(text){
  const match=String(text).match(/-?\d[\d.,]*/);if(!match)return NaN;
  const v=match[0].replace(/\./g,'').replace(',','.');return Number(v);
}
export function readPlannerTable(table){
  if(!table)return [];
  return [...table.querySelectorAll('tbody tr')].map(row=>{
    const td=[...row.querySelectorAll('td')];if(td.length<5)return null;
    const name=td[0].textContent.trim();const required=parseIdNumber(td[1].textContent);const stock=parseIdNumber(td[2].textContent);const shortage=parseIdNumber(td[3].textContent);
    const unit=(td[3].textContent||'').replace(/^[\s\d.,-]+/,'').trim()||'';
    return {name,required,stock,shortage,unit};
  }).filter(Boolean);
}
function clipText(text){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
  const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();let ok=false;try{ok=document.execCommand('copy');}finally{input.remove();}return ok?Promise.resolve():Promise.reject(new Error('Clipboard tidak tersedia.'));
}
function enhancePlanner(){
  if(!main||!main.querySelector('#planner-orders-table') && !main.querySelector('.stats-compact'))return;
  if(main.querySelector('.rv6-planner-visual'))return;
  const intro=main.querySelector('.stats-compact');const table=main.querySelector('.table-wrap table');if(!intro||!table)return;
  const materials=readPlannerTable(table);if(!materials.length)return;
  const relevant=materials.filter(r=>r.required>0);
  const shortage=relevant.filter(r=>r.shortage>0);
  const section=el('section','rv6-planner-visual');
  const head=el('div','rv6-planner-head');const label=el('div');append(label,el('div','rv6-kicker','PRODUCTION INTELLIGENCE'),el('h2','', 'Prioritas belanja bahan'),el('p','rv6-muteline','Perhitungan berdasarkan resep dan stok workspace yang sedang ditampilkan.'));
  const copy=button('Salin daftar belanja','rv6-secondary',async()=>{
    const list=shortage.map(r=>`• ${r.name}: ${fmt(r.shortage)} ${r.unit}`);
    const text=['RANAKARA — Daftar kekurangan bahan',...(list.length?list:['Tidak ada kekurangan bahan terhitung.']),'Catatan: cek resep belum lengkap sebelum membeli.'].join('\n');
    try{await clipText(text);notify('Daftar kebutuhan bahan disalin.');copy.textContent='✓ Tersalin';setTimeout(()=>copy.textContent='Salin daftar belanja',1800);}catch{notify('Clipboard tidak tersedia. Gunakan Unduh CSV.');}
  });append(head,label,copy);section.append(head);
  const grid=el('div','rv6-material-grid');
  (shortage.length?shortage.slice(0,6):relevant.slice(0,3)).forEach(r=>{
    const card=el('div','rv6-material-card');
    append(card,el('small',r.shortage>0?'rv6-critical':'rv6-ok',r.shortage>0?'Perlu disiapkan':'Stok mencukupi'),el('strong','',r.name));
    const metrics=el('div','rv6-material-metrics');append(metrics,el('span','',`Perlu ${fmt(r.required)} ${r.unit}`),el('span','',`Stok ${fmt(r.stock)} ${r.unit}`));card.append(metrics);
    const bar=el('div','rv6-bar');const fill=el('span');fill.style.width=(r.required?Math.min(100,r.stock/r.required*100):100)+'%';bar.append(fill);card.append(bar);
    card.append(el('p',r.shortage>0?'rv6-shortage':'rv6-zero',r.shortage>0?`Kurang ${fmt(r.shortage)} ${r.unit}`:'Cukup untuk pesanan aktif'));grid.append(card);
  });
  if(!relevant.length)grid.append(el('p','rv6-muteline','Belum ada kebutuhan bahan terhitung dari pesanan aktif.'));
  section.append(grid);
  if(main.querySelector('.notice.error'))section.append(el('p','rv6-warning','Perhatian: kebutuhan masih parsial karena ada resep produk yang belum lengkap.'));
  intro.after(section);
}
function decorate(){if(!main)return;try{enhanceDashboard();enhanceStudio();enhancePlanner();}catch(e){console.warn('RANAKARA v6 decoration skipped:',e);}}
addDemoTrigger();decorate();
if(main)new MutationObserver(records=>{if(records.some(r=>r.target===main))decorate();}).observe(main,{childList:true});
