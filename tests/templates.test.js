import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convert} from '../src/converter.js';
import {parseNodes} from '../public/nodes.js';
import {CHOICES,EXTRAS,DEFAULT_TEMPLATE,decodeTemplate,encodeTemplate,extraState,normalizeTemplate} from '../public/templates.js';
import {zh,en} from '../public/i18n.js';
const node = 'vless://11111111-1111-4111-8111-111111111111@example.com:443?security=tls#';
const fixture = file => readFileSync(new URL('./fixtures/templates/ACL4SSR_Online'+file+'.ini',import.meta.url),'utf8');
const bases = {mini:fixture('_Mini'),standard:fixture(''),full:fixture('_Full')};
const named = (...names) => names.map(name=>node+encodeURIComponent(name)).join('\n');
const groupsOf = config => config['proxy-groups'].map(g=>g.name);
// Every size × mode × ad level × add-on subset yields a valid Mihomo config.
const combos = [];
for (const size of CHOICES.size) for (const mode of CHOICES.mode) for (const ads of CHOICES.ads) {
  const extras = EXTRAS.map(e=>e.id).filter(id=>extraState(id,size)==='available');
  for (let mask=0; mask<1<<extras.length; mask++) combos.push(encodeTemplate({size,mode,ads,extras:extras.filter((_,i)=>mask>>i&1)}));
}
test(`all ${combos.length} template combinations produce valid configs`,()=>{
  for (const id of combos) for (const nodes of [named('HK Hong Kong','JP Japan','US Netflix'),named('Custom node')]) {
    const options = decodeTemplate(id), config = convert(nodes,bases[options.size],id);
    const policies = new Set(['DIRECT','REJECT',...config.proxies.map(p=>p.name),...groupsOf(config)]);
    assert.ok(config.rules.at(-1).startsWith('MATCH,'),id);
    assert.equal(new Set(groupsOf(config)).size,config['proxy-groups'].length,id);
    for (const rule of config.rules) assert.ok(policies.has(rule.split(',').at(-1)),`${id}: ${rule}`);
    for (const group of config['proxy-groups']) {
      assert.ok(group.proxies.length>0,`${id}: ${group.name}`);
      for (const policy of group.proxies) assert.ok(policies.has(policy),`${id}: ${policy}`);
      if (group.type!=='select') assert.ok(group.url&&group.interval>0,id);
    }
    if (options.mode==='manual') assert.ok(config['proxy-groups'].every(g=>g.type==='select'),id);
    // A fresh subscription must not send proxied traffic direct.
    assert.notEqual(config['proxy-groups'].find(g=>g.name==='🚀 节点选择').proxies[0],'DIRECT',id);
    assert.equal(groupsOf(config).includes('🔯 故障转移'),['fallback','multi'].includes(options.mode),id);
    assert.equal(groupsOf(config).includes('🔮 负载均衡'),options.mode==='multi',id);
    assert.equal(groupsOf(config).includes('🆎 AdBlock'),options.ads==='plus',id);
    assert.equal(config['proxy-groups'].some(g=>g.proxies.join()==='REJECT,DIRECT'),options.ads!=='off',id);
    assert.equal(config.rules[0]==='DOMAIN,login.steampowered.com,DIRECT',options.extras.includes('steam'),id);
    if (options.extras.includes('ai')) assert.ok(groupsOf(config).includes('💬 Ai平台'),id);
    if (options.extras.includes('google')) assert.ok(groupsOf(config).includes('📢 谷歌'),id);
  }
});
// Rules and groups match the upstream variant files where the options mirror them.
test('compositions reproduce upstream variant templates',()=>{
  const nodes = named('HK 香港','JP 日本','US 美国','SG 新加坡','TW 台湾','KR 韩国','NF Netflix','Music 网易');
  const summary = config => ({
    groups: config['proxy-groups'].map(g=>`${g.name}|${g.type}|${[...g.proxies].sort()}`).sort(),
    rules: config.rules.map(r=>r.replace(/^RULE-SET,([^,]+)/,(_,key)=>config['rule-providers'][key].url))
  });
  for (const [id,file] of [['full-noauto','_Full_NoAuto'],['noauto','_NoAuto'],['mini-noauto','_Mini_NoAuto'],['noreject','_NoReject'],['mini-fallback','_Mini_Fallback'],['mini-multimode','_Mini_MultiMode']])
    assert.deepEqual(summary(convert(nodes,bases[decodeTemplate(id).size],id)),summary(convert(nodes,fixture(file))),id);
  for (const [id,file] of [['full-google','_Full_Google'],['full-multimode','_Full_MultiMode'],['full-netflix','_Full_Netflix'],['mini-ai','_Mini_Ai']])
    assert.deepEqual(new Set(groupsOf(convert(nodes,bases[decodeTemplate(id).size],id))),new Set(groupsOf(convert(nodes,fixture(file)))),id);
});
test('region groups match whole codes and place names only',()=>{
  const names=['香港 01','HKG 02','JP01 东京','USA 西雅图','台北','TW 03','韩国','SGP','AUS 悉尼','RUSSIA','UKR 基辅','平台专线','UK 伦敦'];
  const members=size=>Object.fromEntries(convert(named(...names),bases[size],`${size}.manual.standard+regions`)['proxy-groups']
    .filter(g=>/(香港|日本|美国|台湾|狮城|韩国)节点$/.test(g.name)).map(g=>[g.name.slice(-4,-2),g.proxies.map(p=>p.split('#').at(-1).replace(/^节点 · /,''))]));
  for(const size of ['standard','full']) assert.deepEqual(members(size),{
    香港:['香港 01','HKG 02'],日本:['JP01 东京'],美国:['USA 西雅图'],台湾:['台北','TW 03'],狮城:['SGP'],韩国:['韩国']},size);
});
test('manual mode puts DIRECT last in node selection',()=>{
  for(const size of ['mini','standard']) assert.deepEqual(convert(named('A','B'),bases[size],`${size}.manual.standard`)['proxy-groups'][0].proxies,['节点 · A','节点 · B','DIRECT'],size);
});
test('template ids encode, decode and accept earlier ids',()=>{
  assert.deepEqual(decodeTemplate(DEFAULT_TEMPLATE),{size:'full',mode:'manual',ads:'standard',extras:['steam']});
  assert.equal(normalizeTemplate('full-noauto-steam-web'),DEFAULT_TEMPLATE);
  assert.equal(normalizeTemplate('multicountry'),'standard.auto.standard+regions+ai');
  // Built-in or unavailable add-ons are dropped, so the same choice has one id.
  assert.equal(normalizeTemplate('full.auto.standard+ai+regions+steam'),'full.auto.standard+steam');
  assert.equal(normalizeTemplate('mini.auto.standard+google'),'mini.auto.standard');
  assert.equal(normalizeTemplate('mini.auto.off+steam+ai'),'mini.auto.off+ai+steam');
  assert.equal(normalizeTemplate('mini.auto.off+wmc'),'mini.auto.off+steam');
  for (const bad of ['', 'unknown', 'huge.auto.standard', 'full.auto.standard+steamx', 'full.auto.standard+steam+steam', 'full.auto.standard+wmc+steam', null]) assert.equal(decodeTemplate(bad),null,String(bad));
});
test('all interface strings exist in both languages',()=>assert.deepEqual(Object.keys(zh).sort(),Object.keys(en).sort()));
test('node errors can be shown in English',()=>{
  assert.throws(()=>parseNodes('invalid','zh'),/第 1 行：节点链接格式无效/);
  assert.throws(()=>parseNodes('invalid','en'),/Line 1: Invalid node link format/);
  assert.throws(()=>parseNodes('socks5://example','en'),/Line 1: Unsupported protocol/);
  assert.throws(()=>parseNodes('','en'),/Enter at least/);
});
