import './styles.css';
import { startGame } from './game.js';

try {
  startGame();
} catch (err) {
  const box = document.getElementById('loadError');
  box.textContent = 'Halfway couldn’t start in this browser. Try reloading the page, or update your browser.';
  box.hidden = false;
  console.error(err);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
