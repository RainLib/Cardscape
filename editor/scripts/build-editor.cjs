const path=require('node:path');
Promise.all(['shader-editor','shader-nodes'].map(name=>require('esbuild').build({entryPoints:[path.resolve(__dirname,'../renderer/'+name+'-source.mjs')],outfile:path.resolve(__dirname,'../renderer/'+name+'.bundle.js'),bundle:true,minify:true,format:'iife',target:'chrome120',legalComments:'eof'}))).catch(error=>{console.error(error);process.exitCode=1;});
