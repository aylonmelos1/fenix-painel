import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const POLICY_VERSION = '1.0.0';

const slashExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs', '.jsonc', '.json5', '.css', '.scss', '.sass', '.less', '.java', '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.cxx', '.cs', '.swift', '.kt', '.kts', '.scala', '.groovy', '.dart', '.php']);
const hashExtensions = new Set(['.py', '.pyi', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml', '.tf', '.hcl', '.dockerfile', '.rb', '.r', '.ps1', '.ini', '.properties', '.conf', '.nix', '.mk']);
const sqlExtensions = new Set(['.sql', '.pgsql', '.psql']);
const htmlExtensions = new Set(['.html', '.htm', '.xml', '.svg', '.vue', '.svelte']);
const slashOrHtmlExtensions = new Set(['.vue', '.svelte']);
const filenameCommentPaths = new Set(['Dockerfile', 'Makefile', 'GNUmakefile']);

function extensionFor(path) {
  const leaf = path.split('/').at(-1) ?? path;
  if (filenameCommentPaths.has(leaf) || leaf.toLowerCase().startsWith('dockerfile')) return '.dockerfile';
  const lastDot = leaf.lastIndexOf('.');
  return lastDot < 0 ? '' : leaf.slice(lastDot).toLowerCase();
}

export function parseAddedLines(diff) {
  const files = [];
  let file = null;
  let newLine = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      const path = line.slice(6);
      file = { path, lines: [], sourceLines: [] };
      files.push(file);
      continue;
    }
    if (line.startsWith('+++ /dev/null')) {
      file = null;
      continue;
    }
    if (line.startsWith('@@ ')) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      newLine = match ? Number(match[1]) : 0;
      continue;
    }
    if (!file || newLine < 1) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const entry = { lineNumber: newLine, text: line.slice(1), added: true };
      file.lines.push(entry);
      file.sourceLines.push(entry);
      newLine += 1;
    } else if (line.startsWith(' ')) {
      file.sourceLines.push({ lineNumber: newLine, text: line.slice(1), added: false });
      newLine += 1;
    }
  }
  return files;
}

function commentSyntax(path) {
  const extension = extensionFor(path);
  return {
    slashLine: slashExtensions.has(extension) || slashOrHtmlExtensions.has(extension),
    slashBlock: slashExtensions.has(extension) || slashOrHtmlExtensions.has(extension) || sqlExtensions.has(extension),
    hash: hashExtensions.has(extension) || extension === '.env',
    hashRequiresSpace: !['.py', '.pyi', '.rb', '.r', '.ps1', '.nix', '.mk', '.dockerfile', '.env'].includes(extension),
    sqlLine: sqlExtensions.has(extension),
    html: htmlExtensions.has(extension) || extension === '.md' || extension === '.markdown'
  };
}

function findSequence(text, sequence, start) {
  return text.indexOf(sequence, start);
}


const javascriptExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs']);

