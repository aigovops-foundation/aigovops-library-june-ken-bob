import { registry } from './registry.js';
import { cost } from './cost.js';
import { members } from './members.js';
import { curate } from './curate.js';
import { audit } from './audit.js';
export const desks={'/api/registry':registry,'/api/cost':cost,'/api/members':members,'/api/curate':curate,'/api/audit':audit};
export function routeDesk(pathname,req,res,ctx){ const h=desks[pathname]; if(!h)return false; h(req,res,ctx); return true; }
