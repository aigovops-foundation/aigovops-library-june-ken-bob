import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
const FILE = process.env.NEWSROOM_FILE || `${process.env.DATA_DIR || '/data'}/newsroom.json`;
export const ROSTER=[
{id:'rundown',name:'Rundown',kind:'leaf',blurb:'Monthly governance items, sourced.'},
{id:'failfest',name:'FailFest Scout',kind:'leaf',blurb:'Ranked AI failures & lawsuits.'},
{id:'event-recap',name:'Event Recap',kind:'leaf',blurb:'Recap + LinkedIn variants.'},
{id:'speaker-shortlist',name:'Speaker Shortlister',kind:'leaf',blurb:'Candidate speakers + blurbs.'},
{id:'reg-intel',name:'Registration Intelligence',kind:'leaf',blurb:'Attendee composition & VIPs.'},
{id:'newsletter',name:'Newsletter',kind:'orchestrator',blurb:'Assembles the issue.'}];
const BRAND='AiGovOps Foundation';
function draft(agent,body,decisions=[],gaps=[]){return {agent,sample:true,body,decisions,gaps,note:'SAMPLE — scripted until the Claude tier is on; sources are placeholders to fill.'};}
export function runAgent(id,input={}){const topic=input.topic||'';switch(id){
case 'rundown':return draft('rundown',`${BRAND} — Rundown (draft backlog)\n1. Regulation — [REGULATOR] issues guidance on [topic]. Why it matters: ... [source needed]\n2. Enforcement — [AGENCY] action against [company] over [issue]. [source needed]\n3. Incident — new AI Incident Database entry: [summary]. [source needed]`,['Which 3 items make the cut?','Tone: neutral brief or pointed?'],['3 source links','date confirmations']);
case 'failfest':return draft('failfest',`${BRAND} — FailFest shortlist (ranked)\n1. [Failure A] — why this one: [hook]. [AI Incident DB #__]\n2. [Lawsuit B] — why this one: [hook]. [court docket #__]\n3. [Trade-press C] — why this one: [hook]. [source]`,['Pick the headliner for LinkedIn'],['source links','severity ranking']);
case 'event-recap':return draft('event-recap',`${BRAND} — Event recap (${topic||'most recent event'})\nRecap: A full room explored [theme]; [speaker] argued [point]; takeaway: [quote]. [transcript ref]\nLinkedIn A (short): ...\nLinkedIn B (story): ...\nLinkedIn C (lessons): ...`,['Which LinkedIn variant to publish?'],['speaker quotes from Otter transcript','attendee count from Luma']);
case 'speaker-shortlist':return draft('speaker-shortlist',`${BRAND} — Speaker shortlist\nJul 9 (Education): exec [name/role, link]; founder [name, link]; researcher [name, link]. Intro blurb: ...\nAug 6 (eCommerce/Manufacturing): exec [...]; founder [...]; researcher [...]. Intro blurb: ...`,['Approve who to invite (you hit send)'],['profile links','availability']);
case 'reg-intel':return draft('reg-intel',`${BRAND} — Registration snapshot (sample Luma export, 226 rows)\nComposition: 38% operators, 24% founders, 18% researchers, 20% other. Returning (deduped): 41. VIPs flagged: 6.`,['Confirm VIP list for follow-up'],['real Luma export to replace sample numbers']);
case 'newsletter':return assemble();
default:return draft('unknown','No such agent.');}}
export function assemble(){return draft('newsletter',`${BRAND} — Newsletter (assembled draft)\nTitle options: 1) "Governance, in practice"  2) "The Rundown + the room"  3) "What shipped, what failed"\nPAST (recaps): [Event Recap draft]\nUPCOMING: Jul 9 Education · Aug 6 eCommerce/Manufacturing [calendar]\nTHE RUNDOWN: [top 3 from Rundown]\nFAILFEST: [headliner]\n— every claim source-linked; placeholders flagged; voice & order left to you.`,['Pick the title','Set the section order','Decide what to cut'],['leaf-agent sources','final recap quotes']);}
export function brainstorm(topic='AI governance'){return {sample:true,topic,thread:[
{by:'Rundown',text:`Topic "${topic}": I would anchor on the newest regulation plus one enforcement action. [sources needed]`},
{by:'FailFest Scout',text:`I can pair that with a fresh failure that illustrates the risk — gives the issue a spine.`},
{by:'Event Recap',text:`The Jul 9 Education panel touched this; I can pull a takeaway quote once I have the transcript.`},
{by:'Dana R. (community)',text:`+1 — our members keep asking about classroom use; a practical angle would land.`},
{by:'Newsletter',text:`Proposed order: failure, then the rule, then the recap. Title TBD by a curator. Nothing publishes until Bob or Ken approves.`}],note:'SAMPLE brainstorm — scripted until the model is on. Agents propose; curators decide.'};}
async function load(){try{const j=JSON.parse(await readFile(FILE,'utf8'));return {suggestions:j.suggestions||[],threads:j.threads||[]};}catch{return {suggestions:[],threads:[]};}}
async function save(s){await mkdir(dirname(FILE),{recursive:true}).catch(()=>{});const t=FILE+'.tmp';await writeFile(t,JSON.stringify(s,null,2));await rename(t,FILE);}
function readJson(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{r(b?JSON.parse(b):{})}catch{r({})}})});}
function sendJson(res,c,o){res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o));}
export async function newsroom(req,res,ctx={}){const json=ctx.json||((c,o)=>sendJson(res,c,o));const me=ctx.identity&&ctx.identity.login;
try{const url=new URL(req.url,'http://x');
if(req.method==='GET'){const p=url.searchParams.get('preview');
 if(p){if(p==='assemble')return json(200,assemble());if(p==='brainstorm')return json(200,brainstorm(url.searchParams.get('topic')||'AI governance'));return json(200,runAgent(p,{topic:url.searchParams.get('topic')||''}));}
 const s=await load();const pub=t=>t.public===true;
 return json(200,{brand:BRAND,agents:ROSTER,suggestions:ctx.isSteward?s.suggestions:s.suggestions.filter(pub),threads:ctx.isSteward?s.threads:s.threads.filter(pub)});}
if(req.method==='POST'){const body=await readJson(req);const op=body.op||'';
 if(op==='suggest'){if(!me)return json(401,{error:'sign-in-required'});const s=await load();s.suggestions.push({id:'sug-'+Date.now(),topic:body.topic||'',by:me,public:true,ts:new Date().toISOString()});await save(s);if(ctx.ledgerAppend)await ctx.ledgerAppend({kind:'newsroom',op:'suggest',actor:me,ts:new Date().toISOString()});return json(200,{ok:true});}
 if(!ctx.isSteward)return json(403,{error:'curator-only'});
 const s=await load();let out;
 if(op==='run')out=runAgent(body.agent,body);else if(op==='assemble')out=assemble();else if(op==='brainstorm')out=brainstorm(body.topic);else if(op==='approve'||op==='send')out={ok:true,op,id:body.id};else return json(400,{error:'unknown-op'});
 const entry={id:op+'-'+Date.now(),op,agent:body.agent||op,by:me,public:true,ts:new Date().toISOString(),out};s.threads.push(entry);await save(s);
 if(ctx.ledgerAppend)await ctx.ledgerAppend({kind:'newsroom',op,actor:me,hash:createHash('sha256').update(op+':'+entry.id).digest('hex').slice(0,16),ts:new Date().toISOString()});
 return json(200,{ok:true,op,entry});}
return json(405,{error:'method-not-allowed'});}catch(e){return json(400,{error:'newsroom-refused',detail:String(e.message||e)});}}
