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
    </style>`;
}
