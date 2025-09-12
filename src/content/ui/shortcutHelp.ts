import { getBool, setBool, Keys } from '../store/local'

export function ensureShortcutHelp() {
  const host = document.getElementById('yt-longseek-tsjump-root');
  const sr = host?.shadowRoot;
  if (!sr) return;
  const dismissed = getBool(Keys.ShortcutsHelpDismissed);
  const box = sr.getElementById('shortcut-help') as HTMLDivElement | null;
  if (!box) return;
  if (dismissed) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  const openBtn = sr.getElementById('btn-open-shortcuts') as HTMLButtonElement | null;
  const closeBtn = sr.getElementById('btn-close-help') as HTMLSpanElement | null;
  const status = sr.getElementById('help-status') as HTMLElement | null;
  if (openBtn && !openBtn.onclick) {
    openBtn.onclick = async () => {
      openBtn.disabled = true;
      status && (status.textContent = 'Opening...');
      try {
        const res = await chrome.runtime.sendMessage({ type: 'OPEN_SHORTCUTS' } as any);
        if (res && res.opened) {
          status && (status.textContent = 'Opened in a new tab');
        } else {
          throw new Error('open failed');
        }
      } catch {
        try {
          await navigator.clipboard.writeText('chrome://extensions/shortcuts');
          status && (status.textContent = 'Copied link to clipboard');
        } catch {
          status && (status.textContent = 'Could not open — link copied');
        }
      } finally {
        openBtn.disabled = false;
      }
    };
  }
  if (closeBtn && !closeBtn.onclick) {
    closeBtn.onclick = () => {
      box.style.display = 'none';
      try { setBool(Keys.ShortcutsHelpDismissed, true); } catch {}
    };
  }
}

