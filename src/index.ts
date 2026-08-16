import {defineTool} from '@deepseek-ai/dsh-tools';import {gitWorkspace,gitStatus,gitFiles,gitDiff,gitCommits,githubPr} from './tools/index.js'
export const name='@tzzs/dsh-git-workspace'
export const inject = ['tools']
const json={type:'object',additionalProperties:true} as const
export function apply(ctx:{tools:{register(tool:unknown):unknown}}){
 const add=(name:string,description:string,parameters:Record<string,unknown>,execute:(a:Record<string,unknown>)=>Promise<unknown>)=>ctx.tools.register(defineTool({name,description,parameters: parameters as never,output:{schema:json,render:(_args: never,_value: never)=>[{type:'text',text:'Git workspace result'}]},async execute(args: Record<string, unknown>){return await execute(args as Record<string,unknown>) as never}} as never))
 add('git_workspace','Summarize the current read-only Git workspace.',{},()=>gitWorkspace())
 add('git_status','Read structured Git branch and working-tree status.',{},()=>gitStatus())
 add('git_files','List Git files by scope.',{scope:{type:'string',enum:['working-tree','staged','committed','all']}},a=>gitFiles((a.scope as 'working-tree'|'staged'|'committed'|'all')??'working-tree'))
 add('git_diff','Read a structured, bounded Git diff.',{path:{type:'string'},staged:{type:'boolean'},base:{type:'string'},head:{type:'string'},offset:{type:'integer'},limit:{type:'integer'}},a=>gitDiff(a as {path?:string;staged?:boolean;base?:string;head?:string;offset?:number;limit?:number}))
 add('git_commits','Read recent Git commits.',{limit:{type:'integer'},path:{type:'string'}},a=>gitCommits(a as {limit?:number;path?:string}))
 add('github_pr','Find all GitHub pull requests for the current branch using gh CLI.',{},()=>githubPr())
}
