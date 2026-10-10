const {execFileSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../native-ai'),vendor=path.join(root,'vendor/MobileSAM'),venv=path.join(root,'.venv');
const source='https://github.com/ChaoningZhang/MobileSAM.git',revision='f706ad9c4eb7f219c00d9050e46328518ffb65d2';
fs.mkdirSync(path.dirname(vendor),{recursive:true});
if(!fs.existsSync(path.join(vendor,'mobile_sam'))){execFileSync('git',['clone',source,vendor],{stdio:'inherit'});execFileSync('git',['-C',vendor,'checkout',revision],{stdio:'inherit'});}
if(!fs.existsSync(venv))execFileSync(process.env.ATELIER_PYTHON||'python3',['-m','venv','--system-site-packages',venv],{stdio:'inherit'});
const python=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
try{execFileSync(python,['-c','import torch,torchvision,timm,numpy,PIL,cv2'],{stdio:'ignore'});}
catch{execFileSync(python,['-m','pip','install','numpy<2','torch>=2.2','torchvision','timm','pillow','opencv-python-headless'],{stdio:'inherit'});}
const result=execFileSync(python,['-u',path.join(root,'selection_worker.py')],{input:'{"id":1,"op":"info"}\n',encoding:'utf8'});const status=JSON.parse(result.trim());
if(!status.ok||!status.result.available)throw Error('智能选区依赖未就绪：'+result);
console.log('本地 MobileSAM 已就绪；模型 '+Math.round(status.result.checkpointBytes/1048576)+' MiB。Python 与依赖位于项目隔离环境。');