function extractJavaScriptComments(file) {
  const entries = file.sourceLines;
  const starts = [];
  let source = '';
  for (let index = 0; index < entries.length; index += 1) {
    if (index) source += '\n';
    starts.push(source.length);
    source += entries[index].text;
  }
  const lineAt = (offset) => {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  };
  const comments = [];
  const templates = [];
  const parenControls = [];
  const controlKeywords = new Set(['catch', 'for', 'if', 'switch', 'while', 'with']);
  const expressionKeywords = new Set(['await', 'case', 'const', 'delete', 'do', 'else', 'finally', 'function', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'throw', 'typeof', 'var', 'void', 'yield']);
  let index = 0;
  let regexAllowed = true;
  let pendingControlParen = false;
  const addComment = (start, end, opener, closeToken, kind) => {
    const firstLine = lineAt(start);
    const lastLine = lineAt(Math.max(start, end - 1));
    const addedLineNumbers = entries.slice(firstLine, lastLine + 1).filter((entry) => entry.added).map((entry) => entry.lineNumber);
    if (!addedLineNumbers.length) return;
    comments.push({
      path: file.path,
      lineNumber: entries[firstLine]?.lineNumber ?? 0,
      endLine: entries[lastLine]?.lineNumber ?? entries[firstLine]?.lineNumber ?? 0,
      kind,
      opener,
      closeToken,
      text: source.slice(start + 2, closeToken ? end - closeToken.length : end),
      addedLineNumbers
    });
  };
  const skipString = (quote, start) => {
    let cursor = start + 1;
    while (cursor < source.length) {
      const current = source[cursor];
      if (current === '\\') {
        cursor += 2;
        continue;
      }
      if (current === quote) return cursor + 1;
      if (current === '\n') return cursor;
      cursor += 1;
    }
    return cursor;
  };
  const skipRegularExpression = (start) => {
    let cursor = start + 1;
    let inCharacterClass = false;
    while (cursor < source.length) {
      const current = source[cursor];
      if (current === '\\') {
        cursor += 2;
        continue;
      }
      if (current === '\n') return start + 1;
      if (current === '[') inCharacterClass = true;
      else if (current === ']') inCharacterClass = false;
      else if (current === '/' && !inCharacterClass) {
        cursor += 1;
        while (/[A-Za-z]/.test(source[cursor] ?? '')) cursor += 1;
        return cursor;
      }
      cursor += 1;
    }
    return start + 1;
  };
  while (index < source.length) {
    const template = templates.at(-1);
    const char = source[index];
    if (template && !template.inExpression) {
      if (char === '\\') index += 2;
      else if (char.charCodeAt(0) === 96) {
        templates.pop();
        index += 1;
        regexAllowed = false;
      } else if (char.charCodeAt(0) === 36 && source[index + 1] === '{') {
        template.inExpression = true;
        template.braceDepth = 1;
        index += 2;
        regexAllowed = true;
      } else index += 1;
      continue;
    }
    if (template?.inExpression && char === '{') {
      template.braceDepth += 1;
      index += 1;
      regexAllowed = true;
      continue;
    }
    if (template?.inExpression && char === '}') {
      template.braceDepth -= 1;
      index += 1;
      if (template.braceDepth === 0) template.inExpression = false;
      regexAllowed = false;
      continue;
    }
    if (char.charCodeAt(0) === 96) {
      templates.push({ inExpression: false, braceDepth: 0 });
      index += 1;
      pendingControlParen = false;
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(char, index);
      regexAllowed = false;
      pendingControlParen = false;
      continue;
    }
    if (char === '/' && source[index + 1] === '/') {
      let end = index + 2;
      while (end < source.length && source[end] !== '\n') end += 1;
      addComment(index, end, '//', '', 'line');
      index = end;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      const end = close < 0 ? source.length : close + 2;
      const opener = source[index + 2] === '*' ? '/**' : '/*';
      addComment(index, end, opener, close < 0 ? '' : '*/', 'block');
      index = end;
      continue;
    }
    if (char === '/' && regexAllowed) {
      const end = skipRegularExpression(index);
      if (end > index + 1) {
        index = end;
        regexAllowed = false;
        pendingControlParen = false;
        continue;
      }
      index += 1;
      regexAllowed = true;
      pendingControlParen = false;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (/[A-Za-z0-9_]/.test(source[end] ?? '')) end += 1;
      const word = source.slice(index, end);
      regexAllowed = expressionKeywords.has(word);
      pendingControlParen = controlKeywords.has(word);
      index = end;
      continue;
    }
    if (/[0-9]/.test(char)) {
      index += 1;
      while (/[A-Za-z0-9_.]/.test(source[index] ?? '')) index += 1;
      regexAllowed = false;
      pendingControlParen = false;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      parenControls.push(pendingControlParen);
      pendingControlParen = false;
      regexAllowed = true;
      index += 1;
      continue;
    }
    if (char === ')') {
      regexAllowed = parenControls.pop() ?? false;
      pendingControlParen = false;
      index += 1;
      continue;
    }
    if (char === '[' || char === ',' || char === ';' || char === ':' || char === '?' || char === '{') {
      regexAllowed = true;
      pendingControlParen = false;
      index += 1;
      continue;
    }
    if (char === ']' || char === '.' || char === '}') {
      regexAllowed = false;
      pendingControlParen = false;
      index += 1;
      continue;
    }
    if ((char === '+' && source[index + 1] === '+') || (char === '-' && source[index + 1] === '-')) {
      index += 2;
      regexAllowed = false;
      pendingControlParen = false;
      continue;
    }
    if (char === '/' && source[index + 1] === '=') index += 2;
    else if (source.startsWith('=>', index)) index += 2;
    else index += 1;
    regexAllowed = true;
    pendingControlParen = false;
  }
  return comments;
}

