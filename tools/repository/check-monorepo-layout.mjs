import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const clientRequirements = new Map([
  [
    "BNBU-Sports-Android-master",
    [
      "settings.gradle.kts",
      "app/build.gradle.kts",
      "app/src/main/AndroidManifest.xml",
    ],
  ],
  [
    "BNBU-Sports-Web-new",
    [
      "package.json",
      "package-lock.json",
      "frontend/index.html",
      "frontend/preview-server.cjs",
      "portal-teacher-admin/package.json",
    ],
  ],
]);
const generatedDirectoryNames = new Set([
  "node_modules",
  ".gradle",
  ".kotlin",
  "build",
  "dist",
  ".next",
  "out",
  "coverage",
  ".idea",
]);

const failures = [];
const nestedGitPaths = [];
const presentClientPaths = [...clientRequirements.keys()].filter((clientPath) =>
  existsSync(join(repositoryRoot, clientPath)),
);
const isBackendPublicationMirror = presentClientPaths.length === 0;

function git(args, cwd = repositoryRoot) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function scanForNestedGit(directory, isRoot = false) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (isRoot && entry.name === ".git") {
      continue;
    }
    if (entry.name === ".git") {
      nestedGitPaths.push(relative(repositoryRoot, absolutePath));
      continue;
    }
    if (entry.isDirectory() && !generatedDirectoryNames.has(entry.name)) {
      scanForNestedGit(absolutePath);
    }
  }
}

let stagedIndex = "";
try {
  stagedIndex = git(["ls-files", "--stage"]);
} catch (error) {
  failures.push(`cannot inspect parent index: ${error.message}`);
}

const gitlinks = stagedIndex
  .split(/\r?\n/u)
  .filter((line) => line.startsWith("160000 "));
if (gitlinks.length > 0) {
  failures.push(`mode 160000 gitlinks remain: ${gitlinks.length}`);
}

const gitmodulesPath = join(repositoryRoot, ".gitmodules");
if (existsSync(gitmodulesPath)) {
  const gitmodules = readFileSync(gitmodulesPath, "utf8");
  for (const clientPath of clientRequirements.keys()) {
    if (gitmodules.includes(clientPath)) {
      failures.push(`.gitmodules still references ${clientPath}`);
    }
  }
}

for (const [clientPath, requiredFiles] of isBackendPublicationMirror
  ? []
  : clientRequirements) {
  const absoluteClientPath = join(repositoryRoot, clientPath);
  if (!existsSync(absoluteClientPath)) {
    failures.push(`client directory is missing: ${clientPath}`);
    continue;
  }
  for (const requiredFile of requiredFiles) {
    if (!existsSync(join(absoluteClientPath, requiredFile))) {
      failures.push(
        `required client file is missing: ${clientPath}/${requiredFile}`,
      );
    }
  }
  try {
    const clientTopLevel = resolve(
      git(["rev-parse", "--show-toplevel"], absoluteClientPath),
    );
    if (clientTopLevel.toLowerCase() !== repositoryRoot.toLowerCase()) {
      failures.push(
        `${clientPath} resolves to nested Git root ${clientTopLevel}`,
      );
    }
  } catch (error) {
    failures.push(
      `cannot resolve Git root for ${clientPath}: ${error.message}`,
    );
  }
}

try {
  scanForNestedGit(repositoryRoot, true);
} catch (error) {
  failures.push(`cannot scan for nested Git metadata: ${error.message}`);
}
if (nestedGitPaths.length > 0) {
  failures.push(`nested .git paths found: ${nestedGitPaths.join(", ")}`);
}

if (failures.length > 0) {
  console.error("Monorepo layout: FAIL");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `${isBackendPublicationMirror ? "Backend publication" : "Monorepo"} layout: PASS (clients=${presentClientPaths.length}, gitlinks=${gitlinks.length}, nestedGit=${nestedGitPaths.length})`,
);
