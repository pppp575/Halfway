import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Adds canonical and absolute social-image tags when VITE_SITE_URL is set. */
function siteMeta(siteUrl) {
  return {
    name: 'halfway-site-meta',
    transformIndexHtml(html) {
      if (!siteUrl) return html.replace('<!--site-meta-->', '');
      const url = siteUrl.replace(/\/+$/, '');
      const tags = [
        `<link rel="canonical" href="${url}/" />`,
        `<meta property="og:url" content="${url}/" />`,
        `<meta property="og:image" content="${url}/og-image.png" />`,
        `<meta name="twitter:image" content="${url}/og-image.png" />`,
      ].join('\n    ');
      return html.replace('<!--site-meta-->', tags);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // "/" for a custom domain or user.github.io, "/<repo>/" for a project page. Set by the deploy workflow.
    base: env.VITE_BASE || '/',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [siteMeta(env.VITE_SITE_URL)],
    build: {
      target: 'es2020',
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          privacy: resolve(import.meta.dirname, 'privacy.html'),
        },
      },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
    },
  };
});
