const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createServices,ROOT}=require('../dist/electron/services.cjs');
const {rendererDocument}=require('../dist/electron/renderer-document.cjs');
const port=Number(process.env.ATELIER_PORT||8770);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const services=createServices({runtimeDir:process.env.ATELIER_RUNTIME||path.join(ROOT,'runtime')});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
  try {
    if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(url.pathname==='/api'&&req.method==='POST'){
      if(req.headers.origin!==`http://127.0.0.1:${port}`||req.headers['x-atelier-client']!=='local-editor'){res.writeHead(403);res.end();return;}
      let body='';for await(const chunk of req){body+=chunk;if(body.length>256*1024*1024)throw Error('Request too large');}
      const {method,args}=JSON.parse(body);const result=await services.invoke(method,args);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;
    }
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(ROOT,'dist/renderer',relative);
    if(!file.startsWith(path.join(ROOT,'dist/renderer')+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(relative==='index.html'?rendererDocument(bytes):bytes);
  }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Editor development preview: http://127.0.0.1:${port}`));
process.on('SIGINT',()=>{services.close();server.close();process.exit(0);});
process.on('SIGTERM',()=>{services.close();server.close();process.exit(0);});
