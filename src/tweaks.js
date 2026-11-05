// Special optimizations: DIRECT rules placed ahead of every template rule, so
// they hold whatever the template's groups are switched to. They add no
// groups. Each one is an add-on in public/templates.js (EXTRAS, tweak: true).
// List exact hosts only: anything not listed keeps the template's routing.

// Steam sign-in and game downloads. Store (store/checkout.steampowered.com,
// steamstatic.com), community (steamcommunity.com, steam-chat.com) and
// workshop/user content (steamusercontent.com) are deliberately not listed.
const STEAM = [
  'DOMAIN,login.steampowered.com',           // web and client sign-in
  'DOMAIN,api.steampowered.com',             // Web API used by the client
  'DOMAIN-SUFFIX,cm.steampowered.com',       // connection managers
  'DOMAIN-SUFFIX,steamserver.net',           // connection managers
  'DOMAIN-SUFFIX,steamcontent.com',          // game content
  'DOMAIN,steampipe.akamaized.net',          // game content (Akamai)
  'DOMAIN,steampipe-kr.akamaized.net',
  'DOMAIN,steampipe-partner.akamaized.net',
  'DOMAIN,client-update.queniuqe.com'        // client updates (China CDN)
];

export const TWEAKS = {steam: STEAM.map(rule => `${rule},DIRECT`)};

export function applyTweaks(config, options) {
  const rules = options.extras.flatMap(id => TWEAKS[id] || []);
  return rules.length ? {...config, rules: [...rules, ...config.rules]} : config;
}
