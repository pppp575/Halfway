const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const randomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

/** Renders text as split-flap tiles; with `animate`, each tile flips through letters before settling. */
export function setFlaps(el, text, animate) {
  el.textContent = '';
  const tiles = [];
  for (const w of text.toUpperCase().split(' ')) {
    const word = document.createElement('span');
    word.className = 'word';
    for (const ch of Array.from(w)) {
      const t = document.createElement('span');
      t.className = 'flap';
      t.textContent = ch;
      word.appendChild(t);
      tiles.push({ el: t, ch });
    }
    el.appendChild(word);
  }
  if (!animate) return;
  tiles.forEach((t, i) => {
    const flips = 5 + i * 2;
    let n = 0;
    t.el.classList.add('spin');
    t.el.textContent = randomChar();
    const iv = setInterval(() => {
      n += 1;
      if (n >= flips || !t.el.isConnected) {
        clearInterval(iv);
        t.el.textContent = t.ch;
        t.el.classList.remove('spin');
        return;
      }
      t.el.textContent = randomChar();
    }, 42);
  });
}
