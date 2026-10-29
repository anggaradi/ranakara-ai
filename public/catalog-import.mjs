/** Non-destructive reference-catalog merge. No external dependencies or network calls. */
const key=s=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('id');
const str=(s,max)=>String(s??'').trim().slice(0,max);
const validId=s=>/^[a-zA-Z0-9_-]{1,70}$/.test(s);
function uniqueId(candidate,used,prefix){
  let id=validId(candidate)&&!used.has(candidate)?candidate:null;
  if(!id){let n=1;do{id=`${prefix}_ref_${n++}`;}while(used.has(id));}
  used.add(id);return id;
}
export function mergeCatalogReference(current,incoming){
  if(!current || !Array.isArray(current.materials) || !Array.isArray(current.products) || !Array.isArray(current.orders))throw new Error('Workspace saat ini tidak valid.');
  if(!incoming || !Array.isArray(incoming.materials) || !Array.isArray(incoming.products))throw new Error('File bukan JSON katalog RANAKARA yang valid.');
  if(incoming.materials.length>300 || incoming.products.length>200)throw new Error('File katalog terlalu besar.');
  const materials=structuredClone(current.materials),products=structuredClone(current.products);
  const materialIds=new Set(materials.map(x=>x.id)),productIds=new Set(products.map(x=>x.id));
  const materialNames=new Set(materials.map(x=>key(x.name))),productNames=new Map(products.map(x=>[key(x.name),x]));
  const counts={newMaterials:0,newProducts:0,aliasesAdded:0,materialsSkipped:0,productsSkipped:0};
  for(const raw of incoming.materials){
    const name=str(raw?.name,100),unit=str(raw?.unit,20);
    if(!name||!unit||name.length<2)throw new Error('File katalog memiliki material kosong atau tidak valid.');
    if(materialNames.has(key(name))){counts.materialsSkipped++;continue;}
    materials.push({id:uniqueId(raw.id,materialIds,'m'),name,unit,stock:0});
    materialNames.add(key(name));counts.newMaterials++;
  }
  for(const raw of incoming.products){
    const name=str(raw?.name,100);
    if(!name||name.length<2)throw new Error('File katalog memiliki produk tanpa nama.');
    const aliases=Array.isArray(raw.aliases)?raw.aliases.slice(0,10).map(x=>str(x,50)).filter(x=>x.length>1):[];
    const seen=new Set();const clean=aliases.filter(x=>{const k=key(x);if(seen.has(k))return false;seen.add(k);return true;});
    const existing=productNames.get(key(name));
    if(existing){
      const had=new Set((existing.aliases||[]).map(key));
      for(const alias of clean){if(!had.has(key(alias))&&(existing.aliases||[]).length<10){existing.aliases??=[];existing.aliases.push(alias);had.add(key(alias));counts.aliasesAdded++;}}
      counts.productsSkipped++;continue;
    }
    const product={id:uniqueId(raw.id,productIds,'p'),name,aliases:clean,recipe:[]};
    products.push(product);productNames.set(key(name),product);counts.newProducts++;
  }
  if(materials.length>500||products.length>300)throw new Error('Batas maksimum katalog terlampaui.');
  return {materials,products,counts}; // Intentionally no orders/stocks overwrite.
}
