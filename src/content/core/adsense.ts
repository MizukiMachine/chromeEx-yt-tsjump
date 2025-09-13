/**
 * Simple ad detection for YouTube player
 * Detects common ad markers and exposes a small API
 */

let active = false;
let started = false;
let obs: MutationObserver | null = null;
let scopeRoot: ParentNode | Document = document;

export function isAdActive(): boolean { return active; }

export function startAdWatch(root?: Element | Document, onChange?: (a: boolean) => void): void {
  if (started) return; started = true;
  scopeRoot = (root as any) || document;
  const compute = () => {
    try {
      // Prefer robust player flag within scope
      const player = (scopeRoot as ParentNode).querySelector?.('.html5-video-player') as HTMLElement | null;
      const hasFlag = !!(player && player.classList.contains('ad-showing'));
      const hasOverlay = isAnyVisible([
        '.ytp-ad-player-overlay',
        '.ytp-ad-preview',
        '.ytp-ad-image-overlay',
      ]);
      const hasContainer = isAnyVisible([
        '#player-ads',
        '.ytp-ad-module',
      ]);
      const next = !!(hasFlag || hasOverlay || hasContainer);
      if (next !== active) {
        active = next;
        try { onChange && onChange(active); } catch {}
        try { console.log('[Ads] active=', active); } catch {}
      }
    } catch { /* ignore */ }
  };
  // initial
  compute();
  // watch DOM broadly (attributes + subtree)
  obs = new MutationObserver(() => {
    // throttle via microtask
    queueMicrotask(compute);
  });
  try {
    const target = (scopeRoot as Document).documentElement || (scopeRoot as Element);
    obs.observe(target as Node, { attributes: true, subtree: true, childList: true, attributeFilter: ['class','style'] });
  } catch { /* ignore */ }
}

export function stopAdWatch(): void {
  try { obs?.disconnect(); } catch {}
  obs = null; started = false;
}

function isAnyVisible(selectors: string[]): boolean {
  for (const sel of selectors) {
    const nodes = (scopeRoot as ParentNode).querySelectorAll?.(sel) || [];
    for (const n of nodes as any) {
      if (isVisible(n as Element)) return true;
    }
  }
  return false;
}

function isVisible(el: Element): boolean {
  try {
    const style = getComputedStyle(el as HTMLElement);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const rect = (el as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch {
    return false;
  }
}
