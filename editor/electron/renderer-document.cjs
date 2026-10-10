const {randomBytes}=require('node:crypto');
function rendererDocument(bytes){
 const nonce=randomBytes(24).toString('base64');
 return String(bytes).replaceAll('__ATELIER_STYLE_NONCE__',nonce);
}
module.exports={rendererDocument};
