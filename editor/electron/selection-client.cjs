const path=require('node:path');
const fs=require('node:fs');
const {NativeWorker}=require('./native-client.cjs');
class SelectionWorker extends NativeWorker{
 constructor(){const local=path.join(__dirname,'../native-ai/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');super(process.env.ATELIER_PYTHON||(fs.existsSync(local)?local:'python3'),{args:['-u',path.join(__dirname,'../native-ai/selection_worker.py')],label:'智能选区'});}
}
module.exports={SelectionWorker};
