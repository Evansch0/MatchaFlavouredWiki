import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("builds a GitHub Pages-ready static site", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /Matcha Flavoured Wiki/i);
  assert.match(html, /id="root"/);
  assert.match(html, /\/MatchaFlavouredWiki\/assets\//);
  assert.doesNotMatch(html, /dist\/server|_next\//);

  await Promise.all([
    access(new URL("../dist/matcha/pack.png", import.meta.url)),
    access(
      new URL(
        "../dist/minecraft/assets/minecraft/textures/gui/container/crafting_table.png",
        import.meta.url,
      ),
    ),
  ]);
});

test("generated data preserves secrets, changelogs, and texture links", async () => {
  const raw = await readFile(
    new URL("../app/data/wiki-data.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);

  assert.equal(data.recipes.length, data.stats.recipeCount);
  assert.ok(data.recipes.length >= 1000);
  assert.equal(data.items.length, data.stats.itemCount);
  assert.ok(data.items.length >= 1000);
  assert.ok(data.release.versionId);
  assert.ok(data.release.sha1);
  assert.ok(data.release.changelog.length > 0);
  assert.ok(
    data.release.changelog.every(
      (entry) => entry.versionId && Array.isArray(entry.blocks),
    ),
  );
  assert.ok(data.items.every((item) => item.texture));
  assert.ok(
    data.recipes.every((recipe) =>
      data.items.some((item) => item.key === recipe.result.key),
    ),
  );

  const secrets = data.recipes.filter((recipe) => recipe.secret);
  const pendingReview = data.recipes.filter((recipe) => recipe.reviewPending);
  assert.ok(secrets.length >= 6);
  assert.equal(pendingReview.length, data.stats.reviewPendingRecipeCount);
  assert.equal(pendingReview.length, 0);
  assert.ok(
    secrets.every(
      (recipe) =>
        recipe.ingredients.length === 0 &&
        recipe.grid.length === 0 &&
        recipe.ingredientKeys.length === 0,
    ),
  );

  const obscuredFish = data.items.filter((item) => item.obscured);
  assert.ok(obscuredFish.length >= 21);
  assert.ok(obscuredFish.every((item) => item.sga.length > 0));
  assert.equal(
    new Set(obscuredFish.map((item) => item.texture)).size,
    obscuredFish.length,
  );
});

test("source keeps the recipe UX, exact slots, and low-compute deployment", async () => {
  const [packageJson, wikiApp, globalCss, updater, devUpdater, workflow] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/WikiApp.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(
        new URL("../scripts/update-matcha.mjs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../scripts/dev-with-updates.mjs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../.github/workflows/pages.yml", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(wikiApp, /label="RECOMMENDATION"/);
  assert.match(wikiApp, /Recommended Setup/);
  assert.match(wikiApp, /label: "The Nether"/);
  assert.match(wikiApp, /recipe-catalogue/);
  assert.match(wikiApp, /Find a recipe in this station/);
  assert.match(wikiApp, /function ChangelogPage/);
  assert.match(wikiApp, /import\.meta\.env\.BASE_URL/);
  assert.match(wikiApp, /ATTRIBUTIONS\.md/);
  assert.doesNotMatch(wikiApp, /recipe-selection/);

  assert.match(updater, /include_changelog=true/);
  assert.match(updater, /failed its SHA-1 check/);
  assert.match(updater, /reviewPendingRecipeCount/);
  assert.match(updater, /check-exit-code/);
  assert.match(devUpdater, /MATCHA_UPDATE_INTERVAL_MINUTES/);
  assert.match(packageJson, /scripts\/dev-with-updates\.mjs/);

  assert.match(globalCss, /\.mc-stonecutting \.mc-output[\s\S]*left: 286px/);
  assert.match(globalCss, /\.mc-smithing \.mc-output[\s\S]*left: 196px/);
  assert.match(globalCss, /\.portal-card small[\s\S]*min-height: 2\.9em/);

  assert.match(workflow, /cron: "17 6,18 \* \* \*"/);
  assert.match(workflow, /steps\.gate\.outputs\.publish == 'true'/);
  assert.match(workflow, /actions\/deploy-pages@v4/);

  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
