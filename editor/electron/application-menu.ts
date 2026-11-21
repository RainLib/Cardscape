import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { UiLanguage } from '../shared/contracts';

const i18n: typeof import('../renderer/localization/ui-i18n').default =
  require('../renderer/ui-i18n.js');

export function installApplicationMenu(
  command: (name: string) => void,
  language: UiLanguage,
  setLanguage: (language: UiLanguage) => void,
): void {
  const t = (label: string) => i18n.text(label, language);
  const item = (label: string, name: string, accelerator?: string) => ({
    label: t(label), accelerator, click: () => command(name),
  });
  const role = (value: MenuItemConstructorOptions['role'], label: string) => ({
    role: value, label: t(label),
  });
  const separator = { type: 'separator' } as const;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Cardscape', submenu: [
      role('about', '关于 Cardscape'), separator, role('quit', '退出 Cardscape'),
    ] },
    { label: t('文件'), submenu: [
      item('新建卡片', 'new', 'CmdOrCtrl+N'),
      item('打开工程…', 'open', 'CmdOrCtrl+O'),
      item('保存工程…', 'save', 'CmdOrCtrl+S'),
      item('另存为…', 'save-as', 'CmdOrCtrl+Shift+S'),
      item('导入图像…', 'import', 'CmdOrCtrl+Alt+I'),
      item('导出素材包…', 'export'),
    ] },
    { label: t('编辑'), submenu: [
      item('撤销', 'undo', 'CmdOrCtrl+Z'),
      item('重做', 'redo', 'CmdOrCtrl+Shift+Z'), separator,
      item('全选', 'select-all', 'CmdOrCtrl+A'),
      item('取消选区', 'deselect', 'CmdOrCtrl+D'),
      item('反选', 'invert-selection', 'CmdOrCtrl+Shift+I'),
      item('自由变换', 'transform', 'CmdOrCtrl+T'),
      item('复制图层 / 选区', 'duplicate', 'CmdOrCtrl+J'),
      item('删除普通图层', 'delete-layer', 'Delete'), separator,
      role('cut', '剪切'), role('copy', '复制'), role('paste', '粘贴'),
    ] },
    { label: t('视图'), submenu: [
      item('适合窗口', 'fit', 'CmdOrCtrl+0'),
      item('100%', 'actual', 'CmdOrCtrl+1'),
      role('togglefullscreen', '切换全屏'), separator,
      { label: t('界面语言'), submenu: ([
        ['en', 'English'], ['zh-CN', '简体中文'],
      ] as const).map(([locale, label]) => ({
        label, type: 'radio', checked: locale === language,
        click: () => setLanguage(locale),
      })) },
    ] },
    { label: t('窗口'), submenu: [role('minimize', '最小化'), role('zoom', '缩放窗口')] },
    { label: t('帮助'), submenu: [item('快捷键说明', 'shortcuts', 'F1')] },
  ]));
}
