/** Shadow Root utilities for mounting UI in isolation */

export function ensureShadowRoot(): ShadowRoot | null {
  let hasShadowRoot = !!document.getElementById('yt-longseek-tsjump-root');
  if (hasShadowRoot) {
    const exist = document.getElementById('yt-longseek-tsjump-root');
    return exist && exist.shadowRoot ? exist.shadowRoot : null;
  }
  createShadowRoot();
  const host = document.getElementById('yt-longseek-tsjump-root');
  return host ? host.shadowRoot : null;
}

function createShadowRoot() {
  const host = document.createElement('div');
  host.id = 'yt-longseek-tsjump-root';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.zIndex = '999999';
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      :host { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #container { position: relative; pointer-events: none; }
      #shortcut-help { position: fixed; top: 8px; right: 8px; background: rgba(17,17,17,.9); color: #fff; font-size: 12px; line-height: 1.3; border-radius: 6px; padding: 8px 10px; box-shadow: 0 2px 8px rgba(0,0,0,.3); pointer-events: auto; user-select: none; }
      #shortcut-help .row { display: flex; gap: 6px; align-items: center; }
      #shortcut-help .btn { background: #2563eb; color: #fff; border: 0; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
      #shortcut-help .btn:disabled { opacity: .6; cursor: default; }
      #shortcut-help .close { margin-left: 6px; cursor: pointer; color: #bbb; }
      #shortcut-help small { color: #bbb; }
    </style>
    <div id="container">
      <div id="shortcut-help" style="display:none">
        <div class="row">
          <span>Set keyboard shortcuts in chrome://extensions/shortcuts</span>
          <button class="btn" id="btn-open-shortcuts">Open</button>
          <span class="close" id="btn-close-help">×</span>
        </div>
        <small id="help-status"></small>
      </div>
    </div>`;
}

