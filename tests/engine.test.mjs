import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSeed,computePlan,validateOrder,normalizeAIOutput,isISODate} from '../public/engine.mjs';

test('seed uses explicit example flag and no orders',()=>{const s=makeSeed();assert.equal(s.sample,true);assert.equal(s.orders.length,0);});
test('material plan aggregates items and never subtracts stock automatically',()=>{
 const s=makeSeed();s.orders=[
   {status:'new',items:[{productId:'p_canang',quantity:20},{productId:'p_pejati',quantity:10}]},
   {status:'completed',items:[{productId:'p_canang',quantity:100}]},
   {status:'cancelled',items:[{productId:'p_pejati',quantity:200}]}
 ];
 const plan=computePlan(s.orders,s.products,s.materials);
 assert.equal(plan.activeCount,1);
 assert.deepEqual(plan.rows.map(x=>x.required),[40,200,10]);
 assert.deepEqual(plan.rows.map(x=>x.shortage),[0,100,0]);
 assert.equal(s.materials[1].stock,100);
});
test('does not coerce invalid date to valid date',()=>{assert.equal(isISODate('2026-02-30'),false);assert.equal(isISODate('2026-10-29'),true);assert.equal(isISODate('Jumat'),false);});
test('rejects unknown product, missing due date and zero qty',()=>{
 const catalog=makeSeed().products;
 assert.equal(validateOrder({dueDate:'',items:[]},catalog).length,2);
 assert.equal(validateOrder({dueDate:'2026-10-29',items:[{productId:'fake',quantity:0}]},catalog).length,2);
 assert.equal(validateOrder({dueDate:'2026-10-29',items:[{productId:'p_canang',quantity:3}]},catalog).length,0);
});
test('AI result never lets unknown catalog IDs pass',()=>{
 const normalized=normalizeAIOutput({items:[{catalog_id:'bad',quantity:3,product_name:'A',confidence:'high',source_text:'a'},{catalog_id:'p_canang',quantity:2,product_name:'canang',confidence:'medium',source_text:'b'}],delivery:{date_iso:'bad',time_text:'pagi',raw_text:'Jumat'},notes:'',questions:[]},makeSeed().products);
 assert.equal(normalized.items[0].productId,'');assert.equal(normalized.items[1].productId,'p_canang');assert.equal(normalized.delivery.date_iso,'');
});
test('warns when recipe is absent or material is missing',()=>{
 const s=makeSeed();s.products[0].recipe=[];s.products[1].recipe=[{materialId:'not-found',amount:4}];
 const p=computePlan([{status:'new',items:[{productId:'p_canang',quantity:1},{productId:'p_pejati',quantity:1}]}],s.products,s.materials);
 assert.deepEqual(p.missingRecipes,['Canang sari']);assert.deepEqual(p.missingMaterials,['not-found']);
});
