/* Every card-back entry opens the normal authoring workspace. */
(() => {
'use strict';
window.atelierBackEditor={open(id='',version=0,fresh=false){return window.cardEditorHost.editAsset(id,version,fresh).catch(e=>window.cardEditorHost.say(e.message));}};
})();
