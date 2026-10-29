# dsh-workbuddy-connect（自维护分支）

把 **WorkBuddy 桌面 App** 里已登录的模型接进 **DeepSeek Harness**（DSH）的插件，零配置、复用 App 的登录态。
本仓库是 [上游 `dsh-workbuddy-connect@0.7.9`](https://www.npmjs.com/package/dsh-workbuddy-connect)（作者 Corrine Hu，MIT）的 **自维护构建**，由我们自己托管，用于跟踪 DSH 内核的预发布线。

- 当前版本：**`0.7.9-r3.1`**
- 适配目标：**DSH 内核 `0.2.1-rc.3`**（peer 范围 `^0.2.1-rc.2`，同 tuple 的 rc.3 / rc.4 都放行）
- 上游源码：未公开（上游仓库匿名 404，npm 包里只有构建产物 `lib/` + 类型声明，无 `src`、无 sourcemap）
- 上游文档：见 [`UPSTREAM-README.md`](./UPSTREAM-README.md) / [`UPSTREAM-README.en.md`](./UPSTREAM-README.en.md)

## 与上游 0.7.9 的差异

| 改动 | 位置 | 原因 |
|---|---|---|
| `peerDependencies` 的 6 个 `@deepseek-ai/*` 从 **精确 `0.2.1-rc.2`** 改为 **`^0.2.1-rc.2`** | `package.json` | 上游只认 rc.2；宿主已到 rc.3，靠 profile 里的 `compatibility.json` 白名单才勉强加载。改成 caret 后 rc.3 / rc.4 都直接通过兼容闸门，不再依赖白名单 |
| `version` → `0.7.9-r3.1`、`private: true` | `package.json` | 与上游版本区分；`private` 防止误发到 npm（`dsh-workbuddy-connect` 这个名字属于上游） |
| `repository` / `homepage` → 本仓库 | `package.json` | 自维护 |
| 新增自维护 README / CHANGELOG / 验证与安装脚本 | 仓库根、`scripts/` | 记录差异、快速体检、可重复安装 |
| 删掉上游的 `scripts`（`prepack: npm run build` / `build: tsdown` 等）与 `devDependencies` 构建链 | `package.json` | 本仓库直接维护构建产物，没有 `src`，`pnpm pack` 时 `prepack` 会因缺 `tsdown` 而失败 |

`lib/` **一行未改**，与 npm 上的 0.7.9 构建产物逐字节一致；将来的行为改动也会先记进 [`CHANGELOG.md`](./CHANGELOG.md)。

## 安装到 desktop profile

DSH 桌面端的 `desktop` profile 由 App 独占，CLI 的 `dsh plugin --profile desktop add` 会被拒，所以走「打包成 tarball → 用宿主自带 pnpm 装」：

```bat
node scripts\install-into-profile.mjs
```

脚本做的事：`pnpm pack` 出 `dist/dsh-workbuddy-connect-<version>.tgz` → 备份 `package.json` / `pnpm-lock.yaml` → 把 `dependencies["dsh-workbuddy-connect"]` 写成 `file:<tgz 绝对路径>` 并补进 `dsh.profile.bundles`（写**包名**，不是 `insert.id` `llm-workbuddy`）→ 在 profile 目录跑 pnpm install → 跑静态体检。

手动版等价步骤：

1. `pnpm pack --pack-destination dist`（在仓库根）
2. `~/.dsh/profiles/desktop/package.json`：`dependencies["dsh-workbuddy-connect"] = "file:C:/.../dist/dsh-workbuddy-connect-0.7.9-r3.1.tgz"`，`dsh.profile.bundles` 里包含 `dsh-workbuddy-connect`
3. `node "D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs" install`（在 profile 目录）
4. **完全退出 DSH 再打开** —— 宿主按模块路径缓存插件，热重载换不掉 host 半边。

> **不要用 `link:`（2026-10-29 实测踩坑）**：`link:` 只把 `node_modules/<pkg>` 指到仓库，Node 解析这个包里的裸导入（`@deepseek-ai/dsh-llm` 等）时从**真实路径**向上找，仓库不在 profile 的 node_modules 树里 → 解析不到宿主 peer → 宿主静默跳过该 bundle，`/plugins/dsh-workbuddy-connect/status` 直接 **404**，日志里也不报错（`--dump-config` 照样显示插件在组合树里）。tarball 安装会把文件真正解到 `node_modules/.pnpm`/`node_modules` 下，上溯能命中 profile 与上一级的 `@deepseek-ai` 树。

> 回滚：把 `dependencies["dsh-workbuddy-connect"]` 改回 `"0.7.9"` 再 `pnpm install`（回到 npm 上游版），或删掉这一行 + 从 bundles 移除。

> profile 里的依赖写的是 `file:` 到仓库的 `dist/*.tgz`，所以 **`dist/` 里的 tgz 会随仓库一起提交**（约 160 KiB）。这样 profile 的 spec 永远可解析；改代码后跑一次安装脚本重新打包即可。**删掉 `dist/` 会让后续 `pnpm install` 报「tarball 不存在」**。

## 验证

**静态体检**（在 profile 目录跑，验证本包能否被宿主同版本的 `@deepseek-ai` 树 import）：

```bat
node <repo>\scripts\verify-import.mjs "C:\Users\20646\.dsh\profiles\desktop"
```

**运行时体检**（宿主已加载时会注册一个不鉴权的只读路由）：

```
GET http://127.0.0.1:<DSH 端口>/plugins/dsh-workbuddy-connect/status
```

- `200` + `"status":"signed-in"` + `models[...]` → 正常
- `404` → **插件根本没被加载**（先查 `dsh.profile.bundles` 里有没有这个包名，这是本机 2026-10-29 踩过的坑）

**隔离实例验证**（不打扰正在跑的宿主）：把 profile 配置复制到独立 `DSH_HOME`，`node_modules` 用 `mklink /J` 链真实的，然后

```bat
set DSH_HOME=C:\Users\20646\.dsh-diag-wb
"D:\DeepSeek Harness\DeepSeek Harness.exe" --expose-internals ^
  "D:\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" ^
  --profile diag --no-open --port 59941
```

## 内核升级时的检查清单

1. 读 `package.json` 的 `engines` 与 `peerDependencies`：内核主 tuple 变了（如 `0.2.1` → `0.2.2`），peer 范围要同步放宽/收紧（`^0.2.1-rc.2` 不覆盖 `0.2.2-rc.x`）。
2. 用 `scripts/verify-import.mjs` 看有没有缺导出（典型：`resolveImageAttachmentAccess`、`resolveRetryPolicy`、`PiAiAdapter`）。
3. 起隔离实例看 `/plugins/dsh-workbuddy-connect/status` 是否 200。
4. 上游若有新版（`npm view dsh-workbuddy-connect dist-tags`），先把上游资产重新 vendor 进来，再把本仓库的差异重新贴回去 —— 差异只有 `package.json` 两个字段，成本很低。

## 依赖的宿主包

`@deepseek-ai/dsh-llm`、`dsh-llm-pi-ai`、`dsh-home-paths`、`dsh-settings`、`dsh-attachment`、`dsh-host-webserver`、`cordis`、`schemastery`、`react`（均为 peer，由宿主提供）。

## 许可

上游代码为 MIT，版权归 **Copyright (c) 2026 Corrine Hu**，见 [`LICENSE`](./LICENSE)；本仓库保留原版权声明，改动部分同样以 MIT 发布。
本项目与腾讯 / WorkBuddy / DeepSeek 均无关联，仅供个人学习研究使用。
