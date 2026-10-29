/**
 * 静态体检：从某个 DSH profile 目录出发，解析已安装的 dsh-workbuddy-connect，
 * 导入它的 host 半边，确认能被宿主同版本的 @deepseek-ai 树满足。
 *
 * 用法：
 *   node scripts/verify-import.mjs [profileDir]
 *   node scripts/verify-import.mjs "C:\Users\20646\.dsh\profiles\desktop"
 *
 * profileDir 省略时按 $DSH_HOME/profiles/desktop，再回退到 ~/.dsh/profiles/desktop。
 */
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const pkgName = "dsh-workbuddy-connect";

function defaultProfileDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  return path.join(home, "profiles", "desktop");
}

const profileDir = path.resolve(process.argv[2] || defaultProfileDir());
if (!fs.existsSync(path.join(profileDir, "package.json"))) {
  console.error(`✗ profile 目录不像 DSH profile：${profileDir}`);
  process.exit(2);
}

let installedManifest;
try {
  const req = createRequire(pathToFileURL(path.join(profileDir, "package.json")));
  installedManifest = req.resolve(`${pkgName}/package.json`);
} catch (e) {
  console.error(`✗ 在 ${profileDir} 里解析不到 ${pkgName}：${e.message}`);
  console.error("  先确认 dependencies 里有它、node_modules 已安装（pnpm install）。");
  process.exit(2);
}

const pkgDir = path.dirname(installedManifest);
const manifest = JSON.parse(fs.readFileSync(installedManifest, "utf8"));
console.log(`profile      : ${profileDir}`);
console.log(`installed at : ${pkgDir}`);
console.log(`version      : ${manifest.version}`);

// 兼容闸门自查：peer 范围是否覆盖宿主内核（宿主版本由调用方自己比对，这里只打印范围）
const peers = manifest.peerDependencies || {};
const hostPeers = Object.entries(peers).filter(([k]) => k.startsWith("@deepseek-ai/"));
console.log("peer ranges  :");
for (const [k, v] of hostPeers) console.log(`  ${k} -> ${v}`);

try {
  const mod = await import(pathToFileURL(path.join(pkgDir, "lib", "index.js")).href);
  const keys = Object.keys(mod).sort();
  const must = ["apply", "inject", "name", "createWorkBuddyAdapter", "WORKBUDDY_PROVIDER"];
  const missing = must.filter((k) => !keys.includes(k));
  console.log(`exports      : ${keys.length} 个`);
  if (missing.length) {
    console.error(`✗ host 半边缺少关键导出：${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("✓ import 成功，关键导出齐全（apply / inject / name / createWorkBuddyAdapter / WORKBUDDY_PROVIDER）");
  console.log("  下一步：重启 DSH 后打开 /plugins/dsh-workbuddy-connect/status，应为 200 且 signed-in");
} catch (e) {
  console.error(`✗ import 失败：${e.code || e.name} | ${e.message}`);
  console.error("  典型原因：宿主 @deepseek-ai/* 树版本与插件不匹配（缺导出），或 providers/node_modules 落到了旧内核树。");
  process.exit(1);
}
