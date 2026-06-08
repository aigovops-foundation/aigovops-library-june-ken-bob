// core/src/api/socrates.js — the gate-law desk.
const VERDICT = { YES: 1, NO: 0, MAYBE: "?" };
const COUNCIL = [
  { fn: "legal",        agent: "Statute",   asks: "What is our defensible position, and what law attaches?" },
  { fn: "prodsec",      agent: "Bastion",   asks: "What is the abuse case, and what control must exist first?" },
  { fn: "ai_gov",       agent: "Lantern",   asks: "Which frameworks apply, and what obligations do they attach?" },
  { fn: "it_security",  agent: "Warden",    asks: "Who can reach the data, and is access scoped and brokered?" },
  { fn: "insurance",    agent: "Indemnity", asks: "What risk is retained vs transferred, and will it hold?" },
  { fn: "safety",       agent: "Aegis",     asks: "Who could be harmed, and what eval proves they are not?" },
  { fn: "devsecops",    agent: "Forge",     asks: "What gate is in the pipeline, and is rollback wired?" },
  { fn: "finops",       agent: "Ledger",    asks: "What does this cost, and where is the cap?" },
  { fn: "public_policy",agent: "Herald",    asks: "What is the regulatory weather, and what do we disclose?" }
];
const DEFAULT_POSTURE = {
  get:     { label: "conditional yes",   note: "earn entry — ship behind conditions, each owned" },
  stay:    { label: "yes, with a clock", note: "a license is leased, not owned — renew with evidence" },
  recover: { label: "not yet",           note: "hold the Maybe well — never rush back; retiring is honorable" }
};
function normalizeVerdict(v){
  if (v===1||v==="1"||v===true||v==="yes") return VERDICT.YES;
  if (v===0||v==="0"||v===false||v==="no") return VERDICT.NO;
  return VERDICT.MAYBE;
}
function gate(g){
  const v = normalizeVerdict(g && g.verdict);
  const out = { id:g&&g.id, question:g&&g.question, verdict:v, evidence:(g&&g.evidence)||null, owner:(g&&g.owner)||null };
  if (v===VERDICT.YES && !out.evidence){ out.verdict=VERDICT.MAYBE; out.demoted="yes without evidence -> maybe"; }
  if (out.verdict===VERDICT.MAYBE){
    out.open = true;
    out.discipline = { be_good:"act in good faith; never fake a yes", try_hard:"do the work to find the evidence", eta:(g&&g.eta)||null, owner:out.owner };
  } else { out.open = false; }
  return out;
}
function tally(gates){
  const open = gates.filter(g=>g.verdict===VERDICT.MAYBE);
  const stopped = gates.filter(g=>g.verdict===VERDICT.NO);
  let chamber = stopped.length ? VERDICT.NO : (open.length ? VERDICT.MAYBE : VERDICT.YES);
  return { chamber, counts:{ yes:gates.length-open.length-stopped.length, no:stopped.length, maybe:open.length }, open, stopped };
}
function lawSummary(){
  return { key_to_every_gate:1, "1_yes":"continue — earned with evidence", "0_no":"stop — cancel cleanly, or do the work",
    "?_maybe":"THE HARM — never let it rest; hold it with BE GOOD, TRY HARD, ETA(+owner)", rule:"a Yes without evidence is demoted to a Maybe" };
}
function renderVerdict(spine, result){
  const posture = DEFAULT_POSTURE[spine];
  if (result.chamber===VERDICT.NO) return { gate:0, says:"STOP. A gate returned No.", posture:posture.label, stopped:result.stopped.map(g=>g.id) };
  if (result.chamber===VERDICT.MAYBE) return { gate:"?", says:"NOT YET. Unresolved Maybe(s).", posture:posture.label, discipline:"BE GOOD, TRY HARD, ETA",
    held:result.open.map(g=>({ id:g.id, owner:(g.discipline&&g.discipline.owner)||"UNOWNED — assign one", eta:(g.discipline&&g.discipline.eta)||"NONE — set one" })) };
  return { gate:1, says:"YES — every gate earned with evidence.", posture:posture.label, note:posture.note };
}
export function socrates(req, res, ctx){
  const method = (req.method||"GET").toUpperCase();
  if (method==="GET"){
    let scenario=null;
    try { scenario = new URL(req.url,"http://x").searchParams.get("scenario"); } catch(e){}
    if (scenario && DEFAULT_POSTURE[scenario]) return ctx.json(200,{ agent:"Socrates", spine:scenario, default:DEFAULT_POSTURE[scenario], law:lawSummary() });
    return ctx.json(200,{ agent:"Socrates", role:"gatekeeper — asks the questions that turn a Maybe into a 1 or an honest 0", law:lawSummary(), council:COUNCIL, spines:DEFAULT_POSTURE });
  }
  if (method==="POST"){
    let body="";
    req.on("data",c=>{ body+=c; if(body.length>1e6) req.destroy(); });
    req.on("end",()=>{
      let p={}; try { p=JSON.parse(body||"{}"); } catch(e){ return ctx.json(400,{error:"bad json"}); }
      if (p.op==="ask"){
        const seat = COUNCIL.find(c=>c.fn===p.seat || c.agent.toLowerCase()===String(p.seat||"").toLowerCase());
        if (!seat) return ctx.json(404,{ error:"no such seat", seats:COUNCIL.map(c=>c.fn) });
        return ctx.json(200,{ agent:"Socrates", seat:seat.fn, voice:seat.agent, asks:seat.asks });
      }
      if (p.op==="convene"){
        if (!ctx.isSteward) return ctx.json(403,{ error:"convening requires a steward" });
        const spine = DEFAULT_POSTURE[p.spine] ? p.spine : "get";
        const gates = Array.isArray(p.gates) ? p.gates.map(gate) : [];
        if (!gates.length) return ctx.json(400,{ error:"a convening needs at least one gate" });
        const result = tally(gates);
        const verdict = renderVerdict(spine, result);
        const receipt = { kind:"socrates", spine, decision:String(p.decision||"(unnamed)").slice(0,200), chamber:result.chamber, counts:result.counts,
          open_maybes: result.open.map(g=>({ id:g.id, owner:(g.discipline&&g.discipline.owner)||null, eta:(g.discipline&&g.discipline.eta)||null })), at:new Date().toISOString() };
        if (ctx.ledgerAppend) { try { ctx.ledgerAppend({ kind:"socrates", op:"convene", id:receipt.decision }); } catch(e){} }
        return ctx.json(200,{ agent:"Socrates", spine, verdict, receipt, signed: !!ctx.ledgerAppend });
      }
      return ctx.json(400,{ error:"unknown op", ops:["ask","convene"] });
    });
    return true;
  }
  return ctx.json(405,{ error:"method not allowed" });
}
export { VERDICT, COUNCIL, DEFAULT_POSTURE, gate, tally };
