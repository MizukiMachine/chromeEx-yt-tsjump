// A very small mock page script to control a <video> element's seekable range
// It patches the element's seekable TimeRanges so content script can read it.

function makeTimeRanges(start, end) {
  return {
    length: 1,
    start(i) { if (i !== 0) throw new Error('index'); return start; },
    end(i) { if (i !== 0) throw new Error('index'); return end; },
  };
}

const v = document.getElementById('v');
// Load a small blank media. Use a tiny mp4 or data URL fallback.
// To avoid external fetch, use an empty MediaSource so controls are enabled.
try {
  const ms = new MediaSource();
  v.src = URL.createObjectURL(ms);
} catch {}

let s = 0; // start
let e = 3600; // end
function patchSeekable() {
  try {
    Object.defineProperty(v, 'seekable', {
      get() { return makeTimeRanges(s, e); },
      configurable: true,
    });
    Object.defineProperty(v, 'duration', { get() { return e; }, configurable: true });
  } catch {}
}
patchSeekable();

// Controls
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');
const applyBtn = document.getElementById('apply');
const jumpStartBtn = document.getElementById('jumpStart');
const jumpEndBtn = document.getElementById('jumpEnd');
const move10Btn = document.getElementById('move10');
const moveM10Btn = document.getElementById('move-10');
const adOnBtn = document.getElementById('simAdOn');
const adOffBtn = document.getElementById('simAdOff');

applyBtn.onclick = () => {
  s = Number(startEl.value) || 0;
  e = Number(endEl.value) || 0;
  patchSeekable();
};

jumpStartBtn.onclick = () => { try { v.currentTime = s; v.play().catch(()=>{});} catch {} };
jumpEndBtn.onclick = () => { try { v.currentTime = Math.max(s, e - 3); v.play().catch(()=>{});} catch {} };
move10Btn.onclick = () => { try { v.currentTime += 600; } catch {} };
moveM10Btn.onclick = () => { try { v.currentTime -= 600; } catch {} };

// Ad simulation toggles a class similar to YT
adOnBtn.onclick = () => {
  const player = ensurePlayerWrap();
  player.classList.add('ad-showing');
};
adOffBtn.onclick = () => {
  const player = ensurePlayerWrap();
  player.classList.remove('ad-showing');
};

function ensurePlayerWrap() {
  let p = document.querySelector('.html5-video-player');
  if (!p) {
    p = document.createElement('div');
    p.className = 'html5-video-player';
    v.parentElement?.appendChild(p);
    p.appendChild(v);
  }
  return p;
}

// Expose helpers for Playwright tests
window.__mock = {
  setRange(start, end) { s = start; e = end; patchSeekable(); },
  setAd(active) { (active ? adOnBtn : adOffBtn).click(); },
};

