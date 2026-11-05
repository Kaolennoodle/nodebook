// Custom rule packs: rules ACL4SSR does not define, added on top of the
// generated config. The "wmc" option (👑 王满仓大王定制规则) is a list of parts;
// add future rules as another part. Each part returns the groups it adds and
// the rules to put ahead of the template's own rules.
export const STEAM_WEB_GROUP = '🎮 Steam 商店与社区';

function steam(config) {
  const web = [
    'DOMAIN-SUFFIX,store.steampowered.com',
    'DOMAIN-SUFFIX,checkout.steampowered.com',
    'DOMAIN-SUFFIX,steamcommunity.com',
    'DOMAIN,community.steam-api.com',
    'DOMAIN,avatars.steamstatic.com',
    'DOMAIN,avatars.akamai.steamstatic.com',
    'DOMAIN,avatars.cloudflare.steamstatic.com',
    'DOMAIN,avatars.fastly.steamstatic.com',
    'DOMAIN,images.steamusercontent.com',
    'DOMAIN,steamcommunity-a.akamaihd.net',
    'DOMAIN,steamstore-a.akamaihd.net',
    'DOMAIN,steamuserimages-a.akamaihd.net',
    'DOMAIN,steamusercontent-a.akamaihd.net',
    ...['store','community','shared'].flatMap(prefix => [
      ...['akamai','cloudflare','fastly'].map(cdn => `DOMAIN,${prefix}.${cdn}.steamstatic.com`),
      `DOMAIN,${prefix}.cdn.queniuqe.com`,
      `DOMAIN,${prefix}.st.dl.eccdnx.com`
    ])
  ];
  // Use DIRECT itself: changing the generic gaming/global-direct group must not
  // move login, CM or download traffic onto a proxy. Web exceptions go first.
  const direct = [
    ...['steampowered.com','steamcontent.com','steamusercontent.com','steamserver.net',
      'steam-api.com','steam-chat.com','steamchina.com'].map(d => `DOMAIN-SUFFIX,${d}`),
    ...['steampipe.akamaized.net','steampipe-kr.akamaized.net','steampipe-partner.akamaized.net',
      'steamcdn-a.akamaihd.net','client-update.queniuqe.com','gstore.val.manlaxy.com']
      .map(d => `DOMAIN,${d}`)
  ];
  const cn = Object.entries(config['rule-providers']).find(([,p]) => p.url.endsWith('/SteamCN.list'));
  if (cn) direct.push(`RULE-SET,${cn[0]}`);
  const group = {name:STEAM_WEB_GROUP,type:'select',proxies:['🚀 节点选择','DIRECT',...config.proxies.map(p => p.name)]};
  return {groups:[group], rules:[...web.map(rule => `${rule},${STEAM_WEB_GROUP}`), ...direct.map(rule => `${rule},DIRECT`)]};
}

export const RULE_PACKS = {wmc: [steam]};

export function applyRulePacks(config, options) {
  const parts = options.extras.flatMap(id => RULE_PACKS[id] || []).map(part => part(config));
  if (!parts.length) return config;
  if (!config['proxy-groups'].some(g => g.name === '🚀 节点选择')) throw new Error('定制规则需要「🚀 节点选择」分组');
  return {...config,
    'proxy-groups':[...config['proxy-groups'], ...parts.flatMap(p => p.groups)],
    rules:[...parts.flatMap(p => p.rules), ...config.rules]};
}
