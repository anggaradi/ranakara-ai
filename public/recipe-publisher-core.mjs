/** Offline-only pure recipe publisher: validates private approved CSV + explicit public consent.
 * No network, auth, DOM or storage. Caller decides whether to download produced JSON.
 */
import {createCleanWorkspace,applyGlobalReference} from './global-catalog.mjs';
import {previewApprovedRecipeCSV} from './recipe-bom-import.mjs';
import {inspectPublicRecipeLibrary} from './global-recipe-library.mjs';

export function buildPublishableRecipeLibrary({csvText,consent,master,catalog,reference}) {
  inspectPublicRecipeLibrary(master,catalog);
  if (!consent || !Array.isArray(consent.products)) throw Error('File izin publikasi harus memiliki array products.');
  const consentIds=new Set();
  for (const c of consent.products){
    if(!c?.productId || consentIds.has(c.productId))throw Error('ID produk izin publikasi kosong atau duplikat.');
    consentIds.add(c.productId);
  }
  const workspace=applyGlobalReference(createCleanWorkspace(),catalog).workspace;
  const preview=previewApprovedRecipeCSV(csvText,workspace,reference);
  const invalid=preview.pending.filter(x=>x.reason!=='Belum ada takaran/persetujuan yang diisi');
  if(invalid.length)throw Error('CSV memuat resep tidak lengkap: '+invalid.slice(0,3).map(x=>x.name+': '+x.reason).join(' | '));
  if(!preview.ready.length)throw Error('Tidak ada resep numerik yang disahkan dalam CSV.');
  const next=structuredClone(master);
  next.libraryVersion=master.libraryVersion+1;
  next.products=next.products.map(product=>{
    const approved=preview.ready.find(x=>x.productId===product.productId);
    if(!approved)return product;
    const c=consent.products.find(x=>x.productId===product.productId);
    if(!c||c.publicationConsent!==true||typeof c.sourceLabel!=='string'||c.sourceLabel.trim().length<4||c.variant!==approved.approval.variant||c.approvedOn!==approved.approval.date)
      throw Error('Izin publikasi untuk '+product.productName+' tidak lengkap/tidak cocok. Resep privat tidak diterbitkan.');
    const approvedRecipe=approved.recipe.map(r=>{
      const material=catalog.materials.find(x=>x.id===r.materialId);
      if(!material)throw Error('Material publik tidak ditemukan: '+r.materialId);
      return {materialId:material.id,unit:material.unit,amount:r.amount};
    });
    const usedIds=new Set(approvedRecipe.map(x=>x.materialId));
    return {...product,status:'approved',approvedRecipe,excludedMaterialIds:product.ingredients.map(i=>i.id).filter(id=>!usedIds.has(id)),componentsResolved:true,approval:{publicationConsent:true,approvedOn:c.approvedOn,sourceLabel:c.sourceLabel.trim(),variant:c.variant}};
  });
  next.lastReviewed=new Date().toISOString().slice(0,10);
  const summary=inspectPublicRecipeLibrary(next,catalog);
  return {library:next,summary,newlyApproved:preview.ready.length,pending:preview.pending.length};
}
