import {Menu} from 'electron';

export function installApplicationMenu(command: (name: string) => void): void {
  const item=(label: string,c: string,accelerator?: string)=>({label,accelerator,click:()=>command(c)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Cardscape',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},
    {label:'文件',submenu:[item('新建卡片','new','CmdOrCtrl+N'),item('打开工程…','open','CmdOrCtrl+O'),item('保存工程…','save','CmdOrCtrl+S'),item('另存为…','save-as','CmdOrCtrl+Shift+S'),item('导入图像…','import','CmdOrCtrl+Alt+I'),item('导出素材包…','export')]},
    {label:'编辑',submenu:[item('撤销','undo','CmdOrCtrl+Z'),item('重做','redo','CmdOrCtrl+Shift+Z'),{type:'separator'},item('全选','select-all','CmdOrCtrl+A'),item('取消选区','deselect','CmdOrCtrl+D'),item('反选','invert-selection','CmdOrCtrl+Shift+I'),item('自由变换','transform','CmdOrCtrl+T'),item('复制图层 / 选区','duplicate','CmdOrCtrl+J'),item('删除普通图层','delete-layer','Delete'),{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'}]},
    {label:'视图',submenu:[item('适合窗口','fit','CmdOrCtrl+0'),item('100%','actual','CmdOrCtrl+1'),{role:'togglefullscreen'}]},
    {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]},
    {label:'帮助',submenu:[item('快捷键说明','shortcuts','F1')]}
  ]));
}
