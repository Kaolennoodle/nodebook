<p align="center"><img src="assets/brand/nodebook-logo.svg" width="100" height="100" alt="Nodebook 节点簿 Logo"></p>

# 节点簿 · Cloudflare Workers 订阅转换

**节点会变，订阅地址不变。**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wangmancang520/worker-subscriptions)

基于 Cloudflare Workers 与 D1 的自托管订阅转换服务。通过网页管理 VLESS、Trojan、Hysteria2、TUIC、VMess、Shadowsocks 节点，使用 ACL4SSR 官方在线模板生成 Mihomo 配置，利用访问密钥路径保持编辑地址和订阅地址固定。

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Storage D1](https://img.shields.io/badge/Storage-D1-F38020)
![Client Mihomo](https://img.shields.io/badge/Client-Mihomo-306EFF)
![Template ACL4SSR](https://img.shields.io/badge/Template-ACL4SSR-26854A)

[快速部署](#部署) · [使用方法](#使用) · [支持范围](#支持范围) · [常见问题](#常见问题) · [反馈问题](https://github.com/wangmancang520/worker-subscriptions/issues)

## 功能亮点

- **固定订阅地址**：更新节点后，客户端直接更新订阅，无需重新导入链接。
- **个人编辑页面**：通过 `/访问密钥` 打开之前保存的节点，支持多份独立节点集合。
- **D1 持久化**：数据保存在自己的 Cloudflare 数据库，重新部署 Worker 后仍可使用。
- **Worker 内转换**：不依赖第三方订阅转换站，不向模板服务器发送节点信息。
- **ACL4SSR 分流**：保留官方在线模板的策略组与规则顺序，生成 Mihomo rule-providers。
- **可自由组合的分流模板**：规模、选点方式、广告拦截和附加分组分别选择，实时预览订阅里的分组；另有「特殊优化」可勾选，如 Steam 优先直连。
- **三步完成**：访问密钥 → 节点与模板 → 订阅链接，界面简洁，无多余装饰。
- **中英文与主题**：自动跟随浏览器语言和系统主题，可随时切换。
- **明确校验**：错误行、未知参数和不支持的协议直接报错；版本检查防止多页面互相覆盖。

当前版本已通过本地自动测试、Wrangler 打包检查和本地 D1 迁移验证；云端部署及真实代理连接仍需在自己的环境中验证。本项目用于管理和转换已有节点，不提供代理节点或代理流量转发。

## 工作原理

```mermaid
flowchart LR
  A[浏览器：输入访问密钥和节点] -->|保存| B[Worker API]
  B --> C[(D1 数据库)]
  D[代理客户端：固定订阅地址] --> E[Worker 配置生成器]
  C --> E
  F[ACL4SSR 官方模板] --> E
  E -->|Mihomo 配置| D
  D -->|更新分流规则| G[ACL4SSR 规则列表]
```

前端位于 `public/`，后端位于 `src/`，通过 HTTP API 通信。两者以一个 Workers 项目同源部署。

| 地址 | 功能 |
| --- | --- |
| `/` | 创建访问密钥和节点集合 |
| `/:secret` | 读取并编辑指定集合 |
| `/:secret/sub` | 下载该集合的最新 Mihomo 配置 |

## 部署

需要自己的 Cloudflare 账号。本地开发建议使用 Node.js 24 与 npm（本项目测试使用 Node 内置 SQLite）。GitHub 仅托管源码，服务运行于 Cloudflare Workers，不适用于 GitHub Pages。

### 方式一：一键部署（推荐）

点击上方 **Deploy to Cloudflare** 按钮，按向导完成以下操作：

1. 登录 Cloudflare，并授权连接自己的 GitHub 账号。
2. 确认新仓库、Worker 和 D1 数据库的名称。
3. 保留自动识别的部署命令 `npm run deploy`（使用 pnpm 时为 `pnpm run deploy`），然后确认部署。
4. 等待部署完成，打开分配的 `workers.dev` 地址，保存节点并导入订阅。

Cloudflare 会将此模板复制到你的 Git 账号。项目的 `deploy` 脚本会保留已有真实数据库 ID；未配置 ID 时，按 `database_name` 查找数据库，不存在则创建，再写入真实 ID、运行迁移并部署 Worker。需要部署凭证拥有对应账号的 D1 读取及编辑权限。构建命令可以留空，本项目没有前端编译步骤。

模板不设置虚假的数据库 ID。部署脚本兼容早期全零占位值；真实 ID 写入本次构建目录，不会自动提交回 GitHub。建议首次成功后将真实 ID 保存到自己的仓库，尤其是在重命名数据库或部署多个实例之前。没有 ID 时会复用同名数据库：独立实例应设置不同的 `database_name`。后续修改应推送到部署向导创建并连接的仓库；原始模板的更新不会自动同步过去。

**已有 Cloudflare 项目必须检查其保存的部署命令为 `npm run deploy`。** 仓库更新不会自动改变控制台中的旧命令。直接运行 `npx wrangler deploy` 会跳过本项目的数据库准备和迁移步骤。

按钮及迁移脚本已配置；完整的账号授权、资源创建和首次云端部署仍需要在你的 Cloudflare 账号内验证。参见 [Cloudflare 官方一键部署说明](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。

### 方式二：本地命令行部署

```sh
git clone https://github.com/wangmancang520/worker-subscriptions.git
cd worker-subscriptions
npm install
npx wrangler login
npx wrangler d1 create subscriptions
```

将返回的 `database_id` 填入 `wrangler.jsonc`，然后执行：

```sh
npm run deploy
```

访问 Wrangler 返回的 `https://worker-subscriptions.<你的子域>.workers.dev`。也可以在 Cloudflare Workers 设置中绑定自定义域名。前端资源与后端一起部署，不需要 Pages 或第三方订阅转换服务器。配置了真实 ID 后，部署脚本会使用该数据库，不会另建替代数据库。

### 方式三：已有仓库连接 GitHub 自动部署

1. 将本项目保存到你有管理权限的 GitHub 仓库。
2. 在 Cloudflare 创建名为 `subscriptions` 的 D1 数据库，将它的 ID 填入 `wrangler.jsonc` 并提交到仓库。数据库 ID 是资源标识；不要把 Cloudflare API Token 提交到仓库。
3. 在 Cloudflare Workers & Pages 中创建 Worker，连接 GitHub 仓库，配置如下：

| 设置 | 值 |
| --- | --- |
| Worker 名称 | `worker-subscriptions`，与 `wrangler.jsonc` 的 `name` 一致 |
| 生产分支 | `main` |
| 根目录 | 仓库根目录 |
| 构建命令 | `npm test` |
| 部署命令 | `npm run deploy` |

4. 确认构建环境使用 Node.js 24，部署凭证具有 Worker 部署和对应 D1 数据库编辑权限。
5. 部署成功后访问分配的 `workers.dev` 域名，保存一份节点并在客户端验证订阅。之后推送到 `main` 即可触发后续部署。

数据库迁移会记录已执行的版本，正常重新部署不会清空节点。不要在更新时删除数据库或随意替换绑定。参考 [Workers Builds 官方说明](https://developers.cloudflare.com/workers/ci-cd/builds/)。

## 本地开发与验证

```sh
npm run db:local
npm run dev
npm test
```

测试使用 Node 内置 SQLite 执行实际迁移和查询，覆盖节点转换、官方模板、创建/读取/更新、版本冲突、跨站保存拒绝、请求大小限制以及固定订阅地址更新。测试不访问网络，模板样本保存在 `tests/fixtures`。

## 使用

1. 打开首页。老用户输入访问密钥并点击「打开」，新用户点击「生成密钥」。
2. 逐个填写节点的名称（可留空自动命名）和链接，或在链接框一次粘贴多行链接；可拖动调整顺序，关闭「启用」的节点只保存在网站上，不进入订阅。页面会显示数量、类型、格式和重名检查结果。新密钥在保存节点后才写入数据库。
3. 选择分流模板的各项，对照下方「订阅预览」确认分组，点击「保存」。新配置默认为完整 + 手动选择 + 标准拦截 + Steam 优先直连。
4. 复制订阅链接，在 Mihomo 客户端中选择「从 URL 导入」。结果页同时提供密钥与直达编辑网址，默认遮罩显示。
5. 以后通过编辑网址或密钥打开配置，修改并保存，在客户端更新原订阅即可。

右上角可切换中文 / English，以及跟随系统 / 浅色 / 深色主题。首次访问时，简体中文浏览器使用中文，其余语言使用英语。浏览器只保存语言和主题偏好，不保存节点与密钥。

访问密钥就是读写凭证，没有另外的账号密码。订阅地址包含同一个访问密钥，持有订阅地址的人也能编辑节点。请使用默认随机访问密钥，不要公开地址。数据库只存访问密钥的 SHA-256，节点内容存储在你自己的 D1 中；这不是端到端加密。页面不将节点写入 localStorage，不引入第三方脚本，响应禁止缓存并禁用 Referrer。不要在 Cloudflare 访问日志中公开含访问密钥的路径。公开部署建议为 `/api/*` 配置 Cloudflare 限流，避免陌生人批量创建数据。

## 支持范围

- VLESS：UUID、TLS、Reality、XTLS Vision，TCP / WS / gRPC / XHTTP。
- Trojan：TLS，TCP / WS / gRPC。
- Hysteria2（`hysteria2://` 或 `hy2://`）：密码、SNI、insecure、salamander 混淆、端口跳跃 `mport`、`pinSHA256`、ALPN、up/down。
- TUIC v5（`tuic://uuid:password@...`）：SNI、ALPN、拥塞控制、UDP 中继模式、allow_insecure、disable_sni。
- VMess（v2rayN `vmess://base64(JSON)`）：TCP / WS / gRPC / H2，TLS、SNI、ALPN、指纹；不支持 HTTP 伪装头。
- Shadowsocks（SIP002、明文 userinfo 的 2022 加密、旧版整段 base64）：AEAD、2022-blake3 及常见流加密；插件支持 obfs-local / simple-obfs 与 v2ray-plugin（websocket）。
- 支持 SNI、指纹、ALPN、WS Host/path、gRPC serviceName、XHTTP host/path/mode、Reality public-key/short-id。
- 每份最多 200 节点，请求最大 128 KiB。错误行或未知参数直接拒绝，避免悄悄生成错误配置。
- 暂不支持 Hysteria v1、ShadowsocksR、WireGuard、远程订阅 URL、XHTTP 和其他客户端格式。不支持旧版 Clash 内核中的 VLESS。
- JSON 形式输出 YAML 1.2 配置（文件名 `.yaml`），由 Mihomo 解析。

## ACL4SSR 模板

模板以 [ACL4SSR 在线模板](https://github.com/ACL4SSR/ACL4SSR/tree/master/Clash/config) 的精简（Mini）、标准（Online）、完整（Full）三个基础版为底，由 Worker 按所选项目修改分组和规则后生成。修改方式与上游各变体文件一致，但可以自由组合：

| 项目 | 选择 | 对应上游变体 |
| --- | --- | --- |
| 规模 | 精简 / 标准 / 完整 | Mini / Online / Full |
| 选点方式 | 自动测速 / 手动选择 / 故障转移 / 多模式 | 默认 / No Auto / Fallback / Multi Mode |
| 广告拦截 | 关闭 / 标准 / 增强 | No Reject / 默认 / Adblock Plus |
| 附加分组 | 地区分组、AI 平台（完整版已自带）；Google 细分、Netflix 增强（仅完整版） | Multi Country、AI、Google、Netflix |
| 特殊优化 | Steam 优先直连 | 无，本项目自定义 |

编辑页的「订阅预览」由 `POST /api/preview` 按当前节点（无有效节点时用示例节点）实际生成配置，列出每个分组的类型、用途和成员。

与上游文件的差别：地区分组统一使用完整版的 6 个地区，且匹配更严格（英文缩写需单独成词，如 AUS 不算美国、UKR 不算韩国；台湾需匹配地名，「平台」不算）；手动选择时「🚀 节点选择」把 DIRECT 放在最后，避免默认直连；增强拦截把 EasyPrivacy 单独放进「🛡️ 隐私防护」；Google 细分保留 SteamCN 直连；故障转移和负载均衡同时加入「🐟 漏网之鱼」。No Reject、Mini Fallback、Mini Multi Mode 与上游生成结果一致，No Auto 除上述顺序外一致，测试中逐条比对。规则集不指定缓存路径，由 Mihomo 按网址 MD5 命名，避免与同一客户端里其他订阅的同名缓存文件冲突。

模板保存为 `规模.选点.拦截+附加项` 形式的字符串，例如 `full.manual.standard+steam`。旧版本保存的模板 ID（如 `full-noauto`、`mini-ai`）仍可读取，下次保存时转换为新格式。没有匹配节点的地区组会移除并清理引用。基础模板在 Worker 实例内缓存 1 小时，规则转成 Mihomo HTTP rule-providers，由客户端从官方仓库更新。节点不会发送给模板服务器。

本实现不是完整 subconverter INI 解释器，不支持任意自定义模板 URL。模板获取失败返回 502；客户端初次下载规则需要访问 GitHub。

### 特殊优化

ACL4SSR 原版没有的直连规则，可在任何规模上勾选。规则排在所有模板规则之前，不新增分组，所以无论模板里的分组怎么切换都生效；没有列出的域名仍按模板分流。

**Steam 优先直连**：Steam 登录和游戏下载优先走直连，社区、商店不受影响。

- 直连：`login.steampowered.com`、`api.steampowered.com`、`*.cm.steampowered.com`、`*.steamserver.net`（登录与连接服务器），`*.steamcontent.com`、`steampipe*.akamaized.net`、`client-update.queniuqe.com`（游戏内容与客户端更新）。
- 不处理：商店（`store.steampowered.com` 等其他子域名、`steamstatic.com`）、社区（`steamcommunity.com`、`steam-chat.com`）和创意工坊等用户内容（`steamusercontent.com`）。完整规模里它们归「🎮 游戏平台」（默认直连，想走代理时切换这个分组即可，登录和下载不受影响）；精简和标准规模里走「🚀 节点选择」。
- DIRECT 使用设备本地网络出口：仅在本地出口为中国大陆时才是国内 IP。下载地区、DNS、运营商及 Steam 调度也影响 CDN，不能保证下载落在国内。
- 只处理按域名发起的连接。Steam 客户端直接按 IP 连接的服务器和游戏联机流量不受影响。
- 网页登录时商店页面按模板分流、登录接口直连，可能出现两个出口。
- 旧版「👑 王满仓大王定制规则」（`+wmc`）自动转为本项，原来的「🎮 Steam 商店与社区」分组不再生成，商店和社区回到模板分组。
- 规则维护在 `src/tweaks.js` 的 `TWEAKS`；新增优化项时在这里加规则，并在 `public/templates.js` 的 `EXTRAS` 里加一个 `tweak: true` 的选项。

## 文件与接口

| 文件 / 路径 | 用途 |
| --- | --- |
| `public/` | HTML、CSS、浏览器 JS |
| `src/worker.js` | API、持久化、静态页面路由 |
| `src/converter.js` | 节点解析、模板转换 |
| `src/compose.js` | 按所选项目修改基础模板 |
| `migrations/` | D1 表结构 |
| `GET /api/profiles/:secret` | 读取节点、模板及版本 |
| `POST /api/preview` | 按节点和模板预览订阅分组（同源） |
| `PUT /api/profiles/:secret` | `{nodes, revision, template}`，创建 revision=0，更新使用读取到的版本 |
| `GET /:secret/sub` | 当前节点的 Mihomo 配置 |

API 不提供公开用户列表。写操作要求同源 Origin，版本不匹配返回 409。前后端在源代码与职责上分离，通过 HTTP API 通信；同源部署便于保护写入接口。

## 常见问题

**更新了节点，为什么客户端仍是旧节点？**

先确认网页显示保存成功，再在客户端主动更新原订阅。仅修改文本框不会写入数据库。订阅响应设置 `no-store`，但客户端的自动更新周期由客户端决定。

**忘记访问密钥怎么办？**

如果仍保留订阅链接，可以从其中找到访问密钥路径。没有找回账号或重置访问密钥功能，请收藏编辑地址；不要把它放进公开书签或 Issue。

**保存时提示版本冲突？**

说明同一个访问密钥已在其他页面更新。先自行保留尚未保存的修改，重新打开个人页面，合并内容后再保存。

**页面能打开，但无法保存或下载订阅？**

- `503`：检查 `DB` 绑定、数据库 ID，以及是否已执行远程迁移。
- `502`：检查 ACL4SSR 模板访问和上游格式，稍后重试。
- `400`：按页面提示检查节点协议、参数和访问密钥格式。
- `404`：确认访问密钥正确且对应节点已保存。

**部署报 10181，数据库 ID 为全零？**

同步最新代码，并将 Cloudflare Workers 项目设置中的部署命令改为 `npm run deploy`，然后重新构建。确认使用的仓库也包含 `scripts/deploy.js`。如果已有数据库，直接将其真实 ID 填入 `wrangler.jsonc`；不要删除或重建现有数据库。

**能把订阅链接分享给别人使用吗？**

当前订阅与编辑共用访问密钥，分享订阅也会授予编辑能力。当前版本没有独立的只读订阅令牌。

## 反馈与贡献

欢迎通过 [GitHub Issues](https://github.com/wangmancang520/worker-subscriptions/issues) 提交问题或功能建议。请提供复现步骤、客户端及内核版本、错误提示和预期行为。节点示例应替换服务器、UUID、密码和 Reality 公钥；不要附带真实访问密钥、完整订阅地址或 API Token。

修改转换逻辑后请运行 `npm test`。当前没有为本项目指定开源许可证；公开仓库不代表授予任意再分发或商业使用权限。第三方模板及规则遵循其上游项目的条款。

## 致谢

- [Cloudflare Workers / D1](https://developers.cloudflare.com/workers/)：服务运行与数据存储。
- [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR)：分流模板与规则列表。
- [Mihomo](https://github.com/MetaCubeX/mihomo)：配置消费端内核。

参考：[Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)、[Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)。
