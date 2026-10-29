/**
 * Pure demo scenario functions for the jury tour. All data is deliberately synthetic.
 * No networking, storage, or Supabase writes.
 */
import { extractLocalOrder } from './ranakara-nlp.mjs';
import { makeSeed, computePlan, validateOrder, rounded } from './engine.mjs';

export const DEMO_MESSAGES = Object.freeze([
  'Pesan 10 pejati, eh tambah 5 lagi.',
  'Saya pesan 20 canang sari dan 5 pejati untuk besok pagi.',
  'Pesan 10 pejati dan 20 canang, tambah 5 lagi.'
]);
export const DEMO_RECIPE_NOTICE='TAKARAN SIMULASI: untuk demonstrasi rumus MRP, BUKAN resep atau standar upakara Bali.';
export function newDemoWorkspace(){
  const ws=makeSeed();
  return {products:ws.products, materials:ws.materials, orders:[]};
}
export function analyseDemo(text, workspace=newDemoWorkspace()){
  const output=extractLocalOrder({text,catalog:workspace.products.map(({id,name,aliases})=>({id,name,aliases}))});
  return {
    items: output.items.map(i=>({productId:i.catalog_id||'',name:i.product_name,quantity:Number.isSafeInteger(i.quantity)?i.quantity:null,confidence:i.confidence,sourceText:i.source_text})),
    questions:output.questions,
    delivery:output.delivery,
    notes:output.notes||''
  };
}
export function previewDemoPlan(items, workspace=newDemoWorkspace(), dueDate=''){
  const normalized=items.map(i=>({productId:i.productId,quantity:Number(i.quantity)}));
  const errors=validateOrder({items:normalized,dueDate}, workspace.products);
  if(errors.length)return {ok:false,errors,plan:null};
  const order={id:'demo-not-saved',items:normalized,dueDate,status:'new'};
  const plan=computePlan([order],workspace.products,workspace.materials);
  return {ok:true,errors:[],plan:{...plan,rows:plan.rows.map(r=>({...r,required:rounded(r.required),shortage:rounded(r.shortage)}))}};
}
