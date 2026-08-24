import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {Context} from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {SessionStore} from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as plugin from '../lib/index.js'

const run=promisify(execFile)
const EVENT='tzzs.git-workspace/sample'
const KEY='tzzs.git-workspace'
async function git(cwd,args){return run('git',args,{cwd,encoding:'utf8'})}
async function fixture(){const cwd=await mkdtemp(join(tmpdir(),'dsh-git-proj-'));await git(cwd,['init','-q','-b','main']);await git(cwd,['config','user.email','test@example.com']);await git(cwd,['config','user.name','Test']);await writeFile(join(cwd,'file.txt'),'one\n');await git(cwd,['add','file.txt']);await git(cwd,['commit','-qm','initial']);return cwd}
async function until(fn,ms=8000){const t=Date.now();for(;;){if(fn())return;if(Date.now()-t>ms)throw new Error('timeout waiting for projection');await new Promise(r=>setTimeout(r,50))}}
async function setup(){const ctx=new Context();await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(plugin);await ctx.plugin(SessionProjectionRegistry);await ctx.plugin(SessionStore);return ctx}

test('a new session receives a local workspace projection with no model call',async()=>{const cwd=await fixture();try{const ctx=await setup();const session=ctx.sessions.create(undefined,{meta:{cwd}});await until(()=>session.events.some(e=>e.type===EVENT));const value=ctx.sessionProjections.snapshot(session).values[KEY];assert.ok(value&&typeof value==='object');assert.equal(value.error,undefined);assert.equal(value.branch.name,'main');assert.equal(value.repository.root,cwd);const sample=session.events.find(e=>e.type===EVENT);assert.equal(sample.surfaceOp,undefined);assert.equal(session.deriveEventMessage(sample),null)}finally{await rm(cwd,{recursive:true,force:true})}})

test('unchanged state is not re-sampled on turn end, changes are',async()=>{const cwd=await fixture();try{const ctx=await setup();const session=ctx.sessions.create(undefined,{meta:{cwd}});await until(()=>session.events.some(e=>e.type===EVENT));const count=()=>session.events.filter(e=>e.type===EVENT).length;assert.equal(count(),1);session.append('turn/end',{turn:1,reason:{kind:'completed'}});await new Promise(r=>setTimeout(r,400));assert.equal(count(),1);await writeFile(join(cwd,'file.txt'),'one\ntwo\n');session.append('turn/end',{turn:2,reason:{kind:'completed'}});await until(()=>count()>1);assert.ok(count()>=2)}finally{await rm(cwd,{recursive:true,force:true})}})

test('non-repository cwd projects a structured error payload',async()=>{const cwd=await mkdtemp(join(tmpdir(),'dsh-nonrepo-proj-'));try{const ctx=await setup();const session=ctx.sessions.create(undefined,{meta:{cwd}});await until(()=>session.events.some(e=>e.type===EVENT));const value=ctx.sessionProjections.snapshot(session).values[KEY];assert.ok(value&&typeof value==='object');assert.equal(value.error.code,'NOT_A_GIT_REPOSITORY')}finally{await rm(cwd,{recursive:true,force:true})}})

test('snapshot before the first sample lands serves null instead of throwing',async()=>{const cwd=await fixture();try{const ctx=await setup();const session=ctx.sessions.create(undefined,{meta:{cwd}});assert.equal(ctx.sessionProjections.snapshot(session).values[KEY],null);assert.equal(ctx.sessionProjections.restore({},[],0).snapshot.values[KEY],null)}finally{await rm(cwd,{recursive:true,force:true})}})

test('subagent-origin sessions are not sampled',async()=>{const cwd=await fixture();try{const ctx=await setup();const session=ctx.sessions.create(undefined,{meta:{cwd,origin:'subagent'}});await new Promise(r=>setTimeout(r,600));assert.equal(session.events.some(e=>e.type===EVENT),false);assert.equal(ctx.sessionProjections.snapshot(session).values[KEY],null)}finally{await rm(cwd,{recursive:true,force:true})}})
