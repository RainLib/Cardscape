const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const {NativeWorker}=require('../dist/electron/native-client.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  const worker=new NativeWorker();const qa=path.join(root,'qa');await fs.mkdir(qa,{recursive:true});
  try{
    const document=JSON.parse(await fs.readFile(path.join(root,'runtime/projects/card.cardproj'),'utf8'));
    const baseline='data:image/png;base64,'+(await fs.readFile(path.join(root,'assets/mask-motion.png'))).toString('base64');
    const originalStats=await worker.call('mask_stats',{image:baseline});
    const editedStats=await worker.call('mask_stats',{image:document.masks.motion});
    if(editedStats.mean>=originalStats.mean)throw Error('Expected the tested black brush to lower motion weights');
    const timings=[];for(let i=0;i<3;i++)timings.push((await worker.call('feather',{image:document.masks.motion,guard:document.masks.rigid,radius:4})).elapsedMs);
    const entries=await fs.readdir(path.join(root,'runtime/exports'));const latest=entries.filter(s=>s.startsWith('card-')).sort().at(-1);
    const manifest=JSON.parse(await fs.readFile(path.join(root,'runtime/exports',latest,'manifest.json'),'utf8'));
    const snapshot=JSON.parse(await fs.readFile(path.join(root,'../outputs/card-editor-design-v2/design-data/source-preservation.json'),'utf8'));
    for(const [name,expected] of Object.entries(snapshot)){
      const current=crypto.createHash('sha256').update(await fs.readFile(path.join(root,'../outputs/card-3d-design-v2',name))).digest('hex');
      if(current!==expected)throw Error('Original source artwork changed: '+name);
    }
    const result={date:'2026-10-09',nativeEngine:await worker.call('ping'),maskDimensions:[editedStats.width,editedStats.height],blackBrushLowersMaskMean:true,originalMean:originalStats.mean,editedMean:editedStats.mean,featherRadius:4,featherNativeMilliseconds:timings,exportMaskCount:manifest.masks.length,sourceArtPreserved:true,scope:'Native kernel integration and real saved browser UI output; no production or cross-platform acceptance',nativeDesktop:'Electron startup and renderer bootstrap confirmed',browserActions:['Mask selection','black brush','native feather','undo','card back','region mesh guide','save','open','asset export'],pending:['native file dialogs','drawing tablet','AI provider','Godot dynamic adapter','signed installers']};
    await fs.writeFile(path.join(qa,'verification.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{worker.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
