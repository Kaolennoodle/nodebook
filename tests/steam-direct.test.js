import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convert} from '../src/converter.js';
const fixture=file=>readFileSync(new URL(`./fixtures/templates/ACL4SSR_Online${file}.ini`,import.meta.url),'utf8');
const nodes='vless://11111111-1111-4111-8111-111111111111@example.com:443?security=tls#HK';
const base=convert(nodes,fixture('_Full'),'full.manual.standard');
const tuned=convert(nodes,fixture('_Full'),'full.manual.standard+steam');
const prefix=tuned.rules.slice(0,tuned.rules.length-base.rules.length);
// Policy of the first optimization rule matching a host, if any.
function policy(host){return prefix.find(rule=>{
  const [type,value]=rule.split(',');
  return type==='DOMAIN'?host===value:type==='DOMAIN-SUFFIX'&&(host===value||host.endsWith('.'+value));
})?.split(',').at(-1);}
test('Steam sign-in and downloads go direct ahead of the template',()=>{
  for(const host of ['login.steampowered.com','api.steampowered.com','cm1-hkg1.cm.steampowered.com','ext1-hkg1.steamserver.net',
    'cache1-tyo1.steamcontent.com','steampipe.akamaized.net','steampipe-kr.akamaized.net','client-update.queniuqe.com'])assert.equal(policy(host),'DIRECT',host);
  assert.ok(prefix.every(rule=>rule.endsWith(',DIRECT')));
});
test('store, community and user content keep the template routing',()=>{
  for(const host of ['store.steampowered.com','checkout.steampowered.com','help.steampowered.com','steamcommunity.com','community.steam-api.com',
    'shared.akamai.steamstatic.com','steam-chat.com','images.steamusercontent.com','steamcommunity-a.akamaihd.net','store.steampowered.com.evil.test',
    'evilsteamcontent.com','example.com'])assert.equal(policy(host),undefined,host);
});
test('adds rules only, on every size',()=>{
  assert.deepEqual(tuned.rules.slice(prefix.length),base.rules);
  assert.deepEqual(tuned['proxy-groups'],base['proxy-groups']);
  assert.deepEqual(tuned['rule-providers'],base['rule-providers']);
  for(const [size,file] of [['mini','_Mini'],['standard','']]){
    const plain=convert(nodes,fixture(file),`${size}.auto.off`),with_=convert(nodes,fixture(file),`${size}.auto.off+steam`);
    assert.deepEqual(with_.rules.slice(prefix.length),plain.rules,size);assert.deepEqual(with_.rules.slice(0,prefix.length),prefix,size);
    assert.deepEqual(with_['proxy-groups'],plain['proxy-groups'],size);
  }
});
test('the former custom rules option becomes Steam direct first',()=>{
  assert.deepEqual(convert(nodes,fixture('_Full'),'full-noauto-steam-web'),tuned);
  assert.deepEqual(convert(nodes,fixture('_Full'),'full.manual.standard+wmc'),tuned);
});
