/* Presentation only: placeholders never become saved card artwork. */
(() => {
'use strict';
function create({src='',name='未命名卡片',kind='卡片',compact=false}={}){
 const cover=document.createElement('span');cover.className='card-cover'+(compact?' card-cover-compact':'');cover.dataset.coverState='placeholder';cover.setAttribute('aria-hidden','true');
 const fallback=document.createElement('span');fallback.className='card-cover-fallback';
 const label=document.createElement('span');label.className='card-cover-kind';label.textContent=kind;
 const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');mark.setAttribute('viewBox','0 0 64 72');mark.classList.add('card-cover-mark');mark.setAttribute('focusable','false');
 mark.innerHTML='<path d="M14 15 22 7h28l7 7v43l-7 7H22l-8-8Z"/><path d="m8 22-3 4v35l7 7h29l5-5"/><path d="m24 43 8-15 8 15-8 9Z"/><path d="M24 19h17M24 57h17"/>';
 const title=document.createElement('span');title.className='card-cover-name';title.textContent=name;
 const hint=document.createElement('span');hint.className='card-cover-hint';hint.textContent='暂无封面';
 fallback.append(label,mark,title,hint);cover.append(fallback);
 if(src){
  const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';
  img.addEventListener('load',()=>{if(img.naturalWidth>0)cover.dataset.coverState='image';});
  img.addEventListener('error',()=>{cover.dataset.coverState='placeholder';img.remove();},{once:true});
  img.src=src;cover.append(img);
 }
 return cover;
}
window.atelierCardCover={create};
})();
