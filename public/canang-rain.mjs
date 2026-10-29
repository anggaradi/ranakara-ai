/** RANAKARA AI v3.1: rain of lightweight, flat canang illustrations.
 * No external dependencies, no account/network operations, and no changes to app.mjs.
 * Runs only inside the dashboard hero. Motion controls stored per browser.
 */
const KEY = 'ranakara:canang-rain-enabled';
const content = document.getElementById('app-content');
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const topActions = document.querySelector('.top-actions');
let enabled = true;
try { enabled = window.localStorage.getItem(KEY) !== 'off'; } catch {}
let toggle = null;
let observedHero = null;
let resizeObserver = null;

function createToggle() {
  if (!topActions || toggle) return;
  toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ranakara-canang-toggle';
  toggle.setAttribute('aria-label', 'Aktifkan atau nonaktifkan hujan canang dekoratif');
  toggle.innerHTML = '<span class="canang-toggle-mark" aria-hidden="true"></span><span class="canang-toggle-label"></span>';
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { window.localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch {}
    refresh();
  });
  topActions.insertBefore(toggle, topActions.firstChild);
}
function active() { return enabled && !media.matches && !document.hidden; }
function updateToggle() {
  if (!toggle) return;
  const motionOn = enabled && !media.matches;
  toggle.setAttribute('aria-pressed', String(motionOn));
  toggle.querySelector('.canang-toggle-label').textContent = motionOn ? 'Hujan canang: ON' : 'Hujan canang: OFF';
  toggle.title = media.matches ? 'Animasi otomatis dimatikan oleh pengaturan reduced motion' : 'Klik untuk mengatur hujan canang';
  toggle.disabled = media.matches;
}
function makeDrops(hero) {
  let layer = hero.querySelector('.ranakara-rain-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'ranakara-rain-layer';
  layer.setAttribute('aria-hidden', 'true');
  const small = window.matchMedia('(max-width: 760px)').matches;
  const count = small ? 6 : 13;
  // Fixed seed offsets avoid jumping whenever dashboard data refreshes.
  for (let i = 0; i < count; i++) {
    const d = document.createElement('span');
    d.className = 'canang-drop';
    const x = small ? 36 + ((i * 37) % 56) : 42 + ((i * 31) % 56);
    const size = small ? 25 + ((i * 7) % 20) : 28 + ((i * 13) % 26);
    const duration = 9 + (i % 5) * 1.8;
    const drift = i % 2 === 0 ? 22 : -25;
    d.style.setProperty('--x', `${x}%`);
    d.style.setProperty('--size', `${size}px`);
    d.style.setProperty('--duration', `${duration}s`);
    d.style.setProperty('--delay', `${(-duration * (i / count) * 1.7).toFixed(2)}s`);
    d.style.setProperty('--alpha', String(small ? 0.38 : 0.55));
    d.style.setProperty('--scale', String(0.75 + (i % 3) * 0.15));
    d.style.setProperty('--sway-start', `${-drift}px`);
    d.style.setProperty('--sway-end', `${drift}px`);
    d.style.setProperty('--rotate-start', `${(i * 47) % 80 - 40}deg`);
    d.style.setProperty('--rotate-end', `${((i * 47) % 80 - 40) + 250 + (i % 2) * 100}deg`);
    layer.append(d);
  }
  hero.insertBefore(layer, hero.firstChild);
  return layer;
}
function disposeResizeObserver() {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  observedHero = null;
}
function refresh() {
  createToggle();
  updateToggle();
  const hero = content?.querySelector('.hero-premium, .hero');
  if (!hero || !active()) {
    if (hero) hero.querySelector('.ranakara-rain-layer')?.remove();
    disposeResizeObserver();
    return;
  }
  const layer = makeDrops(hero);
  if (observedHero !== hero) {
    disposeResizeObserver();
    observedHero = hero;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => layer.style.setProperty('--travel', `${Math.ceil(hero.getBoundingClientRect().height) + 125}px`));
      resizeObserver.observe(hero);
    }
  }
  layer.style.setProperty('--travel', `${Math.ceil(hero.getBoundingClientRect().height) + 125}px`);
}

const watcher = new MutationObserver((records) => {
  // Observe only main-content direct children; ignore our own hero decorations.
  if (records.some(r => r.target === content || (r.target instanceof Element && r.target.parentElement === content))) refresh();
});
if (content) watcher.observe(content, { childList:true });
if (media.addEventListener) media.addEventListener('change', refresh);
else if (media.addListener) media.addListener(refresh);
document.addEventListener('visibilitychange', refresh);
window.addEventListener('resize', () => {
  // Resize typically does not recreate elements; adjust the travel distance only.
  if (observedHero) observedHero.querySelector('.ranakara-rain-layer')?.style.setProperty('--travel', `${Math.ceil(observedHero.getBoundingClientRect().height) + 125}px`);
});
refresh();
