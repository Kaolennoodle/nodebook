// Builds a routing template from an ACL4SSR base template and the chosen
// options by editing its ruleset and proxy group lines, so the result goes
// through the same converter as an upstream file. The edits mirror the upstream
// variant files (NoAuto, AdblockPlus, MultiCountry, ...) but can be combined.
// Order matters: add-ons first, then ad blocking, then the selection mode,
// which rewrites references in every group (including ones added before).
const LIST = 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/';
const TEST = 'http://www.gstatic.com/generate_204';
const AUTO = '♻️ 自动选择', SELECT = '🚀 节点选择', MANUAL = '🚀 手动切换', FINAL = '🐟 漏网之鱼', DIRECT_GROUP = '🎯 全球直连';
// Region groups as defined by the Full template, with stricter name patterns
// (used for every size, replacing the upstream ones): letter codes must stand
// alone, so "AUS" is not the US and "UKR" is not Korea, and Taiwan needs a
// place name, so "平台" does not count.
const code = (...codes) => codes.map(c => `(?<![A-Za-z])${c}(?![A-Za-z])`).join('|');
const REGIONS = [
  ['🇭🇰 香港节点', `(港|${code('HK', 'HKG', 'hk')}|Hong ?Kong|hongkong)`, '300,,50'],
  ['🇯🇵 日本节点', `(日本|川日|东京|大阪|泉日|埼玉|沪日|深日|${code('JP', 'JPN')}|Japan)`, '300,,50'],
  ['🇺🇲 美国节点', `(美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|${code('US', 'USA')}|United States)`, '300,,150'],
  ['🇨🇳 台湾节点', `(台湾|台灣|臺灣|台北|臺北|台中|台南|高雄|新北|彰化|${code('TW', 'TWN')}|Taiwan)`, '300,,50'],
  ['🇸🇬 狮城节点', `(新加坡|坡|狮城|${code('SG', 'SGP')}|Singapore)`, '300,,50'],
  ['🇰🇷 韩国节点', `(${code('KR', 'KOR')}|Korea|首尔|韩|韓)`, '300,,50']
];
const REGION_PATTERNS = new Map(REGIONS.map(([name, pattern]) => [name, pattern]));
const isPattern = part => !part.startsWith('[]') && !/^https?:|^\d+(,,\d+)?$/.test(part);
const ref = name => `[]${name}`;
const group = (name, type, ...parts) => ({name, type, parts});
const ruleset = (target, source) => ({group: target, source: /^\[\]|^https?:/.test(source) ? source : LIST + source});
const isRejectGroup = g => g.parts.length === 2 && g.parts[0] === '[]REJECT' && g.parts[1] === '[]DIRECT';
const fromList = file => r => r.source === LIST + file;

