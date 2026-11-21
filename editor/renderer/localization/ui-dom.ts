import i18n from './ui-i18n.ts';
import type { UiLanguage } from '../../shared/contracts';

const attributes = [
  'title', 'aria-label', 'aria-description', 'aria-valuetext',
  'placeholder', 'alt', 'data-help',
] as const;

// These scopes contain data authored outside the interface. Leave both the
// content and its accessible descriptions in the author's language.
const content = 'script,style,code,[contenteditable],[data-ui-content]';
const englishScopes = '.litecontextmenu,.cm-panel,.cm-tooltip,.cm-foldGutter,.splash-art-caption,.splash-kicker';
const chinese: Readonly<Record<string, string>> = {
  'CARD ART / TIDEWARDEN': '卡面原画 / 星潮守卫',
  'YOUR NEXT CARD STARTS HERE': '从这里开始创作',
  'Add Node': '添加节点',
  'Add Group': '添加分组',
  'Node': '节点',
  'Inputs': '输入',
  'Outputs': '输出',
  'Properties': '属性',
  'Title': '标题',
  'Mode': '模式',
  'Resize': '调整大小',
  'Collapse': '折叠',
  'Remove': '删除',
  'Clone': '复制',
  'Copy': '复制',
  'Paste': '粘贴',
  'Disconnect Links': '断开连线',
  'Colors': '颜色',
  'Shapes': '形状',
  'Find': '查找',
  'Replace': '替换',
  'next': '下一个',
  'previous': '上一个',
  'all': '全部',
  'replace': '替换',
  'replace all': '全部替换',
  'match case': '区分大小写',
  'regexp': '正则表达式',
  'whole word': '全字匹配',
  'close': '关闭',
  'Go to line': '跳转到行',
  'go': '跳转',
  'Completions': '自动补全',
  'Diagnostics': '诊断',
  'No diagnostics': '没有诊断',
  'folded code': '已折叠代码',
  'unfold': '展开',
  'fold line': '折叠代码',
  'unfold line': '展开代码',
};
interface Label {
  source: string;
  display: string;
}

function create(root: HTMLElement, initial: UiLanguage) {
  let language = initial;
  const texts = new WeakMap<Text, Label>();
  const labels = new WeakMap<Element, Map<string, Label>>();
  const cache = new Map<string, string>();

  function resolve(current: string, previous?: Label, fromEnglishScope = false): Label {
    const source = current === previous?.display ? previous.source : current;
    if (fromEnglishScope && language === 'zh-CN') {
      const key = source.trim();
      if (Object.hasOwn(chinese, key))
        return { source, display: source.replace(key, chinese[key]) };
    }
    let display = cache.get(source);
    if (display === undefined) {
      display = i18n.text(source, language);
      if (cache.size >= 1024) cache.clear();
      cache.set(source, display);
    }
    return { source, display };
  }

  function attribute(element: Element, name: string) {
    const value = element.getAttribute(name);
    const previous = labels.get(element);
    if (value === null) {
      previous?.delete(name);
      return;
    }
    const next = resolve(value, previous?.get(name), Boolean(element.closest(englishScopes)));
    if (next.source === next.display && !previous?.has(name)) return;
    if (!previous) labels.set(element, new Map([[name, next]]));
    else previous.set(name, next);
    if (value !== next.display) element.setAttribute(name, next.display);
  }

  function update(node: Node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    if (element?.closest(content)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (element?.closest('textarea')) return;
      const leaf = node as Text;
      const previous = texts.get(leaf);
      const next = resolve(leaf.data, previous, Boolean(element?.closest(englishScopes)));
      if (next.source !== next.display || previous) texts.set(leaf, next);
      if (leaf.data !== next.display) {
        // Keep the programmatic value of options that rely on their text.
        if (element instanceof HTMLOptionElement && !element.hasAttribute('value'))
          element.value = element.value;
        leaf.data = next.display;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const name of attributes) attribute(node as Element, name);
      for (const child of node.childNodes) update(child);
    }
  }

  const observer = new MutationObserver((mutations) => {
    const added = new Set<Node>();
    for (const mutation of mutations) {
      if (mutation.type === 'childList')
        for (const child of mutation.addedNodes) added.add(child);
      else if (mutation.type === 'attributes') {
        const element = mutation.target as Element;
        if (root.contains(element) && !element.closest(content))
          attribute(element, mutation.attributeName!);
      } else added.add(mutation.target);
    }
    for (const node of added)
      if (root.contains(node) && !(node.parentNode && added.has(node.parentNode)))
        update(node);
  });

  function set(next: UiLanguage) {
    language = next;
    cache.clear();
    root.lang = next;
    update(root);
  }
  set(initial);
  observer.observe(root, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: [...attributes],
  });

  return { set };
}

export default { create };
