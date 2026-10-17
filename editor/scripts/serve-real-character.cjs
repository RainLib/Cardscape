const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
async function main(){
 const directory=path.resolve(process.argv[2]||'outputs/real-character-animation'),port=Number(process.env.ATELIER_REVIEW_PORT||8785),origin=`http://127.0.0.1:${port}`;
 const config=JSON.parse(await fs.readFile(path.join(directory,'verification-paths.json'))),cards=new Map(config.cards.map(c=>[c.id,c]));
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
 http.createServer(async(req,res)=>{try{
  if(req.headers.host!==`127.0.0.1:${port}`)throw Error('Invalid host');
  const url=new URL(req.url,origin),segments=decodeURIComponent(url.pathname).split('/').filter(Boolean),card=cards.get(segments[0]);
  if(req.method==='POST'){
   if(req.headers.origin!==origin)throw Error('Invalid origin');
   const id=new URL(req.headers.referer).pathname.split('/')[1],selected=cards.get(id);if(!selected)throw Error('Unknown card');
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16*1024*1024)throw Error('Too large');}
   const data=JSON.parse(body),target=path.join(directory,'webgl',id);await fs.mkdir(target,{recursive:true});
   if(url.pathname==='/capture'){
    if(!/^[a-z0-9.-]+$/.test(data.id)||!/^data:image\/png;base64,/.test(data.png))throw Error('Invalid capture');
    await fs.writeFile(path.join(target,data.id+'.png'),Buffer.from(data.png.split(',')[1],'base64'));
   }else if(url.pathname==='/report')await fs.writeFile(path.join(target,'report.json'),JSON.stringify(data,null,2));else throw Error('Unknown endpoint');
   res.writeHead(200);res.end('ok');return;
  }
  if(!card){res.writeHead(200,{'Content-Type':'text/html'});res.end(config.cards.map(c=>`<p><a href="/${c.id}/review.html">${c.name} 动画验证</a> | <a href="/${c.id}/index.html">独立播放器</a></p>`).join(''));return;}
  const file=path.resolve(card.export,segments.slice(1).join('/')||'review.html');if(!file.startsWith(card.export+path.sep))throw Error('Invalid path');
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(400);res.end(e.message);}}).listen(port,'127.0.0.1',()=>console.log(origin));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
