// Questions are a separate reply type: never apply an edit while waiting for a decision.
'use strict';
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function keys(value,allowed){if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('提问包含未知字段');}
function short(value,max){return typeof value==='string'&&value.trim()&&value.length<=max;}
function parseReply(reply){
 const blocks=[...reply.matchAll(/<atelier-question>([\s\S]*?)<\/atelier-question>/g)];
 if(!blocks.length){if(/<\/?atelier-question\b/.test(reply))throw Error('提问块未闭合');return {text:reply};}
 if(blocks.length!==1||/<\/?atelier-question\b/.test(reply.replace(blocks[0][0],'')))throw Error('每阶段只能提交一组问题');
 if(/<atelier-actions>/.test(reply))throw Error('提问阶段不能同时提交编辑操作');
 let data;try{data=JSON.parse(blocks[0][1]);}catch{throw Error('提问 JSON 无效');}
 keys(data,['questions']);if(!Array.isArray(data.questions)||data.questions.length<1||data.questions.length>3)throw Error('每次提问需要 1–3 项');
 const ids=new Set(),questions=data.questions.map(q=>{
  keys(q,['id','title','options']);if(typeof q.id!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(q.id)||ids.has(q.id))throw Error('问题 ID 无效或重复');ids.add(q.id);
  if(!short(q.title,300))throw Error('问题标题需要 1–300 字');
  if(q.options!==undefined&&(!Array.isArray(q.options)||q.options.length<2||q.options.length>3||q.options.some(v=>!short(v,100))||new Set(q.options.map(v=>v.trim())).size!==q.options.length))throw Error('选项需要 2–3 个不同的短文本');
  return {id:q.id,title:q.title.trim(),...(q.options?{options:q.options.map(v=>v.trim())}:{})};
 });
 return {text:reply.replace(blocks[0][0],'').trim(),questions};
}
function pending(session){return [...(session.messages||[])].reverse().find(m=>m.role==='assistant'&&m.state==='complete'&&m.questions&&!m.questionResult);}
function answer(session,value){
 const m=pending(session);if(!m||!object(value)||value.messageId!==m.id)throw Error('问题已回答或已变化，请刷新会话');
 keys(value,['messageId','answers']);if(!object(value.answers)||Object.keys(value.answers).length!==m.questions.length||Object.keys(value.answers).some(k=>!m.questions.some(q=>q.id===k)))throw Error('请回答当前全部问题');
 const answers={};for(const q of m.questions){if(!short(value.answers[q.id],2000))throw Error('请回答“'+q.title+'”');answers[q.id]=value.answers[q.id].trim();}
 return {message:m,result:{messageId:m.id,answers}};
}
const description='When a consequential creative requirement is uncertain, return one <atelier-question>{"questions":[{"id":"short_snake_case","title":"Self-contained question","options":["Recommended choice","Alternative"]}]}</atelier-question>. Ask 1..3 questions; options are optional, 2..3 distinct strings when present. Free-text answers are always allowed. Do not include atelier-actions in that reply. The client pauses production and waits indefinitely for the human answer; never pick an answer yourself. Answers arrive in contract.questionAnswer and transcript questionResult; resume the original goal with fresh context and retain applied results.';
module.exports={parseReply,pending,answer,description};
