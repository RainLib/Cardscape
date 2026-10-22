const {test}=require('node:test'),assert=require('node:assert/strict');
const questions=require('../dist/electron/agent-questions.cjs');
const block=q=>'<atelier-question>'+JSON.stringify({questions:q})+'</atelier-question>';
test('questions accept choices and free text without creating edits',()=>{
 const value=questions.parseReply('先确定风格。'+block([{id:'style',title:'风格？',options:['铜金','冰蓝']},{id:'name',title:'卡片名字？'}]));
 assert.equal(value.text,'先确定风格。');assert.equal(value.questions.length,2);assert.equal(value.questions[1].options,undefined);assert.equal(questions.parseReply('完成').questions,undefined);
});
test('questions reject mixed edits, duplicated ids, malformed blocks and excessive choices',()=>{
 assert.throws(()=>questions.parseReply(block([{id:'a',title:'a'}])+'<atelier-actions>{"commands":[]}</atelier-actions>'),/同时/);
 assert.throws(()=>questions.parseReply(block([{id:'a',title:'a'},{id:'a',title:'b'}])),/重复/);
 assert.throws(()=>questions.parseReply('<atelier-question>{}'),/闭合/);
 assert.throws(()=>questions.parseReply(block([{id:'a',title:'a',options:['a','b','c','d']}])),/选项/);
});
test('a human answer must cover every pending question; custom answers need not match suggested choices',()=>{
 const s={messages:[{id:'message',role:'assistant',state:'complete',questions:[{id:'style',title:'风格？',options:['A','B']},{id:'name',title:'名字？'}]}]};
 assert.throws(()=>questions.answer(s,{messageId:'message',answers:{style:'A'}}),/全部/);
 assert.throws(()=>questions.answer(s,{messageId:'old',answers:{style:'A',name:'N'}}),/已变化/);
 const v=questions.answer(s,{messageId:'message',answers:{style:' 自定义水墨 ',name:'青羽'}});assert.equal(v.result.answers.style,'自定义水墨');
 s.messages[0].questionResult=v.result;assert.equal(questions.pending(s),undefined);assert.throws(()=>questions.answer(s,v.result),/已回答/);
});
