/**
 * 把本仓库打包成 tarball 并装进 DSH profile。
 *
 * 用法：
 *   node scripts/install-into-profile.mjs                 # 默认 desktop profile
 *   node scripts/install-into-profile.mjs --dry-run
 *   node scripts/install-into-profile.mjs <profileDir>
 *
 * 为什么不用 link:（2026-10-29 实测踩坑）：
 *   pnpm 的 `link:` 只是把 node_modules/<pkg> 指向本仓库，Node 解析这个包里的裸导入
 *   （`@deepseek-ai/dsh-llm` 等）时会从**真实路径**逐级上溯，本仓库不在 profile 的
 *   node_modules 树里，所以解析不到宿主提供的 peer → 宿主静默 skip 该 bundle，
 *   /plugins/dsh-workbuddy-connect/status 直接 404。
 *   用 tarball（file:）安装时 pnpm 会把文件真正解到 node_modules/.pnpm 下，
 *   上溯能命中 profile 与上面一级的 @deepseek-ai 树，导入才成立。
 *
 * 做的事：
 *   1. pnpm pack 出 tgz（进 dist/，已被 .gitignore 忽略）
 *   2. 备份 <profile>/package.json 与 pnpm-lock.yaml（带时间戳）
 *   3. dependencies["dsh-workbuddy-connect"] = "file:<tgz 绝对路径>"
 *   4. dsh.profile.bundles 里补包名 dsh-workbuddy-connect（不是 insert id llm-workbuddy）
 *   5. 用宿主自带 pnpm 在 profile 目录 install
 *   6. 跑一遍静态体检
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PKG = "dsh-workbuddy-connect";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicit = args.find((a) => !a.startsWith("--"));

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.resolve(explicit || path.join(dshHome, "profiles", "desktop"));
const pkgPath = path.join(profileDir, "package.json");
const lockPath = path.join(profileDir, "pnpm-lock.yaml");

if (!fs.existsSync(pkgPath)) {
  console.error(`✗ 找不到 ${pkgPath}`);
  process.exit(2);
}

const pnpmCandidates = [
  "D:\\DeepSeek Harness\\resources\\runtime\\primary-runtime\\dependencies\\pnpm\\bin\\pnpm.cjs",
  "D:\\DeepSeek Harness\\resources\\runtime\\pnpm\\bin\\pnpm.cjs",
  path.join(process.env.APPDATA || "", "npm", "node_modules", "pnpm", "bin", "pnpm.cjs"),
];
const pnpm = pnpmCandidates.find((p) => p && fs.existsSync(p));

function runPnpm(argv, opts = {}) {
  if (pnpm) return spawnSync(process.execPath, [pnpm, ...argv], { stdio: "inherit", ...opts });
  return spawnSync("pnpm", argv, { stdio: "inherit", shell: true, ...opts });
}

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const distDir = path.join(repoRoot, "dist");
const tgzName = `${PKG}-${manifest.version}.tgz`;
const tgzPath = path.join(distDir, tgzName);

console.log(`repo         : ${repoRoot}  (v${manifest.version})`);
console.log(`profile      : ${profileDir}`);
console.log(`tarball      : ${tgzPath}`);

if (dryRun) {
  console.log("--dry-run：不打包、不写文件、不跑 pnpm。");
  process.exit(0);
}

fs.mkdirSync(distDir, { recursive: true });
for (const f of fs.readdirSync(distDir)) if (f.endsWith(".tgz")) fs.rmSync(path.join(distDir, f));
const packed = runPnpm(["pack", "--pack-destination", distDir], { cwd: repoRoot });
if (packed.status !== 0 || !fs.existsSync(tgzPath)) {
  console.error(`✗ pnpm pack 失败或产物不在预期路径（exit=${packed.status}）`);
  process.exit(1);
}
console.log(`✓ packed ${(fs.statSync(tgzPath).size / 1024).toFixed(0)} KiB`);

const j = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
j.dependencies ||= {};
j.dsh ||= {};
j.dsh.profile ||= {};
const bundles = (j.dsh.profile.bundles ||= []);
const before = j.dependencies[PKG];
j.dependencies[PKG] = "file:" + tgzPath.replace(/\\/g, "/");
if (!bundles.includes(PKG)) {
  const anchor = bundles.indexOf("dsh-buddy-checkin");
  if (anchor >= 0) bundles.splice(anchor + 1, 0, PKG);
  else bundles.push(PKG);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.copyFileSync(pkgPath, path.join(profileDir, `package.json.bak-install-${stamp}`));
if (fs.existsSync(lockPath)) fs.copyFileSync(lockPath, path.join(profileDir, `pnpm-lock.yaml.bak-install-${stamp}`));
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log(`dependencies : ${PKG}: ${before ?? "(新增)"} -> file:${tgzPath}`);
console.log(`✓ package.json 已写入（备份 .bak-install-${stamp}）`);

const inst = runPnpm(["install"], { cwd: profileDir });
if (inst.status !== 0) {
  console.error(`✗ pnpm install 失败（exit=${inst.status}）`);
  console.error(`  回滚：dependencies["${PKG}"] 改回 ${before ?? "原值"}，再 pnpm install`);
  process.exit(1);
}

const verify = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "verify-import.mjs"), profileDir], {
  stdio: "inherit",
});
console.log("");
console.log("✓ 装好了。接下来：");
console.log("  1) 完全退出 DeepSeek Harness 再打开（插件 host 半边只在启动时加载）");
console.log("  2) 验证：GET /plugins/dsh-workbuddy-connect/status 应为 200 且 signed-in");
if (verify.status !== 0) {
  console.error("⚠ 静态体检未通过，先别重启，按上面报错排查。");
  process.exit(1);
}
