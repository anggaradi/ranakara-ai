/** RANAKARA Bali Immersive v5 — visual enhancement only.
 * Preserves original account sessions, NLP and MRP. Does not save, mutate or fetch user data.
 */
const main = document.getElementById('app-content');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const petalLayout = [
  [69,14,-2.7,13,-13],[77,12,-9.2,17,25],[84,13,-5.7,16,-32],
  [93,10,-3.8,14,19],[55,11,-7,17,38],[96,10,-11,12,-20]
];
function decorateHero(){
 const hero = main?.querySelector('.hero-premium');
 if(!hero || hero.querySelector('.rv5-scene')) return;
 const layer=document.createElement('div');layer.className='rv5-scene';layer.setAttribute('aria-hidden','true');
 const sun=document.createElement('span');sun.className='rv5-orb';layer.append(sun);
 if(!motionQuery.matches){
  petalLayout.forEach(([x,size,delay,duration,drift])=>{
   const petal=document.createElement('i');petal.className='rv5-petal';
   petal.style.setProperty('--x',`${x}%`);petal.style.setProperty('--size',`${size}px`);
   petal.style.setProperty('--delay',`${delay}s`);petal.style.setProperty('--duration',`${duration}s`);
   petal.style.setProperty('--drift',`${drift}px`);layer.append(petal);
  });
 }
 const label=document.createElement('span');label.className='rv5-subtitle';label.textContent='WARISAN BALI · TEKNOLOGI';layer.append(label);
 hero.insertBefore(layer,hero.firstChild);
}
function decoratePages(){
 const isCatalog=Boolean(main?.querySelector('.catalog-browser'));
 const first=main?.querySelector(':scope > .card');
 if(isCatalog && first)first.classList.add('rv5-catalog-intro');
 const isStudio=Boolean(main?.querySelector('#order-text'));
 if(isStudio && first)first.classList.add('rv5-studio-banner');
}
function paint(){decorateHero();decoratePages();}
if(main){
 // The app replaces main's children when navigating; keep cosmetics attached to each new view.
 const observer = new MutationObserver(records=>{
  if(records.some(r=>r.target===main))paint();
 });
 observer.observe(main,{childList:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});
 else paint();
}
