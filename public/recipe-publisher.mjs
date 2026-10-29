import {buildPublishableRecipeLibrary} from './recipe-publisher-core.mjs';
const $=q=>document.querySelector(q);
const output=$('#publisher-output');
const button=$('#publisher-submit');
button.addEventListener('click',async()=>{
  output.textContent='Memeriksa resep dan izin…';button.disabled=true;
  try{
    const csv=$('#publisher-csv').files[0],consent=$('#publisher-consent').files[0];
    if(!csv||!consent)throw Error('Pilih CSV resep disetujui dan JSON izin publikasi terlebih dahulu.');
    if(csv.size>1_500_000||consent.size>200_000)throw Error('Ukuran file terlalu besar.');
    const [catalog,master,reference,consentJson]=await Promise.all([
      fetch('/global-catalog.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Katalog global tidak tersedia'))),
      fetch('/global-recipes.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Resep global tidak tersedia'))),
      fetch('/recipe-reference.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('Referensi resep tidak tersedia'))),
      consent.text().then(x=>JSON.parse(x))
    ]);
    const prepared=buildPublishableRecipeLibrary({csvText:await csv.text(),consent:consentJson,master,catalog,reference});
    const blob=new Blob([JSON.stringify(prepared.library,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='global-recipes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    output.textContent=`BERHASIL: ${prepared.newlyApproved} resep telah diproses. Total resep global disahkan dalam berkas keluaran: ${prepared.summary.approved}/${prepared.summary.total}. Unduhan belum mengubah website. Tinjau JSON, lalu unggah HANYA global-recipes.json ke public/ GitHub untuk publikasi.`;
  }catch(err){output.textContent='BELUM DAPAT DITERBITKAN: '+(err?.message||String(err));}
  finally{button.disabled=false;}
});
