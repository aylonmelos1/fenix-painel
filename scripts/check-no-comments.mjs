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
      file = { path, lines: [] };
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
      file.lines.push({ lineNumber: newLine, text: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith(' ')) {
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

function extractComments(file) {
  const syntax = commentSyntax(file.path);
  const comments = [];
  let block = null;
  let multilineQuote = null;
  let previousLine = 0;
  for (const entry of file.lines) {
    if (previousLine && entry.lineNumber !== previousLine + 1) {
      block = null;
      multilineQuote = null;
    }
    previousLine = entry.lineNumber;
    const text = entry.text;
    let index = 0;
    if (block) {
      const closeToken = block.closeToken ?? '*/';
      const close = findSequence(text, closeToken, index);
      const fragment = close < 0 ? text.slice(index) : text.slice(index, close);
      block.text += '\n' + fragment;
      if (close < 0) continue;
      comments.push(block);
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
        const comment = { path: file.path, lineNumber: entry.lineNumber, kind: 'block', opener: '<!--', closeToken: '-->', text: body };
        if (close < 0) {
          block = comment;
          break;
        }
        comments.push(comment);
        index = close + 3;
        continue;
      }
      if (syntax.slashBlock && text.startsWith('/*', index)) {
        const opener = text.startsWith('/**', index) ? '/**' : '/*';
        const bodyStart = index + 2;
        const close = findSequence(text, '*/', bodyStart);
        const body = close < 0 ? text.slice(bodyStart) : text.slice(bodyStart, close);
        const comment = { path: file.path, lineNumber: entry.lineNumber, kind: 'block', opener, closeToken: '*/', text: body };
        if (close < 0) {
          block = comment;
          break;
        }
        comments.push(comment);
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
      if (char === '"' || char === "'" || char === '`') {
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
        if (close >= text.length && quote === '`') multilineQuote = quote;
        index = close < text.length ? close + 1 : text.length;
        continue;
      }
      if (syntax.slashLine && text.startsWith('//', index)) {
        comments.push({ path: file.path, lineNumber: entry.lineNumber, kind: 'line', opener: '//', text: text.slice(index + 2) });
        break;
      }
      if (syntax.sqlLine && text.startsWith('--', index)) {
        comments.push({ path: file.path, lineNumber: entry.lineNumber, kind: 'line', opener: '--', text: text.slice(index + 2) });
        break;
      }
      if (syntax.hash && char === '#') {
        if (index === 0 && text.startsWith('#!')) break;
        if (syntax.hashRequiresSpace && index > 0 && !/\s/.test(text[index - 1])) {
          index += 1;
          continue;
        }
        comments.push({ path: file.path, lineNumber: entry.lineNumber, kind: 'line', opener: '#', text: text.slice(index + 1) });
        break;
      }
      if (syntax.slashBlock && syntax.slashLine && index === 0 && /^\s*\*(?:\s|$)/.test(text)) {
        comments.push({ path: file.path, lineNumber: entry.lineNumber, kind: 'continuation', opener: '*', text: text.replace(/^\s*\*\s?/, '') });
        break;
      }
      index += 1;
    }
  }
  if (block) comments.push(block);
  return comments;
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
  if (!/@(?:param|returns?|throws?|deprecated|example|property|typedef|type)\b/i.test(comment.text)) return false;
  const file = files.find((candidate) => candidate.path === comment.path);
  if (!file) return false;
  const declaration = file.lines.find((entry) => entry.lineNumber > comment.lineNumber && entry.lineNumber <= comment.lineNumber + 4 && /^\s*export\s+(?:(?:declare|async)\s+)*(?:function|const|let|var|class|interface|type|enum|default)\b/.test(entry.text));
  return Boolean(declaration);
}

export function inspectDiff(diff) {
  const files = parseAddedLines(diff);
  const findings = [];
  const reviewNotices = [];
  const exceptions = [];
  for (const file of files) {
    for (const comment of extractComments(file)) {
      const problem = ruleProblem(comment.text);
      let exception = null;
      if (!problem && isLicenseHeader(comment)) exception = 'license';
      if (!problem && !exception && isFormatterDirective(comment)) exception = 'formatter-directive';
      if (!problem && !exception && isPublicApiDoc(comment, files)) exception = 'public-api-jsdoc';
      if (!problem && !exception && isExternalConstraintReference(comment.text)) exception = 'external-constraint-reference';
      if (problem?.rule === 'suppression' && isExternalConstraintReference(comment.text)) exception = 'external-constraint-reference';
      if (exception) {
        exceptions.push({ path: comment.path, lineNumber: comment.lineNumber, exception });
        if (exception === 'public-api-jsdoc' || exception === 'external-constraint-reference') {
          reviewNotices.push({ path: comment.path, lineNumber: comment.lineNumber, exception });
        }
      } else {
        findings.push({
          path: comment.path,
          lineNumber: comment.lineNumber,
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
  return ['origin/main', 'HEAD^1'].find(availableRef) ?? null;
}

export function buildWorkingTreeDiff(baseRef) {
  const selectedBase = baseRef || defaultBaseRef();
  if (!selectedBase) throw new Error('nenhuma referência base disponível; informe origin/main ou HEAD^1');
  runGit(['rev-parse', '--verify', selectedBase + '^{commit}']);
  let diff = runGit(['diff', '--no-ext-diff', '--no-color', '--unified=0', selectedBase, '--']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z']);
  for (const path of untracked.split('\0').filter(Boolean)) {
    diff += runGit(['diff', '--no-index', '--no-ext-diff', '--no-color', '--unified=0', '--', '/dev/null', path], [0, 1]);
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
