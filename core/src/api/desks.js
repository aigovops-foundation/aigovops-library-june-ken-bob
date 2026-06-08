import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registry } from "./registry.js";
import { cost } from "./cost.js";
import { members } from "./members.js";
import { curate } from "./curate.js";
import { audit } from "./audit.js";
import { newsroom } from "./newsroom.js";
const __d = dirname(fileURLToPath(import.meta.url));
function page(file){ return (req,res)=>{ const html=readFileSync(join(__d,"..","..","public",file),"utf8"); res.writeHead(200,{"content-type":"text/html; charset=utf-8"}); res.end(html); }; }
export const desks = {
  "/api/registry": registry, "/api/cost": cost, "/api/members": members,
  "/api/curate": curate, "/api/audit": audit, "/api/newsroom": newsroom,
  "/demo": page("demo.html"), "/newsroom": page("newsroom.html"), "/tour": page("tour.html")
};
export function routeDesk(pathname, req, res, ctx){ const h = desks[pathname]; if(!h) return false; h(req,res,ctx); return true; }
