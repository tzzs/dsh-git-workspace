import test from 'node:test'
import assert from 'node:assert/strict'
import {Context} from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {CallId} from '@deepseek-ai/dsh-llm'
import * as plugin from '../lib/index.js'

const names=['git_workspace','git_status','git_files','git_diff','git_commits','github_pr']
async function setup(){const ctx=new Context();await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(plugin);return ctx}
async function call(ctx,name,args={}){return ctx.tools.execute({callId:CallId(`integration-${name}`),name,arguments:args,signal:new AbortController().signal})}
test('real Harness ToolRuntime discovers and executes all six Git tools',async()=>{const ctx=await setup();const schemas=ctx.tools.schemas();assert.deepEqual(names.map(name=>schemas.find(x=>x.name===name)?.name),names);for(const name of names){const result=await call(ctx,name,name==='git_files'?{scope:'all'}:name==='git_commits'?{limit:1}:{});assert.equal(result.isError,false,`${name}: ${JSON.stringify(result)}`);assert.ok(result.value!==undefined,name)}})