function extractGenericComments(file) {
  const syntax = commentSyntax(file.path);
  const comments = [];
  let block = null;
  let multilineQuote = null;
  const includeComment = (comment) => {
    if (comment.addedLineNumbers.length) comments.push(comment);
  };
  for (const entry of file.sourceLines) {
    const text = entry.text;
    let index = 0;
    if (block) {
      const closeToken = block.closeToken ?? '*/';
      const close = findSequence(text, closeToken, index);
      const fragment = close < 0 ? text.slice(index) : text.slice(index, close);
      block.text += '\n' + fragment;
      if (entry.added) block.addedLineNumbers.push(entry.lineNumber);
      if (close < 0) continue;
      block.endLine = entry.lineNumber;
      includeComment(block);
      block = null;
      index = close + closeToken.length;
    }
    if (multilineQuote) {
      const close = findSequence(text, multilineQuote, index);
      if (close < 0) continue;
      index = close + multilineQuote.length;
      multilineQuote = null;
    }
    while (index < text.length) {
      if (syntax.html && text.startsWith('<!--', index)) {
        const close = findSequence(text, '-->', index + 4);
        const body = close < 0 ? text.slice(index + 4) : text.slice(index + 4, close);
        const comment = { path: file.path, lineNumber: entry.lineNumber, endLine: entry.lineNumber, kind: 'block', opener: '<!--', closeToken: '-->', text: body, addedLineNumbers: entry.added ? [entry.lineNumber] : [] };
        if (close < 0) {
          block = comment;
          break;
        }
        includeComment(comment);
        index = close + 3;
        continue;
      }
      if (syntax.slashBlock && text.startsWith('/*', index)) {
        const opener = text.startsWith('/**', index) ? '/**' : '/*';
        const bodyStart = index + 2;
        const close = findSequence(text, '*/', bodyStart);
        const body = close < 0 ? text.slice(bodyStart) : text.slice(bodyStart, close);
        const comment = { path: file.path, lineNumber: entry.lineNumber, endLine: entry.lineNumber, kind: 'block', opener, closeToken: '*/', text: body, addedLineNumbers: entry.added ? [entry.lineNumber] : [] };
        if (close < 0) {
          block = comment;
          break;
        }
        includeComment(comment);
        index = close + 2;
        continue;
      }
      const char = text[index];
      const extension = extensionFor(file.path);
      if ((extension === '.py' || extension === '.pyi') && (text.startsWith('"""', index) || text.startsWith("'''", index))) {
        const quote = text.slice(index, index + 3);
        const close = findSequence(text, quote, index + 3);
        if (close < 0) multilineQuote = quote;
        index = close < 0 ? text.length : close + 3;
        continue;
      }
      if (char === '"' || char === "'" || text.charCodeAt(index) === 96) {
        const quote = char;
        let close = index + 1;
        let escaped = false;
        for (; close < text.length; close += 1) {
          const current = text[close];
          if (escaped) {
            escaped = false;
          } else if (current === '\\') {
            escaped = true;
          } else if (current === quote) {
            break;
          }
        }
        if (close >= text.length && quote.charCodeAt(0) === 96) multilineQuote = quote;
        index = close < text.length ? close + 1 : text.length;
        continue;
      }
      if (syntax.slashLine && text.startsWith('//', index)) {
        includeComment({ path: file.path, lineNumber: entry.lineNumber, endLine: entry.lineNumber, kind: 'line', opener: '//', text: text.slice(index + 2), addedLineNumbers: entry.added ? [entry.lineNumber] : [] });
        break;
      }
      if (syntax.sqlLine && text.startsWith('--', index)) {
        includeComment({ path: file.path, lineNumber: entry.lineNumber, endLine: entry.lineNumber, kind: 'line', opener: '--', text: text.slice(index + 2), addedLineNumbers: entry.added ? [entry.lineNumber] : [] });
        break;
      }
      if (syntax.hash && char === '#') {
        if (index === 0 && text.startsWith('#!')) break;
        if (syntax.hashRequiresSpace && index > 0 && !/\s/.test(text[index - 1])) {
          index += 1;
          continue;
        }
        includeComment({ path: file.path, lineNumber: entry.lineNumber, endLine: entry.lineNumber, kind: 'line', opener: '#', text: text.slice(index + 1), addedLineNumbers: entry.added ? [entry.lineNumber] : [] });
        break;
      }
      if (syntax.slashBlock && syntax.slashLine && index === 0 && /^\s*\*(?:\s|$)/.test(text)) {
        includeComment({ path: file.path, lineNumber: entry.lineNumber, endLine: entry.lineNumber, kind: 'continuation', opener: '*', text: text.replace(/^\s*\*\s?/, ''), addedLineNumbers: entry.added ? [entry.lineNumber] : [] });
        break;
      }
      index += 1;
    }
  }
  if (block) {
    block.endLine = file.sourceLines.at(-1)?.lineNumber ?? block.lineNumber;
    includeComment(block);
  }
  return comments;
}
function extractComments(file) {
  if (javascriptExtensions.has(extensionFor(file.path))) return extractJavaScriptComments(file);
  return extractGenericComments(file);
}

