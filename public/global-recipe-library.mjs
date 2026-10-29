/** RANAKARA v8.1 — public recipe library with private per-workspace overrides.
 * No network calls, Supabase credentials, or publishing of workspace data here.
 * Reference-only entries NEVER become numeric production recipes.
 */
const tidy=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const recipeFingerprint=rows=>rows.map(r=>`${r.materialId}:${r.amount}`).sort().join('|');
const failure=msg=>{throw new Error('Pustaka resep global: '+msg);};

export function inspectPublicRecipeLibrary(library,catalog){
  if(library?.type!=='ranakara_public_recipe_library'||!Number.isSafeInteger(library.libraryVersion)||library.libraryVersion<1)failure('format atau versi tidak valid.');
  if(!Array.isArray(library.products)||library.products.length>200)failure('jumlah produk tidak valid.');
  if(!catalog||!Array.isArray(catalog.materials)||!Array.isArray(catalog.products))failure('katalog global tidak tersedia.');
  const products=new Map(catalog.products.map(p=>[p.id,p]));
  const mats=new Map(catalog.materials.map(m=>[m.id,m]));
  const seen=new Set();let approved=0,referenceOnly=0;
  for(const p of library.products){
    if(!products.has(p.productId)||seen.has(p.productId))failure('ID produk tidak cocok atau duplikat.');
    seen.add(p.productId);
    if(!Array.isArray(p.ingredients)||!Array.isArray(p.components)||!Array.isArray(p.approvedRecipe)||!Array.isArray(p.excludedMaterialIds))failure('struktur bahan/komponen tidak valid.');
    if(!['reference_only','approved'].includes(p.status))failure(`status ${p.productId} tidak valid.`);
    if(p.status==='reference_only'){
      referenceOnly++;
      if(p.approvedRecipe.length||p.approval)failure(`resep ${p.productId} masih referensi tetapi memuat klaim persetujuan.`);
      continue;
    }
    approved++;
    const a=p.approval;
    if(!a||a.publicationConsent!==true||!iso(a.approvedOn)||typeof a.sourceLabel!=='string'||a.sourceLabel.trim().length<4||!a.variant?.trim())failure(`persetujuan publik ${p.productId} belum lengkap.`);
    if(!p.approvedRecipe.length||p.approvedRecipe.length>200)failure(`takaran ${p.productId} kosong atau berlebihan.`);
    if(p.components.length && p.componentsResolved!==true)failure(`komponen bertingkat ${p.productId} belum diurai.`);
    const decisions=new Set(p.excludedMaterialIds); const used=new Set();
    if(decisions.size!==p.excludedMaterialIds.length)failure(`pengecualian ganda pada ${p.productId}.`);
    for(const r of p.approvedRecipe){
      const mat=mats.get(r.materialId);
      if(!mat||used.has(r.materialId)||decisions.has(r.materialId))failure(`bahan ${r.materialId} pada ${p.productId} tidak valid.`);
      if(tidy(r.unit)!==tidy(mat.unit))failure(`satuan ${r.materialId} pada ${p.productId} tidak sama dengan katalog.`);
      if(!Number.isFinite(r.amount)||r.amount<=0||r.amount>100000||Math.round(r.amount*1000)/1000!==r.amount)failure(`takaran ${r.materialId} tidak valid.`);
      used.add(r.materialId);
    }
    for(const ing of p.ingredients){
      if(!mats.has(ing.id))failure(`bahan referensi ${ing.id} tidak ada di katalog.`);
      if(!used.has(ing.id)&&!decisions.has(ing.id))failure(`bahan ${ing.id} pada ${p.productId} belum diputuskan (dipakai/tidak).`);
    }
    for(const id of decisions)if(!mats.has(id))failure(`bahan dikecualikan ${id} tidak dikenal.`);
  }
  return {total:library.products.length,approved,referenceOnly,libraryVersion:library.libraryVersion};
}

function resolveMaterial(workspace,publicMaterial){
  return workspace.materials.find(m=>m.id===publicMaterial.id)||workspace.materials.find(m=>tidy(m.name)===tidy(publicMaterial.name)&&tidy(m.unit)===tidy(publicMaterial.unit));
}
function findWorkspaceProduct(workspace,publicProduct){
  return workspace.products.find(p=>p.id===publicProduct.id)||workspace.products.find(p=>tidy(p.name)===tidy(publicProduct.name));
}
/** Converts only approved public BOM to a PRIVATE copy. References without quantities cannot be adopted. */
export function preparePublicRecipeCopy(workspace,library,catalog,productId){
  inspectPublicRecipeLibrary(library,catalog);
  const item=library.products.find(p=>p.productId===productId);
  if(!item||item.status!=='approved')failure('produk ini belum mempunyai takaran global yang disahkan untuk publik.');
  const productRecord=catalog.products.find(p=>p.id===productId);
  const product=findWorkspaceProduct(workspace,productRecord);
  if(!product)failure('produk belum ada di workspace pengguna.');
  const recipe=item.approvedRecipe.map(r=>{
    const pub=catalog.materials.find(m=>m.id===r.materialId);
    const local=resolveMaterial(workspace,pub);
    if(!local||tidy(local.unit)!==tidy(r.unit))failure(`bahan ${pub.name} tidak ada atau satuannya tidak cocok di workspace.`);
    return {materialId:local.id,amount:r.amount};
  });
  return {productId:product.id,productName:product.name,recipe,approval:{status:'approved',source:'Global Recipe Library (salinan privat)',globalLibraryVersion:library.libraryVersion,sourceLabel:item.approval.sourceLabel,variant:item.approval.variant,date:item.approval.approvedOn,publicConsent:true,fingerprint:recipeFingerprint(recipe),approvedIngredientCount:recipe.length}};
}
/** Automatically seed only products having no recipe AND no recipe-approval metadata.
 * Local edits and prior values remain untouched. No orders, stock, or prices are copied.
 */
export function applyPublicRecipeDefaults(workspace,library,catalog){
  inspectPublicRecipeLibrary(library,catalog);
  if(!Array.isArray(workspace?.products)||!Array.isArray(workspace?.materials)||!Array.isArray(workspace?.orders))failure('workspace tidak valid.');
  let changed=false,installed=0,preserved=0;
  const products=workspace.products.map(p=>{
    const global=library.products.find(g=>g.productId===p.id||tidy(g.productName)===tidy(p.name));
    if(!global||global.status!=='approved')return p;
    if(p.recipe?.length||p.recipeApproval||p.globalRecipeOptOut){preserved++;return p;}
    const prepared=preparePublicRecipeCopy(workspace,library,catalog,global.productId);
    changed=true;installed++;
    return {...p,recipe:prepared.recipe,recipeApproval:prepared.approval};
  });
  return {workspace:changed?{...workspace,products}:workspace,changed,installed,preserved};
}
/** Explicit user choice: replace one PRIVATE recipe with a public approved reference. */
export function copyPublicRecipeToWorkspace(workspace,library,catalog,productId){
  const prepared=preparePublicRecipeCopy(workspace,library,catalog,productId);
  return {...workspace,products:workspace.products.map(p=>p.id===prepared.productId?{...p,recipe:prepared.recipe,recipeApproval:prepared.approval,globalRecipeOptOut:false}:p)};
}
/** Allow a UMKM to decline auto-seeding of a public recipe on this product. */
export function optOutPublicRecipe(workspace,productId){
  return {...workspace,products:workspace.products.map(p=>p.id===productId?{...p,globalRecipeOptOut:true}:p)};
}
