import {parseNodes,PROTOCOLS,protocolOf,splitNodeName,joinNodeName,duplicateNames} from './nodes.js';
import {templates,templateById,DEFAULT_TEMPLATE} from './templates.js';
import {zh,en} from './i18n.js';
const $ = id => document.getElementById(id);
const preferences = {get(key) {try {return localStorage.getItem(key);} catch {return null;}},set(key,value) {try {localStorage.setItem(key,value);} catch {}}};
const preferredLanguage = preferences.get('nodebook-language');
let language = ['zh','en'].includes(preferredLanguage) ? preferredLanguage : (/^zh-(CN|Hans)(-|$)/i.test(navigator.language) ? 'zh' : 'en');
let theme = preferences.get('nodebook-theme') || 'system';
if (!['system','light','dark'].includes(theme)) theme = 'system';
let view = 'access', secret = '', revision = 0, busy = false, dirty = false, selectedTemplate = DEFAULT_TEMPLATE, parsed = [], toastTimer;
let savedNodes = '', savedTemplate = DEFAULT_TEMPLATE, composed = '', rowId = 0;
const MAX_NODES = 200;
const t = (key,n) => {const text=(language === 'zh' ? zh : en)[key] || key;return n===undefined?text:text.replace('{n}',n);};
const nodeCount = n => `${n} ${language === 'en' && n === 1 ? 'node' : t('count')}`;
const validKey = value => /^[A-Za-z0-9_-]{16,128}$/.test(value);
function toast(key,error=false,literal=false) {
  clearTimeout(toastTimer); $('status').hidden=false; $('status').className='status'+(error?' error':''); $('status').textContent=literal?key:t(key);
  if (!error) toastTimer=setTimeout(()=>{$('status').hidden=true;},4500);
}
function hideSecrets() {for(const id of ['subscription','saved-key','edit-url']) $(id).type='password'; updateReveal();}
function updateReveal() {document.querySelectorAll('[data-reveal]').forEach(button=>{const shown=$(button.dataset.reveal).type==='text';button.textContent=t(shown?'hide':'show');button.setAttribute('aria-pressed',String(shown));button.setAttribute('aria-controls',button.dataset.reveal);});}
function go(next,{replace=false,history=true}={}) {
  if(next==='nodes'&&!secret) next='access';
  if(next==='result'&&!revision) next='nodes';
  const order=['access','nodes','result'],back=order.indexOf(next)<order.indexOf(view);
  view=next;
  for(const id of order) $(id).hidden=id!==next;
  // Restart the entrance animation; direction follows the step order.
  const section=$(next);section.classList.remove('enter','enter-back');void section.offsetWidth;section.classList.add(back?'enter-back':'enter');
  const index=['access','nodes','result'].indexOf(next);
  document.querySelectorAll('[data-step]').forEach((item,i)=>{item.className=i===index?'active':i<index?'complete':''; if(i===index)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
  $('status').hidden=true;
  if(next==='result') renderResult();
  const path=secret&&revision ? `/${secret}` : '/';
  const hash=(next==='access'&&!(secret&&revision))||(next==='nodes'&&revision)?'':`#${next}`;
  if(history) window.history[replace?'replaceState':'pushState']({view:next},'',path+hash);
  document.title=`${t({access:'step1',nodes:'step2',result:'step3'}[next])} · ${t('brand')}`;
  window.scrollTo({top:0,behavior:'instant'});
  $(`${next}-title`).focus({preventScroll:true});
}
function applyTheme() {
  if(theme==='system') delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=theme;
  $('theme-label').textContent=`${t('themeLabel')}: ${t(theme)}`;$('theme').setAttribute('aria-label',t('themeAria'));
}
function localize() {
  document.documentElement.lang=language==='zh'?'zh-CN':'en';
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t);});
  document.querySelectorAll('[data-placeholder]').forEach(el=>el.placeholder=t(el.dataset.placeholder));
  $('language').textContent=language==='zh'?'English':'中文';$('language').setAttribute('aria-label',t('languageAria'));
  document.querySelector('.steps').setAttribute('aria-label',language==='zh'?'操作步骤':'Progress');
  $('status').hidden=true;applyTheme();updateReveal();renderTemplates();validate();
  if(view==='result') renderResult();
  document.title=`${t({access:'step1',nodes:'step2',result:'step3'}[view])} · ${t('brand')}`;
}
function renderTemplates() {
  $('template-total').textContent=templates.length;
  const query=$('template-search').value.trim().toLowerCase(),filter=$('template-filter').value;
  const matches=templates.filter(item=>(filter==='all'||item.family===filter||item.mode===filter)&&`${item.name} ${item.description.zh} ${item.description.en}`.toLowerCase().includes(query));
  $('template-select').replaceChildren();
  for(const item of matches) {const option=document.createElement('option');option.value=item.id;option.textContent=`${item.name} · ${t(item.mode)}${item.id===DEFAULT_TEMPLATE?` (${t('defaultTag')})`:''}`;option.selected=item.id===selectedTemplate;$('template-select').append(option);}
  if(!matches.length){const option=new Option(t('noTemplates'),'');option.disabled=true;$('template-select').append(option);}
  // Filtering does not silently change the saved selection.
  $('template-select').value=matches.some(x=>x.id===selectedTemplate)?selectedTemplate:'';
  renderDetail();
}
function renderDetail() {
  const item=templateById(selectedTemplate);const box=$('template-detail');box.replaceChildren();
  if(!item)return;
  const title=document.createElement('strong');title.textContent=`${item.name} · ${t(item.family)} · ${t(item.mode)}`;
  const desc=document.createElement('p');desc.textContent=item.description[language];
  const note=document.createElement('p');note.textContent=item.mode==='manual'?t('manualHint'):t('regionHint');
  box.append(title,desc,note);
}
// Each node is a row with separate name and link fields; together they are
// stored as one link per line with the name as its #fragment.
const rows=()=>[...$('node-list').children];
const fields=row=>({row,name:row.querySelector('.node-name'),link:row.querySelector('.node-link')});
function createRow({name='',link=''}={}) {
  const row=document.createElement('div');row.className='node-row';row.setAttribute('role','listitem');
  const handle=document.createElement('button');handle.type='button';handle.className='link node-handle';
  handle.innerHTML='<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg>';
  const index=document.createElement('span');index.className='node-index';index.setAttribute('aria-hidden','true');
  const nameInput=document.createElement('input');nameInput.className='node-name';nameInput.maxLength=64;nameInput.autocomplete='off';nameInput.spellcheck=false;nameInput.value=name;
  const linkInput=document.createElement('input');linkInput.className='node-link';linkInput.autocomplete='off';linkInput.spellcheck=false;linkInput.value=link;
  linkInput.placeholder='vless:// · hysteria2:// · ss:// …';
  const remove=document.createElement('button');remove.type='button';remove.className='link node-remove';remove.textContent='×';
  const error=document.createElement('p');error.className='node-error';error.id=`node-error-${++rowId}`;error.hidden=true;
  nameInput.setAttribute('aria-describedby',error.id);linkInput.setAttribute('aria-describedby',error.id);
  row.append(handle,index,nameInput,linkInput,remove,error);return row;
}
function setRows(list) {$('node-list').replaceChildren(...(list.length?list:[{}]).map(createRow));}
const rowsFromText=text=>String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(splitNodeName);
// A name typed after # in the link field wins only when the name field is empty.
function effective({name,link}) {
  let value=link.value.trim(),label=name.value.trim();
  if(value.includes('#')){const split=splitNodeName(value);if(split.link!==value){value=split.link;label||=split.name;}}
  return {name:label,link:value};
}
function showRowError(row,message,field) {
  const error=row.querySelector('.node-error');error.textContent=error.hidden?message:`${error.textContent}${language==='zh'?'；':'; '}${message}`;error.hidden=false;
  row.classList.add('invalid');row.querySelector(field==='name'?'.node-name':'.node-link').setAttribute('aria-invalid','true');
}
function validate() {
  const all=rows().map(fields),counts={};
  all.forEach(({row,name,link},i)=>{
    row.querySelector('.node-index').textContent=i+1;row.classList.remove('invalid');
    const error=row.querySelector('.node-error');error.hidden=true;error.textContent='';
    name.removeAttribute('aria-invalid');link.removeAttribute('aria-invalid');
    name.setAttribute('aria-label',t('nameAria',i+1));link.setAttribute('aria-label',t('linkAria',i+1));
    row.querySelector('.node-remove').setAttribute('aria-label',t('removeNode',i+1));row.querySelector('.node-handle').setAttribute('aria-label',t('moveNode',i+1));name.placeholder=t('namePlaceholder');
  });
  const filled=all.filter(f=>f.name.value.trim()||f.link.value.trim()).map(f=>({row:f.row,number:all.indexOf(f)+1,...effective(f)}));
  const linked=filled.filter(e=>e.link),missing=filled.filter(e=>!e.link);
  for(const entry of linked){const type=protocolOf(entry.link);if(type)counts[type]=(counts[type]||0)+1;}
  $('node-count').textContent=linked.length?[nodeCount(linked.length),...Object.entries(counts).map(([type,n])=>`${PROTOCOLS[type]} ${n}`)].join(' · '):'';
  // Blank names become <protocol>-<position>, as in parseNodes.
  linked.forEach((entry,i)=>{if(!entry.name)entry.row.querySelector('.node-name').placeholder=`${t('autoName')}${protocolOf(entry.link)||'node'}-${i+1}`;});
  const messages=[];
  for(const entry of missing)showRowError(entry.row,t('missingLink'),'link');
  if(missing.length)messages.push(t('missingLinks'));
  const duplicates=duplicateNames(linked);
  for(const group of duplicates)for(const i of group)showRowError(linked[i].row,t('duplicateName',group.filter(j=>j!==i).map(j=>linked[j].number).join(language==='zh'?'、':', ')),'name');
  if(duplicates.length)messages.push(t('duplicates'));
  composed=linked.map(entry=>joinNodeName(entry.name,entry.link)).join('\n');parsed=[];
  try {
    if(new TextEncoder().encode(JSON.stringify({nodes:composed,revision,template:selectedTemplate})).length>131072)throw Error(t('tooLarge'));
    if(linked.length)parsed=parseNodes(composed,language);
  }catch(error){
    // parseNodes numbers the links it was given; point at the matching row.
    const match=error.message.match(/^(?:第 (\d+) 行：|Line (\d+): )(.*)$/s),entry=match&&linked[+(match[1]||match[2])-1];
    if(entry){showRowError(entry.row,match[3],'link');messages.push(`${t('nodeRef',entry.number)}${language==='zh'?'：':': '}${match[3]}`);}else messages.push(error.message);
  }
  const valid=Boolean(linked.length)&&!messages.length;
  $('validation').textContent=!filled.length?t('empty'):valid?t('valid'):messages[0];
  $('validation').className='validation'+(!filled.length?'':valid?' valid':' error');
  $('add-node').disabled=busy||all.length>=MAX_NODES;
  $('save').disabled=busy||!valid||!templateById(selectedTemplate);updateDirty();return valid;
}
function addRows(list,after,focus='name') {
  const created=list.map(createRow);
  if(after)after.after(...created);else $('node-list').append(...created);
  validate();created.at(-1)?.querySelector(focus==='link'?'.node-link':'.node-name').focus();
}
function setBusy(value){busy=value;for(const id of ['open','create','template-search','template-filter','template-select','key-input','nodes-back'])$(id).disabled=value;$('node-list').querySelectorAll('input,button').forEach(el=>el.disabled=value);validate();}
function updateDirty(){dirty=composed!==savedNodes||selectedTemplate!==savedTemplate;}
async function load(key) {
  if(!validKey(key)){toast('invalidKey',true);return;}
  setBusy(true);toast('loading');
  try {
    const response=await fetch(`/api/profiles/${key}`,{cache:'no-store'});
    if(!response.ok){toast(response.status===404?'missing':'service',true);return;}
    const data=await response.json();secret=key;revision=data.revision;selectedTemplate=templateById(data.template)?data.template:'online';
    // Compare against the normalized form so opening alone is not an edit.
    setRows(rowsFromText(data.nodes));savedTemplate=selectedTemplate;$('template-search').value='';$('template-filter').value='all';
    renderTemplates();validate();savedNodes=composed;dirty=false;go('nodes',{replace:true});
  }catch{toast('network',true);}finally{setBusy(false);}
}
function renderResult(){
  $('subscription').value=`${location.origin}/${secret}/sub`;$('saved-key').value=secret;$('edit-url').value=`${location.origin}/${secret}`;
  $('saved-count').textContent=nodeCount(parsed.length);hideSecrets();
}
$('create').onclick=()=>{
  if(busy)return;
  secret=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');revision=0;selectedTemplate=DEFAULT_TEMPLATE;
  setRows([]);savedNodes='';savedTemplate=DEFAULT_TEMPLATE;$('template-search').value='';$('template-filter').value='all';
  renderTemplates();validate();dirty=false;go('nodes');
};
$('access-form').onsubmit=e=>{e.preventDefault();if(!busy)load($('key-input').value.trim());};
$('node-list').addEventListener('input',validate);
// Move a pasted or typed "#name" out of the link once the field is left.
$('node-list').addEventListener('change',event=>{
  if(!event.target.matches('.node-link'))return;
  const {name,link}=fields(event.target.closest('.node-row')),value=link.value.trim();
  if(!value.includes('#'))return;
  const split=splitNodeName(value);if(split.link===value)return;
  if(!name.value.trim())name.value=split.name;link.value=split.link;validate();
});
// Pasting several links fills one row each; a single link into an empty field also takes its name.
$('node-list').addEventListener('paste',event=>{
  if(!event.target.matches('.node-link'))return;
  const lines=event.clipboardData.getData('text').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const {row,name,link}=fields(event.target.closest('.node-row'));
  if(!lines.length||(lines.length===1&&link.value.trim()))return;
  event.preventDefault();
  const entries=lines.map(splitNodeName);
  if(!link.value.trim()){const first=entries.shift();link.value=first.link;if(!name.value.trim())name.value=first.name;}
  if(entries.length)addRows(entries,row,'link');else validate();
});
$('node-list').addEventListener('click',event=>{
  const button=event.target.closest('.node-remove');if(!button)return;
  const row=button.closest('.node-row'),next=row.nextElementSibling||row.previousElementSibling;
  if(!next){setRows([]);validate();rows()[0].querySelector('.node-name').focus();return;}
  row.remove();validate();next.querySelector('.node-name').focus();
});
// Enter moves to the next node (adding one at the end) instead of saving.
$('node-list').addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing||!event.target.matches('input'))return;
  event.preventDefault();const row=event.target.closest('.node-row');
  if(row.nextElementSibling)row.nextElementSibling.querySelector('.node-name').focus();else if(rows().length<MAX_NODES)addRows([{}],row);
});
$('add-node').onclick=()=>addRows([{}]);
// Sorting: drag a row by its handle (mouse, pen or touch), or focus the handle
// and use the arrow keys. Rows slide into place (FLIP) unless motion is reduced.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function moveRow(row,apply) {
  const before=new Map(rows().map(r=>[r,r.offsetTop]));apply();
  if(reducedMotion.matches)return;
  for(const r of rows()){const dy=before.get(r)-r.offsetTop;if(dy&&r!==drag?.row)r.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:160,easing:'ease-out'});}
}
let drag=null;
$('node-list').addEventListener('pointerdown',event=>{
  const handle=event.target.closest('.node-handle');if(!handle||busy||event.button!==0)return;
  event.preventDefault();handle.setPointerCapture(event.pointerId);handle.focus({preventScroll:true});
  const row=handle.closest('.node-row');drag={row,handle,pointer:event.pointerId,start:rows().indexOf(row)};
  row.classList.add('dragging');$('node-list').classList.add('sorting');
});
$('node-list').addEventListener('pointermove',event=>{
  if(!drag)return;
  // offsetTop is relative to the list and ignores the slide animations.
  const y=event.clientY-$('node-list').getBoundingClientRect().top,mid=r=>r.offsetTop+r.offsetHeight/2;
  let prev=drag.row.previousElementSibling,next=drag.row.nextElementSibling;
  while(prev&&y<mid(prev))prev=prev.previousElementSibling;
  while(next&&y>mid(next))next=next.nextElementSibling;
  if(prev!==drag.row.previousElementSibling)moveRow(drag.row,()=>prev?prev.after(drag.row):$('node-list').prepend(drag.row));
  else if(next!==drag.row.nextElementSibling)moveRow(drag.row,()=>next?next.before(drag.row):$('node-list').append(drag.row));
  // Moving the row in the DOM releases pointer capture; take it back.
  if(!drag.handle.hasPointerCapture(drag.pointer))try{drag.handle.setPointerCapture(drag.pointer);}catch{}
  if(event.clientY<48)scrollBy(0,-16);else if(event.clientY>innerHeight-48)scrollBy(0,16);
});
function endDrag(){
  if(!drag)return;
  const {row,start}=drag;drag=null;row.classList.remove('dragging');$('node-list').classList.remove('sorting');
  if(rows().indexOf(row)!==start)validate();
}
document.addEventListener('pointerup',endDrag);
document.addEventListener('pointercancel',endDrag);
window.addEventListener('blur',endDrag);
$('node-list').addEventListener('keydown',event=>{
  const handle=event.target.closest('.node-handle');if(!handle||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const row=handle.closest('.node-row'),up=event.key==='ArrowUp';
  const target=up?row.previousElementSibling:row.nextElementSibling;if(!target)return;
  moveRow(row,()=>up?target.before(row):target.after(row));
  handle.focus();validate();toast(t('moved',rows().indexOf(row)+1),false,true);
});
$('template-search').oninput=renderTemplates;$('template-filter').onchange=renderTemplates;
$('template-select').onchange=()=>{if(templateById($('template-select').value)){selectedTemplate=$('template-select').value;updateDirty();renderDetail();validate();}};
$('editor').onsubmit=async e=>{
  e.preventDefault();if(busy||!validate())return;
  setBusy(true);toast('saving');
  try {
    const response=await fetch(`/api/profiles/${secret}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:composed,revision,template:selectedTemplate})});
    if(!response.ok){const key=response.status===409?'conflict':response.status===503?'service':response.status===413?'tooLarge':'saveError';toast(key,true);return;}
    const data=await response.json();revision=data.revision;savedNodes=composed;savedTemplate=selectedTemplate;dirty=false;go('result');
  }catch{toast('network',true);}finally{setBusy(false);}
};
$('nodes-back').onclick=()=>{if(!dirty||confirm(t('discard'))){setRows(rowsFromText(savedNodes));selectedTemplate=savedTemplate;validate();dirty=false;go('access');}};
$('edit-again').onclick=()=>go('nodes');
$('language').onclick=()=>{language=language==='zh'?'en':'zh';preferences.set('nodebook-language',language);localize();};
$('theme').onclick=()=>{theme={system:'light',light:'dark',dark:'system'}[theme];preferences.set('nodebook-theme',theme);applyTheme();};
for(const button of document.querySelectorAll('[data-reveal]'))button.onclick=()=>{const input=$(button.dataset.reveal);input.type=input.type==='password'?'text':'password';updateReveal();};
for(const button of document.querySelectorAll('[data-copy]'))button.onclick=async()=>{
  const input=$(button.dataset.copy);
  try{await navigator.clipboard.writeText(input.value);toast('copied');}catch{input.type='text';input.select();updateReveal();toast('copyFailed',true);}
};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('popstate',event=>{
  if(dirty&&!confirm(t('discard'))){go(view,{replace:true});return;}
  if(dirty){setRows(rowsFromText(savedNodes));selectedTemplate=savedTemplate;renderTemplates();validate();dirty=false;}
  go(event.state?.view||(secret&&revision?'nodes':'access'),{history:false});
});
setRows([]);localize();
const pathKey=location.pathname.split('/').filter(Boolean)[0];
if(pathKey){go('access',{history:false});load(pathKey);}else go('access',{replace:true});
