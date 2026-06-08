import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { randomUUID } from 'node:crypto';
process.env.NEWSROOM_FILE = join(tmpdir(),`nr-${randomUUID()}.json`);
const N = await import('../src/api/newsroom.js');
test('roster has six agents incl orchestrator',()=>{ assert.equal(N.ROSTER.length,6); assert.ok(N.ROSTER.find(a=>a.kind==='orchestrator')); });
test('every leaf agent drafts a sample',()=>{ for(const a of N.ROSTER.filter(x=>x.kind==='leaf')){ const d=N.runAgent(a.id); assert.equal(d.sample,true); assert.ok(d.body.length>0); } });
test('newsletter assembles with decisions + gaps',()=>{ const d=N.assemble(); assert.ok(d.decisions.length>=1); assert.ok(d.gaps.length>=1); });
test('brainstorm is a multi-agent thread',()=>{ const b=N.brainstorm('education'); assert.ok(b.thread.length>=3); assert.ok(b.thread.some(m=>m.by==='Newsletter')); });
