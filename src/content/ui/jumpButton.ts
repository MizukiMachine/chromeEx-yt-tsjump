/** Insert a Jump button into YouTube controls and keep it alive during SPA updates. */

let controlsMO: MutationObserver | null = null;

export function ensureJumpButton(toggle: { isOpen: () => boolean; openSmart: () => void; close: () => void }) {
  try { mountJumpButton(toggle); } catch {}
  if (!controlsMO) {
    controlsMO = new MutationObserver(() => { try { mountJumpButton(toggle); } catch {} });
    try { controlsMO.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  }
}

function mountJumpButton(toggle: { isOpen: () => boolean; openSmart: () => void; close: () => void }): void {
  const controls = document.querySelector('.html5-video-player .ytp-right-controls') as HTMLElement | null;
  if (!controls) return;
  if (controls.querySelector('#ytp-jump')) return;

  const btn = document.createElement('button');
  btn.className = 'ytp-button ytp-jump';
  btn.id = 'ytp-jump';
  btn.type = 'button';
  btn.title = 'Jump';
  btn.setAttribute('aria-label', 'Jump');
  btn.innerHTML = '<span class="ytp-jump__inner"><span class="ytp-jump__label">Jump</span></span>';
  btn.addEventListener('click', () => {
    try {
      const isOpen = toggle.isOpen();
      if (isOpen) toggle.close();
      else toggle.openSmart();
    } catch {}
  });

  const afterNode = controls.querySelector('.ytp-subtitles-button') as HTMLElement | null;
  const beforeNode = controls.querySelector('.ytp-settings-button') as HTMLElement | null;
  if (afterNode && afterNode.nextSibling) controls.insertBefore(btn, afterNode.nextSibling);
  else if (beforeNode) controls.insertBefore(btn, beforeNode);
  else controls.appendChild(btn);
}

