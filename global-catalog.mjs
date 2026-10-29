import { mergeCatalogReference } from './catalog-import.mjs';

/** Per-account PRIVATE workspace, seeded from the same PUBLIC reference catalog. */
export function createCleanWorkspace(){
  return {version:1,sample:false,globalCatalogVersion:0,materials:[],products:[],orders:[]};
}

/** Returns a NEW workspace object; never mutates the prior workspace or the public catalog. */
export function applyGlobalReference(workspace,reference){
  if(!reference||reference.type!=='ranakara_public_reference_catalog'||!Number.isSafeInteger(reference.catalogVersion)||reference.catalogVersion<1){
    throw new Error('Versi katalog referensi tidak valid.');
  }
  if(!workspace || !Array.isArray(workspace.materials)||!Array.isArray(workspace.products)||!Array.isArray(workspace.orders))throw new Error('Workspace tidak valid.');
  if(Number(workspace.globalCatalogVersion||0)>=reference.catalogVersion){
    return {workspace,changed:false,counts:null};
  }
  const result=mergeCatalogReference(workspace,reference);
  return {
    workspace:{...workspace,materials:result.materials,products:result.products,globalCatalogVersion:reference.catalogVersion},
    changed:true,
    counts:result.counts
  };
}