function parse(text) {
  const t = {groups: [], rulesets: []};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('custom_proxy_group=')) { const [name, type, ...parts] = line.slice(19).split('`'); t.groups.push({name, type, parts}); }
    else if (line.startsWith('ruleset=')) { const value = line.slice(8), comma = value.indexOf(','); t.rulesets.push({group: value.slice(0, comma), source: value.slice(comma + 1)}); }
  }
  return t;
}
const serialize = t => [
  ...t.rulesets.map(r => `ruleset=${r.group},${r.source}`),
  ...t.groups.map(g => `custom_proxy_group=${[g.name, g.type, ...g.parts].join('`')}`)
].join('\n');

const find = (t, name) => t.groups.find(g => g.name === name);
function addGroups(t, groups, after) {
  const index = after ? t.groups.findIndex(g => g.name === after) : -1;
  t.groups.splice(index < 0 ? t.groups.length : index + 1, 0, ...groups);
}
function addRefs(t, name, refs, after) {
  const g = find(t, name); if (!g) return;
  const index = g.parts.indexOf(ref(after));
  g.parts.splice(index < 0 ? 0 : index + 1, 0, ...refs.map(ref));
}
// Removes groups, every reference to them and the rules that target them.
function removeGroups(t, names) {
  const gone = new Set(names);
  t.groups = t.groups.filter(g => !gone.has(g.name));
  for (const g of t.groups) g.parts = g.parts.filter(p => !(p.startsWith('[]') && gone.has(p.slice(2))));
  t.rulesets = t.rulesets.filter(r => !gone.has(r.group));
}
function addRulesets(t, rules, {before, after}) {
  const index = before ? t.rulesets.findIndex(before) : t.rulesets.findLastIndex(after);
  if (index < 0) throw new Error('模板缺少插入位置');
  t.rulesets.splice(before ? index : index + 1, 0, ...rules);
}

const EXTRA_EDITS = {
  // MultiCountry: region groups and a manual switch, offered in 🚀 节点选择.
  regions(t) {
    const names = REGIONS.map(([name]) => name);
    addGroups(t, [group(MANUAL, 'select', '.*')], SELECT);
    addGroups(t, REGIONS.map(([name, pattern, interval]) => group(name, 'url-test', pattern, TEST, interval)));
    const select = find(t, SELECT);
    select.parts = select.parts.filter(p => p !== '.*');
    addRefs(t, SELECT, [...names, MANUAL], AUTO);
  },
  ai(t) {
    addRulesets(t, [ruleset('💬 Ai平台', 'Ruleset/AI.list'), ruleset('💬 Ai平台', 'Ruleset/OpenAi.list')], {before: fromList('ProxyMedia.list')});
    const at = t.groups.findIndex(g => g.name === DIRECT_GROUP);
    t.groups.splice(at < 0 ? t.groups.length : at, 0, group('💬 Ai平台', 'select', ref(SELECT), ref(DIRECT_GROUP), ref(AUTO), '.*'));
  },
  // Full_Google: Google CN, Play and YouTube get their own groups ahead of Google.list.
  google(t) {
    const regions = ['🇸🇬 狮城节点', '🇭🇰 香港节点', '🇨🇳 台湾节点', '🇯🇵 日本节点', '🇺🇲 美国节点', '🇰🇷 韩国节点'].map(ref);
    const cnRegions = ['🇺🇲 美国节点', '🇭🇰 香港节点', '🇨🇳 台湾节点', '🇸🇬 狮城节点', '🇯🇵 日本节点', '🇰🇷 韩国节点'].map(ref);
    t.rulesets = t.rulesets.filter(r => !(r.group === DIRECT_GROUP && fromList('GoogleCN.list')(r)) && !fromList('Ruleset/YouTube.list')(r));
    addRulesets(t, [
      ruleset('📢 谷歌🇨🇳Play下载', '[]DOMAIN-SUFFIX,xn--ngstr-lra8j.com'),
      ruleset('📢 谷歌🇨🇳Play服务', '[]DOMAIN-SUFFIX,services.googleapis.cn'),
      ruleset('📢 谷歌🇨🇳Play服务', 'Ruleset/GoogleCNProxyIP.list'),
      ruleset('📢 谷歌🇨🇳', 'Ruleset/GoogleCN.list'),
      ruleset('📹 油管视频', 'Ruleset/YouTube.list'),
      ruleset('📢 谷歌', 'Ruleset/Google.list')
    ], {after: fromList('Ruleset/GoogleFCM.list')});
    const proxied = name => group(name, 'select', ref(SELECT), '[]DIRECT', ref(AUTO), ...regions, ref(MANUAL));
    addGroups(t, [proxied('📢 谷歌🇨🇳Play下载'), proxied('📢 谷歌🇨🇳Play服务'),
      group('📢 谷歌🇨🇳', 'select', '[]DIRECT', ref(SELECT), ...cnRegions, ref(MANUAL)), proxied('📢 谷歌')], '📢 谷歌FCM');
  },
  // Full_Netflix: Amazon IP ranges also go to the Netflix group.
  netflix(t) { addRulesets(t, [ruleset('🎥 奈飞视频', 'Ruleset/AmazonIp.list')], {after: fromList('Ruleset/Netflix.list')}); }
};

const AD_EDITS = {
  standard() {},
  // NoReject: no ad, tracking or app-cleaning groups, nor the UnBan exceptions.
  off(t) {
    removeGroups(t, t.groups.filter(isRejectGroup).map(g => g.name));
    t.rulesets = t.rulesets.filter(r => !fromList('UnBan.list')(r));
  },
  // AdblockPlus (Full flavour): EasyList, EasyList China and EasyPrivacy.
  plus(t) {
    addRulesets(t, [ruleset('🆎 AdBlock', 'BanEasyList.list'), ruleset('🆎 AdBlock', 'BanEasyListChina.list'),
      ruleset('🛡️ 隐私防护', 'BanEasyPrivacy.list')], {after: fromList('BanProgramAD.list')});
    const last = t.groups.findLast(isRejectGroup);
    addGroups(t, [group('🆎 AdBlock', 'select', '[]REJECT', '[]DIRECT'), group('🛡️ 隐私防护', 'select', '[]REJECT', '[]DIRECT')], last?.name);
  }
};

const MODE_EDITS = {
  auto() {},
  // NoAuto: no background tests anywhere; region groups become manual lists.
  manual(t) {
    // Groups that offered automatic selection before DIRECT (🚀 节点选择 in Mini
    // and Standard) would otherwise default to DIRECT: move DIRECT to the end.
    const directNext = t.groups.filter(g => g.parts[0] === ref(AUTO) && g.parts[1] === '[]DIRECT');
    removeGroups(t, [AUTO]);
    for (const g of directNext) g.parts = [...g.parts.filter(p => p !== '[]DIRECT'), '[]DIRECT'];
    for (const g of t.groups) if (g.type === 'url-test') { g.type = 'select'; g.parts = g.parts.filter(p => !/^https?:|^\d+(,,\d+)?$/.test(p)); }
  },
  fallback(t) { addFailover(t, [group('🔯 故障转移', 'fallback', '.*', TEST, '300,,50')]); },
  multi(t) { addFailover(t, [group('🔯 故障转移', 'fallback', '.*', TEST, '300,,50'), group('🔮 负载均衡', 'load-balance', '.*', TEST, '300,,50')]); }
};
function addFailover(t, groups) {
  addGroups(t, groups, AUTO);
  for (const name of [SELECT, FINAL]) addRefs(t, name, groups.map(g => g.name), AUTO);
}

export function composeTemplate(text, options) {
  const t = parse(text);
  for (const id of ['regions', 'ai', 'google', 'netflix']) if (options.extras.includes(id)) EXTRA_EDITS[id](t);
  AD_EDITS[options.ads](t);
  MODE_EDITS[options.mode](t);
  for (const g of t.groups) if (REGION_PATTERNS.has(g.name)) g.parts = g.parts.map(p => isPattern(p) ? REGION_PATTERNS.get(g.name) : p);
  return serialize(t);
}
