/* Deterministic date/weekday extraction for Asia/Makassar (WITA).
 * Weekday-only input NEVER silently chooses a date.
 * Dates are represented as YYYY-MM-DD civil dates, not timestamps.
 */
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_MAP={jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agu:8,agustus:8,sep:9,september:9,okt:10,oktober:10,nov:11,november:11,des:12,desember:12};
const WEEKDAYS=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const WEEKDAY_MAP={minggu:0,ahad:0,senin:1,selasa:2,rabu:3,kamis:4,kamis:4,jumat:5,jumaat:5,sabtu:6};
export function iso(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
export function civilToDate(civil){return new Date(`${civil}T00:00:00Z`);}
export function addDays(civil,n){return civilToDate(civil).toISOString().slice(0,10)===civil?new Date(civilToDate(civil).getTime()+n*86400000).toISOString().slice(0,10):null;}
export function weekdayOf(civil){return civilToDate(civil).getUTCDay();}
export function formatDate(civil){const x=civilToDate(civil);return `${WEEKDAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;}
export function validDate(y,m,d){if(y<2020||y>2100||m<1||m>12||d<1||d>31)return false;const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;}
export function witaNow(now=new Date()){
 const pts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Makassar',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
 return {today:iso(pts.year,pts.month,pts.day),hour:pts.hour};
}
function normalize(x){return String(x??'').toLowerCase().replace(/[’]/g,"'").replace(/\bjum['’]?at\b|\bjum\.\b/g,'jumat').replace(/\s+/g,' ').trim();}
function sameOrFutureDate(y,m,d,today){
 if(y)return iso(y,m,d);
 const cur=Number(today.slice(0,4));
 return iso(cur,m,d)<today?iso(cur+1,m,d):iso(cur,m,d);
}
function parseExplicitDate(s,today){
 let m;
 // ISO 2026-11-06
 m=s.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/);
 if(m)return {iso:iso(+m[1],+m[2],+m[3]),valid:validDate(+m[1],+m[2],+m[3]),raw:m[0]};
 // Indonesian dd/mm/yyyy or dd-mm-yyyy (dd/mm requires 2 fields)
 m=s.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))\b/);
 if(m){const year=m[3].length===2?2000+Number(m[3]):Number(m[3]);return {iso:iso(year,+m[2],+m[1]),valid:validDate(year,+m[2],+m[1]),raw:m[0]};}
 // '6 november 2026' 'tgl 6 nov' or '6 nov' (month name mandatory)
 const mons=Object.keys(MONTH_MAP).sort((a,b)=>b.length-a.length).join('|');
 const rx=new RegExp(`\\b(?:tanggal|tgl|tanggale)?\\s*(\\d{1,2})\\s*(${mons})(?:\\s+(20\\d\\d))?\\b`);
 m=s.match(rx);
 if(m){const day=+m[1],mo=MONTH_MAP[m[2]],yr=m[3]?+m[3]:null;
   const chosen=sameOrFutureDate(yr,mo,day,today);
   const y=Number(chosen.slice(0,4));return {iso:chosen,valid:validDate(y,mo,day),raw:m[0]};
 }
 // Day-only 'tanggal 6' -> request month (avoid quantity guessing)
 m=s.match(/\b(?:tanggal|tgl)\s*(\d{1,2})\b/);
 if(m)return {needsMonth:+m[1],raw:m[0]};
 return null;
}
function getWeekdays(s){return [...s.matchAll(/\b(minggu|ahad|senin|selasa|rabu|kamis|jumat|jumaat|sabtu)\b/g)].map(m=>({num:WEEKDAY_MAP[m[1]],raw:m[1],pos:m.index}))}
function possibleWeekdays(today,weekday,hour){
 const day=weekdayOf(today);
 let ahead=(weekday-day+7)%7;
 // evening same-day requests may already be too late for an order
 if(ahead===0&&hour>=18)ahead=7;
 const first=addDays(today,ahead);
 return [first,addDays(first,7)];
}
export function extractDateIntent(input,{now=new Date(),today,hour}={}){
 const s=normalize(input);
 const ref=today?{today,hour:hour??12}:witaNow(now);
 const weekdayMentions=getWeekdays(s.replace(/\b(?:minggu|pekan)\s+(?:depan|ini|berikutnya)\b/g,''));
 const uniqueDays=[...new Set(weekdayMentions.map(x=>x.num))];
 const dt=parseExplicitDate(s,ref.today);
 if(dt?.needsMonth)return {type:'need_month',day:dt.needsMonth,raw:dt.raw};
 if(dt&&!dt.valid)return {type:'invalid',message:`Tanggal “${dt.raw}” tidak valid.`};
 if(dt){
   if(dt.iso < ref.today)return {type:'past',iso:dt.iso,message:`${formatDate(dt.iso)} sudah lewat. Pilih tanggal yang akan datang.`};
   const actual=weekdayOf(dt.iso);
   if(uniqueDays.length && uniqueDays.some(day=>day!==actual))return {type:'weekday_conflict',iso:dt.iso,weekday:uniqueDays[0],message:`${formatDate(dt.iso)} tidak cocok dengan hari yang disebutkan. Tanggal atau harinya yang benar?`};
   return {type:'resolved',iso:dt.iso,source:'explicit',raw:dt.raw};
 }
 if(/\b(lusa|besok|esok|hari ini|sekarang)\b/.test(s)){
  const offset=/\blusa\b/.test(s)?2:/\b(besok|esok)\b/.test(s)?1:0;
  const out=addDays(ref.today,offset);
  if(uniqueDays.length && !uniqueDays.includes(weekdayOf(out)))return {type:'weekday_conflict',iso:out,weekday:uniqueDays[0],message:`${formatDate(out)} berbeda dari hari yang Anda sebut. Mohon pastikan tanggalnya.`};
  return {type:'resolved',iso:out,source:'relative'};
 }
 if(uniqueDays.length>1)return {type:'need_clarify_weekday',choices:[],message:'Ada lebih dari satu nama hari. Tanggal mana yang dimaksud?'};
 if(uniqueDays.length===1){
   const weekday=uniqueDays[0];
   const options=possibleWeekdays(ref.today,weekday,ref.hour);
   if(/\b(minggu depan|pekan depan|minggu berikutnya)\b/.test(s) || new RegExp(`\\b${WEEKDAYS[weekday].toLowerCase()}\\s+depan\\b`).test(s)){
     // First occurrence in following ISO week, never silently pick current week's date.
     const monday=addDays(ref.today,-((weekdayOf(ref.today)+6)%7));
     const nextMonday=addDays(monday,7);
     return {type:'resolved',iso:addDays(nextMonday,(weekday+6)%7),source:'week_next',weekday};
   }
   if(/\b(minggu ini|pekan ini)\b/.test(s) || new RegExp(`\\b${WEEKDAYS[weekday].toLowerCase()}\\s+ini\\b`).test(s)){
     const monday=addDays(ref.today,-((weekdayOf(ref.today)+6)%7));
     const chosen=addDays(monday,(weekday+6)%7);
     if(chosen<ref.today)return {type:'past',iso:chosen,message:`${formatDate(chosen)} sudah lewat. Pilih tanggal yang akan datang.`};
     return {type:'resolved',iso:chosen,source:'week_this',weekday};
   }
   return {type:'need_clarify_weekday',weekday,choices:options,message:`${WEEKDAYS[weekday]} yang mana?`};
 }
 return {type:'none'};
}
export function stripDateSpans(s){
 let clean=String(s);
 clean=clean.replace(/\b20\d\d-\d{1,2}-\d{1,2}\b/g,' ')
   .replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g,' ')
   .replace(/\b(?:tanggal|tgl)?\s*\d{1,2}\s*(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|sep|okt|nov|des)(?:\s+20\d\d)?\b/gi,' ')
   .replace(/\b(?:jumat|senin|selasa|rabu|kamis|sabtu|minggu|jum'at|ahad)(?:\s+(?:depan|ini|minggu depan|minggu ini))?\b/gi,' ')
   .replace(/\b(?:minggu depan|pekan depan|besok|esok|lusa|hari ini)\b/gi,' ')
   .replace(/\b(?:jam|pukul|pkl)\s*\d{1,2}(?:[.:]\d{2})?\b/gi,' ');
 return clean.replace(/\s+/g,' ').trim();
}
export function parseTime(input){
 const s=normalize(input);
 const m=s.match(/\b(?:jam|pukul|pkl)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(pagi|siang|sore|malam)?\b/);
 if(!m)return null;
 let hour=Number(m[1]); const minute=Number(m[2]??'0');
 const period=m[3];
 if(hour>23 || minute>59)return 'invalid';
 if(period){
   if(hour<1||hour>12)return 'invalid';
   if(period==='pagi') hour=hour===12?0:hour;
   else if(period==='siang' || period==='sore')hour=hour===12?12:hour+12;
   else hour=hour===12?0:(hour<6?hour+12:hour); // "jam 7 malam" => 19.00
 } else if(!m[2] && hour>=1 && hour<=12){return 'ambiguous';}
 return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
