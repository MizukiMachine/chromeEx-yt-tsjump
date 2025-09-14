/** Insert a Jump button into YouTube controls and keep it alive during SPA updates. */
import { t } from '../utils/i18n';

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
  const label = t('ui.jump_button');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = `<span class="ytp-jump__inner"><span class="ytp-jump__label">${label}</span></span>`;
  btn.addEventListener('click', () => {
    try {
      const isOpen = toggle.isOpen();
      if (isOpen) toggle.close();
      else toggle.openSmart();
    } catch {}
  });

  // Place at the far-left of the right controls for robustness
  try { (controls as any).prepend(btn); }
  catch { controls.appendChild(btn); }
}
