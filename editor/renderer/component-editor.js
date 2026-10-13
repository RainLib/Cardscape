/* All component types open the same authoring canvas and inspector. */
(() => {
'use strict';
window.atelierComponentEditor={open(kind,id='',version=0){return window.cardEditorHost.editComponent(kind,id,version).catch(e=>window.cardEditorHost.say(e.message));}};
})();
