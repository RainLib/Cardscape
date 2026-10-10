(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AgentDiagnostics=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function classify(value){let message=String(value||'Agent 调用失败');try{const data=JSON.parse(message);message=data.error?.message||data.message||message;}catch{}
 if(/not supported when using Codex with a ChatGPT account|模型.*(?:不支持|不可用)|不支持.*模型/i.test(message))return {kind:'model',message:'本次 CLI 返回所选模型不支持。请先核对实际调用的 CLI 路径与版本，再核对模型和账号；这条错误本身不能证明账号没有权限。'};
 if(/not logged in|unauthorized|authentication|login required|请.*登录|未登录|token.*expired|401/i.test(message))return {kind:'login',message:'CLI 登录已失效或尚未登录。请用所选 Agent 的登录入口完成登录，再重新检测。'};
 if(/unexpected argument|unknown (?:option|argument|command)|unrecognized (?:option|argument)|no such command|版本.*过旧/i.test(message))return {kind:'version',message:'该 CLI 不支持当前命令或参数。请检查更新；外部 Agent 也需要核对配置的参数。'};
 if(/model.*(?:not found|does not exist|not available|not supported)|unsupported model/i.test(message))return {kind:'model',message:'所选模型不可用。请核对型号与账号权限，也可检查 CLI 更新。'};
 return {kind:'other',message};
}
return {classify};
});
