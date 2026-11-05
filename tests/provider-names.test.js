import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {convert, providerKey} from '../src/converter.js';

const dir = new URL('./fixtures/templates/', import.meta.url);
const nodes = 'vless://11111111-1111-4111-8111-111111111111@example.com:443?security=tls#HK';
const ACL = 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/';

// Clients cache each rule list under its provider name. If a name ever points at
// a different list, the stale cache sends traffic to the wrong group.
test('a provider name always refers to the same rule list, across every template', () => {
  const seen = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ini'))) {
    const providers = convert(nodes, readFileSync(new URL(file, dir), 'utf8'))['rule-providers'];
    for (const [key, p] of Object.entries(providers)) {
      assert.equal(p.path, undefined, file);
      assert.equal(seen.get(key) ?? p.url, p.url, `${file}: ${key} reused for another list`);
      seen.set(key, p.url);
    }
  }
  assert.ok(seen.size > 20);
});

test('inserting a ruleset does not rename the others', () => {
  const ini = readFileSync(new URL('ACL4SSR_Online_Mini.ini', dir), 'utf8');
  const lines = ini.split('\n'), first = lines.findIndex(l => /^ruleset=.*https:/.test(l));
  lines.splice(first, 0, `ruleset=🎯 全球直连,${ACL}Ruleset/SteamCN.list`);
  const before = convert(nodes, ini)['rule-providers'], after = convert(nodes, lines.join('\n'))['rule-providers'];
  for (const [key, p] of Object.entries(before)) assert.equal(after[key]?.url, p.url, key);
});

test('keys are readable and distinguish Clash/ from Clash/Ruleset/', () => {
  assert.equal(providerKey(`${ACL}Telegram.list`), 'Telegram');
  assert.equal(providerKey(`${ACL}Ruleset/GoogleFCM.list`), 'Ruleset-GoogleFCM');
  assert.notEqual(providerKey(`${ACL}Netflix.list`), providerKey(`${ACL}Ruleset/Netflix.list`));
});