function ruleProblem(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (/^(?:[=*_#~\-]){3,}(?:\s+[\w .:/-]+)?$/.test(normalized)) {
    return { rule: 'decorative-separator', message: 'separador decorativo' };
  }
  if (/\b(?:TODO|FIXME|HACK|IMPORTANT)\b|\b(?:temporary|temporarily|temporário|temporariamente)\b|\b(?:do not|don't|never) (?:remove|touch|edit)\b|\bnão (?:remova|remover|altere|mexer)\b/i.test(normalized)) {
    return { rule: 'fragile-marker', message: 'marcador frágil ou aviso de gambiarra' };
  }
  if (/(?:\beslint-disable\b|@ts-ignore\b|@ts-expect-error\b|\bnoqa\b|\bshellcheck\s+disable\b|\btype:\s*ignore\b)/i.test(normalized)) {
    return { rule: 'suppression', message: 'supressão de lint ou tipagem' };
  }
  if (/^(?:const|let|var|function|class|return|if|for|while|switch|try|catch|export|import|await|npm|npx|curl|systemctl|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(normalized)) {
    return { rule: 'commented-code', message: 'código comentado' };
  }
  return null;
}

function isLicenseHeader(comment) {
  const text = comment.text.trim();
  return /SPDX-License-Identifier:\s*[A-Za-z0-9.-]+/i.test(text)
    || /(?:copyright|©)\s*(?:\d{4}|[A-Za-z])/i.test(text)
    || /licensed under (?:the )?(?:MIT|Apache|BSD|ISC|MPL|GPL|LGPL)\b/i.test(text)
    || /\b(?:MIT|Apache(?:-2\.0)?|BSD(?:-3-Clause)?|ISC)\s+License\b/i.test(text);
}

function isFormatterDirective(comment) {
  return /^(?:\s*\*?\s*)?(?:prettier-ignore|fmt:off|fmt:on)\s*$/i.test(comment.text);
}

function isExternalConstraintReference(text) {
  const externalSystem = /\b(?:Fênix|Fenix|CBMBA|Odoo|VAI|kernel|systemd|upstream|API externa|external API)\b/i.test(text);
  const limitation = /\b(?:limita(?:ção|tions?)|restri(?:ção|ct(?:ion)?)|não (?:suporta|permite)|does not support|unsupported|cannot|inevitably|requires?|requirement|limitação externa inevitável|restrição externa inevitável)\b/i.test(text);
  const reference = /https?:\/\/|#\d+|RFC-\d+/i.test(text);
  return externalSystem && limitation && reference;
}

function isPublicApiDoc(comment, files) {
  if (comment.opener !== '/**') return false;
  const contractTags = comment.text.split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .filter(Boolean);
  const tagPatterns = [
    /^@param\s+(?:\{[^{}]+\}\s*)?(?:\[[\w.-]+\]|(?:\.\.\.)?[\w.-]+)$/,
    /^@returns?\s+\{[^{}]+\}$/,
    /^@throws\s+\{[^{}]+\}$/,
    /^@property\s+\{[^{}]+\}\s+[\w.-]+$/,
    /^@typedef\s+\{[^{}]+\}\s+[\w.-]+$/,
    /^@type\s+\{[^{}]+\}$/,
    /^@deprecated$/
  ];
  if (!contractTags.length || !contractTags.every((line) => tagPatterns.some((pattern) => pattern.test(line)))) return false;
  const file = files.find((candidate) => candidate.path === comment.path);
  if (!file) return false;
  const declaration = file.sourceLines.find((entry) => entry.lineNumber > comment.endLine && entry.lineNumber <= comment.endLine + 4 && entry.text.trim());
  return Boolean(declaration && /^\s*export\s+(?:(?:declare|async)\s+)*(?:function|const|let|var|class|interface|type|enum|default)\b/.test(declaration.text));
}

export function inspectDiff(diff) {
  const files = parseAddedLines(diff);
  const findings = [];
  const reviewNotices = [];
  const exceptions = [];
  for (const file of files) {
    for (const comment of extractComments(file)) {
      const lineNumber = comment.addedLineNumbers[0];
      const problem = ruleProblem(comment.text);
      let exception = null;
      if (!problem && isLicenseHeader(comment)) exception = 'license';
      if (!problem && !exception && isFormatterDirective(comment)) exception = 'formatter-directive';
      if (!problem && !exception && isPublicApiDoc(comment, files)) exception = 'public-api-jsdoc';
      if (!problem && !exception && isExternalConstraintReference(comment.text)) exception = 'external-constraint-reference';
      if (problem?.rule === 'suppression' && isExternalConstraintReference(comment.text)) exception = 'external-constraint-reference';
      if (exception) {
        exceptions.push({ path: comment.path, lineNumber, exception });
        if (exception === 'public-api-jsdoc' || exception === 'external-constraint-reference') {
          reviewNotices.push({ path: comment.path, lineNumber, exception });
        }
      } else {
        findings.push({
          path: comment.path,
          lineNumber,
          rule: problem?.rule ?? 'unapproved-comment',
          message: problem?.message ?? 'comentário fora das exceções aprovadas'
        });
      }
    }
  }
  return { addedLines: files.reduce((total, file) => total + file.lines.length, 0), findings, exceptions, reviewNotices };
}

function runGit(args, acceptedStatuses = [0]) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error((result.stderr || result.stdout || 'falha ao executar git').trim());
  }
  return result.stdout ?? '';
}

function availableRef(ref) {
  const result = spawnSync('git', ['rev-parse', '--verify', ref + '^{commit}'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function defaultBaseRef() {
  return ['origin/main', 'main', 'HEAD^1'].find(availableRef) ?? null;
}

export function buildWorkingTreeDiff(baseRef) {
  const selectedBase = baseRef || defaultBaseRef();
  if (!selectedBase) throw new Error('nenhuma referência base disponível; informe origin/main ou HEAD^1');
  runGit(['rev-parse', '--verify', selectedBase + '^{commit}']);
  let diff = runGit(['diff', '--no-ext-diff', '--no-color', '--unified=2147483647', selectedBase, '--']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z']);
  for (const path of untracked.split('\0').filter(Boolean)) {
    diff += runGit(['diff', '--no-index', '--no-ext-diff', '--no-color', '--unified=2147483647', '--', '/dev/null', path], [0, 1]);
  }
  return diff;
}

function run() {
  const baseRef = process.argv[2] || defaultBaseRef();
  let diff;
  try {
    diff = buildWorkingTreeDiff(baseRef);
  } catch (error) {
    console.error('no-comments: não foi possível calcular o diff contra ' + (baseRef || 'a referência disponível') + ': ' + error.message);
    process.exitCode = 2;
    return;
  }
  const result = inspectDiff(diff);
  for (const notice of result.reviewNotices) {
    console.log('REVISÃO HUMANA: ' + notice.path + ':' + notice.lineNumber + ' (' + notice.exception + ')');
  }
  for (const finding of result.findings) {
    console.error(finding.path + ':' + finding.lineNumber + ': ' + finding.message + ' [' + finding.rule + ']');
  }
  if (result.findings.length) {
    console.error('no-comments: bloqueado; policy=' + POLICY_VERSION + ', findings=' + result.findings.length);
    process.exitCode = 1;
    return;
  }
  console.log('no-comments: aprovado; policy=' + POLICY_VERSION + ', linhas adicionadas=' + result.addedLines + ', exceções=' + result.exceptions.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
