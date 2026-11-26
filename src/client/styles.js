const css = String.raw`
.dgw-root{
  --dgw-space-1:4px;--dgw-space-2:8px;--dgw-space-3:12px;--dgw-space-4:16px;--dgw-space-5:20px;--dgw-space-6:24px;--dgw-space-8:32px;
  --dgw-radius-xs:4px;--dgw-radius-sm:6px;--dgw-radius-md:8px;--dgw-radius-lg:12px;--dgw-radius-xl:16px;
  --dgw-font-xs:10px;--dgw-font-sm:11px;--dgw-font-md:12px;--dgw-font-lg:13px;--dgw-font-xl:14px;
  --dgw-line-tight:16px;--dgw-line:20px;
  --dgw-bg:var(--dsw-alias-bg-base);--dgw-surface:var(--dsw-alias-bg-layer-2);--dgw-surface-2:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-layer-2));
  --dgw-text:var(--dsw-alias-label-primary);--dgw-text-2:var(--dsw-alias-label-secondary);--dgw-text-3:var(--dsw-alias-label-secondary);
  --dgw-border:var(--dsw-alias-border-l1);--dgw-border-2:var(--dsw-alias-border-l2);
  --dgw-accent:var(--dsw-alias-brand-primary);--dgw-on-accent:var(--dsw-alias-label-primary-inverted);
  --dgw-success:var(--dsw-alias-state-success-primary);--dgw-error:var(--dsw-alias-state-error-primary);--dgw-warn:var(--dsw-alias-state-warn-primary);
  --dgw-success-strong:color-mix(in srgb,var(--dgw-success) 52%,var(--dgw-text));--dgw-error-strong:color-mix(in srgb,var(--dgw-error) 78%,var(--dgw-text));--dgw-warn-strong:color-mix(in srgb,var(--dgw-warn) 42%,var(--dgw-text));
  --dgw-hover:var(--dsw-alias-interactive-bg-hover);--dgw-active:var(--dsw-alias-interactive-bg-hover-solid);
  --dgw-add-bg:color-mix(in srgb,var(--dgw-success) 11%,transparent);--dgw-del-bg:color-mix(in srgb,var(--dgw-error) 10%,transparent);
  --dgw-shadow:0 1px 2px color-mix(in srgb,var(--dgw-text) 8%,transparent);
  --dgw-shadow-pop:0 16px 40px color-mix(in srgb,var(--dgw-text) 18%,transparent);
  --dgw-dur-fast:150ms;--dgw-dur:200ms;--dgw-ease:cubic-bezier(.2,.8,.2,1);
}
.dgw-root{container-type:inline-size;container-name:dgw-panel;color:var(--dgw-text);font-family:var(--dsw-font-family);font-size:var(--dgw-font-md);line-height:var(--dgw-line)}
.dgw-root *,.dgw-root *::before,.dgw-root *::after{box-sizing:border-box}
.dgw-root :where(button,[role="button"],a,input,textarea,summary):focus-visible{outline:2px solid var(--dgw-accent);outline-offset:2px}
.dgw-root :where(button,[role="button"]):disabled{cursor:default}
.dgw-root ::selection{background:color-mix(in srgb,var(--dgw-accent) 26%,transparent)}

.dgw-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:var(--dgw-radius-sm);background:none;color:var(--dgw-text-2);cursor:pointer;flex:none;transition:background-color var(--dgw-dur-fast) var(--dgw-ease),color var(--dgw-dur-fast) var(--dgw-ease),opacity var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-iconbtn:hover:not(:disabled){background:var(--dgw-hover);color:var(--dgw-text)}
.dgw-iconbtn:active:not(:disabled){background:var(--dgw-active)}
.dgw-iconbtn:disabled{opacity:.38}
.dgw-linkbtn{display:inline-flex;align-items:center;justify-content:center;gap:5px;width:auto;min-height:26px;padding:0 var(--dgw-space-2);border:0;border-radius:var(--dgw-radius-sm);background:none;color:var(--dgw-text-2);font:500 var(--dgw-font-sm) var(--dsw-font-family);cursor:pointer;text-decoration:none;white-space:nowrap}
.dgw-linkbtn:hover:not(:disabled){background:var(--dgw-hover);color:var(--dgw-text)}
.dgw-row{position:relative;display:flex;align-items:center;gap:var(--dgw-space-2);min-height:28px;min-width:0;margin:0;padding:0 var(--dgw-space-2);border-radius:var(--dgw-radius-sm);font-size:var(--dgw-font-md);line-height:var(--dgw-line-tight);cursor:default;transition:background-color var(--dgw-dur-fast) var(--dgw-ease),box-shadow var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-row:hover{background:var(--dgw-hover)}
.dgw-row[data-active="true"]{background:var(--dgw-active);box-shadow:inset 2px 0 0 var(--dgw-accent)}
.dgw-copy{opacity:0;transition:opacity var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-row:hover .dgw-copy,.dgw-row:focus-within .dgw-copy,.dgw-copy:focus-within{opacity:1}
.dgw-copy.dgw-iconbtn{width:22px;height:22px}
.dgw-link{text-decoration:none}.dgw-link:hover{text-decoration:underline}
.dgw-chevron{transition:transform var(--dgw-dur) var(--dgw-ease);flex:none;display:inline-flex;color:var(--dgw-text-3)}
.dgw-chevron[data-open="true"]{transform:rotate(90deg)}
.dgw-textarea{width:100%;box-sizing:border-box;min-height:34px;padding:var(--dgw-space-2) var(--dgw-space-2);border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-sm);background:var(--dgw-bg);color:var(--dgw-text);font-family:var(--dsw-font-family);font-size:var(--dgw-font-md);line-height:18px;resize:vertical;outline:none;transition:border-color var(--dgw-dur-fast) var(--dgw-ease),box-shadow var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-textarea:hover{border-color:var(--dgw-border-2)}
.dgw-textarea:focus-visible{border-color:var(--dgw-accent);outline:2px solid var(--dgw-accent);outline-offset:1px}
.dgw-textarea::placeholder{color:var(--dgw-text-2)}
.dgw-stagebtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;height:30px;padding:0 var(--dgw-space-2);border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-sm);background:var(--dgw-bg);color:var(--dgw-text);font-family:var(--dsw-font-family);font-size:var(--dgw-font-md);font-weight:500;cursor:pointer;transition:background-color var(--dgw-dur-fast) var(--dgw-ease),border-color var(--dgw-dur-fast) var(--dgw-ease),opacity var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-stagebtn:hover:not(:disabled){background:var(--dgw-hover);border-color:var(--dgw-border-2)}
.dgw-stagebtn:active:not(:disabled){background:var(--dgw-active)}
.dgw-stagebtn:disabled{opacity:.42}
.dgw-primarybtn{background:var(--dgw-accent);border-color:var(--dgw-accent);color:var(--dgw-on-accent);font-weight:600}
.dgw-primarybtn:hover:not(:disabled){background:color-mix(in srgb,var(--dgw-accent) 88%,var(--dgw-text));border-color:var(--dgw-accent)}
.dgw-mergebtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;height:34px;padding:0 var(--dgw-space-3);border:none;border-radius:var(--dgw-radius-sm);background:var(--dgw-success-strong);color:var(--dgw-on-accent);font-family:var(--dsw-font-family);font-size:var(--dgw-font-md);font-weight:600;cursor:pointer;transition:filter var(--dgw-dur-fast) var(--dgw-ease),opacity var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-mergebtn:hover:not(:disabled){filter:brightness(1.06)}
.dgw-mergebtn:active:not(:disabled){filter:brightness(.96)}
.dgw-mergebtn:disabled{opacity:.45}
.dgw-linkicon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--dgw-radius-sm);color:var(--dgw-text-3);text-decoration:none;flex:none;transition:background-color var(--dgw-dur-fast) var(--dgw-ease),color var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-linkicon:hover{background:var(--dgw-hover);color:var(--dgw-text)}
.dgw-actionmenu{width:240px;max-height:min(60dvh,420px);overflow-y:auto;padding:var(--dgw-space-1);border:1px solid var(--dgw-border-2);border-radius:var(--dgw-radius-lg);background:var(--dgw-surface);box-shadow:var(--dgw-shadow-pop);z-index:1200;scrollbar-width:thin}
.dgw-actionmenu[popover]{inset:auto;margin:0}
.dgw-action{display:flex;align-items:center;justify-content:space-between;gap:var(--dgw-space-2);width:100%;min-height:30px;padding:0 var(--dgw-space-2);border:0;border-radius:var(--dgw-radius-sm);background:none;color:var(--dgw-text);font:var(--dgw-font-md) var(--dsw-font-family);text-align:left;cursor:pointer}
.dgw-action:hover:not(:disabled),.dgw-action:focus-visible{background:var(--dgw-hover)}
.dgw-action:disabled{color:var(--dgw-text-3);cursor:default}
.dgw-actionsep{height:1px;margin:var(--dgw-space-1) 0;background:var(--dgw-border)}
.dgw-createpr{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 var(--dgw-space-3);border:0;border-radius:var(--dgw-radius-sm);background:var(--dgw-text);color:var(--dgw-bg);font-family:var(--dsw-font-family);font-size:var(--dgw-font-md);font-weight:600;cursor:pointer;flex:none;transition:opacity var(--dgw-dur-fast) var(--dgw-ease)}
.dgw-createpr:hover{opacity:.88}
.dgw-createpr:active{opacity:.78}
.dgw-createpr:disabled{opacity:.45;cursor:default}
.dgw-dock-open [data-git-workspace-drawer]{border-right:1px solid var(--dgw-border-2)}
.dgw-filebtn{display:flex;align-items:center;gap:var(--dgw-space-2);cursor:pointer;font-family:var(--dsw-font-family);padding-inline-start:calc(var(--dgw-depth,0) * 12px + var(--dgw-space-3) + 17px)}
.dgw-dirbtn{display:flex;align-items:center;gap:6px;border:none;background:none;cursor:pointer;font-family:var(--dsw-font-family);text-align:left;padding-inline-start:calc(var(--dgw-depth,0) * 12px + var(--dgw-space-2))}
.dgw-filebtn:focus-visible,.dgw-dirbtn:focus-visible{outline-offset:-2px}

.dgw-panel-shell{display:flex;flex-direction:column;height:100%;min-height:0;padding:0}
.dgw-statusbar{display:flex;flex-direction:column;gap:var(--dgw-space-1);padding:var(--dgw-space-3) var(--dgw-space-3) var(--dgw-space-2);flex:none;border-bottom:1px solid var(--dgw-border);background:var(--dgw-surface)}
.dgw-statusbar__row{display:flex;align-items:center;gap:var(--dgw-space-2);min-width:0;min-height:26px}
.dgw-statusbar__branch{display:inline-flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;color:var(--dgw-text)}
.dgw-statusbar__name{font:600 var(--dgw-font-lg)/18px var(--dsw-font-family-code);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgw-statusbar__upstream{display:inline-flex;align-items:center;gap:3px;min-width:0;font:var(--dgw-font-xs)/14px var(--dsw-font-family-code);color:var(--dgw-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dgw-statusbar__counts{display:inline-flex;align-items:center;gap:var(--dgw-space-1);flex:none;font:var(--dgw-font-xs)/14px var(--dsw-font-family-code);color:var(--dgw-text-2)}
.dgw-statusbar__state{display:inline-flex;align-items:center;gap:5px;font:var(--dgw-font-sm)/16px var(--dsw-font-family);color:var(--dgw-text-2);white-space:nowrap}
.dgw-sync{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-sm);background:var(--dgw-bg);flex:none}
.dgw-syncbtn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border:0;border-radius:var(--dgw-radius-xs);background:none;color:var(--dgw-text-2);font:500 var(--dgw-font-sm) var(--dsw-font-family);cursor:pointer;white-space:nowrap}
.dgw-syncbtn:hover:not(:disabled){background:var(--dgw-hover);color:var(--dgw-text)}
.dgw-syncbtn:active:not(:disabled){background:var(--dgw-active)}
.dgw-syncbtn:disabled{opacity:.4}
.dgw-statusbar__meta{display:flex;align-items:center;gap:var(--dgw-space-2);min-width:0;flex:1 1 auto}
.dgw-changeshead{display:flex;align-items:center;gap:var(--dgw-space-2);min-height:38px;padding:var(--dgw-space-2) var(--dgw-space-3);flex:none;border-bottom:1px solid var(--dgw-border);background:var(--dgw-surface)}
.dgw-changeshead__title{font:600 var(--dgw-font-sm)/16px var(--dsw-font-family);letter-spacing:.06em;text-transform:uppercase;color:var(--dgw-text-2)}
.dgw-changeshead__count{font:600 var(--dgw-font-xs)/16px var(--dsw-font-family-code);color:var(--dgw-text-3)}
.dgw-grouphd{display:flex;align-items:center;gap:6px;min-height:30px;padding:0 var(--dgw-space-3);cursor:pointer;background:var(--dgw-surface);border-bottom:1px solid color-mix(in srgb,var(--dgw-border) 64%,transparent);color:var(--dgw-text-2)}
.dgw-grouphd:hover{background:var(--dgw-hover)}
.dgw-grouphd:focus-visible{outline-offset:-2px}
.dgw-grouphd__title{font:600 var(--dgw-font-xs)/16px var(--dsw-font-family);letter-spacing:.06em;text-transform:uppercase}
.dgw-grouphd__count{font:600 var(--dgw-font-xs)/16px var(--dsw-font-family-code);color:var(--dgw-text-3)}
.dgw-groupbody{padding:var(--dgw-space-1) var(--dgw-space-2)}
.dgw-minibtn{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 var(--dgw-space-2);border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-xs);background:var(--dgw-bg);color:var(--dgw-text-2);font:500 var(--dgw-font-xs) var(--dsw-font-family);cursor:pointer;white-space:nowrap}
.dgw-minibtn:hover:not(:disabled){background:var(--dgw-hover);color:var(--dgw-text)}
.dgw-minibtn:disabled{opacity:.4}
.dgw-minibtn[data-armed="true"]{color:var(--dgw-error);border-color:var(--dgw-error)}
.dgw-inline-diff{margin:var(--dgw-space-1) var(--dgw-space-2) var(--dgw-space-2) var(--dgw-space-3);border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-lg);overflow:hidden;background:var(--dgw-bg);box-shadow:var(--dgw-shadow)}
.dgw-diff{display:flex;flex-direction:column;min-height:0;flex:1 1 auto;background:var(--dgw-bg)}
.dgw-diff-head{display:flex;align-items:center;gap:var(--dgw-space-2);padding:var(--dgw-space-2) var(--dgw-space-3);min-height:40px;flex:none;border-bottom:1px solid var(--dgw-border);background:var(--dgw-surface);position:sticky;top:0;z-index:2}
.dgw-diff-head__path{flex:1 1 auto;min-width:0}
.dgw-diff-body{position:relative;flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;background:var(--dgw-bg);scrollbar-width:thin}
.dgw-inline-diff .dgw-diff{flex:none}
.dgw-inline-diff .dgw-diff-body{max-height:360px}
.dgw-diff-hunk{display:flex;flex-direction:column}
.dgw-diff-hunkhead{display:flex;align-items:center;justify-content:space-between;gap:var(--dgw-space-2);min-height:24px;padding:0 var(--dgw-space-3);font:var(--dgw-font-sm)/16px var(--dsw-font-family-code);color:var(--dgw-text-2);background:color-mix(in srgb,var(--dgw-text) 4%,var(--dgw-bg));border-block:1px solid var(--dgw-border);white-space:nowrap}
.dgw-diff-line{display:flex;align-items:center;min-height:22px;font-family:var(--dsw-font-family-code);font-size:11.5px;line-height:17px;min-width:max-content}
.dgw-diff-gutter{flex:none;width:38px;padding-right:7px;box-sizing:border-box;text-align:right;color:var(--dgw-text-3);user-select:none}
.dgw-diff-sign{flex:none;width:12px;text-align:center;user-select:none}
.dgw-diff-text{font-family:inherit;font-size:inherit;color:var(--dgw-text);white-space:pre;tab-size:4}
.dgw-diff-splitpane{display:flex;align-items:stretch;width:100%;min-width:0;height:24px;overflow:hidden}
.dgw-diff-splitcol{flex:1 1 50%;min-width:0;overflow:hidden;display:flex;flex-direction:column}
.dgw-diff-splitcol+.dgw-diff-splitcol{border-left:1px solid var(--dgw-border)}
.dgw-diff-splitcol .dgw-diff-line{min-width:0;width:100%}
.dgw-diff-splitcol .dgw-diff-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;display:block}
.dgw-diff-split-empty{background:color-mix(in srgb,var(--dgw-text) 3%,transparent)}
.dgw-spacer{flex:1 1 auto;min-width:0}
.dgw-diff-spacer{width:100%;flex:none}
.dgw-hunkactions{display:inline-flex;align-items:center;gap:var(--dgw-space-1);flex:none}
.dgw-hunkbtn{display:inline-flex;align-items:center;height:20px;padding:0 6px;border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-xs);background:var(--dgw-bg);color:var(--dgw-text-2);font:500 var(--dgw-font-xs) var(--dsw-font-family);cursor:pointer;white-space:nowrap}
.dgw-hunkbtn:hover:not(:disabled){background:var(--dgw-hover);color:var(--dgw-text)}
.dgw-hunkbtn:disabled{opacity:.4}
.dgw-confirm-armed{color:var(--dgw-error)!important;border-color:var(--dgw-error)!important;font-weight:600}
.dgw-commitbar{position:sticky;bottom:0;z-index:4;display:flex;flex-direction:column;gap:var(--dgw-space-2);padding:var(--dgw-space-2) var(--dgw-space-3) var(--dgw-space-3);flex:none;border-top:1px solid var(--dgw-border);background:var(--dgw-surface);box-shadow:0 -8px 20px color-mix(in srgb,var(--dgw-text) 6%,transparent)}
.dgw-commitbar__row{display:flex;gap:var(--dgw-space-1);align-items:stretch}
.dgw-commitbar__row .dgw-stagebtn{width:auto}
.dgw-commitbar__row .dgw-stagebtn:first-child{flex:1 1 auto}
.dgw-commitbar__hint{font:var(--dgw-font-xs)/14px var(--dsw-font-family);color:var(--dgw-text-3);min-height:14px}
.dgw-commitbar__success{display:inline-flex;align-items:center;gap:5px;color:var(--dgw-success);font:500 var(--dgw-font-sm)/16px var(--dsw-font-family)}
.dgw-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scroll-padding-top:38px}
.dgw-section{display:flex;flex-direction:column;border-top:1px solid var(--dgw-border);flex:none}
.dgw-section__hd{display:flex;align-items:center;gap:var(--dgw-space-2);width:100%;min-height:36px;padding:0 var(--dgw-space-3);border:0;background:none;color:var(--dgw-text-2);font:600 var(--dgw-font-sm)/16px var(--dsw-font-family);letter-spacing:.05em;text-transform:uppercase;text-align:left;cursor:pointer}
.dgw-section__hd:hover{background:var(--dgw-hover)}
.dgw-section__hd:focus-visible{outline-offset:-2px}
.dgw-section__body{padding:0 0 var(--dgw-space-2)}
.dgw-section__plain{font-size:var(--dgw-font-md);letter-spacing:0;text-transform:none;color:var(--dgw-text)}
.dgw-path{display:flex;align-items:baseline;gap:2px;min-width:0;white-space:nowrap;font-family:var(--dsw-font-family-code);font-size:var(--dgw-font-sm)}
.dgw-path__dir{min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dgw-text-2)}
.dgw-path__base{flex:none;color:var(--dgw-text)}
.dgw-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--dgw-space-2);padding:var(--dgw-space-8) var(--dgw-space-4);text-align:center;color:var(--dgw-text-2)}
.dgw-empty__icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:color-mix(in srgb,var(--dgw-accent) 12%,transparent);color:var(--dgw-accent)}
.dgw-empty__title{font:600 var(--dgw-font-lg)/18px var(--dsw-font-family);color:var(--dgw-text)}
.dgw-empty__hint{max-width:30ch;font:var(--dgw-font-sm)/17px var(--dsw-font-family);color:var(--dgw-text-2)}
.dgw-empty__action{margin-top:var(--dgw-space-1)}
.dgw-skeleton{display:flex;flex-direction:column;gap:var(--dgw-space-2);padding:var(--dgw-space-4) var(--dgw-space-3)}
.dgw-skeleton__bar{height:10px;border-radius:var(--dgw-radius-sm);background:linear-gradient(90deg,var(--dgw-hover) 0%,color-mix(in srgb,var(--dgw-text) 9%,transparent) 50%,var(--dgw-hover) 100%);background-size:200% 100%}
.dgw-skeleton__bar:nth-child(2){width:72%}.dgw-skeleton__bar:nth-child(3){width:88%}.dgw-skeleton__bar:nth-child(4){width:64%}
.dgw-tip-wrap{display:inline-flex;min-width:0}
.dgw-tooltip{position:fixed;margin:0;inset:auto;max-width:240px;padding:5px 8px;border:1px solid var(--dgw-border-2);border-radius:var(--dgw-radius-sm);background:var(--dgw-text);color:var(--dgw-bg);font:var(--dgw-font-sm)/15px var(--dsw-font-family);box-shadow:var(--dgw-shadow-pop);z-index:1300;overflow:visible;pointer-events:auto}
@supports (position-area:block-start){
  .dgw-tooltip[popover][data-side="top"]{position-area:block-start;position-try-fallbacks:flip-block,flip-inline}
  .dgw-tooltip[popover][data-side="bottom"]{position-area:block-end;position-try-fallbacks:flip-block,flip-inline}
}
.dgw-tooltip[popover]{inset:auto;margin:0}
.dgw-spinner{appearance:none;width:18px;height:18px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dgw-text) 15%,transparent);border-top-color:var(--dgw-accent);background:none}
@media (prefers-reduced-motion:no-preference){
  .dgw-spinner{animation:dgw-spin 900ms linear infinite}
  .dgw-drawer{animation:dgw-drawer-in var(--dgw-dur) var(--dgw-ease)}
  .dgw-inline-diff{opacity:1;translate:0;transition:opacity var(--dgw-dur) var(--dgw-ease),translate var(--dgw-dur) var(--dgw-ease)}
  @starting-style{.dgw-inline-diff{opacity:0;translate:0 -5px}}
  .dgw-skeleton__bar{animation:dgw-shimmer 1.4s ease-in-out infinite}
  .dgw-tooltip{transition:opacity var(--dgw-dur-fast) var(--dgw-ease),translate var(--dgw-dur-fast) var(--dgw-ease),display var(--dgw-dur-fast) allow-discrete,overlay var(--dgw-dur-fast) allow-discrete}
  @starting-style{.dgw-tooltip:is(:popover-open,.\:popover-open){opacity:0;translate:0 3px}}
  .dgw-actionmenu{transition:opacity var(--dgw-dur-fast) var(--dgw-ease),translate var(--dgw-dur-fast) var(--dgw-ease),display var(--dgw-dur-fast) allow-discrete,overlay var(--dgw-dur-fast) allow-discrete}
  @starting-style{.dgw-actionmenu:is(:popover-open,.\:popover-open){opacity:0;translate:0 -4px}}
}
@keyframes dgw-spin{to{rotate:1turn}}
@keyframes dgw-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes dgw-drawer-in{from{opacity:.55;translate:18px 0}to{opacity:1;translate:0}}
@media (prefers-reduced-motion:reduce){
  .dgw-spinner{animation:none}
  .dgw-skeleton__bar{animation:none}
  .dgw-inline-diff,.dgw-drawer{animation:none;transition:none}
}
@container dgw-panel (max-width:420px){
  .dgw-syncbtn__label{display:none}
}
@container dgw-panel (max-width:420px){
  .dgw-statusbar__upstream{display:none}
}
@container dgw-panel (max-width:360px){
  .dgw-changeshead .dgw-minibtn{display:none}
}
@container dgw-panel (max-width:300px){
  .dgw-statusbar__state{display:none}
  .dgw-statusbar__counts{display:none}
  .dgw-commitbar__row{flex-wrap:wrap}
}
@container dgw-panel (min-width:440px){
  .dgw-changeshead__title{font-size:var(--dgw-font-md)}
}
.dgw-modal-backdrop{position:fixed;inset:0;background:color-mix(in srgb,var(--dgw-text) 42%,transparent);display:flex;align-items:center;justify-content:center;padding:var(--dgw-space-6);z-index:1200}
.dgw-modal{width:100%;max-width:860px;max-height:calc(100dvh - 48px);display:flex;flex-direction:column;background:var(--dgw-surface);border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-lg);box-shadow:var(--dgw-shadow-pop);overflow:hidden}
`
const extra = String.raw`
.dgw-statuschip{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;border-radius:var(--dgw-radius-xs);font:600 var(--dgw-font-xs)/1 var(--dsw-font-family-code);background:color-mix(in srgb,currentColor 10%,transparent)}
.dgw-stats{display:inline-flex;align-items:center;gap:6px;flex:none;font:var(--dgw-font-xs)/14px var(--dsw-font-family-code);white-space:nowrap}
.dgw-stats__add{color:var(--dgw-success-strong);min-width:22px;text-align:right}
.dgw-stats__del{color:var(--dgw-error-strong);min-width:22px;text-align:right}
.dgw-treelabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;color:var(--dgw-text);font-size:var(--dgw-font-md)}
.dgw-treecount{font:var(--dgw-font-xs)/14px var(--dsw-font-family-code);color:var(--dgw-text-3);flex:none}
.dgw-fileicon{display:inline-flex;flex:none;color:var(--dgw-text-3)}
.dgw-static{cursor:default}
.dgw-static:hover{background:transparent}
.dgw-tree{display:flex;flex-direction:column}
.dgw-changes{display:flex;flex-direction:column;padding-bottom:var(--dgw-space-2)}
.dgw-searchbar{padding:var(--dgw-space-1) var(--dgw-space-3) var(--dgw-space-2);background:var(--dgw-surface);border-bottom:1px solid var(--dgw-border)}
.dgw-input{min-height:32px;height:32px;resize:none}
.dgw-note{padding:var(--dgw-space-1) var(--dgw-space-3) var(--dgw-space-2);font:var(--dgw-font-xs)/15px var(--dsw-font-family);color:var(--dgw-text-2)}
.dgw-nodata{padding:var(--dgw-space-4) 0}
.dgw-banner{display:flex;align-items:center;gap:var(--dgw-space-2);margin:var(--dgw-space-2) var(--dgw-space-3);padding:var(--dgw-space-2);border:1px solid var(--dgw-warn-strong);border-radius:var(--dgw-radius-sm);background:color-mix(in srgb,var(--dgw-warn) 9%,transparent);color:var(--dgw-text);font:var(--dgw-font-sm)/16px var(--dsw-font-family);flex:none}
.dgw-loading{display:flex;flex-direction:column;gap:var(--dgw-space-3);padding:var(--dgw-space-3)}
.dgw-loading__label{display:flex;align-items:center;gap:var(--dgw-space-2);font:var(--dgw-font-sm)/16px var(--dsw-font-family);color:var(--dgw-text-2)}
.dgw-loading .dgw-spinner{width:16px;height:16px}
.dgw-segmented{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dgw-border);border-radius:var(--dgw-radius-sm);background:var(--dgw-bg);flex:none}
.dgw-segmented__btn{display:inline-flex;align-items:center;gap:4px;min-height:20px;padding:0 7px;border-radius:var(--dgw-radius-xs);color:var(--dgw-text-2);font:500 var(--dgw-font-xs)/16px var(--dsw-font-family);cursor:pointer;white-space:nowrap;user-select:none}
.dgw-segmented__btn:hover{color:var(--dgw-text);background:var(--dgw-hover)}
.dgw-segmented__btn[data-active="true"]{background:var(--dgw-active);color:var(--dgw-text)}
.dgw-segmented__btn:focus-visible{outline-offset:0}
.dgw-segmented__label{display:inline}
.dgw-actionnote{padding:0 var(--dgw-space-2) var(--dgw-space-1);font:var(--dgw-font-xs)/15px var(--dsw-font-family);color:var(--dgw-text-3)}
.dgw-pr{display:flex;flex-direction:column;padding:var(--dgw-space-2) 0 0}
.dgw-pr__head{display:flex;flex-direction:column;gap:var(--dgw-space-1);padding:var(--dgw-space-1) var(--dgw-space-3) var(--dgw-space-2)}
.dgw-pr__headline{display:flex;align-items:center;gap:var(--dgw-space-2);min-width:0}
.dgw-pr__stateicon{display:inline-flex;flex:none}
.dgw-pr__number{font:700 var(--dgw-font-lg)/18px var(--dsw-font-family-code)}
.dgw-pr__title{font:500 var(--dgw-font-lg)/19px var(--dsw-font-family);color:var(--dgw-text)}
.dgw-pr__meta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--dgw-space-2);font:var(--dgw-font-xs)/15px var(--dsw-font-family-code);color:var(--dgw-text-2)}
.dgw-pr__pending{color:var(--dgw-text-2)}
.dgw-pr__time{font:var(--dgw-font-xs)/15px var(--dsw-font-family);color:var(--dgw-text-3)}
.dgw-empty--compact{padding:var(--dgw-space-4) var(--dgw-space-3);gap:var(--dgw-space-1)}
.dgw-empty--compact .dgw-empty__icon{width:34px;height:34px}
.dgw-empty--compact .dgw-empty__title{font-size:var(--dgw-font-md)}
.dgw-diff-line{height:24px;min-height:24px}
.dgw-diff-line--add{background:var(--dgw-add-bg)}
.dgw-diff-line--del{background:var(--dgw-del-bg)}
.dgw-diff-line--meta{color:var(--dgw-text-3);font-style:italic}
.dgw-diff-line--add .dgw-diff-sign{color:var(--dgw-success-strong)}
.dgw-diff-line--del .dgw-diff-sign{color:var(--dgw-error-strong)}
.dgw-diff-splitpane{height:24px;overflow:hidden}
.dgw-diff-inline .dgw-diff-head{position:static}
.dgw-drawer__header{background:var(--dgw-surface)}
.dgw-drawer__title{font:600 var(--dgw-font-xl)/20px var(--dsw-font-family);color:var(--dgw-text)}
.dgw-drawer__subtitle{font:var(--dgw-font-sm)/16px var(--dsw-font-family);color:var(--dgw-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dgw-drawer__body{min-height:0}
@media (prefers-reduced-motion:reduce){
  .dgw-chevron,.dgw-row,.dgw-iconbtn,.dgw-stagebtn,.dgw-tooltip,.dgw-actionmenu{transition:none!important}
}
@container dgw-panel (max-width:340px){
  .dgw-segmented__label{display:none}
}
`
const extra2 = String.raw`
.dgw-mergegroup{display:flex;align-items:stretch;border-radius:var(--dgw-radius-sm);overflow:hidden}
.dgw-mergegroup .dgw-mergebtn:first-child{border-radius:var(--dgw-radius-sm) 0 0 var(--dgw-radius-sm)}
.dgw-mergebtn--chev{width:32px;flex:none;padding:0;border-left:1px solid color-mix(in srgb,var(--dgw-on-accent) 35%,transparent);border-radius:0 var(--dgw-radius-sm) var(--dgw-radius-sm) 0}
.dgw-pr__controls{display:flex;flex-direction:column;gap:var(--dgw-space-2);padding:var(--dgw-space-1) var(--dgw-space-3) var(--dgw-space-3)}
.dgw-pr__actions{display:flex;align-items:center;justify-content:space-between;gap:var(--dgw-space-2);flex-wrap:wrap}
.dgw-pr__review{display:flex;gap:var(--dgw-space-1);flex:none}
.dgw-pr__review .dgw-stagebtn{width:auto;padding:0 var(--dgw-space-2)}
.dgw-checkbox{display:inline-flex;align-items:center;gap:6px;font:var(--dgw-font-sm)/16px var(--dsw-font-family);color:var(--dgw-text-2);cursor:pointer}
.dgw-checkbox input{accent-color:var(--dgw-accent);width:14px;height:14px}
.dgw-input{width:100%}
.dgw-tooltip{opacity:1}
@media (prefers-reduced-motion:no-preference){
  .dgw-mergegroup .dgw-mergebtn{transition:filter var(--dgw-dur-fast) var(--dgw-ease),opacity var(--dgw-dur-fast) var(--dgw-ease)}
}
`
export const STYLE_SHEET = css + extra + extra2
