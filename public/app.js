import {parseNodes,PROTOCOLS,protocolOf,splitNodeName,readNodeLine,writeNodeLine,duplicateNames} from './nodes.js';
import {CHOICES,EXTRAS,DEFAULT_TEMPLATE,decodeTemplate,encodeTemplate,extraState} from './templates.js';
import {describeGroup} from './groups.js';
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
  if(next==='nodes') schedulePreview(0);
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
  $('status').hidden=true;applyTheme();updateReveal();renderTemplates();renderPreview();validate();
  if(view==='result') renderResult();
  document.title=`${t({access:'step1',nodes:'step2',result:'step3'}[view])} · ${t('brand')}`;
}
// Template options: a radio group per choice and a checkbox per add-on. The
// controls are rebuilt on every change, keeping focus on the same control.
const templateOptions=()=>decodeTemplate(selectedTemplate)||decodeTemplate(DEFAULT_TEMPLATE);
function optionSet(key,children,hint) {
  const set=document.createElement('fieldset');set.className=`option-set option-${key}`;
  const legend=document.createElement('legend');legend.textContent=t(`legend_${key}`);set.append(legend,...children);
  if(hint){const p=document.createElement('p');p.className='option-hint';p.textContent=hint;set.append(p);}
  return set;
}
function renderTemplates() {
  const options=templateOptions(),focused=$('template-options').contains(document.activeElement)?document.activeElement.id:'';
  const choices=Object.entries(CHOICES).map(([key,values])=>{
    const row=document.createElement('div');row.className='segmented';
    for(const value of values){
      const input=document.createElement('input');input.type='radio';input.name=`opt-${key}`;input.id=`opt-${key}-${value}`;input.value=value;input.dataset.key=key;
      input.checked=options[key]===value;input.disabled=busy;
      const label=document.createElement('label');label.htmlFor=input.id;label.textContent=t(`${key}_${value}`);row.append(input,label);
    }
    return optionSet(key,[row],t(`${key}Hint_${options[key]}`));
  });
  const check=extra=>{
    const state=extraState(extra.id,options.size),item=document.createElement('div');item.className='check';
    const input=document.createElement('input');input.type='checkbox';input.id=`opt-extra-${extra.id}`;input.dataset.extra=extra.id;
    input.checked=state==='included'||options.extras.includes(extra.id);input.disabled=busy||state!=='available';
    const label=document.createElement('label');label.htmlFor=input.id;
    const name=document.createElement('span');name.className='check-name';name.textContent=t(`extra_${extra.id}`);label.append(name);
    if(state!=='available'){const tag=document.createElement('span');tag.className='tag';tag.textContent=t(state==='included'?'included':'fullOnly');name.append(' ',tag);}
    const hint=document.createElement('span');hint.className='check-hint';hint.textContent=t(`extraHint_${extra.id}`);label.append(hint);
    item.append(input,label);return item;
  };
  const grid=list=>{const box=document.createElement('div');box.className='checks';box.append(...list.map(check));return box;};
  $('template-options').replaceChildren(...choices,optionSet('extras',[grid(EXTRAS.filter(e=>!e.tweak))]),optionSet('tweaks',[grid(EXTRAS.filter(e=>e.tweak))]));
  if(focused)$(focused)?.focus();
  schedulePreview(0);
}
$('template-options').addEventListener('change',event=>{
  const input=event.target,options=templateOptions();
  if(input.dataset.key)options[input.dataset.key]=input.value;
  else if(input.dataset.extra)options.extras=input.checked?[...options.extras,input.dataset.extra]:options.extras.filter(id=>id!==input.dataset.extra);
  selectedTemplate=encodeTemplate(options);renderTemplates();validate();
});
// The preview asks the Worker which groups the subscription would contain for
// the current nodes and options; it waits for typing to pause.
let preview=null,previewKey='',previewTimer,previewRequest;
function schedulePreview(delay=500){clearTimeout(previewTimer);previewTimer=setTimeout(loadPreview,delay);}
async function loadPreview() {
  if($('nodes').hidden)return;
  const key=JSON.stringify([composed,selectedTemplate]);if(key===previewKey)return;previewKey=key;
  previewRequest?.abort();const request=previewRequest=new AbortController();
  $('preview').setAttribute('aria-busy','true');$('preview-summary').textContent=t('previewLoading');
  try {
    const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:composed,template:selectedTemplate}),signal:request.signal});
    if(!response.ok)throw new Error(String(response.status));
    renderPreview(await response.json());
  }catch{
    if(request.signal.aborted)return;
    previewKey='';preview=null;$('preview-summary').textContent=t('previewError');$('preview-tweaks').replaceChildren();$('preview-groups').replaceChildren();
  }finally{if(previewRequest===request)$('preview').removeAttribute('aria-busy');}
}
function renderPreview(data=preview) {
  preview=data;if(!data)return;
  $('preview-summary').textContent=[t('previewGroups',data.groups.length),t('previewRules',data.rules),data.sample?t('previewSample'):t('previewYours',data.nodes)].join(' · ');
  // Optimizations add rules, not groups, so they get a line of their own.
  $('preview-tweaks').replaceChildren(...(data.tweaks||[]).map(tweak=>{
    const line=document.createElement('p');line.className='preview-tweak';
    const name=document.createElement('strong');name.textContent=t(`extra_${tweak.id}`);
    line.append(name,` · ${t('previewTweakRules',tweak.rules)}`);return line;
  }));
  const groups=new Set(data.groups.map(g=>g.name));
  $('preview-groups').replaceChildren(...data.groups.map(group=>{
    const card=document.createElement('article');card.className='group-card';
    const head=document.createElement('div');head.className='group-head';
    const name=document.createElement('h4');name.textContent=group.name;
    const badges=document.createElement('span');badges.className='badges';
    const badge=document.createElement('span');badge.className='badge';badge.textContent=t(`type_${group.type}`);badges.append(badge);
    head.append(name,badges);card.append(head);
    const description=describeGroup(group.name,language);
    if(description){const p=document.createElement('p');p.className='group-desc';p.textContent=description;card.append(p);}
    const members=document.createElement('p');members.className='group-members';
    for(const member of group.proxies.slice(0,6)){
      const chip=document.createElement('span');chip.className='chip'+(groups.has(member)?' chip-group':['DIRECT','REJECT'].includes(member)?' chip-policy':'');
      chip.textContent=member.replace(/^节点 · /,'');chip.title=member;members.append(chip);
    }
    if(group.proxies.length>6){const more=document.createElement('span');more.className='chip chip-more';more.textContent=t('previewMore',group.proxies.length-6);members.append(more);}
    card.append(members);return card;
  }));
}
// Each node is a row with separate name and link fields; together they are
// stored as one link per line with the name as its #fragment.
const rows=()=>[...$('node-list').children];
const fields=row=>({row,name:row.querySelector('.node-name'),link:row.querySelector('.node-link'),toggle:row.querySelector('.node-toggle')});
function createRow({name='',link='',enabled=true}={}) {
  const row=document.createElement('div');row.className='node-row';row.setAttribute('role','listitem');
  const handle=document.createElement('button');handle.type='button';handle.className='link node-handle';
  handle.innerHTML='<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg>';
  const index=document.createElement('span');index.className='node-index';index.setAttribute('aria-hidden','true');
  const nameInput=document.createElement('input');nameInput.className='node-name';nameInput.maxLength=64;nameInput.autocomplete='off';nameInput.spellcheck=false;nameInput.value=name;
  const linkInput=document.createElement('input');linkInput.className='node-link';linkInput.autocomplete='off';linkInput.spellcheck=false;linkInput.value=link;
  linkInput.placeholder='vless:// · hysteria2:// · ss:// …';
  const toggle=document.createElement('input');toggle.type='checkbox';toggle.className='node-toggle';toggle.checked=enabled;
  const remove=document.createElement('button');remove.type='button';remove.className='link node-remove';remove.textContent='×';
  const error=document.createElement('p');error.className='node-error';error.id=`node-error-${++rowId}`;error.hidden=true;
  nameInput.setAttribute('aria-describedby',error.id);linkInput.setAttribute('aria-describedby',error.id);
  row.append(handle,index,nameInput,linkInput,toggle,remove,error);return row;
}
function setRows(list) {$('node-list').replaceChildren(...(list.length?list:[{}]).map(createRow));}
const rowsFromText=text=>String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(readNodeLine);
// A name typed after # in the link field wins only when the name field is empty.
function effective({name,link,toggle}) {
  let value=link.value.trim(),label=name.value.trim();const enabled=toggle.checked;
  if(value.includes('#')){const split=splitNodeName(value);if(split.link!==value){value=split.link;label||=split.name;}}
  return {name:label,link:value,enabled};
}
function showRowError(row,message,field) {
  const error=row.querySelector('.node-error');error.textContent=error.hidden?message:`${error.textContent}${language==='zh'?'；':'; '}${message}`;error.hidden=false;
  row.classList.add('invalid');row.querySelector(field==='name'?'.node-name':'.node-link').setAttribute('aria-invalid','true');
}
function validate() {
  const all=rows().map(fields),counts={};
  all.forEach(({row,name,link,toggle},i)=>{
    row.querySelector('.node-index').textContent=i+1;row.classList.remove('invalid');row.classList.toggle('off',!toggle.checked);
    toggle.setAttribute('aria-label',t('toggleNode',i+1));toggle.title=t(toggle.checked?'enabledTip':'disabledTip');
    const error=row.querySelector('.node-error');error.hidden=true;error.textContent='';
    name.removeAttribute('aria-invalid');link.removeAttribute('aria-invalid');
    name.setAttribute('aria-label',t('nameAria',i+1));link.setAttribute('aria-label',t('linkAria',i+1));
    row.querySelector('.node-remove').setAttribute('aria-label',t('removeNode',i+1));row.querySelector('.node-handle').setAttribute('aria-label',t('moveNode',i+1));name.placeholder=t('namePlaceholder');
  });
  const filled=all.filter(f=>f.name.value.trim()||f.link.value.trim()).map(f=>({row:f.row,number:all.indexOf(f)+1,...effective(f)}));
  const linked=filled.filter(e=>e.link),missing=filled.filter(e=>!e.link);
  for(const entry of linked){const type=protocolOf(entry.link);if(type)counts[type]=(counts[type]||0)+1;}
  const off=linked.filter(e=>!e.enabled).length;
  $('node-count').textContent=linked.length?[nodeCount(linked.length),...(off?[t('disabledCount',off)]:[]),...Object.entries(counts).map(([type,n])=>`${PROTOCOLS[type]} ${n}`)].join(' · '):'';
  // Blank names become <protocol>-<position>, as in parseNodes.
  linked.forEach((entry,i)=>{if(!entry.name)entry.row.querySelector('.node-name').placeholder=`${t('autoName')}${protocolOf(entry.link)||'node'}-${i+1}`;});
  const messages=[];
  for(const entry of missing)showRowError(entry.row,t('missingLink'),'link');
  if(missing.length)messages.push(t('missingLinks'));
  const duplicates=duplicateNames(linked);
  for(const group of duplicates)for(const i of group)showRowError(linked[i].row,t('duplicateName',group.filter(j=>j!==i).map(j=>linked[j].number).join(language==='zh'?'、':', ')),'name');
  if(duplicates.length)messages.push(t('duplicates'));
  composed=linked.map(writeNodeLine).join('\n');parsed=[];
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
  $('save').disabled=busy||!valid||!decodeTemplate(selectedTemplate);updateDirty();schedulePreview();return valid;
}
function addRows(list,after,focus='name') {
  const created=list.map(createRow);
  if(after)after.after(...created);else $('node-list').append(...created);
  validate();created.at(-1)?.querySelector(focus==='link'?'.node-link':'.node-name').focus();
}
function setBusy(value){busy=value;for(const id of ['open','create','key-input','nodes-back'])$(id).disabled=value;renderTemplates();$('node-list').querySelectorAll('input,button').forEach(el=>el.disabled=value);validate();}
function updateDirty(){dirty=composed!==savedNodes||selectedTemplate!==savedTemplate;}
async function load(key) {
  if(!validKey(key)){toast('invalidKey',true);return;}
  setBusy(true);toast('loading');
  try {
    const response=await fetch(`/api/profiles/${key}`,{cache:'no-store'});
    if(!response.ok){toast(response.status===404?'missing':'service',true);return;}
    const data=await response.json();secret=key;revision=data.revision;selectedTemplate=encodeTemplate(decodeTemplate(data.template)||decodeTemplate('online'));
    // Compare against the normalized form so opening alone is not an edit.
    setRows(rowsFromText(data.nodes));savedTemplate=selectedTemplate;
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
  setRows([]);savedNodes='';savedTemplate=DEFAULT_TEMPLATE;
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
  const entries=lines.map(readNodeLine);
  if(!link.value.trim()){const first=entries.shift();link.value=first.link;if(!name.value.trim())name.value=first.name;if(!first.enabled)row.querySelector('.node-toggle').checked=false;}
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
$('editor').onsubmit=async e=>{
  e.preventDefault();if(busy||!validate())return;
  setBusy(true);toast('saving');
  try {
    const response=await fetch(`/api/profiles/${secret}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:composed,revision,template:selectedTemplate})});
    if(!response.ok){const key=response.status===409?'conflict':response.status===503?'service':response.status===413?'tooLarge':'saveError';toast(key,true);return;}
    const data=await response.json();revision=data.revision;savedNodes=composed;savedTemplate=selectedTemplate;dirty=false;go('result');
  }catch{toast('network',true);}finally{setBusy(false);}
};
$('nodes-back').onclick=()=>{if(!dirty||confirm(t('discard'))){setRows(rowsFromText(savedNodes));selectedTemplate=savedTemplate;renderTemplates();validate();dirty=false;go('access');}};
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
