# Changelog

本仓库从上游 `dsh-workbuddy-connect@0.7.9`（npm，2026-10-19 发布）分叉而来，版本号采用 `<上游版本>-r<内核线>.<修订>`。

## 0.7.9-r3.1 — 2026-10-29

首个自维护版本，目标是让上游 0.7.9 在 **DSH `0.2.1-rc.3`** 上直接可用。

**改动**

- `peerDependencies`：`@deepseek-ai/dsh-{llm,llm-pi-ai,home-paths,settings,attachment,host-webserver}` 由精确 `0.2.1-rc.2` 放宽为 `^0.2.1-rc.2`
  - 依据：`^0.2.1-rc.2` 在 semver 下接受同 tuple 的预发布（`0.2.1-rc.3`、`0.2.1-rc.4`），但不接受 `0.2.2-rc.x`，正好覆盖当前内核线
  - 效果：不再依赖 `~/.dsh/profiles/desktop/compatibility.json` 里的 `"dsh-workbuddy-connect@0.7.9": ["0.2.1-rc.3"]` 白名单
- `package.json`：`version` → `0.7.9-r3.1`，`private: true`（防止误发到 npm，名字属于上游），`repository` / `homepage` 指向本仓库
- `package.json`：删掉上游的 `scripts`（`prepack: npm run build`、`build: tsdown` 等）与 `devDependencies`（构建链 + 钉死 `0.2.1-rc.2` 的 dev peer），改成我们自己的 `verify` / `install-profile`；否则 `pnpm pack` 会因缺 `tsdown` 直接失败
- `package.json`：补 `files` 白名单（`lib`、`cordis.patch.yml`、`LICENSE`、`THIRD_PARTY_NOTICES.txt`、`README.md`、`CHANGELOG.md`、`scripts`）
- 新增：自维护 `README.md`、`CHANGELOG.md`、`scripts/verify-import.mjs`（静态体检）、`scripts/install-into-profile.mjs`（打包 tarball + 装机，可重复执行）
- 上游文档保留为 `UPSTREAM-README.md` / `UPSTREAM-README.en.md`

**安装方式的坑（重要）**

- `link:` 装法会让宿主静默跳过插件：Node 从仓库真实路径上溯找不到 `@deepseek-ai/*` peer → 路由 404、日志无报错、`--dump-config` 又看不出问题
- 正确做法是 `pnpm pack` 出 tarball 再 `file:` 安装，文件落到 `node_modules` / `.pnpm` 下才能解析宿主 peer
- 另外：把 `dependencies` 从 `link:` 改成 `file:` 时，pnpm 会沿用 lockfile 里旧的 `version: link:...` 解析，必须先删掉这条依赖跑一次 `pnpm install` 再重新加，否则 pnpm 依然生成软链

**未改动**

- `lib/`（构建产物）与 `cordis.patch.yml` 与 npm 上的 0.7.9 完全一致

**验证记录**

- `node --input-type=module -e "await import('dsh-workbuddy-connect')"`（cwd = `~/.dsh/profiles/desktop`）→ 导入成功，导出齐全
- 隔离实例（独立 `DSH_HOME` + junction，宿主 `0.2.1-rc.3`，端口 59941）：
  `GET /plugins/dsh-workbuddy-connect/status` → `200`，`{"status":"signed-in","domain":"www.workbuddy.cn","catalog":{"source":"live"},"models":[...]}`
- 主实例修复：desktop profile 的 `dsh.profile.bundles` 曾丢失 `dsh-workbuddy-connect` 导致插件未被加载（路由 404），补回后生效
- 用 `file:` tarball 装进 `~/.dsh/profiles/desktop`（`0.7.9-r3.1`）后复验隔离实例：
  `GET /plugins/dsh-workbuddy-connect/status` → `200`，`status=signed-in`，`models=16`，`domain=www.workbuddy.cn`
- 同一 profile 里其它 bundle 无新增 "did not activate"（对照 `dsh-clinepass-guard` 路由 200）
