import crypto from "node:crypto";

export function recipeContentSha1(recipe) {
  return crypto.createHash("sha1").update(JSON.stringify(recipe)).digest("hex");
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function normalizeIngredient(ingredient) {
  if (!Array.isArray(ingredient)) return sortObjectKeys(ingredient);
  return ingredient
    .map(sortObjectKeys)
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function normalizeShapedRecipe(recipe) {
  if (!Array.isArray(recipe.pattern) || !recipe.key) return recipe;

  const grid = recipe.pattern.map((row) =>
    [...row].map((symbol) =>
      symbol === " " ? null : normalizeIngredient(recipe.key[symbol] ?? null),
    ),
  );

  while (grid.length && grid[0].every((cell) => cell === null)) grid.shift();
  while (grid.length && grid.at(-1).every((cell) => cell === null)) grid.pop();
  while (grid.length && grid.every((row) => row[0] === null)) {
    grid.forEach((row) => row.shift());
  }
  while (grid.length && grid.every((row) => row.at(-1) === null)) {
    grid.forEach((row) => row.pop());
  }

  delete recipe.pattern;
  delete recipe.key;
  recipe.semanticGrid = grid;
  return recipe;
}

export function recipeSemanticSha1(recipe) {
  const normalized = structuredClone(recipe);

  // These fields only control recipe-book presentation, not what players craft.
  delete normalized.category;
  delete normalized.group;
  delete normalized.show_notification;

  if (
    normalized.result &&
    typeof normalized.result === "object" &&
    normalized.result.count === 1
  ) {
    delete normalized.result.count;
  }

  if (
    normalized.type === "minecraft:crafting_shapeless" &&
    Array.isArray(normalized.ingredients)
  ) {
    normalized.ingredients = normalized.ingredients
      .map(normalizeIngredient)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  }

  if (normalized.type === "minecraft:crafting_shaped") {
    normalizeShapedRecipe(normalized);
  }

  return crypto.createHash("sha1").update(stableJson(normalized)).digest("hex");
}
