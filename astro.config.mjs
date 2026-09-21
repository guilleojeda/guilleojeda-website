import { defineConfig } from 'astro/config';

const rawSiteUrl = process.env.SITE_URL;

if (!rawSiteUrl) {
  throw new Error('SITE_URL is required. Set it to the public HTTPS origin before building.');
}

let siteUrl;
try {
  siteUrl = new URL(rawSiteUrl);
} catch {
  throw new Error(`SITE_URL must be an absolute URL: ${rawSiteUrl}`);
}

if (siteUrl.protocol !== 'https:') {
  throw new Error('SITE_URL must use HTTPS.');
}

if (siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash || siteUrl.username || siteUrl.password) {
  throw new Error('SITE_URL must be an origin without a path, query, hash, username, or password.');
}

export default defineConfig({
  site: siteUrl.href,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory'
  }
});
