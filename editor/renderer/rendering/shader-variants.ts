/* Specialize only the built-in rim. User fragment hooks remain byte-for-byte intact. */
const marker = '// Shared procedural finish';
const maskComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (value) =>
    value.replace(/[^\n]/g, ' '),
  );
function close(code: string, start: number, left = '(', right = ')'): number {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === left) depth++;
    if (code[i] === right && --depth === 0) return i;
  }
  throw Error('Unbalanced built-in shader');
}
function condition(expression: string, finish: number): boolean | undefined {
  let value = expression.trim();
  while (value[0] === '(' && close(value, 0) === value.length - 1)
    value = value.slice(1, -1).trim();
  for (const operator of ['||', '&&']) {
    let depth = 0;
    for (let i = 0; i < value.length - 1; i++) {
      if (value[i] === '(') depth++;
      if (value[i] === ')') depth--;
      if (!depth && value.slice(i, i + 2) === operator) {
        const a = condition(value.slice(0, i), finish),
          b = condition(value.slice(i + 2), finish);
        if (operator === '&&')
          return a === false || b === false
            ? false
            : a === true && b === true
              ? true
              : undefined;
        return a === true || b === true
          ? true
          : a === false && b === false
            ? false
            : undefined;
      }
    }
  }
  if (value === 'true' || value === 'false') return value === 'true';
  const match =
    /^finish\s*(<=|>=|==|!=|<|>)\s*(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(value);
  if (!match) return undefined;
  const n = Number(match[2]);
  switch (match[1]) {
    case '<':
      return finish < n;
    case '>':
      return finish > n;
    case '<=':
      return finish <= n;
    case '>=':
      return finish >= n;
    case '==':
      return finish === n;
    case '!=':
      return finish !== n;
  }
  return undefined;
}
function specializeBody(source: string, finish: number): string {
  const code = maskComments(source),
    whitespace = (start: number) => {
      while (/\s/.test(code[start] || '') && start < code.length) start++;
      return start;
    };
  const isIf = (start: number) =>
    code.slice(start, start + 2) === 'if' &&
    !/\w/.test(code[start - 1] || '') &&
    !/\w/.test(code[start + 2] || '');
  function statement(start: number): number {
    start = whitespace(start);
    if (code[start] === '{') return close(code, start, '{', '}') + 1;
    if (isIf(start)) {
      const end = statement(close(code, whitespace(start + 2)) + 1),
        next = whitespace(end);
      return code.slice(next, next + 4) === 'else' ? statement(next + 4) : end;
    }
    for (let i = start; i < code.length; i++) {
      if (code[i] === '(') i = close(code, i);
      if (code[i] === ';') return i + 1;
      if (code[i] === '{') return close(code, i, '{', '}') + 1;
    }
    throw Error('Unterminated built-in shader statement');
  }
  function transform(start: number, end: number): string {
    let output = '',
      cursor = start;
    for (let i = start; i < end; i++) {
      if (!isIf(i)) continue;
      const open = whitespace(i + 2),
        predicateEnd = close(code, open),
        body = whitespace(predicateEnd + 1),
        bodyEnd = statement(body),
        next = whitespace(bodyEnd);
      const alternative =
          code.slice(next, next + 4) === 'else' ? whitespace(next + 4) : null,
        final = alternative === null ? bodyEnd : statement(alternative);
      const known = condition(code.slice(open + 1, predicateEnd), finish);
      output += source.slice(cursor, i);
      if (known === undefined)
        output +=
          source.slice(i, body) +
          transform(body, bodyEnd) +
          (alternative === null
            ? ''
            : source.slice(bodyEnd, alternative) +
              transform(alternative, final));
      else
        output += known
          ? '{' + transform(body, bodyEnd) + '}'
          : alternative === null
            ? ';'
            : '{' + transform(alternative, final) + '}';
      cursor = final;
      i = final - 1;
    }
    return output + source.slice(cursor, end);
  }
  return transform(0, source.length);
}
/** Fold finish selection, then keep only reachable shared functions in original order. */
function frameFragment(source: string, finish: number): string {
  if (!Number.isInteger(finish) || finish < 0 || finish > 24) return source;
  const start = source.lastIndexOf(marker),
    end = source.indexOf('\nvoid ', start);
  if (start < 0 || end < 0) return source;
  // A custom hook may deliberately invoke a rim with another finish. Its
  // arguments must retain their original semantics instead of inheriting ours.
  if (
    /\b(?:rimColor|rimAura|rimCoverage|contourRim|contourGlow)\b/.test(
      maskComments(source.slice(0, start)),
    )
  )
    return source;
  const shared = source.slice(start, end),
    code = maskComments(shared),
    functions: Array<{
      name: string;
      start: number;
      end: number;
      source: string;
    }> = [];
  const pattern =
    /\b(?:float|vec[234]|mat[234]|bool|int|void)\s+(\w+)\s*\([^;{}]*\)\s*\{/g;
  for (let match; (match = pattern.exec(code)); ) {
    const open = pattern.lastIndex - 1,
      final = close(code, open, '{', '}') + 1,
      name = match[1]!;
    let body = shared.slice(open, final);
    if (name === 'rimColor' || name === 'rimAura')
      body = specializeBody(body, finish);
    if (name === 'rimCoverage' && finish !== 12) body = '{return 1.;}';
    functions.push({
      name,
      start: match.index,
      end: final,
      source: shared.slice(match.index, open) + body,
    });
    pattern.lastIndex = final;
  }
  const names = new Set(functions.map((f) => f.name)),
    required = new Set<string>();
  const visit = (text: string) => {
    // Identifier references also include aliases in user #define directives.
    for (const match of maskComments(text).matchAll(/\b(\w+)\b/g))
      if (names.has(match[1]!) && !required.has(match[1]!)) {
        required.add(match[1]!);
        for (const f of functions)
          if (f.name === match[1]) visit(f.source.slice(f.source.indexOf('{')));
      }
  };
  visit(source.slice(0, start) + source.slice(end));
  let output = '',
    cursor = 0;
  for (const f of functions) {
    output +=
      shared.slice(cursor, f.start) + (required.has(f.name) ? f.source : '');
    cursor = f.end;
  }
  return (
    source.slice(0, start) + output + shared.slice(cursor) + source.slice(end)
  );
}
export default { frameFragment };
