/** Deterministic production engine — zero external dependencies. */
export const makeId = (prefix = "id") => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export const isPositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
export const rounded = value => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
export const isISODate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
};
export function validateOrder({items, dueDate}, products) {
  const errors = [];
  if (!isISODate(dueDate)) errors.push('Tanggal selesai harus valid (YYYY-MM-DD).');
  if (!Array.isArray(items) || !items.length) errors.push('Tambahkan minimal satu produk.');
  const productIds = new Set(products.map(p => p.id));
  for (const [i, item] of (items || []).entries()) {
    if (!productIds.has(item.productId)) errors.push(`Baris ${i+1}: produk belum dipilih atau tidak ada di katalog.`);
    if (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > 100000) {
      errors.push(`Baris ${i+1}: jumlah harus bilangan bulat positif (maksimal 100.000).`);
    }
  }
  return errors;
}
export function computePlan(orders, products, materials) {
  const demands = new Map(materials.map(m => [m.id, 0]));
  const missingRecipes = new Set();
  const missingMaterials = new Set();
  const activeOrders = orders.filter(o => ['new', 'in_progress'].includes(o.status));
  for (const order of activeOrders) {
    for (const item of order.items || []) {
      const product = products.find(p => p.id === item.productId);
      if (!product || !product.recipe?.length) { missingRecipes.add(product?.name || item.productId || 'Produk tidak dikenal'); continue; }
      for (const ingredient of product.recipe) {
        if (!demands.has(ingredient.materialId)) { missingMaterials.add(ingredient.materialId); continue; }
        if (!isPositive(item.quantity) || !isPositive(ingredient.amount)) continue;
        demands.set(ingredient.materialId, demands.get(ingredient.materialId) + Number(item.quantity) * Number(ingredient.amount));
      }
    }
  }
  return {
    activeCount: activeOrders.length,
    rows: materials.map(m => {
      const required = rounded(demands.get(m.id) || 0);
      const stock = rounded(Math.max(0, Number(m.stock) || 0));
      return { id:m.id, name:m.name, unit:m.unit, required, stock, shortage:rounded(Math.max(0,required-stock)) };
    }),
    missingRecipes:[...missingRecipes],
    missingMaterials:[...missingMaterials]
  };
}
export function makeSeed() {
  return {
    version:1, sample:true,
    materials:[
      {id:'m_janur',name:'Janur (CONTOH)',unit:'lembar',stock:50},
      {id:'m_bunga',name:'Bunga (CONTOH)',unit:'g',stock:100},
      {id:'m_daun',name:'Daun pisang (CONTOH)',unit:'lembar',stock:30}
    ],
    products:[
      {id:'p_canang',name:'Canang sari',aliases:['canang','cnng'],recipe:[{materialId:'m_janur',amount:1},{materialId:'m_bunga',amount:5}]},
      {id:'p_pejati',name:'Pejati',aliases:['pjti'],recipe:[{materialId:'m_janur',amount:2},{materialId:'m_daun',amount:1},{materialId:'m_bunga',amount:10}]}
    ],
    orders:[]
  };
}
export function normalizeAIOutput(raw, catalog) {
  if (!raw || !Array.isArray(raw.items) || !Array.isArray(raw.questions) || !raw.delivery) throw new Error('Respons AI tidak lengkap.');
  const knownIds = new Set(catalog.map(x=>x.id));
  return {
    items: raw.items.slice(0,30).map(item => ({
      productId:knownIds.has(item.catalog_id)?item.catalog_id:'',
      rawName:String(item.product_name || '').slice(0,150),
      quantity:Number.isSafeInteger(item.quantity) && item.quantity>0 && item.quantity<=100000 ? item.quantity : '',
      confidence:['high','medium','low'].includes(item.confidence)?item.confidence:'low',
      sourceText:String(item.source_text||'').slice(0,250)
    })),
    delivery:{date_iso:isISODate(raw.delivery.date_iso)?raw.delivery.date_iso:'', time_text:String(raw.delivery.time_text||'').slice(0,80), raw_text:String(raw.delivery.raw_text||'').slice(0,150)},
    notes:String(raw.notes||'').slice(0,500),
    questions:raw.questions.slice(0,20).map(q=>String(q).slice(0,250))
  };
}
