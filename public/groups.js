// Short descriptions of the proxy groups ACL4SSR creates, shown in the
// template preview. Unknown groups get none.
const GROUPS = {
  '🚀 节点选择': ['总开关：大部分需要代理的流量都走这里，在此选择自动、地区分组或具体节点。', 'Main switch: most proxied traffic goes here. Pick automatic, a region or a specific node.'],
  '🚀 手动切换': ['列出全部节点，供手动指定某一个。', 'Every node, for picking one by hand.'],
  '♻️ 自动选择': ['定时测速，自动使用延迟最低的节点。', 'Tests latency periodically and uses the fastest node.'],
  '🔯 故障转移': ['按顺序使用第一个可用节点，当前节点失效时自动切换。', 'Uses the first available node and switches when it fails.'],
  '🔮 负载均衡': ['把连接分散到多个节点上。', 'Spreads connections across several nodes.'],
  '🌍 国外媒体': ['海外视频与流媒体网站。', 'Overseas video and streaming sites.'],
  '🌏 国内媒体': ['国内视频网站的海外版权限制内容。', 'Region-locked content on Chinese video sites.'],
  '📲 电报信息': ['Telegram。', 'Telegram.'],
  '📲 电报消息': ['Telegram。', 'Telegram.'],
  '💬 Ai平台': ['ChatGPT、Claude、Gemini 等 AI 服务。', 'AI services such as ChatGPT, Claude and Gemini.'],
  '📹 油管视频': ['YouTube。', 'YouTube.'],
  '🎥 奈飞视频': ['Netflix 流量，可指定解锁节点。', 'Netflix traffic; can use an unlocking node.'],
  '🎥 奈飞节点': ['名称含 Netflix、奈飞、解锁等关键词的节点。', 'Nodes whose names mention Netflix or unlocking.'],
  '📺 巴哈姆特': ['巴哈姆特动画疯，通常需要台湾节点。', 'Bahamut Anime Crazy; usually needs a Taiwan node.'],
  '📺 哔哩哔哩': ['哔哩哔哩，含港澳台限定内容。', 'Bilibili, including Hong Kong, Macau and Taiwan content.'],
  '📢 谷歌FCM': ['Google 推送服务（FCM），影响安卓通知。', 'Google push (FCM), used by Android notifications.'],
  '📢 谷歌': ['Google 搜索、账号和其他服务。', 'Google search, accounts and other services.'],
  '📢 谷歌🇨🇳': ['Google 在国内可直连的服务。', 'Google services reachable directly in China.'],
  '📢 谷歌🇨🇳Play下载': ['Google Play 应用下载。', 'Google Play app downloads.'],
  '📢 谷歌🇨🇳Play服务': ['Google Play 服务的国内地址。', 'Google Play services on Chinese addresses.'],
  'Ⓜ️ 微软服务': ['微软账号、Office 等服务。', 'Microsoft accounts, Office and other services.'],
  'Ⓜ️ 微软Bing': ['必应搜索。', 'Bing search.'],
  'Ⓜ️ 微软云盘': ['OneDrive。', 'OneDrive.'],
  '🍎 苹果服务': ['Apple 服务与更新。', 'Apple services and updates.'],
  '🎮 游戏平台': ['Steam、Epic、PlayStation、Nintendo 等游戏平台。', 'Game platforms such as Steam, Epic, PlayStation and Nintendo.'],
  '🎶 网易音乐': ['网易云音乐，可使用解锁节点。', 'NetEase Cloud Music; can use an unlocking node.'],
  '🎯 全球直连': ['国内网站和局域网，默认直连。', 'Chinese sites and the local network; direct by default.'],
  '🛑 全球拦截': ['广告与跟踪域名，默认拦截。', 'Ads and trackers; blocked by default.'],
  '🛑 广告拦截': ['广告与跟踪域名，默认拦截。', 'Ads and trackers; blocked by default.'],
  '🍃 应用净化': ['应用内广告，默认拦截。', 'In-app ads; blocked by default.'],
  '🆎 AdBlock': ['EasyList 与 EasyList China 广告规则。', 'EasyList and EasyList China ad rules.'],
  '🛡️ 隐私防护': ['EasyPrivacy 跟踪器拦截。', 'EasyPrivacy tracker blocking.'],
  '🐟 漏网之鱼': ['所有规则都没匹配上的流量。', 'Traffic no rule matched.']
};
const REGION = /^(\S+) (香港|台湾|狮城|日本|美国|韩国)节点$/;
const REGION_EN = {香港:'Hong Kong', 台湾:'Taiwan', 狮城:'Singapore', 日本:'Japan', 美国:'United States', 韩国:'South Korea'};
export function describeGroup(name, language) {
  const known = GROUPS[name];
  if (known) return known[language === 'zh' ? 0 : 1];
  const region = REGION.exec(name);
  if (region) return language === 'zh' ? `名称含${region[2]}关键词的节点。` : `Nodes whose names mention ${REGION_EN[region[2]]}.`;
  return '';
}
