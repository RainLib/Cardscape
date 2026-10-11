const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {NativeWorker} = require('./native-client.cjs');
const {createAgentService} = require('./agent-service.cjs');
const runtimeModel=require('../renderer/runtime-model.js');
const frameModel=require('../renderer/frame-model.js');
const {exportCard}=require('./card-export.cjs');
const workshopModel=require('../renderer/workshop-model.js'),workshopStorage=require('./workshop-storage.cjs');
const {exportWorkshop}=require('./workshop-export.cjs');
const {SelectionWorker}=require('./selection-client.cjs');
const {CutoutWorker}=require('./cutout-client.cjs');
const {prepareAuthoring}=require('./authoring-service.cjs');
const {createCheckpoints}=require('./production-checkpoints.cjs');
const {createEditorSession}=require('./editor-session.cjs');
const APP_VERSION=require('../package.json').version;
const ROOT = path.resolve(__dirname,'..');
const ASSETS = path.join(ROOT,'assets');
const MAX_DOCUMENT = 64 * 1024 * 1024;
const OPS = new Set(['ping','feather','resize','mask_stats','mesh','selection','mask_combine','clean_alpha','underpaint','repair_split','alpha','image_channel','refine_selection','adjust_image','wand_selection','title_raster']);
function validateProject(doc) {
  if (!doc || doc.schema !== 'card-atelier/1' || doc.width !== 1024 || doc.height !== 1536 || !Array.isArray(doc.layers) || doc.layers.length > 64) throw Error('工程格式或画布尺寸不支持');
  if (!doc.masks || typeof doc.masks !== 'object') throw Error('工程缺少 Mask');
  const ids = new Set();
  for (const layer of doc.layers) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(layer.id) || ids.has(layer.id)) throw Error('无效或重复的图层 ID');
    ids.add(layer.id);
    if (!['image','foreground','background','text','frame'].includes(layer.kind)) throw Error('不支持的图层类型');
    if (typeof layer.name !== 'string' || layer.name.length > 200 || ![layer.x,layer.y,layer.scale,layer.opacity].every(Number.isFinite) || layer.scale <= 0 || layer.scale > 10 || layer.opacity < 0 || layer.opacity > 1) throw Error('图层参数无效');
    if (layer.src && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(layer.src)) throw Error('工程图像必须内嵌');
    if (layer.master && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(layer.master)) throw Error('母版图像必须内嵌');
    if(layer.cutoutMask&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(layer.cutoutMask))throw Error('抠图 Mask 必须为内嵌 PNG');
    if(layer.ownershipMask&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(layer.ownershipMask))throw Error('拆层 ownership Mask 必须为内嵌 PNG');
    if(layer.sourceWindow){const r=layer.sourceWindow;if(!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>8192||r.y+r.height>8192)throw Error('扩图注册区域无效');}
    if(layer.textStyle){const s=layer.textStyle;if(typeof s.fontFamily!=='string'||s.fontFamily.length>100||!/^[\w\u3400-\u9fff -]+$/.test(s.fontFamily)||![400,700,800].includes(Number(s.fontWeight))||!Number.isFinite(s.fontSize)||s.fontSize<12||s.fontSize>300||!Number.isFinite(s.strokeWidth)||s.strokeWidth<0||s.strokeWidth>24||![s.color,s.stroke].every(c=>/^#[a-fA-F0-9]{6}$/.test(c))||!['left','center','right'].includes(s.align))throw Error('文字样式无效');}
  }
  for (const mask of Object.values(doc.masks)) if (typeof mask !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(mask)) throw Error('Mask 必须为内嵌 PNG');
  if (doc.back && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(doc.back)) throw Error('卡背图像无效');
  if(doc.fonts){if(!Array.isArray(doc.fonts)||doc.fonts.length>16)throw Error('工程最多 16 个嵌入字体');const families=new Set();for(const font of doc.fonts){if(!/^AtelierFont-[0-9]+$/.test(font.family)||families.has(font.family)||typeof font.name!=='string'||font.name.length>200||!/^data:font\/(ttf|otf|woff2);base64,[A-Za-z0-9+/=]+$/.test(font.src)||font.src.length>17*1024*1024)throw Error('工程字体无效');families.add(font.family);}}
  require('../renderer/layer-tree.js').validate(doc);
  runtimeModel.validate(doc);
  if (JSON.stringify(doc).length > MAX_DOCUMENT) throw Error('工程超过 64 MB 上限');
  return doc;
}
async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp = file+'.'+randomUUID()+'.tmp';
  try { await fs.writeFile(tmp,data); await fs.rename(tmp,file); }
  finally { await fs.rm(tmp,{force:true}); }
}
function pngBytes(data) {
  if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) throw Error('需要 PNG 图像');
  const bytes = Buffer.from(data.slice(data.indexOf(',')+1),'base64');
  if (bytes.length > 32*1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('PNG 无效或过大');
  return bytes;
}
function createServices({runtimeDir = path.join(ROOT,'runtime'), dialogs = null, initialProject = null} = {}) {
  // CLI children change cwd to their job directory. Resolve the runtime once so
  // contracts and --cd never become relative to that directory a second time.
  runtimeDir=path.resolve(runtimeDir);
  const worker = new NativeWorker(),selectionWorker=new SelectionWorker(),cutoutWorker=new CutoutWorker(); let projectFile = initialProject;
  const agents=createAgentService({runtimeDir,dialogs}),checkpoints=createCheckpoints({runtimeDir,validate:validateProject,write:atomicWrite});
  const session=createEditorSession({runtimeDir,validate:validateProject,write:atomicWrite});
  return {
    worker,
    async invoke(method,args={}) {
      if(typeof method==='string'&&method.startsWith('agent-'))return agents.invoke(method,args);
      switch(method) {
        case 'editor-session-save': return session.save(args,projectFile);
        case 'editor-session-start': return {sessionToken:session.start()};
        case 'production-checkpoint': return checkpoints.save(args);
        case 'production-checkpoint-info': return checkpoints.info(args.id);
        case 'production-checkpoint-open': return checkpoints.open(args.id);
        case 'bootstrap': {
          const recovered=await session.recover(initialProject);let initial={document:null};
          if(recovered?.document||recovered?.workshop){initial=recovered;projectFile=recovered.sourceFile;}
          else{
           if(!projectFile){try{const files=await fs.readdir(path.join(runtimeDir,'projects'));const projects=await Promise.all(files.filter(f=>/\.(cardproj|cardworkshop)$/.test(f)).map(async name=>({file:path.join(runtimeDir,'projects',name),mtime:(await fs.stat(path.join(runtimeDir,'projects',name))).mtimeMs})));projects.sort((a,b)=>b.mtime-a.mtime);projectFile=projects[0]?.file||null;}catch(error){if(error.code!=='ENOENT')throw error;}}
           if(projectFile)initial=await workshopStorage.read(projectFile,validateProject);
           if(recovered?.recoveryError)initial.recoveryError=recovered.recoveryError;
          }
          initialProject=null;
          return {template:JSON.parse(await fs.readFile(path.join(ASSETS,'template.json'),'utf8')),...initial,sessionToken:session.start(),engine:await worker.call('ping'),appVersion:APP_VERSION,initialPanel:['agent','masks','shader','motion','frame','appearance'].includes(process.env.ATELIER_INITIAL_PANEL)?process.env.ATELIER_INITIAL_PANEL:null,initialView:['edit','split','preview','space'].includes(process.env.ATELIER_INITIAL_VIEW)?process.env.ATELIER_INITIAL_VIEW:null,desktop:!!dialogs};
        }
        case 'document-state': return {ok:true};
        case 'authoring-prepare': return prepareAuthoring(args,{validate:validateProject,process:(op,a)=>this.invoke('process',{op,args:a}),asset:id=>agents.invoke('agent-result',{id})});
        case 'smart-info': return selectionWorker.call('info');
        case 'cutout-info': return cutoutWorker.call('info');
        case 'save-image': {
          const bytes=pngBytes(args.image),name=String(args.name||'image').replace(/[^\w\u3400-\u9fff-]/g,'_').slice(0,80)+'.png';
          const file=dialogs?.saveImage?await dialogs.saveImage(name):path.join(runtimeDir,'images',Date.now()+'-'+name);
          if(!file)return {canceled:true};await atomicWrite(file,bytes);return {file};
        }
        case 'cutout-setup': {
          const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
          const command='cd '+quote(ROOT)+' && npm run cutout:setup';
          if(process.platform!=='darwin'||!dialogs?.openSetup)return {command,opened:false};
          const directory=path.join(runtimeDir,'setup');await fs.mkdir(directory,{recursive:true,mode:0o700});
          const file=path.join(directory,'cutout-'+randomUUID()+'.command');
          await fs.writeFile(file,'#!/bin/zsh\ncd '+quote(ROOT)+' || exit 1\nELECTRON_RUN_AS_NODE=1 '+quote(process.execPath)+' '+quote(path.join(ROOT,'scripts/setup-cutout.cjs'))+'\nresult=$?\nprintf "\\n安装结束（%s）。返回编辑器点击重新检测。\\n" "$result"\nread -r "answer?按回车关闭…"\nexit "$result"\n',{mode:0o700});
          const error=await dialogs.openSetup(file);if(error)throw Error(error);return {command,opened:true};
        }
        case 'new-document': projectFile=null; return {ok:true};
        case 'process': {
          if(args.op==='smart_selection'){if(JSON.stringify(args).length>MAX_DOCUMENT)throw Error('智能选区输入过大');return selectionWorker.call('select',args.args);}
          if(args.op==='remove_background'){
            if(JSON.stringify(args).length>MAX_DOCUMENT)throw Error('抠图输入过大');
            const result=await cutoutWorker.call('segment',args.args);
            const alpha=await worker.call('alpha',{image:args.args.image,mask:result.mask,decontaminate:true});
            return {...result,image:alpha.image,elapsedMs:result.elapsedMs+alpha.elapsedMs};
          }
          if (!OPS.has(args.op)) throw Error('不支持的处理操作');
          if (JSON.stringify(args).length > MAX_DOCUMENT) throw Error('处理输入过大');
          return worker.call(args.op,args.args);
        }
        case 'cancel': worker.cancel();selectionWorker.cancel();cutoutWorker.cancel(); return {canceled:true};
        case 'open-data': {if(typeof args.text!=='string'||Buffer.byteLength(args.text)>workshopStorage.MAX_BYTES)throw Error('工坊文件超过 192 MB');const data=JSON.parse(args.text);const result=data.schema==='card-atelier/1'?{document:validateProject(data)}:{workshop:workshopModel.validate(workshopStorage.unpack(data),validateProject)};projectFile=null;return result;}
        case 'validate-card': return {document:validateProject(args.document)};
        case 'save-workshop': {
          const w=workshopStorage.unpack(args.workshop),text=workshopStorage.serialized(w,validateProject);
          let file=projectFile?.endsWith('.cardworkshop')?projectFile:null;
          if(dialogs&&(!file||args.saveAs))file=await dialogs.saveWorkshop(w.name);
          if(dialogs&&!file)return {canceled:true};if(!dialogs&&args.saveAs)file=null;
          file ||= path.join(runtimeDir,'projects',(w.name.replace(/[^\w\u3400-\u9fff-]/g,'_').slice(0,80)||'workshop')+'-'+randomUUID().slice(0,8)+'.cardworkshop');
          await atomicWrite(file,text);projectFile=file;return {file,cards:w.cards.length,resources:w.resources.length};
        }
        case 'export-preview-stage': {
          if(!/^[\w-]{1,100}$/.test(args.token)||!/^[\w-]{1,100}$/.test(args.cardId))throw Error('导出暂存标识无效');const text=JSON.stringify(args.output);if(text.length>24*1024*1024)throw Error('单卡导出图像超过 24 MB');pngBytes(args.output.front);for(const png of Object.values(args.output.layerRasters||{}))pngBytes(png);for(const locales of Object.values(args.output.titleRasters||{}))for(const png of Object.values(locales))pngBytes(png);await atomicWrite(path.join(runtimeDir,'export-staging',args.token,args.cardId+'.json'),text);return {staged:true,cardId:args.cardId};
        }
        case 'export-workshop': {
          const w=workshopStorage.unpack(args.workshop);workshopModel.validate(w,validateProject);
          const base=dialogs?await dialogs.exportDirectory():path.join(runtimeDir,'exports');if(!base)return {canceled:true};
          const directory=path.join(base,'workshop-'+Date.now()+'-'+randomUUID().slice(0,8));
          let outputs=args.outputs;let staged=null;if(args.stageToken){if(!/^[\w-]{1,100}$/.test(args.stageToken))throw Error('导出暂存标识无效');staged=path.join(runtimeDir,'export-staging',args.stageToken);outputs={};for(const c of w.cards)outputs[c.id]=JSON.parse(await fs.readFile(path.join(staged,c.id+'.json'),'utf8'));}
          const result=await exportWorkshop(directory,w,outputs,worker,{atomicWrite,pngBytes,validateProject});if(staged)await fs.rm(staged,{recursive:true,force:true});return result;
        }
        case 'save': {
          const doc = validateProject(args.document);
          let file = projectFile;
          if (dialogs && (!file || args.saveAs)) file = await dialogs.saveProject(doc.name);
          if (dialogs && !file) return {canceled:true};
          if(!dialogs&&args.saveAs)file=null;
          file ||= path.join(runtimeDir,'projects',(doc.name.replace(/[^\w\u3400-\u9fff-]/g,'_').slice(0,80)||'card')+'-'+randomUUID().slice(0,8)+'.cardproj');
          await atomicWrite(file,JSON.stringify(doc)); projectFile = file;
          return {file};
        }
        case 'open': {
          let file = dialogs ? await dialogs.openProject() : projectFile || path.join(runtimeDir,'projects','card.cardproj');
          if (!file) return {canceled:true};
          if ((await fs.stat(file)).size > workshopStorage.MAX_BYTES) throw Error('工坊超过 192 MB');
          const result=await workshopStorage.read(file,validateProject);projectFile=file;return {file,...result};
        }
        case 'import': {
          if (!dialogs) throw Error('浏览器预览请使用文件选择器');
          const file=await dialogs.importImage();if(!file)return {canceled:true};
          const ext=path.extname(file).toLowerCase();const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
          if(!mime||(await fs.stat(file)).size>24*1024*1024)throw Error('仅支持 24 MB 内的 PNG / JPEG / WebP');
          return {name:path.basename(file),src:`data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`};
        }
        case 'import-font': {
          if(!dialogs?.importFont)throw Error('请使用字体文件选择器');const file=await dialogs.importFont();if(!file)return {canceled:true};const ext=path.extname(file).slice(1).toLowerCase();if(!['ttf','otf','woff2'].includes(ext)||(await fs.stat(file)).size>12*1024*1024)throw Error('仅支持 12 MB 内的字体');return {name:path.basename(file),src:`data:font/${ext};base64,${(await fs.readFile(file)).toString('base64')}`};
        }
        case 'export': {
          const doc=validateProject(args.document);
          let base=dialogs?await dialogs.exportDirectory():path.join(runtimeDir,'exports');
          if(!base)return {canceled:true};
          const dir=path.join(base,'card-'+Date.now()+'-'+randomUUID().slice(0,8));await fs.mkdir(dir,{recursive:true});
          await exportCard(dir,doc,args,worker,{atomicWrite,pngBytes});const single=workshopModel.create(doc,'single-workshop',doc.id||'single-card',doc.name);const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));await require('./godot-export.cjs').exportGodot(dir,single,new Map([[single.activeCardId,manifest]]),{cardDirectory:dir});
          return {directory:dir};
        }
        default: throw Error('未知编辑器命令');
      }
    },
    close(){agents.close();worker.close();selectionWorker.close();cutoutWorker.close();}
  };
}
module.exports={createServices,validateProject,atomicWrite,ROOT,ASSETS};
