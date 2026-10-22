import type { EditorElements } from '../../types/editor-elements';

export function element<K extends keyof EditorElements>(
  id: K,
): EditorElements[K];
export function element<T extends HTMLElement = HTMLElement>(id: string): T;
export function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw Error('编辑器缺少界面元素：' + id);
  return value;
}
