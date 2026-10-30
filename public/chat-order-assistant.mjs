/**
 * RANAKARA conversational order draft prototype.
 * Local deterministic interpretation, NOT a generative LLM or live production integration.
 * No automatic order save, no inventory changes. Explicit human confirmation required.
 */
import {parseOrder,extractNumbers} from './smart-order-parser.mjs';
import {extractDateIntent,stripDateSpans,parseTime,formatDate} from './date-intent.mjs';

const CONFIRM=/^(?:konfirmasi|konfirm|setuju|sudah benar|benar|betul|iya benar|oke simpan|ok simpan|ya benar|simpan draf)$/i;
const RESET=/^(?:reset|mulai lagi|pesanan baru|hapus semua draf)$/i;
const ANSWER_NUMBERS={pertama:0,kedua:1,ketiga:2};
const WORD_CUES= /\b(eh|tapi|ralat|revisi|koreksi|maksudnya|maksud saya|jadi|cuma|saja|aja|cukup|ganti|ubah|tambah|nambah|kurang|kurangi|potong|batal|batalkan)\b/i;
const TRANSACTION_WORDS=/\b(?:canang|pesan|buat|beli|mau|order)\b/i;
function plainText(s){return String(s??'').replace(/\s+/g,' ').trim();}
function normalized(s){return plainText(s).toLowerCase();}
function productMentioned(message,catalog){
  const low=normalized(message);
  return catalog.some(p=>[p.name,...(p.aliases||[])].some(a=>new RegExp(`(?:^|[^a-z])${String(a).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|[^a-z])`).test(low)));
}
function itemList(items){return items.filter(x=>x.quantity!==null).map(i=>`${i.quantity} ${i.name}`).join(', ');}
function summarize(st){
  return {
    items:[...st.items.values()].map(x=>({...x})),
    date:st.date,dateLabel:st.date?formatDate(st.date):null,time:st.time,
    confirmed:st.confirmed,pending:st.pending?.kind??null,
    canConfirm:!st.confirmed&&!!st.date&&st.items.size>0&&!st.pending&&[...st.items.values()].every(x=>Number.isInteger(x.quantity)&&x.quantity>0),
  };
}
function output(st,messages,choices=[]){return {messages,choices,summary:summarize(st)};}
function optionsForDate(choices){return choices.map(x=>({label:formatDate(x),value:x}));}
function isBareChoice(input){return /^(?:1|2|pertama|kedua|yang pertama|yang kedua|pilihan 1|pilihan 2|nomor 1|nomor 2)$/i.test(input);}
function parseChoice(input){const s=normalized(input);if(/(?:pertama|(?:nomor|pilihan|yang)\s*1|^1$)/.test(s))return 0;if(/(?:kedua|(?:nomor|pilihan|yang)\s*2|^2$)/.test(s))return 1;return null;}
function safeCandidateProduct(raw,catalog){const s=normalized(raw);return catalog.find(p=>[p.name,...(p.aliases||[])].some(a=>normalized(a)===s))||null;}
export class ChatOrderAssistant {
  constructor({catalog,now=new Date()}={}){
    if(!Array.isArray(catalog)||!catalog.length)throw new Error('catalog cannot be empty');
    this.catalog=catalog.map(x=>({id:String(x.id??x.name),name:String(x.name),aliases:x.aliases||[]}));
    this.now=now;
    this.reset();
  }
  reset(){this.state={items:new Map(),date:null,time:null,pending:null,lastProductId:null,unassignedQuantity:null,confirmed:false};}
  getSummary(){return summarize(this.state);}
  hello(){return output(this.state,['Halo! Tulis pesanan seperti biasa, misalnya “Bu pesan 20 canang, eh 10 aja untuk Jumat”. Saya bantu membuat draf dan akan bertanya jika ada hal yang belum jelas.'],[]);}
  send(text){
    const input=plainText(text);
    const st=this.state;
    if(!input)return output(st,['Pesan masih kosong. Tulis nama produk dan jumlah, misalnya: “10 pejati untuk 6 November”. Pesanan belum berubah.']);
    if(input.length>1500)return output(st,['Pesan terlalu panjang (maksimal 1.500 karakter). Ringkas pesan menjadi daftar produk, jumlah, dan tanggal. Pesanan belum berubah.']);
    if(RESET.test(input)){this.reset();return output(this.state,['Draf baru dimulai. Pesanan sebelumnya tidak dipakai. Silakan tulis produk, jumlah, dan tanggal yang diperlukan.']);}
    if(st.confirmed)return output(st,['Draf sudah dikonfirmasi dalam chat. Periksa formulir verifikasi lalu klik “Konfirmasi & simpan pesanan” untuk menyimpan. Untuk membuat pesanan lain, pilih “Mulai pesanan baru”. Pesan ini tidak mengubah draf lama.']);
    const preDate=extractDateIntent(input,{now:this.now});
    if(preDate.type==='invalid'||preDate.type==='past')return output(st,[`${preDate.message} Pesanan sebelumnya tetap. Tolong sebutkan tanggal yang valid di masa depan.`]);
    const preTime=parseTime(input);
    if(preTime==='invalid')return output(st,['Jam tidak valid: gunakan 00–23 untuk jam dan 00–59 untuk menit. Contoh yang benar: “15.30” ditulis “jam 15.30”, atau “jam 3 sore”. Pesanan sebelumnya tetap.']);
    if(preTime==='ambiguous')return output(st,['Jam masih ambigu. Apakah jam 3 pagi atau jam 3 sore? Sebutkan waktu dengan keterangan pagi/siang/sore/malam atau format 24 jam. Pesanan sebelumnya tetap.']);

    if(/(?:^|\s)-\d+\s*(?:canang|pejati|kwangen|unit|buah|pcs)/i.test(input))return output(st,['Jumlah negatif tidak bisa dibuat sebagai pesanan. Jika ingin mengurangi jumlah, tulis misalnya “kurangi 5 canang” dari pesanan yang sudah ada. Pesanan belum berubah.']);
    if(/\b(?:pesan|buat|beli|mau)\s+0\s+[a-z]/i.test(input) || /\b0\s+(?:canang|pejati|banten|segehan|kwangen|pcs|buah|unit)\b/i.test(input))return output(st,['Jumlah pesanan harus lebih dari 0. Jika maksudnya membatalkan, tulis “batalkan [nama produk]”. Pesanan belum berubah.']);

    // Pending contextual answers take precedence over free-form parsing.
    if(st.pending?.kind==='ask_date' && WORD_CUES.test(input) && extractNumbers(input).length && !/\b(?:tanggal|tgl|jam|pukul)\b/i.test(input))st.pending=null;
    if(st.pending?.kind==='choose_date' && WORD_CUES.test(input) && extractNumbers(input).length && !/^(?:minggu|pekan)\s+(?:depan|ini|berikutnya)$/i.test(input))st.pending=null;
    if(st.pending?.kind==='choose_date'){
      let relativeWeekChoice=null;
      if(st.pending.weekday!==undefined && /^(?:minggu|pekan)\s+(?:depan|ini|berikutnya)$/i.test(input)) {
        const days=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        const relative=extractDateIntent(`${days[st.pending.weekday]} ${input}`,{now:this.now});
        if(relative.type==='resolved')relativeWeekChoice=relative.iso;
      }
      const idx=/^(?:yang\s+)?(?:terdekat|paling dekat|paling awal)$/i.test(input)?0:parseChoice(input);
      const asISO=/^20\d{2}-\d\d-\d\d$/.test(input)?input:null;
      const dateAnswer=extractDateIntent(input,{now:this.now});
      const chosen=relativeWeekChoice || (idx!==null?st.pending.options[idx]:null) ||
        (asISO&&st.pending.options.includes(asISO)?asISO:null) ||
        (dateAnswer.type==='resolved'?dateAnswer.iso:null);
      if(chosen){
        st.date=chosen;st.pending=null;
        return this._afterDate(`Baik, saya catat tanggal **${formatDate(chosen)}**.`);
      }
      if(dateAnswer.type==='need_month')return output(st,[`Tanggal ${dateAnswer.day} bulan apa? Contohnya “${dateAnswer.day} November”.`]);
      return output(st,[`Saya belum bisa menentukan tanggal dari “${input.slice(0,70)}”. Pilih ${st.pending.options.map(formatDate).join(' atau ')}, atau tulis tanggal lengkap seperti “6 November 2026”. Jumlah pesanan belum berubah.`],optionsForDate(st.pending.options));
    }
    if(st.pending?.kind==='conflicting_weekday'){
      const p=st.pending;
      if(/^(?:ikuti tanggal|tanggal|1|pilihan 1)$/i.test(input)){
        st.date=p.iso;st.pending=null;return this._afterDate(`Baik, saya gunakan tanggal **${formatDate(p.iso)}**, bukan nama hari sebelumnya.`);
      }
      if(/^(?:ikuti hari|hari|2|pilihan 2)$/i.test(input)){
        const todayCtx={now:this.now};
        // Reuse weekday-based clarification; do not infer a day and silently select a date.
        const days=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        const result=extractDateIntent(days[p.weekday],todayCtx);
        if(result.type==='need_clarify_weekday'){
          st.pending={kind:'choose_date',options:result.choices,weekday:p.weekday};
          return output(st,[`Baik. ${days[p.weekday]} yang mana?`],optionsForDate(result.choices));
        }
      }
      // Treat non-menu replies as new date clarification if recognizable.
      const fresh=extractDateIntent(input,{now:this.now});
      if(fresh.type==='resolved'){st.date=fresh.iso;st.pending=null;return this._afterDate(`Baik, saya gunakan **${formatDate(fresh.iso)}**.`);}
      return output(st,[p.question],[{label:`Tanggal ${formatDate(p.iso)}`,value:'ikuti tanggal'},{label:'Ikuti nama hari',value:'ikuti hari'}]);
    }

    // If the customer first said "tanggal 6" and then answers just "November",
    // bind the month to the pending day; never interpret it as a quantity.
    if(st.pending?.kind==='ask_date'&&st.pending.day){
      const months={jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agu:8,agustus:8,sep:9,september:9,okt:10,oktober:10,nov:11,november:11,des:12,desember:12};
      const m=normalized(input).match(/^(?:bulan\s+)?([a-z]+)(?:\s+(20\d\d))?$/);
      if(m&&months[m[1]]){
        const y=m[2]?` ${m[2]}`:'';
        const resolved=extractDateIntent(`${st.pending.day} ${m[1]}${y}`,{now:this.now});
        if(resolved.type==='resolved'){
          st.date=resolved.iso;st.pending=null;
          return this._afterDate(`Baik, saya catat tanggal **${formatDate(resolved.iso)}**.`);
        }
        return output(st,[resolved.message||'Tanggal tidak valid. Mohon sebutkan tanggal lengkap.']);
      }
    }
    if(st.pending?.kind==='product_for_quantity'){
      // A date can arrive before the customer specifies the product; keep the quantity context.
      if(preDate.type==='resolved' && !productMentioned(input,this.catalog)){
        st.date=preDate.iso;
        if(preTime && preTime!=='invalid' && preTime!=='ambiguous')st.time=preTime;
        return output(st,[`Tanggal **${formatDate(st.date)}** dicatat. Saya masih perlu nama produk untuk jumlah **${st.pending.qty}** agar draf lengkap.`]);
      }
      const p=safeCandidateProduct(input,this.catalog);
      if(p){
        const qty=st.pending.qty;st.pending=null;
        st.items.set(p.id,{id:p.id,name:p.name,quantity:qty});st.lastProductId=p.id;st.unassignedQuantity=null;
        return this._next(`Saya catat **${qty} ${p.name}**.`);
      }
      return output(st,[`Saya belum menemukan nama produk “${input.slice(0,65)}” yang cocok dengan katalog. Pilih nama produk yang terdaftar, misalnya “${this.catalog.slice(0,3).map(x=>x.name).join('”, “')}”. Angka pesanan tetap saya ingat.`]);
    }
    if(st.pending?.kind==='quantity_action'){
      const p=st.pending;
      if(/^(?:ganti|ubah|koreksi|ralat|1|pilihan 1)$/i.test(input)){
        st.items.set(p.id,{id:p.id,name:p.name,quantity:p.qty});st.lastProductId=p.id;st.pending=null;
        return this._next(`Jumlah **${p.name} diganti menjadi ${p.qty}**.`);
      }
      if(/^(?:tambah|tambahkan|2|pilihan 2)$/i.test(input)){
        const next=p.before+p.qty;
        st.items.set(p.id,{id:p.id,name:p.name,quantity:next});st.lastProductId=p.id;st.pending=null;
        return this._next(`Jumlah **${p.name} menjadi ${next}** (${p.before} + ${p.qty}).`);
      }
    }
    if(st.pending?.kind==='clarify_quantity'){
      // Do not interpret ambiguous quantity answer as a date unless date clearly provided.
      const nums=extractNumbers(input);
      const target=st.pending.id;
      if(target&&nums.length===1&&/^(?:\d+|\d+\s*(?:buah|pcs|unit)|jadi\s*\d+|sebanyak\s*\d+)$/i.test(input)){
        const p=this.catalog.find(x=>x.id===target);
        st.items.set(p.id,{id:p.id,name:p.name,quantity:nums[0].value});st.lastProductId=p.id;st.pending=null;
        return this._next(`Saya catat **${nums[0].value} ${p.name}**.`);
      }
    }

    if(CONFIRM.test(input)){
      if(st.pending)return output(st,['Masih ada informasi yang harus diklarifikasi sebelum draf bisa dikonfirmasi.']);
      if(!st.items.size)return output(st,['Belum ada produk dengan jumlah yang jelas. Tulis misalnya “10 pejati untuk besok”. Saya belum menyimpan pesanan apa pun.']);
      if(!st.date){st.pending={kind:'ask_date'};return output(st,['Produk sudah dicatat, tetapi tanggal belum ada. Kapan pesanan diperlukan? Jawab misalnya “Jumat”, “6 November”, atau “besok”.']);}
      st.confirmed=true;
      return output(st,[`Draf sudah **dikonfirmasi di prototipe lokal**: ${itemList([...st.items.values()])}, untuk ${formatDate(st.date)}${st.time?` pukul ${st.time} WITA`:''}. Belum disimpan ke database atau memotong stok.`]);
    }
    const dateIntent=extractDateIntent(input,{now:this.now});
    const time=parseTime(input);
    const hasTime=/\b(?:jam|pukul|pkl)\s*\d/.test(input.toLowerCase());
    if(time==='invalid')return output(st,['Jam tidak valid: rentang jam 00–23 dan menit 00–59. Gunakan misalnya “pukul 15.30” atau “jam 3 sore”. Pesanan belum berubah.']);
    if(time==='ambiguous')return output(st,['Jam yang disebut masih ambigu. Maksudnya “jam 3 pagi”, “jam 3 sore”, atau pukul 03.00 / 15.00? Tulis waktu lebih lengkap; tanggal dan produk tidak berubah.']);
    if(time)st.time=time;

    // Detect calendar ambiguity and conflicts before committing. Keep parsed product quantities in draft.
    let dateLine='';
    if(dateIntent.type==='invalid')return output(st,[dateIntent.message]);
    if(dateIntent.type==='past')return output(st,[dateIntent.message]);
    if(dateIntent.type==='weekday_conflict'){
      st.pending={kind:'conflicting_weekday',iso:dateIntent.iso,weekday:dateIntent.weekday,question:dateIntent.message};
    } else if(dateIntent.type==='need_clarify_weekday'){
      if(dateIntent.choices?.length)st.pending={kind:'choose_date',options:dateIntent.choices,weekday:dateIntent.weekday};
      else st.pending={kind:'ask_date'};
    } else if(dateIntent.type==='need_month'){
      st.pending={kind:'ask_date',day:dateIntent.day};
    } else if(dateIntent.type==='resolved'){
      st.date=dateIntent.iso;
      dateLine=`Tanggal **${formatDate(st.date)}** telah dicatat.`;
      if(st.pending?.kind==='ask_date')st.pending=null;
    }

    const stripped=stripDateSpans(input);
    // If a weekday is mentioned with an unattached quantity, preserve the quantity
    // through the date-clarification turn instead of silently losing it.
    if(dateIntent.type!=='none' && !st.items.size && !productMentioned(stripped,this.catalog)){
      const unknownQty=extractNumbers(stripped);
      if(unknownQty.length===1 && !/\b(?:tanggal|tgl|pukul|jam)\b/i.test(stripped))st.unassignedQuantity=unknownQty[0].value;
    }
    // Do not run product parser over a bare date answer; '6 November' is a date, not 6 items.
    const justDate=(dateIntent.type!=='none' && !productMentioned(stripped,this.catalog));
    let parsed=null;
    const standaloneClarification=st.pending?.kind==='ask_date' && dateIntent.type==='none' && !productMentioned(stripped,this.catalog);
    if(!justDate && !standaloneClarification && stripped){
      if(productMentioned(stripped,this.catalog))parsed=parseOrder(stripped,this.catalog);
      else if(st.lastProductId && WORD_CUES.test(stripped) && extractNumbers(stripped).length===1){
        const prev=st.items.get(st.lastProductId);
        const product=this.catalog.find(p=>p.id===st.lastProductId);
        if(prev && product)parsed=parseOrder(`${product.name} ${prev.quantity}, ${stripped}`,this.catalog);
      } else if(!st.items.size && extractNumbers(stripped).length===1){
        st.unassignedQuantity=extractNumbers(stripped)[0].value;
        st.pending=st.pending||{kind:'product_for_quantity',qty:st.unassignedQuantity};
      } else if(st.lastProductId && /^\d+\s*(?:buah|pcs|unit)?$/i.test(stripped)){
        const qty=extractNumbers(stripped)[0]?.value;
        if(qty!==undefined){
          const last=st.items.get(st.lastProductId);
          st.pending=st.pending||{kind:'quantity_action',id:last.id,name:last.name,qty,before:last.quantity};
        }
      }
    }
    const partial=[];
    if(parsed){
      if(parsed.status==='needs_review'){
        const risky=parsed.items.filter(p=>p.status==='needs_review');
        if(!st.pending)st.pending={kind:'clarify_quantity',id:risky.length===1?risky[0].id:null};
        partial.push(`Pesanan ini belum aman dipastikan: ${parsed.questions[0]||'nama produk/jumlah belum jelas.'} ${/\b(kalau|jika|bila)\b/i.test(stripped)?'Ada kalimat bersyarat; tuliskan pesanan final setelah syaratnya dipastikan.':/\b(antara|sekitar|kira-kira)\b/i.test(stripped)?'Ada rentang atau perkiraan; minta jumlah pasti.':'Mohon tulis jumlah pasti atau perjelas produk yang dimaksud.'}`);
      } else {
        for(const p of parsed.items){
          const existing=st.items.get(p.id);
          const genericRepeat=!!existing && !WORD_CUES.test(stripped) && p.quantity!==existing.quantity;
          if(genericRepeat){
            st.pending=st.pending||{kind:'quantity_action',id:p.id,name:p.name,qty:p.quantity,before:existing.quantity};
          }else{st.items.set(p.id,{id:p.id,name:p.name,quantity:p.quantity});st.lastProductId=p.id;}
        }
      }
    }
    if(st.items.size && !parsed && !st.pending && !dateLine && !time)
      partial.push(`Saya membaca pesan “${input.slice(0,90)}”, tetapi belum menemukan perubahan yang aman untuk diterapkan. Tulis “eh 12 aja”, “tambah 5”, “ganti tanggal 6 November”, atau “konfirmasi”. Draf sebelumnya tetap.`);
    if(parsed?.status==='draft'&&parsed.items.length)partial.unshift(`Saya membaca pesanan: **${itemList(parsed.items)}**.`);
    if(dateLine)partial.push(dateLine);
    if(time)partial.push(`Jam **${time} WITA** dicatat.`);
    if(st.pending?.kind==='choose_date')return output(st,[...partial,`Untuk pesanan ini, ${dateIntent.message||'tanggal'} Pilih salah satu tanggal berikut.`],optionsForDate(st.pending.options));
    if(st.pending?.kind==='conflicting_weekday')return output(st,[...partial,st.pending.question],[{label:`Ikuti tanggal: ${formatDate(st.pending.iso)}`,value:'ikuti tanggal'},{label:'Ikuti nama hari',value:'ikuti hari'}]);
    if(st.pending?.kind==='ask_date')return output(st,[...partial,st.pending.day?`Tanggal ${st.pending.day} bulan apa?`:'Tanggal berapa pesanan diperlukan?']);
    if(st.pending?.kind==='product_for_quantity')return output(st,[...partial,`Saya menangkap jumlah **${st.pending.qty}**, tetapi produknya apa?`]);
    if(st.pending?.kind==='quantity_action')return output(st,[...partial,`Untuk ${st.pending.name}: angka ${st.pending.qty} ini **mengganti jumlah ${st.pending.before}** atau **menambah ${st.pending.before}**?`],[{label:'Ganti jumlah',value:'ganti'},{label:'Tambah jumlah',value:'tambah'}]);
    if(st.pending?.kind==='clarify_quantity')return output(st,[...partial,'Mohon tuliskan jumlah pasti untuk produk terkait.']);
    return this._next(partial.join(' ')||'Pesan sudah saya terima, tetapi belum ada rincian baru yang pasti.');
  }
  _afterDate(message){return this._next(message);}
  _next(prefix){
    const st=this.state;
    if(!st.items.size){
      if(st.unassignedQuantity!==null){st.pending={kind:'product_for_quantity',qty:st.unassignedQuantity};return output(st,[`${prefix} Saya menangkap jumlah ${st.unassignedQuantity}, tetapi produknya apa?`]);}
      return output(st,[`${prefix} Produk dan jumlahnya belum jelas. Apa yang ingin dipesan?`]);
    }
    if(!st.date){st.pending={kind:'ask_date'};return output(st,[`${prefix} Jumlah sudah saya catat. Tanggal berapa pesanan diperlukan? Sebutkan tanggal atau nama hari.`]);}
    return output(st,[`${prefix} Ringkasan sementara: **${itemList([...st.items.values()])}** untuk **${formatDate(st.date)}**${st.time?`, pukul ${st.time} WITA`:''}. Jika benar, ketik **konfirmasi** untuk menyiapkan formulir simpan. Jika ada yang salah, tuliskan koreksi; belum ada yang otomatis disimpan.`],[{label:'Konfirmasi draf',value:'konfirmasi'}]);
  }
}
