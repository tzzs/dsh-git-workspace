import {gitStatus} from './status.js';import {command} from './exec.js';import {repository} from './repository.js';import type {Result,GitFile} from '../types.js'
export type Scope='working-tree'|'staged'|'committed'|'all'
export async function gitFiles(scope:Scope='working-tree',cwd=process.cwd()):Promise<Result<{files:GitFile[]}>>{
 const r=await repository(cwd);if('error'in r)return r
 if(scope==='committed'){
  try { const text=(await command('git',['ls-tree','-r','--name-only','-z','HEAD'],r.root)).stdout;return {files:text.split('\0').filter(Boolean).map(path=>({path,status:'modified' as const,staged:false}))} }
  catch { return {error:{code:'GIT_COMMAND_FAILED',message:'Unable to list committed files.'}} }
 }
 const s=await gitStatus(r.root);if('error'in s)return s;let f=s.files;if(scope==='staged')f=f.filter(x=>x.staged);if(scope==='all'){try{const committed=(await command('git',['ls-tree','-r','--name-only','-z','HEAD'],r.root)).stdout.split('\0').filter(Boolean).map(path=>({path,status:'modified' as const,staged:false}));const changed=new Set(f.map(x=>x.path));f=[...committed.filter(x=>!changed.has(x.path)),...f]}catch{return {error:{code:'GIT_COMMAND_FAILED',message:'Unable to list all Git files.'}}}}return {files:f}
}
