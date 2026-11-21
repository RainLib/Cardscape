import english from './ui-catalog.ts';
import type { UiLanguage } from '../../shared/contracts';

const hasChinese = /\p{Script=Han}/u;
const placeholders = /\{(\d+)\}/g;
const space = /\s+/g;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Pattern {
  readonly test: RegExp;
  readonly indexes: number[];
  readonly output: string;
  readonly literalLength: number;
}

const patterns = Object.entries(english)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, output]): Pattern => {
    const parts = key.split(placeholders);
    const indexes: number[] = [];
    let literalLength = 0;
    const expression = parts.map((part, index) => {
      if (index % 2) {
        indexes.push(Number(part));
        return '(.*?)';
      }
      literalLength += part.length;
      return escapeRegExp(part);
    }).join('');
    return { test: new RegExp('^' + expression + '$', 'u'), indexes, output, literalLength };
  })
  .sort((a, b) => b.literalLength - a.literalLength);

function isLanguage(value: unknown): value is UiLanguage {
  return value === 'en' || value === 'zh-CN';
}

function language(value: unknown): UiLanguage {
  return isLanguage(value) ? value : 'en';
}

function lookup(message: string): string | undefined {
  if (Object.hasOwn(english, message)) return english[message];
  for (const pattern of patterns) {
    const values = pattern.test.exec(message);
    if (values) {
      const args = new Map(pattern.indexes.map((index, slot) => [index, values[slot + 1]]));
      return pattern.output.replace(placeholders, (_, slot: string) => args.get(Number(slot)) ?? '');
    }
  }
  return undefined;
}

// Keep the original spacing around inline controls. A composed status can
// localize its labels independently of the file, layer or action name.
function text(source: string, target: UiLanguage): string {
  if (target === 'zh-CN' || !hasChinese.test(source)) return source;
  const prefix = source.match(/^\s*/)?.[0] || '';
  const suffix = source.match(/\s*$/)?.[0] || '';
  const message = source.trim().replace(space, ' ');
  // Help sections can combine multiple independent labels. Match each complete
  // line before letting one message template capture an adjacent paragraph.
  const lines = source.split(/(\r?\n)/);
  if (lines.length > 1) {
    const localized = lines.map((line, index) => index % 2 ? line : text(line, target)).join('');
    if (localized !== source) return localized;
  }
  const translated = lookup(message);
  if (translated !== undefined) return prefix + translated + suffix;
  const parts = source.split(/(\s+[·/|]\s+)/);
  return parts.length > 1
    ? parts.map((part, index) => index % 2 ? part : text(part, target)).join('')
    : source;
}

export default { isLanguage, language, text };
