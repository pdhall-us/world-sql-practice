// Author: Prateek Dhall — World Dataset Assignment.
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const storage={get(k,fallback=null){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}},draft(id){try{return localStorage.getItem('worldsql-'+id)}catch{return null}}};
// Migrate saved work once, taking a snapshot before renumbering overlapping IDs.
function migrateQuestionNumbers(){
 try{
  if(['2','3'].includes(localStorage.getItem('worldsql-numbering-version')))return;
  let backup=storage.get('worldsql-numbering-backup-v1');
  if(!backup){
   backup={drafts:{},favorites:{},progress:storage.get('worldsql-progress',{}),history:storage.get('worldsql-history',[]),current:storage.get('worldsql-current',11)};
   for(let id=11;id<=30;id++){backup.drafts[id]=localStorage.getItem('worldsql-'+id);backup.favorites[id]=storage.get('worldsql-favorite-'+id,false)}
   localStorage.setItem('worldsql-numbering-backup-v1',JSON.stringify(backup));
  }
  const progress={};
  for(let old=11;old<=30;old++){
   const id=old-10,draft=backup.drafts[old];
   if(draft===null||draft===undefined)localStorage.removeItem('worldsql-'+id);else localStorage.setItem('worldsql-'+id,draft);
   localStorage.setItem('worldsql-favorite-'+id,JSON.stringify(!!backup.favorites[old]));
   if(backup.progress?.[old])progress[id]=true;
  }
  const history=Array.isArray(backup.history)?backup.history.filter(x=>x.id>=11&&x.id<=30).map(x=>({...x,id:x.id-10})):[];
  localStorage.setItem('worldsql-progress',JSON.stringify(progress));
  localStorage.setItem('worldsql-history',JSON.stringify(history));
  localStorage.setItem('worldsql-current',JSON.stringify(backup.current>=11&&backup.current<=30?backup.current-10:1));
  for(let old=21;old<=30;old++){localStorage.removeItem('worldsql-'+old);localStorage.removeItem('worldsql-favorite-'+old)}
  localStorage.setItem('worldsql-numbering-version','2');
 }catch{/* Browser storage may be unavailable; the practice workspace still opens. */}
}
migrateQuestionNumbers();
function migrateFullAssignment(){
 try{
  if(localStorage.getItem('worldsql-numbering-version')==='3')return;
  let backup=storage.get('worldsql-numbering-backup-v2');
  if(!backup){
   backup={drafts:{},favorites:{},custom:{},progress:storage.get('worldsql-progress',{}),history:storage.get('worldsql-history',[]),current:storage.get('worldsql-current',1)};
   for(let id=1;id<=20;id++){backup.drafts[id]=localStorage.getItem('worldsql-'+id);backup.favorites[id]=storage.get('worldsql-favorite-'+id,false);backup.custom[id]=storage.get('worldsql-custom-'+id)}
   localStorage.setItem('worldsql-numbering-backup-v2',JSON.stringify(backup));
  }
  const progress={};
  for(let old=1;old<=20;old++){
   const id=old+10,draft=backup.drafts[old];
   if(draft==null)localStorage.removeItem('worldsql-'+id);else localStorage.setItem('worldsql-'+id,draft);
   localStorage.setItem('worldsql-favorite-'+id,JSON.stringify(!!backup.favorites[old]));
   if(backup.custom[old]!=null)localStorage.setItem('worldsql-custom-'+id,JSON.stringify(backup.custom[old]));else localStorage.removeItem('worldsql-custom-'+id);
   if(backup.progress?.[old])progress[id]=true;
  }
  const history=Array.isArray(backup.history)?backup.history.filter(x=>x.id>=1&&x.id<=20).map(x=>({...x,id:x.id+10})):[];
  localStorage.setItem('worldsql-progress',JSON.stringify(progress));localStorage.setItem('worldsql-history',JSON.stringify(history));
  // Start the completed assignment at its new first question.
  localStorage.setItem('worldsql-current','1');
  for(let old=1;old<=10;old++){localStorage.removeItem('worldsql-'+old);localStorage.removeItem('worldsql-favorite-'+old);localStorage.removeItem('worldsql-custom-'+old)}
  localStorage.setItem('worldsql-numbering-version','3');
 }catch{}
}
migrateFullAssignment();
let qs=[],schema={},current=1,busy=false,renderVersion=0,resultData=null,resultPage=0,expectedPage=0;
let progress=storage.get('worldsql-progress',{}),history=storage.get('worldsql-history',[]);
if(!progress||typeof progress!=='object'||Array.isArray(progress))progress={};
if(!Array.isArray(history))history=[];
const exampleCache=new Map();
const customCases=new Map();
let lastResult=null;
async function api(path,options){const r=await fetch(path,options);let d;try{d=await r.json()}catch{throw new Error('The server returned an invalid response. Try again.')}if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:`Request failed (${r.status})`);return d}
function uiIcon(name){return `<svg class="ui-icon" aria-hidden="true"><use href="/static/icons.svg#${name}"/></svg>`}
function store(){const ok=(()=>{try{localStorage.setItem('worldsql-'+current,$('#sql').value);return true}catch{return false}})();$('#saved').textContent=ok?'Saved locally':'Saving unavailable';lineNumbers()}
function lineNumbers(){window.sqlEditor?.setValue($('#sql').value);$('#line-numbers').textContent=Array.from({length:$('#sql').value.split('\n').length},(_,i)=>i+1).join('\n');$('#line-numbers').scrollTop=$('#sql').scrollTop}
function table(cols,rows){return `<div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${v===null?'<span class="null">NULL</span>':esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${Math.max(cols.length,1)}" class="null">No rows returned</td></tr>`}</tbody></table></div>`}
function renderNav(){const search=$('#search').value.toLowerCase(),difficulty=$('#difficulty').value,status=$('#status-filter').value;const filtered=qs.filter(q=>(`${q.id} ${q.title} ${q.topics}`).toLowerCase().includes(search)&&(!difficulty||q.difficulty===difficulty)&&(!status||(status==='solved')===!!progress[q.id]));$('#nav').innerHTML=filtered.map(q=>`<button class="navitem ${q.id===current?'on':''}" data-id="${q.id}" ${q.id===current?'aria-current="page"':''}><span class="check ${progress[q.id]?'solved':''}" aria-label="${progress[q.id]?'Solved':'Unsolved'}">${progress[q.id]?'✓':'○'}</span><span class="title">${q.id}. ${esc(q.title)}</span><span class="diff ${q.difficulty}">${q.difficulty==='Easy'?'Easy':q.difficulty==='Medium'?'Med.':'Hard'}</span></button>`).join('');$('#no-problems').hidden=filtered.length>0;const solved=qs.filter(q=>progress[q.id]).length;$('#progress-label').textContent=`${solved} / ${qs.length} solved`;$('#progress').value=solved}
function showTab(name){for(const tab of ['description','schema','editorial','solutions','history']){$('#'+tab).hidden=tab!==name;const button=$('#'+tab+'-tab');if(button){button.classList.toggle('active',tab===name);button.setAttribute('aria-selected',String(tab===name))}}if(name==='history')renderHistory()}
function ascii(columns,rows){const strings=rows.map(r=>r.map(v=>v===null?'null':String(v)));const widths=columns.map((c,i)=>Math.max(String(c).length,...strings.map(r=>r[i].length)));const border='+'+widths.map(w=>'-'.repeat(w+2)).join('+')+'+';const line=r=>'|'+r.map((v,i)=>' '+String(v).padEnd(widths[i])+' ').join('|')+'|';return [border,line(columns),border,...strings.map(line),border].join('\n')}
function showResultTab(name){const testcase=name==='testcase';$('#testcase-content').hidden=!testcase;$('#result').hidden=testcase;for(const t of ['testcase','result']){$('#'+t+'-tab').classList.toggle('active',t===name);$('#'+t+'-tab').setAttribute('aria-selected',String(t===name))}}
function customDraft(ex){
 if(!customCases.has(current)){
  const saved=storage.get('worldsql-custom-'+current);const base=saved&&typeof saved==='object'?saved:ex.custom_input;
  customCases.set(current,Object.fromEntries(Object.entries(base).map(([name,d])=>[name,{columns:d.columns,text:typeof d.text==='string'?d.text:JSON.stringify(d.rows,null,2)}])));
 }
 return customCases.get(current);
}
function renderCase(ex){
 const selected=$('#testcase').value;
 if(selected==='world'){$('#case-input').innerHTML='<p class="schema-note">The full official World dataset: 239 countries, 4,079 cities, and 984 country-language records. Use the SQL Schema to inspect columns.</p>';return}
 if(selected==='custom'){
  const draft=customDraft(ex);
  $('#case-input').innerHTML='<p class="schema-note">Edit JSON row arrays below. Column order is shown above each table. Run checks this input; Submit checks the three judge datasets. Up to 100 rows per table.</p>'+Object.entries(draft).map(([name,d])=>`<label class="case-table-label" for="custom-${name}">${esc(name)} =</label><p class="case-columns">${d.columns.map(esc).join(' · ')}</p><textarea id="custom-${name}" class="custom-case-input" data-table="${esc(name)}" aria-label="${esc(name)} custom rows" spellcheck="false">${esc(d.text)}</textarea>`).join('');return;
 }
 $('#case-input').innerHTML=Object.entries(ex.input).map(([name,d])=>`<div class="case-table-label">${esc(name)} =</div><p class="case-columns">${d.columns.map(esc).join(' · ')}</p><pre class="case-data">${esc(JSON.stringify(d.rows))}</pre>`).join('');
}
function customPayload(){
 const draft=customCases.get(current);if(!draft)throw new Error('Wait for the testcase to finish loading.');const data={};
 for(const [name,d] of Object.entries(draft)){try{data[name]={columns:d.columns,rows:JSON.parse(d.text)}}catch{throw new Error(`Invalid JSON in ${name}. Enter an array of row arrays.`)}}
 return data;
}
function setCase(value){$('#testcase').value=value;document.querySelectorAll('[data-case]').forEach(b=>b.classList.toggle('active',b.dataset.case===value));const ex=exampleCache.get(current);if(ex)renderCase(ex)}
function resultLabel(testcase){return testcase==='world'?'Official World dataset':testcase==='custom'?'Custom testcase':'Example dataset'}
function resultContext(){
 if(!lastResult)return '';
 const changed=$('#sql').value!==lastResult.sql;
 const inputChanged=lastResult.customSignature&&lastResult.customSignature!==JSON.stringify(customCases.get(current));
 return `<p class="result-context">${lastResult.kind==='run'?`Run · ${esc(resultLabel(lastResult.testcase))}`:'Submit · All judge datasets'}${changed?' · Code changed since this result. Run again to test your edits.':''}${inputChanged?' · Testcase changed since this result. Run again to test your edits.':''}</p>`;
}
function drawer(open){$('.app').classList.toggle('collapsed',!open);$('#drawer-backdrop').hidden=!open;$('#toggle-list').setAttribute('aria-expanded',String(open));if(open)$('#search').focus()}
const approaches={1:"Filter country.Continent to Asia and return the requested country names.",2:"Sort city rows by Population descending. Apply the stated tie breakers before LIMIT 5.",3:"Join countries to language records, filter Europe and official languages, then select DISTINCT Language.",4:"Join cities to countries and filter the country name India. Return each city name and population.",5:"Filter country.Population with a strict greater-than comparison against 100000000.",6:"Filter city.District to California. Keep each city record even if names repeat.",7:"Group country rows by Continent and count the countries in each group.",8:"Order countries by SurfaceArea ascending, then Name, before LIMIT 10. Zero area is still a recorded area.",9:"Use EXISTS to find an official English record for each country. Non-official English does not qualify.",10:"Use AVG(Population) on city without grouping. Round the average to two decimal places; AVG on no rows returns NULL.",11:'Aggregate estimated speakers by continent and language first. Rank those totals within each continent with RANK(), then keep ranks at most three. Round only the returned estimate.',12:'Start with country and LEFT JOIN city so countries with no cities remain. Count city.ID, rather than COUNT(*), and group by the country key and name.',13:'Calculate the maximum recorded language percentage per country. Join that value to official language rows, then keep official percentages strictly below the maximum.',14:'Rank city populations within each country with RANK(). Keep rank one to preserve ties, then join the country name.',15:'Use NOT EXISTS to test for a city above one million. Countries with no cities satisfy that condition too.',16:'Group country rows by Region and sum Population once per country.',17:'Filter the inclusive surface-area range. Use NULLIF(SurfaceArea, 0) for the density calculation and compare the unrounded ratio against 100.',18:'Filter languages to IsOfficial = T before grouping by country. Use HAVING COUNT(*) > 3.',19:'Count city rows for each country, sort counts descending and names ascending, then select the first five.',20:'Calculate the average city population per CountryCode. Join that average to each city and compare populations before rounding the output average.',21:'Aggregate population from country without joining language rows. Exclude a continent with NOT EXISTS if any of its countries has official English.',22:'Join country.Capital to city.ID. Calculate country averages separately so the capital is compared against every recorded city in its country.',23:'Use a LEFT JOIN and COUNT(DISTINCT Language). Counting the nullable language column gives zero for countries with no language rows.',24:'Use EXISTS to identify qualifying countries, so Hindi and Urdu do not count a country twice. Sum country populations and divide by total world population.',25:'Join cities to countries to obtain Region. Apply RANK() partitioned by Region and ordered by population descending.',26:'Sum estimated speakers per language before selecting the largest five. The population share denominator is the sum of country populations, not a joined total.',27:'Calculate the city-population to country-area ratio, excluding nonpositive country areas. Rank ratios within each continent and retain every first-place tie.',28:'Use NOT EXISTS for official English in a city’s country. Sort the qualifying cities by population and the specified tie breakers before selecting ten.',29:'Select exactly the two largest city populations per country using ROW_NUMBER(). Check that there are at least two cities and compare the sum against half the positive country population.',30:'Aggregate cities and official languages separately before joining countries. Rank cities by population descending and name ascending to select one largest city without multiplying counts.'};
function renderHistory(){const entries=history.filter(x=>x.id===current);$('#history').innerHTML='<h3>Submissions</h3><p class="schema-note">Stored on this device. Times are shown in your local timezone.</p>'+ (entries.length?entries.map(x=>`<details class="history-item"><summary><span class="${x.accepted?'accepted':'wrong'}">${esc(x.status)}</span> · ${esc(new Date(x.date).toLocaleString())}</summary><div class="meta">${esc(x.passed??0)} / ${esc(x.total??3)} tests · ${esc(x.runtime??'—')} ms</div><pre>${esc(x.sql)}</pre><button class="restore" data-entry="${esc(x.date)}">Restore query</button></details>`).join(''):'<div class="empty"><b>No submissions yet</b><p>Submit your solution to check all test cases.</p></div>')}
function renderSchema(q){$('#schema').innerHTML='<h3>Database schema</h3><p class="schema-note">Official MySQL World dataset. CountryCode links to country.Code; country.Capital links to city.ID. All identifiers and types below come from the running database.</p>'+q.tables.map(t=>`<h3>Table: <code>${esc(t)}</code></h3>${schema[t]?table(['Column','Type','Nullable','Key'],schema[t].map(c=>[c.name,c.type,c.nullable?'Yes':'No',c.key||'—'])):'<p class="load-error">Schema unavailable. Check the database and reload.</p>'}`).join('')}
async function render(){
 const version=++renderVersion,q=qs.find(x=>x.id===current);if(!q)return;
 storage.set('worldsql-current',current);renderNav();document.title=`${q.id}. ${q.title} · World Dataset Assignment`;
 const schemaContent=q.tables.map(t=>`<h3>Table: <code>${esc(t)}</code></h3>${schema[t]?`<pre>${esc(ascii(['Column Name','Type'],schema[t].map(c=>[c.name,c.type.startsWith('enum(')?'enum':c.type])))}</pre><p>${esc(t==='country'?'Code is the primary key. Capital references city.ID and may be NULL.':t==='city'?'ID is the primary key. CountryCode references country.Code.':'(CountryCode, Language) is the primary key. CountryCode references country.Code.')}</p>`:'<p class="load-error">Database schema unavailable.</p>'}`).join('');
 $('#description').innerHTML=`<div class="problem-title"><h1>${q.id}. ${esc(q.title)}</h1>${progress[q.id]?'<span class="solved-label">Solved <span>✓</span></span>':''}</div><div class="problem-tags"><span class="badge ${q.difficulty}">${q.difficulty}</span><button class="topic-button" id="topics-button">${uiIcon('topic')} Topics</button><button class="topic-button" id="hints-button">${uiIcon('editorial')} Hints</button></div><p id="topic-detail" class="schema-note" hidden>${esc(q.topics)}</p><button class="schema-toggle" id="inline-schema-toggle" aria-expanded="true">SQL Schema <span>⌄</span></button><div class="schema-inline" id="inline-schema">${schemaContent}</div><p>${esc(q.description)}</p><p>Return the columns ${q.return_columns.map(c=>`<code>${esc(c)}</code>`).join(', ')}.</p><div class="requirements"><ul>${q.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div><p>The result format is in the following example.</p><h3>Example 1:</h3><div id="example-content" class="example-block">Loading example…</div>`;
 $('#editorial').innerHTML=`<h1>${esc(q.title)}</h1><h3>Approach</h3><p>${esc(approaches[q.id])}</p><h3>Things to check</h3><ul>${q.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p class="schema-note">Try the example dataset, then submit to check all three datasets.</p>`;
 $('#solutions').innerHTML='<h1>Solutions</h1><p>Reveal the reference solution when you are ready to compare approaches.</p><button id="reveal-solution">View solution</button><div id="solution-content"></div>';
 renderSchema(q);renderHistory();$('#sql').value=storage.draft(current)??q.starter_sql;window.sqlEditor?.setDocument(current,$('#sql').value);$('#editor-message').textContent='';lineNumbers();$('#result').innerHTML='<div class="empty">You must run your code first</div>';resultData=null;lastResult=null;$('#case-input').innerHTML='<p class="schema-note">Loading testcase…</p>';
 const index=qs.indexOf(q);$('#position').textContent=`${index+1} / ${qs.length}`;$('#previous').disabled=index===0;$('#next').disabled=index===qs.length-1;
 $('#favorite').setAttribute('aria-pressed',String(!!storage.get('worldsql-favorite-'+current,false)));$('#favorite').textContent=storage.get('worldsql-favorite-'+current,false)?'★':'☆';showTab('description');showResultTab('testcase');
 try{let ex=exampleCache.get(q.id);if(!ex){ex=await api(`/api/questions/${q.id}/example`);exampleCache.set(q.id,ex)}if(version!==renderVersion)return;
 $('#example-content').innerHTML='<b>Input:</b>'+Object.entries(ex.input).map(([name,d])=>`<p>${esc(name)} table:</p><pre>${esc(ascii(d.columns,d.rows))}</pre>`).join('')+'<b>Output:</b><pre>'+esc(ascii(ex.columns,ex.rows))+'</pre>';
 setCase($('#testcase').value);
 }catch(e){if(version===renderVersion){$('#example-content').innerHTML=`<span class="load-error">${esc(e.message)}</span>`;$('#case-input').innerHTML=`<p class="load-error">${esc(e.message)}</p>`}}
}
function select(id){if(!qs.some(q=>q.id===id))return;store();current=id;drawer(false);render()}
function resultTable(columns,rows,page,expected=false){
 const start=page*50,prefix=expected?'expected':'result';
 return table(columns,rows.slice(start,start+50))+(rows.length>50?`<div class="output-pagination"><button id="${prefix}-prev" ${page===0?'disabled':''}>‹ Previous</button><span>${start+1}–${Math.min(start+50,rows.length)} of ${rows.length}</span><button id="${prefix}-next" ${start+50>=rows.length?'disabled':''}>Next ›</button></div>`:'');
}
function renderResults(){
 const d=resultData;if(!d)return;
 $('#result').innerHTML=`<div class="status ${d.accepted?'accepted':'wrong'}">${esc(d.message)}</div>${resultContext()}<div class="meta">${d.passed} / ${d.total} test case passed · ${d.runtime_ms} ms · ${esc(resultLabel(d.testcase))}</div>${d.accepted?'':`<div class="hint">${esc(d.hint)}</div>`}<section class="your-output ${d.accepted?'':'output-mismatch'}"><h4>Your output <span>(${d.row_count} rows)</span></h4>${resultTable(d.columns,d.rows,resultPage)}</section><section class="expected-output"><h4>Expected output <span>(${d.expected_row_count} rows)</span></h4>${resultTable(d.expected_columns,d.expected_rows,expectedPage,true)}</section>`;
}
async function call(kind){
 if(busy)return;
 store();const id=current,version=renderVersion,sql=$('#sql').value,testcase=$('#testcase').value;
 showResultTab('result');$('.workspace').classList.remove('results-collapsed','editor-expanded');$('#result').scrollTop=0;window.sqlEditor?.clearError();
 const sqlWithoutComments=sql.replace(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g,m=>m.startsWith("'")||m.startsWith('"')?m:'');
 if(!sqlWithoutComments.trim()){$('#result').innerHTML='<div class="hint">Write a query first.</div>';resultData=null;lastResult=null;return}
 let customInput,customSignature;
 try{if(kind==='run'&&testcase==='custom'){customInput=customPayload();customSignature=JSON.stringify(customCases.get(current))}}catch(e){$('#result').innerHTML=`<div class="status wrong">Invalid Testcase</div><p class="error">${esc(e.message)}</p>`;resultData=null;lastResult=null;return}
 busy=true;$('#run').disabled=$('#submit').disabled=true;$('#result').setAttribute('aria-busy','true');$('#action-note').textContent=kind==='submit'?'Judging 3 test cases…':'Running query…';$('#result').innerHTML='<div class="empty"><b>Running…</b></div>';resultData=null;lastResult=null;
 try{
  const d=await api('/api/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question_id:id,sql,testcase,custom_input:customInput})});
  if(kind==='submit'){
   history.unshift({id,sql,date:new Date().toISOString(),accepted:d.accepted,status:d.message,passed:d.passed,total:d.total,runtime:d.runtime_ms});history=history.slice(0,200);storage.set('worldsql-history',history);
   if(d.accepted){progress[id]=true;storage.set('worldsql-progress',progress)}renderNav();renderHistory();
  }
  if(current!==id||renderVersion!==version)return;
  lastResult={kind,sql,testcase,customSignature};
  if(kind==='run'){resultData=d;resultPage=0;expectedPage=0;renderResults()}
  else{
   const input=d.input?'<details class="failed-input"><summary>Failing testcase input</summary>'+Object.entries(d.input).map(([name,t])=>`<p class="case-table-label">${esc(name)}</p>${table(t.columns,t.rows)}`).join('')+'</details>':'';
   $('#result').innerHTML=`<div class="status ${d.accepted?'accepted':'wrong'}">${esc(d.message)}</div>${resultContext()}<div class="meta">${d.passed} / ${d.total} test cases passed · ${d.runtime_ms} ms total</div>`+(d.accepted?'<p class="accepted">✓ Official data and both edge-case datasets passed.</p>':`<div class="hint">${esc(d.hint)}</div><p class="meta">Failed: ${esc(d.testcase)} · First 20 rows shown</p>${input}<h4>Your output (${d.row_count} rows)</h4>${table(d.your_columns,d.your_preview)}<h4>Expected output (${d.expected_row_count} rows)</h4>${table(d.expected_columns,d.expected_preview)}`);
   if(d.accepted&&!$('#description .solved-label'))$('#description h1').insertAdjacentHTML('afterend','<span class="solved-label">Solved <span>✓</span></span>');
  }
  $('#result').scrollTop=0;
 }catch(e){
  if(kind==='submit'){history.unshift({id,sql,date:new Date().toISOString(),accepted:false,status:'SQL / Runtime Error'});history=history.slice(0,200);storage.set('worldsql-history',history);renderHistory()}
  if(current===id&&renderVersion===version){lastResult={kind,sql,testcase,customSignature};window.sqlEditor?.showError(e.message,sql);$('#result').innerHTML=`<div class="status wrong">${e.message.startsWith('Invalid testcase:')?'Invalid Testcase':'SQL / Runtime Error'}</div>${resultContext()}<pre class="error">${esc(e.message)}</pre>`}
 }finally{busy=false;$('#run').disabled=$('#submit').disabled=false;$('#result').setAttribute('aria-busy','false');$('#action-note').textContent='Ready'}
}
$('#nav').onclick=e=>{const b=e.target.closest('[data-id]');if(b)select(+b.dataset.id)};
for(const s of ['#search','#difficulty','#status-filter'])$(s).addEventListener('input',renderNav);
for(const t of ['description','schema','editorial','solutions','history'])$('#'+t+'-tab').onclick=()=>showTab(t);
$('#previous').onclick=()=>select(qs[qs.findIndex(q=>q.id===current)-1]?.id);
$('#next').onclick=()=>select(qs[qs.findIndex(q=>q.id===current)+1]?.id);
$('#run').onclick=()=>call('run');$('#submit').onclick=()=>call('submit');
$('#sql').addEventListener('input',()=>{store();if(lastResult){const label=$('#result .result-context');if(label)label.outerHTML=resultContext()}});$('#sql').addEventListener('scroll',()=>{$('#line-numbers').scrollTop=$('#sql').scrollTop});
$('#sql').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();call(e.shiftKey?'submit':'run')}if(e.key==='Tab'){e.preventDefault();const t=e.target,start=t.selectionStart,end=t.selectionEnd;t.setRangeText('    ',start,end,'end');store()}});
$('#reset').onclick=()=>{if(confirm('Reset the query for this problem?')){$('#sql').value=qs.find(q=>q.id===current).starter_sql;store()}};
$('#history').onclick=e=>{const button=e.target.closest('.restore');if(button){const entry=history.find(x=>x.date===button.dataset.entry&&x.id===current);if(entry){$('#sql').value=entry.sql;store();window.sqlEditor?.focus()}}};
$('#result').onclick=e=>{if(e.target.closest('#result-prev')){resultPage--;renderResults()}if(e.target.closest('#result-next')){resultPage++;renderResults()}if(e.target.closest('#expected-prev')){expectedPage--;renderResults()}if(e.target.closest('#expected-next')){expectedPage++;renderResults()}};
$('#toggle-list').onclick=()=>drawer($('.app').classList.contains('collapsed'));
$('#close-list').onclick=()=>drawer(false);$('#drawer-backdrop').onclick=()=>drawer(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')drawer(false)});
$('#random').onclick=()=>{const choices=qs.filter(q=>q.id!==current);select(choices[Math.floor(Math.random()*choices.length)]?.id)};
$('#favorite').onclick=()=>{const favorite=!storage.get('worldsql-favorite-'+current,false);storage.set('worldsql-favorite-'+current,favorite);$('#favorite').setAttribute('aria-pressed',String(favorite));$('#favorite').textContent=favorite?'★':'☆'};
$('#description').onclick=e=>{if(e.target.closest('#topics-button'))$('#topic-detail').hidden=!$('#topic-detail').hidden;if(e.target.closest('#hints-button'))showTab('editorial');if(e.target.closest('#inline-schema-toggle')){const panel=$('#inline-schema');panel.hidden=!panel.hidden;$('#inline-schema-toggle').setAttribute('aria-expanded',String(!panel.hidden))}};
$('#solutions').onclick=async e=>{if(!e.target.closest('#reveal-solution'))return;const id=current,version=renderVersion;const button=$('#reveal-solution');button.disabled=true;try{const d=await api(`/api/questions/${id}/solution`);if(version!==renderVersion)return;$('#solution-content').innerHTML=`<h3>MySQL</h3><pre class="solution-code">${esc(d.sql)}</pre><button id="use-solution">Use in editor</button>`;button.hidden=true;$('#use-solution').onclick=()=>{$('#sql').value=d.sql;store();window.sqlEditor?.focus()}}catch(err){if(version===renderVersion){$('#solution-content').innerHTML=`<p class="load-error">${esc(err.message)}</p>`;button.disabled=false}}};
$('#testcase-tab').onclick=()=>showResultTab('testcase');$('#result-tab').onclick=()=>showResultTab('result');
$('#case-input').addEventListener('input',e=>{if(!e.target.matches('.custom-case-input'))return;const draft=customCases.get(current);draft[e.target.dataset.table].text=e.target.value;storage.set('worldsql-custom-'+current,draft);if(lastResult){const label=$('#result .result-context');if(label)label.outerHTML=resultContext()}});
$('#testcase').onchange=()=>setCase($('#testcase').value);
document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>setCase(b.dataset.case));
$('#collapse-results').onclick=()=>{$('.workspace').classList.toggle('results-collapsed');$('#collapse-results').style.transform=$('.workspace').classList.contains('results-collapsed')?'rotate(180deg)':''};
$('#expand-editor').onclick=()=>$('.workspace').classList.toggle('editor-expanded');
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}};
let timerInterval=null,timerStart=0;$('#timer').onclick=()=>{if(timerInterval){clearInterval(timerInterval);timerInterval=null;$('#timer').classList.remove('running');$('#timer').innerHTML=uiIcon('timer');$('#timer').setAttribute('aria-label','Start practice timer');return}timerStart=Date.now();$('#timer').classList.add('running');$('#timer').setAttribute('aria-label','Stop practice timer');const tick=()=>{const seconds=Math.floor((Date.now()-timerStart)/1000);$('#timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};tick();timerInterval=setInterval(tick,1000)};
function columnSize(percent){percent=Math.max(25,Math.min(75,percent));$('main').style.gridTemplateColumns=`minmax(0,${percent}fr) 8px minmax(0,${100-percent}fr)`;$('#column-resizer').setAttribute('aria-valuenow',String(Math.round(percent)));storage.set('worldsql-column-size',percent)}
function rowSize(percent){percent=Math.max(15,Math.min(65,percent));$('.workspace').style.setProperty('--result-size',percent+'%');$('#row-resizer').setAttribute('aria-valuenow',String(Math.round(percent)));storage.set('worldsql-row-size',percent)}
columnSize(Number(storage.get('worldsql-column-size',50))||50);rowSize(Number(storage.get('worldsql-row-size',31))||31);
for(const [id,adjust,horizontal] of [['column-resizer',columnSize,true],['row-resizer',rowSize,false]]){const handle=$('#'+id);handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);document.body.classList.add('dragging');const move=ev=>{const rect=$(horizontal?'main':'.workspace').getBoundingClientRect();adjust(horizontal?(ev.clientX-rect.left)/rect.width*100:(rect.bottom-ev.clientY)/rect.height*100)};const stop=()=>{document.body.classList.remove('dragging');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop)};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop)};handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const value=Number(handle.getAttribute('aria-valuenow'));adjust(value+(['ArrowRight','ArrowUp'].includes(e.key)?2:-2))};}
$('#theme').onclick=()=>{document.body.classList.toggle('light');storage.set('worldsql-light',document.body.classList.contains('light'))};
// Apply the requested dark theme once, including browsers that saved light mode.
if(!storage.get('worldsql-dark-default-applied',false)){
 storage.set('worldsql-light',false);
 storage.set('worldsql-dark-default-applied',true);
}
if(storage.get('worldsql-light',false))document.body.classList.add('light');
window.addEventListener('beforeunload',()=>{if(qs.length)store()});
(async()=>{try{qs=await api('/api/questions');const remembered=storage.get('worldsql-current',1);current=qs.some(q=>q.id===remembered)?remembered:1;try{schema=await api('/api/schema');window.sqlEditor?.setSchema(schema)}catch{}await render();const h=await api('/api/health');$('#db').textContent=h.ok?'● MySQL · Official dataset':'● Database check failed';$('#db').classList.toggle('ok',h.ok);$('#db').title=h.ok?`${h.country} countries · ${h.city} cities · ${h.countrylanguage} languages`:'Check Docker and reload the page'}catch(e){$('#db').textContent='● Connection failed';$('#description').innerHTML=`<h1>Unable to load practice</h1><p class="load-error">${esc(e.message)}</p><button onclick="location.reload()">Retry</button>`}})();

for(const id of ['testcase-tab','result-tab'])$('#'+id).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const name=e.key==='Home'?'testcase':e.key==='End'?'result':id==='testcase-tab'?'result':'testcase';showResultTab(name);$('#'+name+'-tab').focus()});
