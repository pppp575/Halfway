/** Build-time settings. Set them in .env (local) or as GitHub repository variables (deploy). */
const env = import.meta.env;

export const SITE_URL = (env.VITE_SITE_URL || '').replace(/\/+$/, '');
export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const ADSENSE_CLIENT = env.VITE_ADSENSE_CLIENT || '';
export const ADSENSE_SLOTS = {
  round: env.VITE_ADSENSE_SLOT_ROUND || '',
  done: env.VITE_ADSENSE_SLOT_DONE || '',
};
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
