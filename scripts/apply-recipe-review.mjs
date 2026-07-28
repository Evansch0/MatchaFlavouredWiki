import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const reviewFile = path.join(projectRoot, "app/data/recipe-review.json");
const manifestFile = path.join(projectRoot, "app/data/recipe-visibility.json");
const wikiDataFile = path.join(projectRoot, "app/data/wiki-data.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function packRootFrom(candidate) {
  if (
    fs.existsSync(path.join(candidate, "data")) &&
    fs.existsSync(path.join(candidate, "assets"))
  ) {
    return candidate;
  }
  const nested = fs
    .readdirSync(candidate, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(candidate, entry.name))
    .find(
      (directory) =>
        fs.existsSync(path.join(directory, "data")) &&
        fs.existsSync(path.join(directory, "assets")),
    );
  if (!nested) throw new Error("No datapack root was found.");
  return nested;
}

function recipeId(packRoot, file) {
  const relative = path.relative(packRoot, file).replaceAll(path.sep, "/");
  const [, namespace, , ...parts] = relative.split("/");
  return `${namespace}:${parts.join("/").replace(/\.json$/, "")}`;
}

const review = readJson(reviewFile);
const wikiData = readJson(wikiDataFile);
const manifest = readJson(manifestFile);
if (review.versionId !== wikiData.release.versionId) {
  throw new Error("The recipe review does not match the current release.");
}

const publicIds = new Set(review.publicRecipeIds || []);
const secretIds = new Set(review.secretRecipeIds || []);
const reviewedIds = new Set([...publicIds, ...secretIds]);
const pendingIds = wikiData.recipes
  .filter((recipe) => recipe.reviewPending)
  .map((recipe) => recipe.id);
const missing = pendingIds.filter((id) => !reviewedIds.has(id));
const unexpected = [...reviewedIds].filter((id) => !pendingIds.includes(id));
if (missing.length || unexpected.length) {
  throw new Error(
    `Review mismatch: ${missing.length} missing, ` +
      `${unexpected.length} unexpected.`,
  );
}

const packRoot = packRootFrom(
  path.resolve(
    process.argv[2] ||
      path.join(
        projectRoot,
        ".matcha-cache/releases",
        review.versionId,
        "unpacked",
      ),
  ),
);
const recipeFiles = new Map(
  walk(path.join(packRoot, "data"))
    .filter(
      (file) =>
        file.endsWith(".json") && file.split(path.sep).includes("recipe"),
    )
    .map((file) => [recipeId(packRoot, file), file]),
);

for (const id of reviewedIds) {
  const file = recipeFiles.get(id);
  if (!file) throw new Error(`Reviewed recipe is missing: ${id}`);
  manifest.recipes[id] = {
    sha1: crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex"),
    visibility: secretIds.has(id) ? "secret" : "public",
  };
}
manifest.lastReviewedVersion = review.version;
manifest.lastReviewedVersionId = review.versionId;
manifest.reviewedAt = new Date().toISOString();

const temporary = `${manifestFile}.next`;
fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temporary, manifestFile);
console.log(
  `Approved ${publicIds.size} public and ${secretIds.size} secret recipes.`,
);
