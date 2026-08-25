import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve the globally installed dsh CLI package at runtime so this script has
// no hardcoded absolute paths and works on any machine with `dsh` installed
// (npm i -g @deepseek-ai/dsh). Transitive harness packages (@deepseek-ai/cordis,
// dsh-llm, ...) live inside dsh's own node_modules.
function resolveDshRoot() {
  const fromEnv = process.env.DSH_GLOBAL_ROOT
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`DSH_GLOBAL_ROOT does not exist: ${fromEnv}`)
    return fromEnv
  }
  const globalRoot = execFileSync('npm', ['root', '-g'], {encoding: 'utf8'}).trim()
  const candidates = [
    join(globalRoot, '@deepseek-ai/dsh'),
    join(globalRoot, 'node_modules/@deepseek-ai/dsh'), // pnpm/yarn-style layouts
  ]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error(
    `Cannot locate the globally installed @deepseek-ai/dsh package.\n` +
    `Install it first (npm i -g @deepseek-ai/dsh) or point DSH_GLOBAL_ROOT at its directory.`,
  )
}

const dshRoot = resolveDshRoot()
const req = (name) => pathToFileURL(join(dshRoot, 'node_modules', name)).href

const {Context} = await import(req('@deepseek-ai/cordis/lib/index.js'))
const LlmRuntimeDefault = await import(req('@deepseek-ai/dsh-llm/lib/index.js'))
const {LlmAdapter, CallId, createUserMessage} = LlmRuntimeDefault
const LlmRuntime = LlmRuntimeDefault.default ?? LlmRuntimeDefault
const SessionStoreMod = await import(req('@deepseek-ai/dsh-session/lib/index.js'))
const SessionStore = SessionStoreMod.default ?? SessionStoreMod
const SessionId = SessionStoreMod.SessionId
const SystemPromptMod = await import(req('@deepseek-ai/dsh-system-prompt/lib/index.js'))
const SystemPrompt = SystemPromptMod.default ?? SystemPromptMod
const ToolRuntimeMod = await import(req('@deepseek-ai/dsh-tools/lib/index.js'))
const ToolRuntime = ToolRuntimeMod.default ?? ToolRuntimeMod
const AgentRegistryMod = await import(req('@deepseek-ai/dsh-agent/lib/index.js'))
const AgentRegistry = AgentRegistryMod.default ?? AgentRegistryMod
const AgentLoopMod = await import(req('@deepseek-ai/dsh-agent-loop/lib/index.js'))
const AgentLoop = AgentLoopMod.default ?? AgentLoopMod

const plugin = await import(pathToFileURL(join(__dirname, '../lib/index.js')).href)
const names = [
  'git_workspace','git_status','git_files','git_diff','git_commits',
  'git_show','git_compare','git_blame','git_branches','git_remotes',
  'git_worktrees','git_stash','git_tags',
  'github_pr','github_pr_diff','github_pr_reviews','github_pr_comments',
  'github_ci','github_ci_logs','github_issue','github_issue_comments',
  'github_releases','git_stage','git_unstage','git_commit',
  'git_branch_create','git_push','git_checkout','git_merge','git_reset',
  'github_pr_create','github_pr_merge','github_pr_comment','github_pr_review',
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
const ctx=new Context();await ctx.plugin(LlmRuntime);await ctx.plugin(SessionStore);await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);await ctx.plugin(plugin);await ctx.plugin(AgentRegistry);await ctx.plugin(AgentLoop,{agents:[]});ctx.llm.registerAdapter(['mock'],new A());const agent=ctx.agentLoop.create(SessionId('integration-agent'),{provider:'mock',model:'mock'});agent.followup(createUserMessage({content:[{type:'text',text:'inspect workspace'}],source:{kind:'user'}}));await agent.whenIdle();console.log('agent-status',agent.status);const calls=agent.session.events.filter(e=>e.type==='tool/call').map(e=>e.data.name);console.log('tool-call-names',calls.length,'of',names.length);if(JSON.stringify(calls)!==JSON.stringify(names)) process.exit(1);
