const fs=require('node:fs');
const path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');

// Development uses Electron.app directly, so macOS also needs its bundle icon.
// Dock.setIcon alone does not cover Finder or minimized-window badges.
if(process.platform==='darwin'){
  const root=path.resolve(__dirname,'..');
  const bundle=path.join(root,'node_modules/electron/dist/Electron.app');
  const source=path.join(root,'assets/icons/card-atelier.icns');
  const target=path.join(bundle,'Contents/Resources/electron.icns');
  const desired=fs.readFileSync(source);
  if(!fs.existsSync(target)||!fs.readFileSync(target).equals(desired)){
    const signed=spawnSync('/usr/bin/codesign',['-dv',bundle],{stdio:'ignore'}).status===0;
    fs.copyFileSync(source,target);
    if(signed)execFileSync('/usr/bin/codesign',['--force','--sign','-','--preserve-metadata=entitlements,requirements,flags,runtime',bundle],{stdio:'inherit'});
    const now=new Date();fs.utimesSync(bundle,now,now);
    const register='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
    if(fs.existsSync(register))execFileSync(register,['-f',bundle],{stdio:'ignore'});
    console.log('macOS application bundle icon updated to Card Atelier.');
  }
}
