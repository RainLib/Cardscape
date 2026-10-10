const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const root=path.resolve(__dirname,'../native-ai'),venv=path.join(root,'.venv-cutout');
const selectionPython=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!fs.existsSync(venv))execFileSync(process.env.ATELIER_CUTOUT_PYTHON||(fs.existsSync(selectionPython)?selectionPython:'python3'),['-m','venv',venv],{stdio:'inherit'});
const python=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
// Direct ONNX inference avoids Python matting/JIT imports on the editing path.
execFileSync(python,['-m','pip','install','--only-binary=:all:','onnxruntime==1.23.2','numpy==2.3.5','pillow==12.3.0'],{stdio:'inherit'});
console.log('准备本地 U2Net / ISNet 模型；仅下载模型文件，不上传图片。');
async function checksum(file){const hash=createHash('md5');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
(async()=>{
 for(const [model,md5] of [['u2netp','8e83ca70e441ab06c318d82300c84806'],['u2net','60024c5c889badc19c04ad937298a77b'],['isnet-general-use','fc16ebd8b0c10d971d3513d564d01e29']]){
  const file=path.join(root,'models/rembg/models',model,model+'.onnx');
  if(fs.existsSync(file)&&await checksum(file)===md5)continue;
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.download';
  try{console.log('下载并校验 '+model+'…');const response=await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/'+model+'.onnx',{signal:AbortSignal.timeout(180000)});if(!response.ok||!response.body)throw Error('模型下载失败：'+response.status);await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(tmp));if(await checksum(tmp)!==md5)throw Error('模型校验失败：'+model);fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}
 }
 const result=execFileSync(python,['-u',path.join(root,'cutout_worker.py')],{input:'{"id":1,"op":"info"}\n',encoding:'utf8'});
 const status=JSON.parse(result.trim());if(!status.ok||!status.result.models.every(m=>m.available))throw Error('抠图模型未就绪');
 console.log('本地抠图已就绪，模型总计 '+Math.round(status.result.models.reduce((a,m)=>a+m.bytes,0)/1048576)+' MiB；图片处理无需联网。');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
