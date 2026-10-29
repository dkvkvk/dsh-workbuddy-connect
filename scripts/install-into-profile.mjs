/**
 * 把本仓库以 link: 方式装进 DSH desktop profile，并确保 bundles 里有这个包名。
 *
 * 用法：
 *   node scripts/install-into-profile.mjs                 # 默认 desktop profile
 *   node scripts/install-into-profile.mjs --dry-run       # 只看会改什么
 *   node scripts/install-into-profile.mjs <profileDir>
 *
 * 做的事：
 *   1. 备份 <profile>/package.json 与 pnpm-lock.yaml（带时间戳）
 *   2. dependencies["dsh-workbuddy-connect"] = "link:<本仓库绝对路径>"
 *   3. dsh.profile.bundles 里补上包名 dsh-workbuddy-connect（不是 insert id llm-workbuddy）
 *   4. 用宿主自带 pnpm 在 profile 目录跑 install
 *
 * 注意：desktop profile 由桌面 App 独占，CLI 的 `dsh plugin --profile desktop add` 会被拒，
 * 所以这里直接改文件。装完必须完全退出并重启 DSH（宿主按模块路径缓存插件）。
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

const raw = fs.readFileSync(pkgPath, "utf8");
const j = JSON.parse(raw);
j.dependencies ||= {};
j.dsh ||= {};
j.dsh.profile ||= {};
const bundles = (j.dsh.profile.bundles ||= []);

const linkTarget = "link:" + repoRoot;
const before = j.dependencies[PKG];
j.dependencies[PKG] = linkTarget;
if (!bundles.includes(PKG)) {
  const anchor = bundles.indexOf("dsh-buddy-checkin");
  if (anchor >= 0) bundles.splice(anchor + 1, 0, PKG);
  else bundles.push(PKG);
}

console.log(`repo         : ${repoRoot}`);
console.log(`profile      : ${profileDir}`);
console.log(`dependencies : ${PKG}: ${before ?? "(新增)"} -> ${linkTarget}`);
console.log(`bundles      : ${bundles.length} 项，包含 ${PKG}: ${bundles.includes(PKG)}`);

if (dryRun) {
  console.log("--dry-run：不写文件、不跑 pnpm。");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.copyFileSync(pkgPath, path.join(profileDir, `package.json.bak-install-${stamp}`));
if (fs.existsSync(lockPath)) fs.copyFileSync(lockPath, path.join(profileDir, `pnpm-lock.yaml.bak-install-${stamp}`));
fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log(`✓ 已写入 package.json（备份后缀 .bak-install-${stamp}）`);

const pnpmCandidates = [
  "D:\\DeepSeek Harness\\resources\\runtime\\primary-runtime\\dependencies\\pnpm\\bin\\pnpm.cjs",
  "D:\\DeepSeek Harness\\resources\\runtime\\pnpm\\bin\\pnpm.cjs",
  path.join(process.env.APPDATA || "", "npm", "node_modules", "pnpm", "bin", "pnpm.cjs"),
];
const pnpm = pnpmCandidates.find((p) => p && fs.existsSync(p));

let r;
if (pnpm) {
  console.log(`$ node ${pnpm} install  (cwd=${profileDir})`);
  r = spawnSync(process.execPath, [pnpm, "install"], { cwd: profileDir, stdio: "inherit" });
} else {
  console.log("$ pnpm install  (PATH 上的 pnpm)");
  r = spawnSync("pnpm", ["install"], { cwd: profileDir, stdio: "inherit", shell: true });
}

if (r.status !== 0) {
  console.error(`✗ pnpm install 失败（exit=${r.status}）。回滚：把 dependencies["${PKG}"] 改回 ${before ?? "原值"} 再 pnpm install。`);
  process.exit(1);
}

console.log("");
console.log("✓ 装好了。接下来：");
console.log("  1) 完全退出 DeepSeek Harness 再打开（插件 host 半边只在启动时加载）");
console.log("  2) 验证：GET /plugins/dsh-workbuddy-connect/status 应为 200 且 signed-in");
console.log(`  3) 静态体检：node "${path.join(repoRoot, "scripts", "verify-import.mjs")}" "${profileDir}"`);
