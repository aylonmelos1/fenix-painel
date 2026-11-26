import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectDiff, parseAddedLines, POLICY_VERSION } from './check-no-comments.mjs';

function addedDiff(path, lines) {
  return [
    'diff --git a/' + path + ' b/' + path,
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/' + path,
    '@@ -0,0 +1,' + lines.length + ' @@',
    ...lines.map((line) => '+' + line)
  ].join('\n');
}

test('parses only added lines and preserves new line numbers', () => {
  const diff = [
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -2,2 +2,3 @@',
    ' const kept = 1;',
    '-// removed comment',
    '+const added = 2;',
    '+const second = 3;'
  ].join('\n');
  assert.deepEqual(parseAddedLines(diff)[0].lines.map((entry) => entry.lineNumber), [3, 4]);
  assert.equal(inspectDiff(diff).findings.length, 0);
});

test('blocks narrative, separators, commented code and fragile markers', () => {
  const diff = addedDiff('src/example.ts', [
    '// returns the client',
    '// ===== section',
    '// const oldValue = 1;',
    '// TODO temporary implementation',
    '// FIXME',
    '// do not remove',
    '// HACK',
    '// IMPORTANT',
    '// temporary workaround'
  ]);
  const findings = inspectDiff(diff).findings;
  assert.equal(findings.length, 9);
  assert.deepEqual(findings.map((finding) => finding.rule), [
    'unapproved-comment',
    'decorative-separator',
    'commented-code',
    'fragile-marker',
    'fragile-marker',
    'fragile-marker',
    'fragile-marker',
    'fragile-marker',
    'fragile-marker'
  ]);
});

test('detects line and block suppressions', () => {
  const diff = addedDiff('src/example.ts', [
    '// eslint-disable-next-line no-alert',
    '/* @ts-ignore */',
    '// @ts-expect-error',
    'const value: number = 1;'
  ]);
  const findings = inspectDiff(diff).findings;
  assert.equal(findings.length, 3);
  assert.deepEqual(findings.map((finding) => finding.rule), Array(3).fill('suppression'));
});

test('detects Python and shell suppression directives', () => {
  const diff = [
    addedDiff('scripts/run.py', ['# type: ignore', '# noqa']),
    addedDiff('scripts/run.sh', ['# shellcheck disable=SC2086'])
  ].join('\\n');
  const findings = inspectDiff(diff).findings;
  assert.equal(findings.length, 3);
  assert.deepEqual(findings.map((finding) => finding.rule), Array(3).fill('suppression'));
});

test('ignores comment markers inside string literals', () => {
  const diff = addedDiff('src/example.ts', [
    'const line = "// ordinary text";',
    'const block = "/* ordinary text */";',
    'const template = `// ordinary text`;',
    'const url = "https://example.invalid/path";'
  ]);
  assert.equal(inspectDiff(diff).findings.length, 0);
});

test('detects shell, Python, SQL and HTML comments', () => {
  const files = [
    addedDiff('scripts/run.sh', ['# restarts the service']),
    addedDiff('scripts/run.py', ['value = 1  # describes value']),
    addedDiff('db/schema.sql', ['-- creates index']),
    addedDiff('public/page.html', ['<!-- hidden explanation -->'])
  ].join('\n');
  assert.equal(inspectDiff(files).findings.length, 4);
});

test('accepts license, formatting and explicitly recognizable pstack exceptions', () => {
  const diff = addedDiff('src/api.ts', [
    '/*',
    ' * SPDX-License-Identifier: MIT',
    ' */',
    '// prettier-ignore',
    '/**',
    ' * @param value input value',
    ' * @returns parsed value',
    ' */',
    'export function parse(value: string) { return value; }',
    '// Odoo upstream imposes an external restriction; see https://example.invalid/odoo/issue/12'
  ]);
  const result = inspectDiff(diff);
  assert.equal(result.findings.length, 0);
  assert.deepEqual(result.exceptions.map((exception) => exception.exception), [
    'license',
    'formatter-directive',
    'public-api-jsdoc',
    'external-constraint-reference'
  ]);
  assert.equal(result.reviewNotices.length, 2);
});

test('does not treat unrelated JSDoc as a public API exception', () => {
  const diff = addedDiff('src/internal.ts', [
    '/**',
    ' * internal explanation',
    ' */',
    'function helper() {}'
  ]);
  assert.equal(inspectDiff(diff).findings.length, 1);
});

test('suppression requires a concrete external limitation reference', () => {
  const withoutReference = addedDiff('src/example.ts', ['// eslint-disable-next-line no-alert']);
  const withReference = addedDiff('src/example.ts', [
    '// eslint-disable-next-line no-alert; Odoo upstream requires this external restriction, see https://example.invalid/odoo/issue/4'
  ]);
  assert.equal(inspectDiff(withoutReference).findings.length, 1);
  assert.equal(inspectDiff(withReference).findings.length, 0);
});

test('parses multiline HTML comments', () => {
  const diff = addedDiff('public/page.html', ['<!--', 'hidden explanation', '-->']);
  assert.equal(inspectDiff(diff).findings.length, 1);
});

test('detects added text inside a block comment opened in unchanged context', () => {
  const diff = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -1,5 +1,5 @@',
    ' const value = 1;',
    ' /*',
    ' existing context text',
    '+added narrative text',
    ' */',
    ' const after = 2;'
  ].join('\n');
  const findings = inspectDiff(diff).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].lineNumber, 4);
});

test('reports only added comments, excluding unchanged and removed comments', () => {
  const diff = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -1,3 +1,3 @@',
    ' // unchanged note',
    '-// removed note',
    ' const kept = 1;',
    '+// added note',
    '+const added = 2;'
  ].join('\n');
  const findings = inspectDiff(diff).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].lineNumber, 3);
});

test('accepts new JSDoc attached to an unchanged exported declaration', () => {
  const diff = [
    'diff --git a/src/api.ts b/src/api.ts',
    '--- a/src/api.ts',
    '+++ b/src/api.ts',
    '@@ -1,1 +1,5 @@',
    '+/**',
    '+ * @param value input value',
    '+ * @returns parsed value',
    '+ */',
    ' export function parse(value: string) { return value; }'
  ].join('\n');
  const result = inspectDiff(diff);
  assert.equal(result.findings.length, 0);
  assert.deepEqual(result.exceptions.map((exception) => exception.exception), ['public-api-jsdoc']);
});

test('detects block comments after template and regular expression literals', () => {
  const diff = addedDiff('src/example.ts', [
    'const template = `value`; // after template',
    'const pattern = /[a-z]+/; /*',
    'after regular expression',
    '*/'
  ]);
  const findings = inspectDiff(diff).findings;
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((finding) => finding.rule), ['unapproved-comment', 'unapproved-comment']);
});
test('reports the pinned policy version', () => {
  assert.match(POLICY_VERSION, /^\d+\.\d+\.\d+$/);
});
