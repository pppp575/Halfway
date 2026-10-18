import './styles.css';
import { store } from './lib/storage.js';

const theme = store.get('settings', {})?.theme;
if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
