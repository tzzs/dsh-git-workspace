import {Context} from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js'
import LlmRuntime,{LlmAdapter,CallId,createUserMessage} from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
import SessionStore,{SessionId} from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js'
import SystemPrompt from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'
import ToolRuntime from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js'
import AgentRegistry from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js'
import AgentLoop from '/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const plugin = await import(pathToFileURL(join(__dirname, '../lib/index.js')).href)
const names = [
  'git_workspace','git_status','git_files','git_diff','git_commits',
  'git_show','git_compare','git_blame','git_branches','git_remotes',
  'git_worktrees','git_stash','git_tags',
  'github_pr','github_pr_diff','github_pr_reviews','github_pr_comments',
  'github_ci','github_ci_logs','github_issue','github_issue_comments',
  'github_releases',
];
const argsFor = (n) => {
  switch (n) {
    case 'git_files': return {scope:'all'};
    case 'git_commits': return {limit:1};
    case 'git_show': return {sha:'HEAD',includeDiff:false,includeFiles:true};
    case 'git_compare': return {base:'HEAD',head:'HEAD'};
    case 'git_blame': return {path:'src/index.ts',limit:5};
    case 'git_diff': return {limit:5};
    case 'github_pr_diff':
    case 'github_pr_reviews':
    case 'github_pr_comments':
    case 'github_issue':
    case 'github_issue_comments':
    case 'github_ci': return {number:1};
    case 'github_ci_logs': return {runId:1};
    default: return {};
  }
};
const chunks=(id,name,args)=>[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:CallId(id),name,argumentsDelta:JSON.stringify(args)},{type:'block-end',index:0,block:{type:'tool-call',id:CallId(id),name,arguments:JSON.stringify(args)}},{type:'usage',usage:{inputTokens:1,outputTokens:1}},{type:'finish',reason:{kind:'tool-calls'}}];
class A extends LlmAdapter { i=0; async *stream(){if(this.i>=names.length){yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'done'};yield {type:'block-end',index:0,block:{type:'text',text:'done'}};yield {type:'usage',usage:{inputTokens:1,outputTokens:1}};yield {type:'finish',reason:{kind:'stop'}};return}const n=names[this.i++];yield* chunks('c'+this.i,n,argsFor(n));}}
const ctx=new Context();await ctx.plugin(LlmRuntime);await ctx.plugin(SessionStore);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(plugin);await ctx.plugin(AgentRegistry);await ctx.plugin(AgentLoop,{agents:[]});ctx.llm.registerAdapter(['mock'],new A());const agent=ctx.agentLoop.create(SessionId('integration-agent'),{provider:'mock',model:'mock'});agent.followup(createUserMessage({content:[{type:'text',text:'inspect workspace'}],source:{kind:'user'}}));await agent.whenIdle();console.log('agent-status',agent.status);const calls=agent.session.events.filter(e=>e.type==='tool/call').map(e=>e.data.name);console.log('tool-call-names',calls);if(JSON.stringify(calls)!==JSON.stringify(names)) process.exit(1);
