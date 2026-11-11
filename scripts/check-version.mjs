import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const own = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const upstream = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.resolve("@ai-hero/sandcastle"))), "../package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const versions = [own.version, own.dependencies["@ai-hero/sandcastle"], upstream.version,
  lock.version, lock.packages[""].version, lock.packages[""].dependencies["@ai-hero/sandcastle"],
  lock.packages["node_modules/@ai-hero/sandcastle"].version];
if (!versions.every(version => version === upstream.version)) {
  throw new Error("Package, exact upstream dependency, installed upstream, and lockfile versions must match.");
}
