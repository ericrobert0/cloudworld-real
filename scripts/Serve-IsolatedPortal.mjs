import {startIsolatedPortal} from '../portal-isolation.mjs';
if(process.platform!=='linux'||process.getuid()!==61001||process.getgroups().some(g=>g!==61001))throw Error('Identidade isolada obrigatoria.');
startIsolatedPortal(process.env.CW_ISOLATED_PORTAL_ROOT,process.env.CW_PORTAL_ORIGIN,process.env.CW_PORTAL_PROXY_HOST);
