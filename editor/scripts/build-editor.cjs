const path=require('node:path');
require('esbuild').build({entryPoints:[path.resolve(__dirname,'../renderer/shader-editor-source.mjs')],outfile:path.resolve(__dirname,'../renderer/shader-editor.bundle.js'),bundle:true,minify:true,format:'iife',target:'chrome120',legalComments:'eof'}).catch(error=>{console.error(error);process.exitCode=1;});
