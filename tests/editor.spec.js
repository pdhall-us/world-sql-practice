// Author: Prateek Dhall — World Dataset Assignment.
const {test,expect}=require('@playwright/test');
const mod=process.platform==='darwin'?'Meta':'Control';
const input=page=>page.getByRole('textbox',{name:'MySQL query editor'});
const value=page=>page.evaluate(()=>window.sqlEditor.getValue());
async function fill(page,text){await input(page).focus();await input(page).press(mod+'+A');if(text)await page.keyboard.insertText(text);else await page.keyboard.press('Backspace');await expect.poll(()=>value(page)).toBe(text)}
async function choose(page,id){await page.locator('#toggle-list').click();await page.locator(`[data-id="${id}"]`).click();await expect(page.locator('#description h1')).toContainText(id+'.')}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('#description h1')).toBeVisible();await expect(input(page)).toBeAttached()});
test('real typing, bracket and quote pairs, indentation, comments, undo and redo',async({page})=>{
 await fill(page,'');await page.keyboard.type('SELECT (');await expect.poll(()=>value(page)).toBe('SELECT ()');await page.keyboard.type('1');await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await page.keyboard.press('Enter');await page.keyboard.press('Tab');await page.keyboard.insertText('FROM country');await expect.poll(()=>value(page)).toBe('SELECT (1)\n    FROM country');await page.keyboard.press('Shift+Tab');await expect.poll(()=>value(page)).toBe('SELECT (1)\nFROM country');
 await fill(page,'SELECT Name FROM country');await page.keyboard.press(mod+'+/');await expect.poll(()=>value(page)).toMatch(/^-- SELECT/);await page.keyboard.press(mod+'+/');await expect.poll(()=>value(page)).toBe('SELECT Name FROM country');
 await fill(page,'SELECT ');await page.keyboard.type("'");await expect.poll(()=>value(page)).toBe("SELECT ''");await page.keyboard.type('hello');await page.keyboard.press('ArrowRight');await expect.poll(()=>value(page)).toBe("SELECT 'hello'");await page.keyboard.press(mod+'+z');await expect.poll(()=>value(page)).not.toBe("SELECT 'hello'");await page.keyboard.press(mod+'+Shift+z');await expect.poll(()=>value(page)).toBe("SELECT 'hello'");
});
test('alias-aware and table-name completion can be accepted from the keyboard',async({page})=>{
 await fill(page,'SELECT c.\nFROM country c');await page.keyboard.press(process.platform==='darwin'?'Meta+ArrowUp':'Control+Home');await page.keyboard.press(process.platform==='darwin'?'Meta+ArrowRight':'End');await page.keyboard.press('Control+Space');const widget=page.locator('.suggest-widget.visible');await expect(widget).toBeVisible();await expect(widget).not.toContainText('CountryCode');await page.keyboard.type('Pop');await expect(widget).toContainText('Population');await page.keyboard.press('Tab');await expect.poll(()=>value(page)).toBe('SELECT c.Population\nFROM country c');
 await fill(page,'SELECT * FROM ');await page.keyboard.press('Control+Space');await expect(widget).toContainText('countrylanguage');await page.keyboard.type('cit');await page.keyboard.press('Tab');await expect.poll(()=>value(page)).toBe('SELECT * FROM city');
});
test('MySQL formatting preserves executable semantics and supports undo',async({page})=>{
 const original="select Name, round(Population / nullif(SurfaceArea, 0), 2) as density from country where Population > 0 order by Name limit 3";
 await fill(page,original);await page.keyboard.press('Shift+Alt+f');await expect.poll(()=>value(page)).toMatch(/^SELECT\n/);const formatted=await value(page);expect(formatted).toContain('NULLIF(');await page.keyboard.press(mod+'+z');await expect.poll(()=>value(page)).toBe(original);await page.keyboard.press(mod+'+Shift+z');await expect.poll(()=>value(page)).toBe(formatted);await page.locator('#run').click();await expect(page.locator('#result')).toContainText('3 rows');
 await fill(page,'SELECT (1)');await page.keyboard.press(process.platform==='darwin'?'Meta+ArrowRight':'End');await page.keyboard.press('Backspace');await expect.poll(()=>value(page)).toBe('SELECT (1');await page.locator('#format-code').click();await expect(page.locator('#editor-message')).toContainText('Cannot format');await expect.poll(()=>value(page)).toBe('SELECT (1');await input(page).focus();await page.keyboard.type(')');await expect(page.locator('#editor-message')).toHaveText('');
});
test('drafts, cursor positions and undo stacks remain separate for each problem',async({page})=>{
 await choose(page,11);await fill(page,'SELECT 11');await page.keyboard.press('Escape');await page.keyboard.press('End');await choose(page,12);await fill(page,'SELECT 12');await choose(page,11);await expect.poll(()=>value(page)).toBe('SELECT 11');await expect(page.locator('#cursor-position')).toContainText('Col 10');await input(page).focus();await page.keyboard.press(mod+'+z');await expect.poll(()=>value(page)).not.toContain('SELECT 12');await choose(page,12);await expect.poll(()=>value(page)).toBe('SELECT 12');await page.reload();await expect.poll(()=>value(page)).toBe('SELECT 12');
});
test('settings persist, find works and run/submit shortcuts reach MySQL',async({page})=>{
 await page.locator('#editor-settings summary').click();await page.locator('#editor-font-size').selectOption('16');await page.locator('#editor-tab-size').selectOption('2');await page.locator('#editor-word-wrap').check();await page.locator('#editor-autocomplete').uncheck();await page.reload();await page.locator('#editor-settings summary').click();await expect(page.locator('#editor-font-size')).toHaveValue('16');await expect(page.locator('#editor-tab-size')).toHaveValue('2');await expect(page.locator('#editor-word-wrap')).toBeChecked();await expect(page.locator('#editor-autocomplete')).not.toBeChecked();await page.locator('#editor-settings summary').click();
 await fill(page,'SELECT Name FROM country');await page.keyboard.press(mod+'+f');await expect(page.locator('.find-widget')).toBeVisible();await page.keyboard.press('Escape');await input(page).focus();await page.keyboard.press(mod+'+Enter');await expect(page.locator('#result')).toContainText('10 rows');
 await choose(page,12);await fill(page,'SELECT c.Name CountryName,COUNT(ci.ID) NumberOfCities FROM country c LEFT JOIN city ci ON c.Code=ci.CountryCode GROUP BY c.Code,c.Name ORDER BY NumberOfCities DESC,CountryName');await page.keyboard.press(mod+'+Shift+Enter');await expect(page.locator('#result .status')).toHaveText('Accepted');
});
test('syntax error is shown at the MySQL-reported line and clears when editing',async({page})=>{
 await fill(page,'SELECT Name\nFROM country\nWHERE = 1');await page.locator('#run').click();await expect(page.locator('#result')).toContainText('SQL / Runtime Error');await expect(page.locator('#result')).toContainText('at line 3');await expect(page.locator('.squiggly-error')).not.toHaveCount(0);await fill(page,'SELECT Name FROM country');await expect(page.locator('.squiggly-error')).toHaveCount(0);
});
test('editor assets work locally without a CDN or browser errors',async({page,request})=>{
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8080/'))external.push(r.url())});await page.reload();await expect(input(page)).toBeAttached();await fill(page,'SELECT Name FROM country');await page.keyboard.press('Control+Space');await page.keyboard.press('Escape');for(const asset of ['editor.js','editor.css','editor-worker.js'])expect((await request.get('/static/'+asset)).ok()).toBe(true);expect(errors).toEqual([]);expect(external).toEqual([]);await page.screenshot({path:'test-results/monaco-editor.png'});
});
test('every exercise still accepts its solution after MySQL formatting',async({page,request})=>{
 for(const q of require('../app/data/questions.json')){
  if(q.id!==1)await choose(page,q.id);
  const {sql}=await (await request.get(`/api/questions/${q.id}/solution`)).json();await fill(page,sql);await page.locator('#format-code').click();await expect(page.locator('#editor-message')).toHaveText('Query formatted');await page.locator('#submit').click();await expect(page.locator('#result .status'),`Q${q.id}`).toHaveText('Accepted');
 }
});
