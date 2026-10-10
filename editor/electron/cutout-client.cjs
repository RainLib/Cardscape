const path=require('node:path'),fs=require('node:fs');
const {NativeWorker}=require('./native-client.cjs');
class CutoutWorker extends NativeWorker {
 constructor(){const local=path.join(__dirname,'../native-ai/.venv-cutout',process.platform==='win32'?'Scripts/python.exe':'bin/python');super(process.env.ATELIER_CUTOUT_PYTHON||(fs.existsSync(local)?local:'python3'),{args:['-u',path.join(__dirname,'../native-ai/cutout_worker.py')],label:'本地抠图'});}
}
module.exports={CutoutWorker};
