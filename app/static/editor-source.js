// Author: Prateek Dhall — World Dataset Assignment.
import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/register.all.js';
import { conf, language } from 'monaco-editor/languages/definitions/mysql/mysql.js';
import { formatDialect, mysql } from 'sql-formatter';

// All editor code, fonts and its worker are served by this application.
self.MonacoEnvironment = { getWorker: () => new Worker('/static/editor-worker.js') };
monaco.languages.register({ id: 'mysql' });
monaco.languages.setMonarchTokensProvider('mysql', language);
monaco.languages.setLanguageConfiguration('mysql', {
  ...conf,
  autoClosingPairs: [...conf.autoClosingPairs, { open: '`', close: '`', notIn: ['string', 'comment'] }],
  indentationRules: {
    increaseIndentPattern: /\(\s*(?:--.*)?$/,
    decreaseIndentPattern: /^\s*\)/,
  },
});
const textarea = document.querySelector('#sql');
const container = document.createElement('div');
container.id = 'monaco-editor';
container.style.cssText = 'width:100%;height:100%;min-width:0;';
document.querySelector('.code-area').append(container);
textarea.hidden = true;
document.querySelector('#line-numbers').hidden = true;
let schema = {};
let settings;
try { settings = JSON.parse(localStorage.getItem('worldsql-editor-settings')) || {}; } catch { settings = {}; }
if (!settings || typeof settings !== 'object') settings = {};
settings = {
  fontSize: [12, 13, 14, 16, 18].includes(settings.fontSize) ? settings.fontSize : 13,
  tabSize: [2, 4].includes(settings.tabSize) ? settings.tabSize : 4,
  wordWrap: settings.wordWrap === true,
  autocomplete: settings.autocomplete !== false,
};
for (const [name, base, background, foreground, muted, selection] of [
  ['world-dark', 'vs-dark', '#1e1e1e', '#eff1f6', '#808080', '#264f78'],
  ['world-light', 'vs', '#ffffff', '#262626', '#808080', '#add6ff'],
]) {
  monaco.editor.defineTheme(name, {
    base, inherit: true, rules: [], colors: {
      'editor.background': background, 'editor.foreground': foreground,
      'editorLineNumber.foreground': muted, 'editorLineNumber.activeForeground': foreground,
      'editor.selectionBackground': selection, 'editor.lineHighlightBorder': '#00000000',
      'editor.lineHighlightBackground': name === 'world-dark' ? '#ffffff05' : '#00000003',
    },
  });
}
const editor = monaco.editor.create(container, {
  model: null, language: 'mysql', ariaLabel: 'MySQL query editor',
  theme: document.body.classList.contains('light') ? 'world-light' : 'world-dark',
  automaticLayout: true, editContext: false,
  fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: settings.fontSize, lineHeight: 22, fontLigatures: false,
  minimap: { enabled: false }, scrollBeyondLastLine: false,
  lineNumbers: 'on', lineNumbersMinChars: 3, glyphMargin: false,
  folding: true, showFoldingControls: 'mouseover', padding: { top: 16, bottom: 16 },
  tabSize: settings.tabSize, insertSpaces: true, detectIndentation: false,
  wordWrap: settings.wordWrap ? 'on' : 'off', autoIndent: 'full',
  autoClosingBrackets: 'always', autoClosingQuotes: 'languageDefined',
  bracketPairColorization: { enabled: false }, matchBrackets: 'always',
  quickSuggestions: { other: settings.autocomplete, comments: false, strings: false },
  suggestOnTriggerCharacters: settings.autocomplete, acceptSuggestionOnEnter: 'smart',
  wordBasedSuggestions: 'off', snippetSuggestions: 'bottom',
  renderWhitespace: 'selection', renderLineHighlight: 'all', stickyScroll: { enabled: false },
  contextmenu: true, smoothScrolling: true, scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
});
const models = new Map();
const viewStates = new Map();
let documentId = null;
let syncing = false;
let contentSubscription;
const keywords = ['SELECT','FROM','WHERE','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN','CROSS JOIN','ON','AS','AND','OR','NOT','NULL','IS NULL','IS NOT NULL','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','DISTINCT','ASC','DESC','UNION','UNION ALL','WITH','CASE','WHEN','THEN','ELSE','END','EXISTS','BETWEEN','IN','OVER','PARTITION BY','ROWS','UNBOUNDED PRECEDING','CURRENT ROW','CREATE VIEW'];
const functions = [
  ['COUNT','COUNT(${1:*})','Count rows or non-NULL values'],
  ['SUM','SUM(${1:expression})','Sum numeric values'],
  ['AVG','AVG(${1:expression})','Average numeric values'],
  ['MIN','MIN(${1:expression})','Minimum value'],
  ['MAX','MAX(${1:expression})','Maximum value'],
  ['ROUND','ROUND(${1:expression}, ${2:2})','Round a number'],
  ['COALESCE','COALESCE(${1:expression}, ${2:0})','First non-NULL value'],
  ['NULLIF','NULLIF(${1:expression}, ${2:0})','NULL if both values are equal'],
  ['DATEDIFF','DATEDIFF(${1:date1}, ${2:date2})','Difference in days'],
  ['DATE_ADD','DATE_ADD(${1:date}, INTERVAL ${2:1} DAY)','Add an interval to a date'],
  ['RANK','RANK() OVER (PARTITION BY ${1:column} ORDER BY ${2:column} DESC)','Ranking with gaps for ties'],
  ['DENSE_RANK','DENSE_RANK() OVER (PARTITION BY ${1:column} ORDER BY ${2:column} DESC)','Ranking without gaps'],
  ['ROW_NUMBER','ROW_NUMBER() OVER (PARTITION BY ${1:column} ORDER BY ${2:column} DESC)','Sequential row numbers'],
  ['LAG','LAG(${1:column}) OVER (ORDER BY ${2:column})','Value from a previous row'],
];
function cleanSql(value) { return value.replace(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, ' '); }
function aliasTable(model, qualifier) {
  const lower = qualifier.toLowerCase();
  if (schema[lower]) return lower;
  const pattern = /\b(?:FROM|JOIN)\s+`?(\w+)`?(?:\s+(?:AS\s+)?`?(\w+)`?)?/gi;
  for (const match of cleanSql(model.getValue()).matchAll(pattern)) {
    if (match[2]?.toLowerCase() === lower && schema[match[1].toLowerCase()]) return match[1].toLowerCase();
  }
  return null;
}
function inCommentOrString(model, position) {
  const tokens = monaco.editor.tokenize(model.getValue(), 'mysql')[position.lineNumber - 1] || [];
  const offset = Math.max(0, position.column - 2);
  const token = [...tokens].reverse().find(t => t.offset <= offset);
  return token && /comment|string/.test(token.type);
}
monaco.languages.registerCompletionItemProvider('mysql', {
  triggerCharacters: ['.'],
  provideCompletionItems(model, position) {
    if (inCommentOrString(model, position)) return { suggestions: [] };
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const prefix = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
    const qualified = prefix.match(/(`?[\w]+`?)\.\s*$/);
    if (qualified) {
      const table = aliasTable(model, qualified[1].replace(/`/g, ''));
      return { suggestions: (schema[table] || []).map(c => ({ label: c.name, insertText: c.name, kind: monaco.languages.CompletionItemKind.Field, detail: `${table}.${c.name} · ${c.type}`, range, sortText: '0' + c.name })) };
    }
    const tables = Object.entries(schema);
    const tableOnly = /\b(?:FROM|JOIN)\s*$/i.test(prefix);
    const suggestions = tables.map(([name]) => ({ label: name, insertText: name, kind: monaco.languages.CompletionItemKind.Struct, detail: 'Table', range, sortText: '0' + name }));
    if (!tableOnly) {
      const columns = new Map();
      for (const [table, cols] of tables) for (const c of cols) {
        if (!columns.has(c.name)) columns.set(c.name, { label: c.name, insertText: c.name, kind: monaco.languages.CompletionItemKind.Field, detail: `${table} · ${c.type}`, range, sortText: '1' + c.name });
      }
      suggestions.push(...columns.values());
      suggestions.push(...keywords.map(label => ({ label, insertText: label, kind: monaco.languages.CompletionItemKind.Keyword, range, sortText: '2' + label })));
      suggestions.push(...functions.map(([label, insertText, detail]) => ({ label, insertText, detail, kind: monaco.languages.CompletionItemKind.Function, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: '3' + label })));
    }
    return { suggestions };
  },
});
function formatSql(value, tabSize = settings.tabSize) {
  return formatDialect(value, { dialect: mysql, tabWidth: tabSize, keywordCase: 'upper', functionCase: 'upper', linesBetweenQueries: 1 });
}
monaco.languages.registerDocumentFormattingEditProvider('mysql', {
  provideDocumentFormattingEdits(model, options) {
    try { return [{ range: model.getFullModelRange(), text: formatSql(model.getValue(), options.tabSize) }]; }
    catch { return []; }
  },
});
function updatePosition() {
  const p = editor.getPosition();
  if (p) document.querySelector('#cursor-position').textContent = `Ln ${p.lineNumber}, Col ${p.column}`;
}
editor.onDidChangeCursorPosition(updatePosition);
function setDocument(id, value) {
  if (documentId === id) { setValue(value); return; }
  if (documentId !== null) viewStates.set(documentId, editor.saveViewState());
  contentSubscription?.dispose();
  documentId = id;
  let model = models.get(id);
  if (!model) {
    model = monaco.editor.createModel(value, 'mysql', monaco.Uri.parse(`inmemory://worldsql/problem-${id}.sql`));
    models.set(id, model);
  } else if (model.getValue() !== value) model.setValue(value);
  model.updateOptions({ tabSize: settings.tabSize, insertSpaces: true });
  editor.setModel(model);
  if (viewStates.has(id)) editor.restoreViewState(viewStates.get(id));
  contentSubscription = model.onDidChangeContent(() => {
    document.querySelector('#editor-message').textContent = '';
    monaco.editor.setModelMarkers(model, 'mysql-runner', []);
    if (syncing) return;
    textarea.value = model.getValue();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  updatePosition();
}
function setValue(value) {
  const model = editor.getModel();
  if (!model || model.getValue() === value) return;
  syncing = true;
  editor.pushUndoStop();
  editor.executeEdits('replace-query', [{ range: model.getFullModelRange(), text: value }]);
  editor.pushUndoStop();
  editor.setPosition({ lineNumber: 1, column: 1 });
  syncing = false;
  updatePosition();
}
function formatEditor() {
  try {
    const model = editor.getModel();
    if (!model || !model.getValue().trim()) return;
    const value = formatSql(model.getValue());
    editor.pushUndoStop();
    editor.executeEdits('format-query', [{ range: model.getFullModelRange(), text: value }]);
    editor.pushUndoStop();
    document.querySelector('#editor-message').textContent = 'Query formatted';
    editor.focus();
  } catch {
    document.querySelector('#editor-message').textContent = 'Cannot format incomplete SQL. Complete the query and try again.';
  }
}
editor.addAction({ id: 'worldsql.run', label: 'Run MySQL query', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => document.querySelector('#run').click() });
editor.addAction({ id: 'worldsql.submit', label: 'Submit MySQL solution', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter], run: () => document.querySelector('#submit').click() });
editor.addAction({ id: 'worldsql.format', label: 'Format MySQL query', keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF], contextMenuGroupId: '1_modification', contextMenuOrder: 1, run: formatEditor });
function applySettings() {
  editor.updateOptions({
    fontSize: settings.fontSize, wordWrap: settings.wordWrap ? 'on' : 'off',
    quickSuggestions: { other: settings.autocomplete, comments: false, strings: false }, suggestOnTriggerCharacters: settings.autocomplete,
  });
  for (const model of models.values()) model.updateOptions({ tabSize: settings.tabSize, insertSpaces: true });
  try { localStorage.setItem('worldsql-editor-settings', JSON.stringify(settings)); } catch {}
}
function setTheme() { monaco.editor.setTheme(document.body.classList.contains('light') ? 'world-light' : 'world-dark'); }
new MutationObserver(setTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
const inputs = { fontSize: '#editor-font-size', tabSize: '#editor-tab-size', wordWrap: '#editor-word-wrap', autocomplete: '#editor-autocomplete' };
for (const [name, selector] of Object.entries(inputs)) {
  const input = document.querySelector(selector);
  if (input.type === 'checkbox') input.checked = settings[name]; else input.value = String(settings[name]);
  input.addEventListener('change', () => { settings[name] = input.type === 'checkbox' ? input.checked : Number(input.value); applySettings(); });
}
document.querySelector('#format-code').onclick = formatEditor;
window.sqlEditor = {
  setDocument, setValue, getValue: () => editor.getValue(), focus: () => editor.focus(),
  setSchema: value => { schema = value; },
  getPosition: () => editor.getPosition(),
  clearError: () => { const model = editor.getModel(); if (model) monaco.editor.setModelMarkers(model, 'mysql-runner', []); },
  showError(message, sql) {
    const model = editor.getModel();
    if (!model || model.getValue() !== sql) return;
    // MySQL supplies a line number for syntax errors. Do not invent locations for
    // errors (e.g. unknown columns) which carry no source position.
    const line = Number(message.match(/\bat line (\d+)/i)?.[1]);
    if (!line || line > model.getLineCount()) return;
    monaco.editor.setModelMarkers(model, 'mysql-runner', [{ severity: monaco.MarkerSeverity.Error, message,
      startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: model.getLineMaxColumn(line) }]);
    editor.revealLineInCenter(line);
  },
};
