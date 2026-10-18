import { ADSENSE_CLIENT, ADSENSE_SLOTS } from '../env.js';

let loaded = false;

/** Shows an AdSense unit in `el` when the site is configured for ads. No-op otherwise. */
export function showAd(el, slotName) {
  const slot = ADSENSE_SLOTS[slotName];
  if (!ADSENSE_CLIENT || !slot || !el || el.dataset.filled) return;
  if (!loaded) {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
    document.head.appendChild(s);
    loaded = true;
  }
  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = ADSENSE_CLIENT;
  ins.dataset.adSlot = slot;
  ins.dataset.adFormat = 'auto';
  ins.dataset.fullWidthResponsive = 'true';
  el.appendChild(ins);
  el.dataset.filled = '1';
  el.hidden = false;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    /* ad blockers */
  }
}
