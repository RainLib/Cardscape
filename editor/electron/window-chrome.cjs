'use strict';
// Native controls retain OS close confirmation, fullscreen and accessibility.
function windowChromeOptions(platform){
  return platform==='darwin'
    ? {titleBarStyle:'hiddenInset',trafficLightPosition:{x:14,y:13}}
    : {titleBarStyle:'hidden',titleBarOverlay:{color:'#262626',symbolColor:'#d8d8d8',height:40}};
}
module.exports={windowChromeOptions};
