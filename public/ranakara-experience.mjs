/** RANAKARA Experience v4 — additive interactions. Independent of Supabase and NLP.
 * Deliberately never writes business data; does not modify app.mjs or config.js.
 * Features: WITA clock, command palette, catalog jump, guided tour, subtle motion,
 * text-ready feedback, and scroll aid. No third-party resources.
 */
const main = document.querySelector('#app-content');
const topbarActions = document.querySelector('.top-actions');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
const navOptions = [
  {id:'dashboard', title:'Ringkasan',description:'Dashboard operasional',icon:'▤'},
  {id:'studio',title:'AI Order Studio',description:'Analisis pesan pelanggan',icon:'✦'},
  {id:'catalog',title:'Katalog & Bahan',description:'Cari produk dan isi resep',icon:'▦'},
  {id:'planner',title:'Rencana Produksi',description:'Pesanan, stok, dan kebutuhan bahan',icon:'☷'},
  {id:'guide',title:'Panduan & Verifikasi',description:'Kesiapan teknis MVP',icon:'ⓘ'},
];
const tourSteps = [
  {title:'Pantau seluruh pesanan',page:'dashboard',desc:'Ringkasan menampilkan jumlah pesanan, tahapan produksi, kekurangan bahan, dan pesanan yang mendekati tenggat. Setiap angka berasal dari workspace aktif.',label:'01 · Ringkasan'},
  {title:'Ubah chat menjadi draf',page:'studio',desc:'Tempel pesan pelanggan lalu jalankan RANAKARA-NLP lokal. Hasil wajib diperiksa dan dikonfirmasi; AI tidak langsung membuat transaksi.',label:'02 · AI Order Studio'},
  {title:'Rawat resep milik UMKM',page:'catalog',desc:'Cari produk upakara, kelola alias untuk NLP, isi resep per unit sesuai pengrajin, lalu sesuaikan stok bahan.',label:'03 · Katalog & Bahan'},
  {title:'Rencanakan kebutuhan produksi',page:'planner',desc:'Lihat kebutuhan bahan dari pesanan aktif, periksa kekurangan stok, dan perbarui status pengerjaan.',label:'04 · Rencana Produksi'},
];
let catalogCache=[];
let catalogPromise=null;
let palette=null, paletteInput=null, paletteResults=null;
let paletteMatches=[];
let selectedIndex=0;
let tour=null,tourIndex=0;
let scrollButton=null;
function el(tag,attrs={},text=''){
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==='className')node.className=v;
    else if(k==='type')node.type=v;
    else node.setAttribute(k,v);
  }
  if(text)node.textContent=text;
  return node;
}
function navigate(page,query=''){
  const nav=document.querySelector(`.sidebar [data-nav="${page}"]`)||document.querySelector(`.mobile-nav [data-nav="${page}"]`);
  if(!nav)return;
  nav.click();
  if(page==='catalog' && query){
    const field=document.querySelector('#catalog-search');
    if(field){ field.value=query;field.dispatchEvent(new Event('input',{bubbles:true}));field.scrollIntoView({block:'center',behavior:reduceMotion?'instant':'smooth'});field.focus({preventScroll:true}); }
  }else if(page==='studio'){
    document.querySelector('#order-text')?.focus({preventScroll:true});
  }
}
function mkClock(){
  if(!topbarActions||document.querySelector('.rv4-top-clock'))return;
  const clock=el('span',{className:'rv4-top-clock','aria-label':'Waktu Bali WITA'});
  topbarActions.insertBefore(clock,topbarActions.firstChild);
  const update=()=>{clock.textContent=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' WITA';};
  update();window.setInterval(update,60000);
}
function ensurePalette(){
  if(palette)return;
  palette=el('dialog',{id:'rv4-command','aria-label':'Cari dan pindah halaman'});
  const heading=el('div',{className:'rv4-modal-title'});
  heading.append(el('span',{},'PENCARIAN CEPAT · RANAKARA'));
  const close=el('button',{type:'button',className:'rv4-modal-close','aria-label':'Tutup pencarian'},'×');close.addEventListener('click',()=>palette.close());heading.append(close);
  paletteInput=el('input',{type:'search',id:'rv4-command-input',placeholder:'Cari halaman atau produk upakara…',autocomplete:'off','aria-label':'Cari halaman atau produk'});
  paletteResults=el('div',{className:'rv4-results',id:'rv4-results'});
  const hint=el('p',{className:'rv4-command-hint'},'↑↓ memilih · Enter membuka · Esc menutup · ⌘K / Ctrl K');
  palette.append(heading,paletteInput,paletteResults,hint);document.body.append(palette);
  paletteInput.addEventListener('input',paintMatches);
  paletteInput.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){e.preventDefault();selectedIndex=Math.min(selectedIndex+1,paletteMatches.length-1);paintActive();}
    if(e.key==='ArrowUp'){e.preventDefault();selectedIndex=Math.max(0,selectedIndex-1);paintActive();}
    if(e.key==='Enter' && paletteMatches[selectedIndex]){e.preventDefault();activate(paletteMatches[selectedIndex]);}
  });
  palette.addEventListener('click',e=>{if(e.target===palette)palette.close();});
  mkSearchTrigger();
}
function mkSearchTrigger(){
 if(!topbarActions||topbarActions.querySelector('.rv4-command-trigger'))return;
 const b=el('button',{type:'button',className:'rv4-command-trigger','aria-label':'Buka pencarian cepat'},'');
 const t=el('span',{className:'rv4-search-text'},'Cari fitur');
 b.append(el('span',{},'⌕'),t,el('kbd',{},'⌘K'));
 b.addEventListener('click',openPalette);
 const auth=topbarActions.querySelector('#auth-button');topbarActions.insertBefore(b,auth||null);
}
function safeCatalog(){
 if(catalogPromise)return catalogPromise;
 catalogPromise=fetch('/global-catalog.json',{cache:'force-cache'}).then(r=>r.ok?r.json():null).then(j=>{
  catalogCache=Array.isArray(j?.products)?j.products.filter(p=>p&&typeof p.name==='string').slice(0,100):[];
  return catalogCache;
 }).catch(()=>{catalogCache=[];return []});
 return catalogPromise;
}
async function openPalette(){
 ensurePalette();paletteInput.value='';selectedIndex=0;paintMatches();palette.showModal();paletteInput.focus();
 await safeCatalog();if(palette.open)paintMatches();
}
function getMatches(query){
 const q=query.trim().toLocaleLowerCase('id-ID');
 const pages=navOptions.filter(n=>!q||(n.title+' '+n.description).toLocaleLowerCase('id-ID').includes(q)).map(n=>({...n,type:'page'}));
 if(!q)return pages;
 const products=catalogCache.filter(p=>[p.name,...(p.aliases||[])].join(' ').toLocaleLowerCase('id-ID').includes(q)).slice(0,7).map(p=>({type:'product',id:p.id,title:p.name,description:'Temukan di katalog',icon:'✿'}));
 return [...pages,...products].slice(0,11);
}
function paintMatches(){
 paletteMatches=getMatches(paletteInput.value);selectedIndex=0;paletteResults.replaceChildren();
 if(!paletteMatches.length){paletteResults.append(el('div',{className:'rv4-empty'},'Tidak ada hasil. Coba nama halaman atau produk lain.'));return;}
 paletteMatches.forEach((item,index)=>{
   const btn=el('button',{type:'button',className:'rv4-result'+(index===0?' rv4-active':''),'data-result-index':String(index)});
   const left=el('span',{className:'rv4-result-left'});left.append(el('span',{className:'rv4-result-ico','aria-hidden':'true'},item.icon));
   const info=el('span');info.append(el('strong',{},item.title),el('small',{},item.description));left.append(info);
   btn.append(left,el('span',{className:'rv4-result-flag','aria-hidden':'true'},item.type==='page'?'Halaman':'Produk'));
   btn.addEventListener('click',()=>activate(item));paletteResults.append(btn);
 });
}
function paintActive(){
 paletteResults.querySelectorAll('.rv4-result').forEach((e,i)=>e.classList.toggle('rv4-active',i===selectedIndex));
 paletteResults.querySelectorAll('.rv4-result')[selectedIndex]?.scrollIntoView({block:'nearest'});
}
function activate(item){
 palette.close();
 if(item.type==='product')navigate('catalog',item.title);
 else navigate(item.id);
}
function ensureTour(){
 if(tour)return;
 tour=el('dialog',{id:'rv4-tour','aria-label':'Tur interaktif RANAKARA AI'});
 const heading=el('div',{className:'rv4-modal-title'});
 heading.append(el('span',{},'JELAJAH RANAKARA AI'));
 const close=el('button',{type:'button',className:'rv4-modal-close','aria-label':'Tutup tur'},'×');close.addEventListener('click',()=>tour.close());heading.append(close);
 const body=el('div',{className:'rv4-tour-body'});
 body.innerHTML='<div class="rv4-tour-step"></div><h2></h2><p></p><div class="rv4-tour-visual" aria-hidden="true"><span>✦</span> PESAN → VERIFIKASI → PRODUKSI</div><div class="rv4-tour-nav"><div class="rv4-tour-dots" aria-hidden="true"></div><div class="button-row"><button type="button" class="button secondary small" data-rv4-prev>Kembali</button><button type="button" class="rv4-tour-next" data-rv4-next>Berikutnya →</button></div></div><button type="button" class="button secondary" data-rv4-view style="width:100%;margin-top:14px">Buka halaman ini</button>';
 body.querySelector('[data-rv4-prev]').addEventListener('click',()=>{tourIndex=Math.max(0,tourIndex-1);paintTour();});
 body.querySelector('[data-rv4-next]').addEventListener('click',()=>{if(tourIndex===tourSteps.length-1){tour.close();return;}tourIndex++;paintTour();});
 body.querySelector('[data-rv4-view]').addEventListener('click',()=>{const page=tourSteps[tourIndex].page;tour.close();navigate(page);});
 tour.append(heading,body);document.body.append(tour);
 tour.addEventListener('click',e=>{if(e.target===tour)tour.close();});
}
function paintTour(){
 const step=tourSteps[tourIndex];const body=tour.querySelector('.rv4-tour-body');
 body.querySelector('.rv4-tour-step').textContent=`${step.label} · ${tourIndex+1} DARI ${tourSteps.length}`;
 body.querySelector('h2').textContent=step.title;
 body.querySelector('p').textContent=step.desc;
 const dots=body.querySelector('.rv4-tour-dots');dots.replaceChildren();
 tourSteps.forEach((_,i)=>dots.append(el('i',{className:i===tourIndex?'active':''})));
 body.querySelector('[data-rv4-prev]').disabled=tourIndex===0;
 body.querySelector('[data-rv4-next]').textContent=tourIndex===tourSteps.length-1?'Selesai ✓':'Berikutnya →';
}
function openTour(){ensureTour();tourIndex=0;paintTour();tour.showModal();}
function addHeroArt(){
 const hero=main?.querySelector('.hero-premium');if(!hero)return;
 if(!hero.querySelector('.rv4-hero-art')){
   const art=el('div',{className:'rv4-hero-art','aria-hidden':'true'});
   art.append(el('div',{className:'rv4-art-rim'}),el('div',{className:'rv4-art-icon'}));
   for(let i=0;i<4;i++)art.append(el('i',{className:'rv4-art-leaf'}));
   art.append(el('span',{className:'rv4-art-caption'},'WARISAN · TEKNOLOGI'));
   hero.insertBefore(art,hero.firstChild);
 }
 if(!hero.querySelector('.rv4-tour-trigger')){
   const b=el('button',{type:'button',className:'rv4-tour-trigger'},'Jelajahi fitur ↗');
   b.addEventListener('click',openTour);
   (hero.querySelector('.hero-steps')||hero).append(b);
 }
}
function animateNum(elNode){
 if(reduceMotion||!elNode||elNode.dataset.rv4Done)return;
 const num=Number(elNode.textContent.replace(/[^0-9]/g,''));
 if(!Number.isInteger(num)||num<1||num>100000)return;
 elNode.dataset.rv4Done='yes';
 const finalText=elNode.textContent;
 elNode.setAttribute('aria-label',finalText);
 const t0=performance.now();const duration=500;
 function frame(now){
   if(!elNode.isConnected)return;
   const x=Math.min(1,(now-t0)/duration);
   elNode.textContent=new Intl.NumberFormat('id-ID').format(Math.round(num*(1-Math.pow(1-x,3))));
   if(x<1)requestAnimationFrame(frame);else elNode.textContent=finalText;
 }
 requestAnimationFrame(frame);
}
let revealObserver = null;
function updatePageMotion(){
 if(!main)return;
 addHeroArt();
 if(revealObserver)revealObserver.disconnect();
 if(!reduceMotion && 'IntersectionObserver' in window){
   revealObserver = new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){e.target.classList.add('rv4-visible');revealObserver.unobserve(e.target);}}},{threshold:.04,rootMargin:'0px 0px 70px 0px'});
   const targets=[...main.querySelectorAll('.hero-premium,.stat-action,.dashboard-grid > .card,.section-header')].slice(0,16);
   targets.forEach((node,i)=>{node.classList.add('rv4-reveal');node.style.transitionDelay=Math.min(i*32,240)+'ms';revealObserver.observe(node);});
 }else main.querySelectorAll('.rv4-reveal').forEach(n=>n.classList.add('rv4-visible'));
 main.querySelectorAll('.stat-action strong').forEach(animateNum);
 main.querySelectorAll('.pipeline-fill').forEach(n=>n.classList.add('rv4-progress-animate'));
 updateStudioSignal();
}
function updateStudioSignal(){
 const input=main?.querySelector('#order-text');
 if(!input)return;
 let signal=main.querySelector('.rv4-studio-signal');
 if(!signal){
   signal=el('div',{className:'rv4-studio-signal','role':'status'});
   signal.append(el('strong'),el('div',{className:'rv4-studio-rail','aria-hidden':'true'}));
   signal.querySelector('.rv4-studio-rail').append(el('span'));
   input.insertAdjacentElement('afterend',signal);
 }
 const n=input.value.trim().length;
 signal.querySelector('strong').textContent=n===0?'Masukkan pesan untuk dianalisis':n<12?'Pesan perlu dilengkapi':'Pesan siap dicoba di NLP lokal';
 signal.querySelector('.rv4-studio-rail span').style.setProperty('--progress',Math.min(100,n/90*100)+'%');
}
function scrollTopSetup(){
 scrollButton=el('button',{className:'rv4-scroll-top',type:'button','aria-label':'Kembali ke atas',title:'Kembali ke atas'},'↑');
 document.body.append(scrollButton);
 scrollButton.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduceMotion?'instant':'smooth'}));
 const update=()=>scrollButton.classList.toggle('rv4-show',window.scrollY>420);
 window.addEventListener('scroll',update,{passive:true});update();
}
function bootstrap(){
 mkClock();ensurePalette();scrollTopSetup();updatePageMotion();
 document.addEventListener('keydown',e=>{
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(palette?.open)palette.close();else openPalette();}
 });
 document.addEventListener('input',e=>{if(e.target.id==='order-text')updateStudioSignal();});
 const watcher=new MutationObserver(mutations=>{
  if(mutations.some(m=>m.target===main || (m.target instanceof Element&&m.target.parentElement===main))){
    // A render replaces main children. Avoid observing nested cosmetic changes.
    updatePageMotion();
  }
 });
 if(main)watcher.observe(main,{childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
