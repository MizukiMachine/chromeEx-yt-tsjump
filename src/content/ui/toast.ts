let container: HTMLElement | null = null;
let mountedRoot: ShadowRoot | null = null;

type Kind = 'success' | 'info' | 'warn' | 'error';

export function initToast(root: ShadowRoot): void {
  if (mountedRoot === root && container) return;
  mountedRoot = root;
  container = root.getElementById('yt-toasts') as HTMLElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = 'yt-toasts';
    Object.assign(container.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    root.appendChild(container);
  }
  // inject minimal styles once per root
  const styleId = 'yt-toasts-style';
  if (!root.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    .yt-toast{min-width:240px;max-width:360px;color:#fff;background:rgba(17,17,17,.95);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.35);opacity:0;transform:translateY(8px);transition:opacity .2s ease, transform .2s ease;pointer-events:auto;font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif}
    .yt-toast.show{opacity:1;transform:translateY(0)}
    .yt-toast.info{border-color:#2563eb}
    .yt-toast.success{border-color:#22c55e}
    .yt-toast.warn{border-color:#f59e0b}
    .yt-toast.error{border-color:#ef4444}
    `;
    root.appendChild(style);
  }
}

export function showToast(text: string, kind: Kind = 'info', durationMs = 3000): void {
  // Lazy-init: 他の箇所から直接呼ばれても表示できるよう、ShadowRootを探して初期化する
  if (!container) {
    try {
      const host = document.getElementById('yt-longseek-tsjump-root');
      const sr = host?.shadowRoot ?? null;
      if (sr) initToast(sr);
    } catch {}
  }
  // それでも未初期化なら、document.body にフォールバックコンテナを用意
  if (!container) {
    try {
      let fb = document.getElementById('yt-toasts-fallback') as HTMLElement | null;
      if (!fb) {
        fb = document.createElement('div');
        fb.id = 'yt-toasts-fallback';
        Object.assign(fb.style, {
          position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647',
          display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none',
        } as CSSStyleDeclaration);
        document.body.appendChild(fb);
        // style
        const styleId = 'yt-toasts-fallback-style';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
          .yt-toast{min-width:240px;max-width:360px;color:#fff;background:rgba(17,17,17,.95);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.35);opacity:0;transform:translateY(8px);transition:opacity .2s ease, transform .2s ease;pointer-events:auto;font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif}
          .yt-toast.show{opacity:1;transform:translateY(0)}
          .yt-toast.info{border-color:#2563eb}
          .yt-toast.success{border-color:#22c55e}
          .yt-toast.warn{border-color:#f59e0b}
          .yt-toast.error{border-color:#ef4444}
          `;
          document.head.appendChild(style);
        }
      }
      container = fb;
    } catch {}
  }
  if (!container) return; // still not initialized
  // cap at 3 items
  try {
    while (container!.children.length >= 3) container!.removeChild(container!.firstElementChild!);
  } catch {}

  const el = document.createElement('div');
  el.className = `yt-toast ${kind}`;
  el.textContent = text;
  el.onclick = () => removeNow();
  container!.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const t = window.setTimeout(() => removeNow(), durationMs);
  function removeNow(){
    try { window.clearTimeout(t); } catch {}
    try {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    } catch {}
  }
}
