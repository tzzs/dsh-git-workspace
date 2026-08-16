import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run=promisify(execFile)
export interface CommandResult { stdout:string; stderr:string }
export async function command(command:string,args:string[],cwd?:string):Promise<CommandResult>{
 try { const r=await run(command,args,{cwd,encoding:'utf8',maxBuffer:20*1024*1024}); return {stdout:r.stdout,stderr:r.stderr} }
 catch(e) { const x=e as {stdout?:string;stderr?:string;code?:string|number}; throw Object.assign(new Error(x.stderr?.trim()||`Command failed: ${command}`),{code:x.code,stdout:x.stdout??'',stderr:x.stderr??''}) }
}
