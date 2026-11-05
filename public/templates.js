// A routing template is one of three ACL4SSR base templates plus independent
// options, stored as a short string such as "full.manual.standard+steam":
// size.mode.ads, then "+extra" for each add-on. Template ids saved by earlier
// versions (one per upstream variant file) still decode, see LEGACY.
const CONFIG = 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/';
export const BASE_URLS = {
  mini: CONFIG + 'ACL4SSR_Online_Mini.ini',
  standard: CONFIG + 'ACL4SSR_Online.ini',
  full: CONFIG + 'ACL4SSR_Online_Full.ini'
};
export const CHOICES = {
  size: ['mini', 'standard', 'full'],
  mode: ['auto', 'manual', 'fallback', 'multi'],
  ads: ['off', 'standard', 'plus']
};
// Order is the canonical order in the stored string. `included`: the size
// already has it built in. `only`: the sizes it can be added to. `tweak`: a
// special optimization (src/tweaks.js) rather than extra groups.
export const EXTRAS = [
  {id: 'regions', included: ['full']},
  {id: 'ai', included: ['full']},
  {id: 'google', only: ['full']},
  {id: 'netflix', only: ['full']},
  {id: 'steam', tweak: true}
];
export function extraState(id, size) {
  const extra = EXTRAS.find(e => e.id === id);
  if (extra.included?.includes(size)) return 'included';
  if (extra.only && !extra.only.includes(size)) return 'unavailable';
  return 'available';
}
const LEGACY = {
  'full-noauto-steam-web': 'full.manual.standard+steam',
  'full-noauto': 'full.manual.standard',
  'full': 'full.auto.standard',
  'online': 'standard.auto.standard',
  'noauto': 'standard.manual.standard',
  'adblock': 'standard.auto.plus',
  'multicountry': 'standard.auto.standard+regions+ai',
  'noreject': 'standard.auto.off',
  'full-adblock': 'full.multi.plus',
  'full-google': 'full.auto.standard+google',
  'full-netflix': 'full.multi.standard+netflix',
  'full-multimode': 'full.multi.standard',
  'mini': 'mini.auto.standard',
  'mini-noauto': 'mini.manual.standard',
  'mini-adblock': 'mini.auto.plus',
  'mini-ai': 'mini.auto.standard+ai',
  'mini-fallback': 'mini.fallback.standard',
  'mini-multicountry': 'mini.auto.standard+regions',
  'mini-multimode': 'mini.multi.standard'
};
export const DEFAULT_TEMPLATE = 'full.manual.standard+steam';
// Add-on ids that were renamed. wmc (👑 王满仓大王定制规则) added a Steam store
// group; its sign-in and download rules live on as Steam 优先直连.
const RENAMED = {wmc: 'steam'};

// Returns {size, mode, ads, extras} or null. Add-ons a size already includes
// or cannot take are dropped, so equal choices always encode the same way.
export function decodeTemplate(value) {
  const text = LEGACY[value] ?? value;
  const match = typeof text === 'string' && /^([a-z]+)\.([a-z]+)\.([a-z]+)((?:\+[a-z]+)*)$/.exec(text);
  if (!match) return null;
  const [, size, mode, ads, tail] = match, extras = tail.split('+').filter(Boolean).map(id => RENAMED[id] ?? id);
  if (!CHOICES.size.includes(size) || !CHOICES.mode.includes(mode) || !CHOICES.ads.includes(ads)) return null;
  if (new Set(extras).size !== extras.length || !extras.every(id => EXTRAS.some(e => e.id === id))) return null;
  return {size, mode, ads, extras: EXTRAS.map(e => e.id).filter(id => extras.includes(id) && extraState(id, size) === 'available')};
}
export function encodeTemplate({size, mode, ads, extras = []}) {
  return [`${size}.${mode}.${ads}`, ...EXTRAS.map(e => e.id).filter(id => extras.includes(id) && extraState(id, size) === 'available')].join('+');
}
export const normalizeTemplate = value => { const options = decodeTemplate(value); return options && encodeTemplate(options); };
// Whether the template includes an add-on, built in or chosen.
export const hasExtra = (options, id) => options.extras.includes(id) || extraState(id, options.size) === 'included';
