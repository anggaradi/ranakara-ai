/** RANAKARA Recipe BOM import v8: approved measurements only, never AI-estimated quantities. */
const FIELDS=['jenis','id_produk','nama_produk','id_item','nama_item','satuan','takaran','status','umkm','pengrajin','tanggal','varian','catatan','sumber'];
const clean=s=>String(s??'').trim();
const norm=s=>clean(s).normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/g,' ');
function parseCSV(s){
  const rows=[];let field='',row=[],quoted=false;const t=String(s).replace(/^\uFEFF/,'');
  for(let i=0;i<t.length;i++){
    const ch=t[i];
    if(quoted){if(ch==='"'&&t[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"'){if(field)throw Error(`CSV tidak valid pada posisi ${i}.`);quoted=true;}
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(field);if(row.some(x=>clean(x)))rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(quoted)throw Error('CSV berisi tanda petik yang belum ditutup.');
  if(field||row.length){row.push(field);if(row.some(x=>clean(x)))rows.push(row);}
  if(rows.length<2)throw Error('CSV kosong atau tidak berisi baris resep.');
  const header=rows.shift().map(clean);
  for(const k of FIELDS)if(!header.includes(k))throw Error(`Kolom wajib '${k}' tidak ada. Gunakan template RANAKARA v8.`);
  const mapping=FIELDS.map(k=>header.indexOf(k));
  return rows.map((r,i)=>Object.fromEntries([['__line',i+2],...FIELDS.map((k,j)=>[k,clean(r[mapping[j]])])]));
}
function ISODate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
function findProduct(products,id,name){return products.find(x=>x.id===id)||products.find(x=>norm(x.name)===norm(name));}
function findMaterial(materials,id,name){return materials.find(x=>x.id===id)||materials.find(x=>norm(x.name)===norm(name));}
const digestRows=rows=>rows.map(r=>`${r.materialId}:${r.amount}`).sort().join('|');
/** Preview does not mutate workspace. Incomplete product groups stay untouched. */
export function previewApprovedRecipeCSV(csv,workspace,reference){
 const input=parseCSV(csv);if(input.length>5000)throw Error('Maksimal 5000 baris.');
 if(!workspace||!Array.isArray(workspace.products)||!Array.isArray(workspace.materials))throw Error('Workspace tidak valid.');
 const references=new Map((reference?.products||[]).map(x=>[x.productId,x]));
 const groups=new Map(),seen=new Set(),errors=[];
 for(const r of input){
   const type=norm(r.jenis);if(!['material','komponen','persetujuan'].includes(type)){errors.push(`Baris ${r.__line}: jenis '${r.jenis}' tidak dikenali.`);continue;}
   const product=findProduct(workspace.products,r.id_produk,r.nama_produk);
   if(!product){errors.push(`Baris ${r.__line}: produk '${r.nama_produk||r.id_produk}' tidak ditemukan dalam workspace.`);continue;}
   const id=product.id;
   const key=`${id}|${type}|${r.id_item}`;
   if(seen.has(key)){errors.push(`Baris ${r.__line}: data ${type} '${r.id_item}' duplikat untuk ${product.name}.`);continue;}
   seen.add(key);
   if(!groups.has(id))groups.set(id,{product,materials:[],components:[],approval:[],errors:[],reference:references.get(r.id_produk)||[...references.values()].find(x=>norm(x.productName)===norm(product.name))});
   const g=groups.get(id);
   if(type==='material')g.materials.push(r);if(type==='komponen')g.components.push(r);if(type==='persetujuan')g.approval.push(r);
 }
 const ready=[],pending=[];
 for(const g of groups.values()){
   const errs=[...g.errors],approved=g.approval.find(r=>norm(r.status)==='final_disetujui');
   const acted=g.materials.filter(r=>['disetujui','tidak_digunakan'].includes(norm(r.status)));
   const anyAct=acted.length>0||!!approved;
   if(!anyAct){pending.push({name:g.product.name,reason:'Belum ada takaran/persetujuan yang diisi'});continue;}
   if(g.approval.length!==1)errs.push('Harus ada tepat satu baris persetujuan produk.');
   if(!approved)errs.push('Status baris persetujuan belum final_disetujui.');
   if(approved){if(!clean(approved.pengrajin)||!ISODate(approved.tanggal)||!clean(approved.umkm)||!clean(approved.varian))errs.push('Baris persetujuan wajib UMKM, pengrajin, tanggal valid YYYY-MM-DD, dan varian.');}
   const expectedMat=new Set((g.reference?.ingredients||[]).map(x=>x.id));
   const expectedComp=new Set((g.reference?.components||[]).map(x=>x.id));
   // Reference rows must explicitly indicate used or excluded; otherwise the BOM could be partial.
   for(const id of expectedMat){const r=g.materials.find(x=>x.id_item===id);if(!r||!['disetujui','tidak_digunakan'].includes(norm(r.status)))errs.push(`Bahan ${id} belum diputuskan (disetujui / tidak_digunakan).`);}
   for(const id of expectedComp){const r=g.components.find(x=>x.id_item===id);if(!r||!['terurai','tidak_digunakan'].includes(norm(r.status)))errs.push(`Komponen ${id} belum dinyatakan terurai / tidak_digunakan.`);if(r&&norm(r.status)==='terurai'&&!clean(r.catatan))errs.push(`Komponen ${id}: isi catatan penguraian bersih agar tidak dihitung ganda.`);}
   const recipe=[],ids=new Set();
   for(const r of g.materials){
     const state=norm(r.status);
     if(!['disetujui','tidak_digunakan','belum'].includes(state)){errs.push(`Baris ${r.__line}: status bahan tidak valid.`);continue;}
     if(state==='belum'){if(clean(r.takaran))errs.push(`Baris ${r.__line}: takaran diisi tetapi belum disetujui.`);continue;}
     const m=findMaterial(workspace.materials,r.id_item,r.nama_item);
     if(!m){errs.push(`Baris ${r.__line}: bahan ${r.nama_item||r.id_item} belum ada di katalog. Tambahkan terlebih dahulu.`);continue;}
     if(r.satuan&&norm(r.satuan)!==norm(m.unit)){errs.push(`Baris ${r.__line}: satuan ${r.satuan} tidak sama dengan stok ${m.unit}.`);continue;}
     if(ids.has(m.id)){errs.push(`Baris ${r.__line}: bahan '${m.name}' digunakan dua kali.`);continue;}
     ids.add(m.id);
     const amt=Number(clean(r.takaran).replace(',','.'));
     if(state==='disetujui'){
       if(!clean(r.takaran)||!Number.isFinite(amt)||amt<=0||amt>100000||Math.round(amt*1000)/1000!==amt){errs.push(`Baris ${r.__line}: takaran disetujui harus angka positif dengan maks 3 desimal.`);continue;}
       recipe.push({materialId:m.id,amount:amt});
     } else if(clean(r.takaran)&&amt!==0){errs.push(`Baris ${r.__line}: bahan tidak_digunakan harus kosong atau 0.`);}
   }
   if(!recipe.length)errs.push('Resep final harus memiliki paling tidak satu bahan dengan jumlah positif.');
   if(g.reference?.components?.length && approved && !/terurai|bersih|netto/i.test(clean(approved.catatan)))errs.push('Produk komposit: catatan persetujuan harus menegaskan BOM bahan bersih/terurai tanpa penghitungan ganda.');
   if(errs.length)pending.push({name:g.product.name,reason:errs.join(' | ')});
   else ready.push({productId:g.product.id,name:g.product.name,recipe,approval:{status:'approved',umkm:approved.umkm,artisan:approved.pengrajin,date:approved.tanggal,variant:approved.varian,note:approved.catatan,source:'CSV pengrajin v8',fingerprint:digestRows(recipe),approvedIngredientCount:recipe.length}});
 }
 // An explicitly malformed CSV must not partially import good groups silently.
 if(errors.length)throw Error(errors.slice(0,5).join(' | '));
 return {ready,pending,receivedRows:input.length,approvedProducts:ready.length,unapprovedProducts:pending.length};
}
export function applyApprovedRecipePreview(workspace,preview){
 if(!workspace||!Array.isArray(workspace.products))throw Error('Workspace tidak valid.');
 const next={...workspace,products:workspace.products.map(p=>({...p,recipe:Array.isArray(p.recipe)?p.recipe.map(r=>({...r})):[]}))};
 for(const change of preview.ready){
   const p=next.products.find(p=>p.id===change.productId);if(!p)throw Error(`Produk ${change.name} hilang saat impor.`);
   p.recipe=change.recipe.map(r=>({...r}));p.recipeApproval={...change.approval};
 }
 return next;
}
export function invalidateRecipeApproval(product){if(product&&'recipeApproval' in product)delete product.recipeApproval;}
export function auditActiveRecipeCoverage(workspace){
 const needed=new Set((workspace.orders||[]).filter(o=>['new','in_progress'].includes(o.status)).flatMap(o=>(o.items||[]).map(i=>i.productId)));
 const products=workspace.products||[];
 const ready=products.filter(p=>p.recipeApproval?.status==='approved'&&p.recipeApproval.fingerprint===digestRows(p.recipe||[])).map(p=>p.id);
 const flagged=[...needed].filter(id=>!ready.includes(id)).map(id=>products.find(p=>p.id===id)?.name||`Produk tidak dikenal (${id})`);
 return {readyProducts:ready.length,totalProducts:products.length,unverifiedActive:flagged,activeCoverageComplete:flagged.length===0};
}
export {parseCSV};
