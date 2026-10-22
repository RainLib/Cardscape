/* Every card-back entry opens the normal authoring workspace. */
export const moduleApi=(() => {
'use strict';
const exposedatelierBackEditor={open(id='',version=0,fresh=false){return window.cardEditorHost.editAsset(id,version,fresh).catch(e=>window.cardEditorHost.say(e.message));}};
window.atelierBackEditor=exposedatelierBackEditor;
return {atelierBackEditor:exposedatelierBackEditor};
})();
