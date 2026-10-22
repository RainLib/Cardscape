/* All component types open the same authoring canvas and inspector. */
export const moduleApi=(() => {
'use strict';
const exposedatelierComponentEditor={open(kind,id='',version=0){return window.cardEditorHost.editComponent(kind,id,version).catch(e=>window.cardEditorHost.say(e.message));}};
window.atelierComponentEditor=exposedatelierComponentEditor;
return {atelierComponentEditor:exposedatelierComponentEditor};
})();
