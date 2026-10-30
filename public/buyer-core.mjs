/** Buyer request helpers: no backend orders, no payment, no seller-account authorization. */
export function cleanCatalog(raw){
  const products=Array.isArray(raw?.products)?raw.products:[];
  return products.filter(x=>typeof x.id==='string'&&typeof x.name==='string').map(x=>({id:x.id,name:x.name,aliases:Array.isArray(x.aliases)?x.aliases:[]}));
}
export function normalizeCart(cart,catalog){
  const allowed=new Set(catalog.map(p=>p.id));
  return Array.isArray(cart)?cart.filter(x=>allowed.has(x.id)&&Number.isSafeInteger(x.quantity)&&x.quantity>=1&&x.quantity<=1000).slice(0,100):[];
}
export function changeCart(cart,id,delta,catalog){
  if(!catalog.some(x=>x.id===id)||!Number.isInteger(delta)||!delta)return cart;
  const next=cart.map(x=>({...x}));
  const found=next.find(x=>x.id===id);
  if(!found && delta>0)next.push({id,quantity:Math.min(1000,delta)});
  else if(found){found.quantity=Math.max(0,Math.min(1000,found.quantity+delta));}
  return next.filter(x=>x.quantity>0);
}
export function fromAI(summary,catalog){
  if(!summary || !(summary.canConfirm||summary.confirmed) || summary.pending)return null;
  const next=[];
  for(const item of summary.items||[]){
    const match=catalog.find(p=>p.id===item.id);
    if(!match||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000)return null;
    const already=next.find(x=>x.id===match.id);
    if(already)already.quantity+=item.quantity;
    else next.push({id:match.id,quantity:item.quantity});
  }
  if(!next.length||next.some(x=>x.quantity>1000))return null;
  return {cart:next,date:summary.date||'',time:summary.time||''};
}
export function formatBuyerMessage({cart,catalog,date='',time='',note=''}){
  const mapped=normalizeCart(cart,catalog);
  if(!mapped.length)return '';
  const items=mapped.map((x,i)=>{
    const product=catalog.find(p=>p.id===x.id);
    return `${i+1}. ${product.name} — ${x.quantity} unit`;
  }).join('\n');
  const dateText=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'Belum ditentukan, mohon konfirmasi';
  const timeText=/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?`${time} WITA`:'Belum ditentukan';
  return `Om Swastyastu, saya ingin menanyakan ketersediaan upakara berikut:\n\n${items}\n\nTanggal diperlukan: ${dateText}\nWaktu: ${timeText}${String(note).trim()?`\nCatatan: ${String(note).trim().slice(0,500)}`:''}\n\nMohon konfirmasi ketersediaan, harga, dan cara pemesanan. Terima kasih.`;
}
