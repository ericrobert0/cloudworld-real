import { startIsolatedPortal } from '../portal-isolation.mjs';

if (process.platform !== 'linux' || process.getuid() === 0 || !process.env.CW_PORTAL_ORIGIN) {
  throw Error('O portal exige uma conta Linux sem root e CW_PORTAL_ORIGIN.');
}
const origin = new URL(process.env.CW_PORTAL_ORIGIN);
if (origin.protocol !== 'https:' || origin.origin !== process.env.CW_PORTAL_ORIGIN) {
  throw Error('Configure CW_PORTAL_ORIGIN com a origem HTTPS exata do portal.');
}
startIsolatedPortal('/var/lib/cloudworld-portal', origin.origin, null);
