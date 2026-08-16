export type GitFileStatus = 'modified'|'added'|'deleted'|'renamed'|'copied'|'untracked'|'unknown'
export interface ToolError { code:string; message:string; hint?:string }
export type Result<T> = T | { error: ToolError }
export interface Branch { name:string|null; upstream:string|null; ahead:number; behind:number }
export interface GitFile { path:string; oldPath?:string|null; status:GitFileStatus; staged:boolean; unstaged?:boolean }
