/** Watch SPA URL changes and invoke a callback when changed. */

export function setupURLObserver(onChange: () => void): void {
  let currentURL = location.href;

  const checkURLChange = () => {
    const newURL = location.href;
    if (newURL !== currentURL) {
      currentURL = newURL;
      onChange();
    }
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args as any);
    checkURLChange();
    return result as any;
  } as any;

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args as any);
    checkURLChange();
    return result as any;
  } as any;

  window.addEventListener('popstate', checkURLChange);
  setInterval(checkURLChange, 1000);
}

