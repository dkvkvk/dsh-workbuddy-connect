# Changelog

本仓库从上游 `dsh-workbuddy-connect@0.7.9`（npm，2026-10-19 发布）分叉而来，版本号采用 `<上游版本>-r<内核线>.<修订>`。

## 0.7.9-r3.1 — 2026-10-29

首个自维护版本，目标是让上游 0.7.9 在 **DSH `0.2.1-rc.3`** 上直接可用。

**改动**

- `peerDependencies`：`@deepseek-ai/dsh-{llm,llm-pi-ai,home-paths,settings,attachment,host-webserver}` 由精确 `0.2.1-rc.2` 放宽为 `^0.2.1-rc.2`
  - 依据：`^0.2.1-rc.2` 在 semver 下接受同 tuple 的预发布（`0.2.1-rc.3`、`0.2.1-rc.4`），但不接受 `0.2.2-rc.x`，正好覆盖当前内核线
  - 效果：不再依赖 `~/.dsh/profiles/desktop/compatibility.json` 里的 `"dsh-workbuddy-connect@0.7.9": ["0.2.1-rc.3"]` 白名单
- `package.json`：`version` → `0.7.9-r3.1`，`private: true`（防止误发到 npm，名字属于上游），`repository` / `homepage` 指向本仓库
- 新增：自维护 `README.md`、`CHANGELOG.md`、`scripts/verify-import.mjs`（静态体检）、`scripts/install-into-profile.mjs`（可重复安装）
- 上游文档保留为 `UPSTREAM-README.md` / `UPSTREAM-README.en.md`

**未改动**

- `lib/`（构建产物）与 `cordis.patch.yml` 与 npm 上的 0.7.9 完全一致

**验证记录**

- `node --input-type=module -e "await import('dsh-workbuddy-connect')"`（cwd = `~/.dsh/profiles/desktop`）→ 导入成功，导出齐全
- 隔离实例（独立 `DSH_HOME` + junction，宿主 `0.2.1-rc.3`，端口 59941）：
  `GET /plugins/dsh-workbuddy-connect/status` → `200`，`{"status":"signed-in","domain":"www.workbuddy.cn","catalog":{"source":"live"},"models":[...]}`
- 主实例修复：desktop profile 的 `dsh.profile.bundles` 曾丢失 `dsh-workbuddy-connect` 导致插件未被加载（路由 404），补回后生效
