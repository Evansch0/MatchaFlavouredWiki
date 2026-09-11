import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  recipeContentSha1,
  recipeSemanticSha1,
} from "./recipe-fingerprint.mjs";

const projectRoot = process.cwd();
const packRoot = process.argv[2] || "/tmp/matcha-flavoured-1.02";
const outputFile =
  process.argv[3] || path.join(projectRoot, "app/data/wiki-data.json");
const releaseMetadataFile = process.argv[4] || "";
const publicRoot = process.argv[5] || path.join(projectRoot, "public");
const visibilityManifestFile =
  process.argv[6] || path.join(projectRoot, "app/data/recipe-visibility.json");
const vanillaRoot = process.argv[7] || "";
const releaseMetadata = releaseMetadataFile
  ? readJson(releaseMetadataFile)
  : null;
const assetRevision =
  releaseMetadata?.versionId || releaseMetadata?.version || "";

const secretRecipeIds = new Set([
  "food:chorus_mochi",
  "food:gnocchi",
  "food:puerquito",
  "food:pupusa",
  "food:sweet_berry_toast",
  "food:warped_stroganoff",
]);

const stationLabels = {
  crafting: "Crafting Table",
  furnace: "Oven",
  blasting: "Blast Furnace",
  smoking: "Mud Kiln",
  campfire: "Campfire",
  smithing: "Smithing Table",
  stonecutting: "Stonecutter",
  chemistry: "Chemistry Stand",
};

const stationTextures = {
  crafting:
    "/minecraft/assets/minecraft/textures/gui/container/crafting_table.png",
  furnace: "/minecraft/assets/minecraft/textures/gui/container/furnace.png",
  blasting:
    "/minecraft/assets/minecraft/textures/gui/container/blast_furnace.png",
  smoking: "/minecraft/assets/minecraft/textures/gui/container/smoker.png",
  campfire: "/minecraft/assets/minecraft/textures/gui/container/furnace.png",
  smithing: "/minecraft/assets/minecraft/textures/gui/container/smithing.png",
  stonecutting:
    "/minecraft/assets/minecraft/textures/gui/container/stonecutter.png",
  chemistry:
    "/minecraft/assets/minecraft/textures/gui/container/brewing_stand.png",
};

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function versionedAssetUrl(url) {
  return assetRevision ? `${url}?v=${encodeURIComponent(assetRevision)}` : url;
}

function normalizeId(value, defaultNamespace = "minecraft") {
  if (!value || typeof value !== "string") return "";
  const clean = value.replace(/^#/, "");
  return clean.includes(":") ? clean : `${defaultNamespace}:${clean}`;
}

function splitId(value) {
  const normalized = normalizeId(value);
  const separator = normalized.indexOf(":");
  return [normalized.slice(0, separator), normalized.slice(separator + 1)];
}

function titleCase(value) {
  return value
    .replace(/^.*:/, "")
    .replace(/[/.]/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripFormatting(value) {
  return String(value || "")
    .replace(/§./g, "")
    .trim();
}

const lang =
  readJson(path.join(packRoot, "assets/minecraft/lang/en_us.json")) || {};

function translated(key) {
  return stripFormatting(lang[key] || "");
}

function textComponent(value) {
  if (typeof value === "string") return stripFormatting(value);
  if (Array.isArray(value)) {
    return value.map(textComponent).filter(Boolean).join("");
  }
  if (!value || typeof value !== "object") return "";
  const base =
    value.text ??
    (value.translate
      ? translated(value.translate) ||
        titleCase(value.translate.split(".").at(-1))
      : "");
  const extra = Array.isArray(value.extra)
    ? value.extra.map(textComponent).join("")
    : "";
  return stripFormatting(`${base}${extra}`);
}

function nameForId(id) {
  const [namespace, itemPath] = splitId(id);
  return (
    translated(`item.${namespace}.${itemPath}`) ||
    translated(`block.${namespace}.${itemPath}`) ||
    titleCase(itemPath)
  );
}

function nameForModel(model, fallbackId) {
  if (model === fallbackId) return nameForId(fallbackId);
  const [namespace, itemPath] = splitId(model);
  return (
    translated(`item.${namespace}.${itemPath}`) ||
    translated(`block.${namespace}.${itemPath}`) ||
    translated(`item.kleispack.${itemPath}`) ||
    translated(`item.kleispack.fish.${itemPath}`) ||
    titleCase(itemPath)
  );
}

function publicAssetFile(section, resource, extension = ".json") {
  const [namespace, resourcePath] = splitId(resource);
  return path.join(
    publicRoot,
    "minecraft/assets",
    namespace,
    section,
    `${resourcePath}${extension}`,
  );
}

function publicTextureUrl(resource) {
  const [namespace, texturePath] = splitId(resource);
  const file = path.join(
    publicRoot,
    "minecraft/assets",
    namespace,
    "textures",
    `${texturePath}.png`,
  );
  return fs.existsSync(file)
    ? versionedAssetUrl(
        `/minecraft/assets/${namespace}/textures/${texturePath}.png`,
      )
    : null;
}

function findFirstModelResource(node) {
  if (!node || typeof node !== "object") return null;
  if (typeof node.model === "string" && node.model.includes(":")) {
    return node.model;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = findFirstModelResource(value);
      if (found) return found;
    }
  }
  return null;
}

function resolveModelTexture(modelId, seen = new Set()) {
  const normalized = normalizeId(modelId);
  if (!normalized || seen.has(normalized)) return null;
  seen.add(normalized);
  const model = readJson(publicAssetFile("models", normalized));
  if (!model) return null;

  const textures =
    model.textures && typeof model.textures === "object" ? model.textures : {};
  const textureValues = [
    textures.layer0,
    textures.all,
    textures.texture,
    textures.particle,
    ...Object.values(textures),
  ].filter((value) => typeof value === "string");

  for (const texture of textureValues) {
    if (texture.startsWith("#")) continue;
    const url = publicTextureUrl(texture);
    if (url) return url;
  }

  if (typeof model.parent === "string") {
    return resolveModelTexture(model.parent, seen);
  }
  return null;
}

const textureCache = new Map();

function resolveItemTexture(modelRef, fallbackId) {
  const cacheKey = `${modelRef}|${fallbackId}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const references = [
    normalizeId(modelRef || fallbackId),
    normalizeId(fallbackId || modelRef),
  ].filter(Boolean);

  for (const reference of references) {
    const [namespace, itemPath] = splitId(reference);
    const itemDefinition = readJson(
      publicAssetFile("items", `${namespace}:${itemPath}`),
    );
    const definitionModel = findFirstModelResource(itemDefinition);
    const fromDefinition = definitionModel
      ? resolveModelTexture(definitionModel)
      : null;
    if (fromDefinition) {
      textureCache.set(cacheKey, fromDefinition);
      return fromDefinition;
    }

    const fromItemModel = resolveModelTexture(`${namespace}:item/${itemPath}`);
    if (fromItemModel) {
      textureCache.set(cacheKey, fromItemModel);
      return fromItemModel;
    }

    for (const direct of [
      `${namespace}:item/${itemPath}`,
      `${namespace}:block/${itemPath}`,
    ]) {
      const url = publicTextureUrl(direct);
      if (url) {
        textureCache.set(cacheKey, url);
        return url;
      }
    }
  }

  const fallbackPath = splitId(fallbackId || modelRef)[1];
  const specialCandidates = [];
  if (fallbackPath === "chain") {
    specialCandidates.push("minecraft:item/iron_chain");
  }
  if (fallbackPath.endsWith("_banner")) {
    specialCandidates.push("minecraft:entity/banner/base");
  }
  if (fallbackPath.includes("copper_golem_statue")) {
    const oxidation = fallbackPath.startsWith("exposed_")
      ? "_exposed"
      : fallbackPath.startsWith("weathered_")
        ? "_weathered"
        : fallbackPath.startsWith("oxidized_")
          ? "_oxidized"
          : "";
    specialCandidates.push(
      `minecraft:entity/copper_golem/copper_golem${oxidation}`,
    );
  }
  for (const specialCandidate of specialCandidates) {
    const url = publicTextureUrl(specialCandidate);
    if (url) {
      textureCache.set(cacheKey, url);
      return url;
    }
  }

  textureCache.set(cacheKey, null);
  return null;
}

function resultComponents(recipe) {
  const result = recipe?.result;
  if (!result || typeof result !== "object") return {};
  return result.components || {};
}

function extractEffects(components) {
  const effects = [];
  const consumeEffects =
    components?.["minecraft:consumable"]?.on_consume_effects || [];
  for (const consumeEffect of consumeEffects) {
    for (const effect of consumeEffect?.effects || []) {
      if (!effect?.id) continue;
      effects.push({
        name: titleCase(effect.id),
        level: Number(effect.amplifier || 0) + 1,
        seconds: Math.round(Number(effect.duration || 0) / 20),
      });
    }
  }
  return effects;
}

function extractProperties(components) {
  const properties = [];
  if (components?.["minecraft:max_damage"]) {
    properties.push(`${components["minecraft:max_damage"]} durability`);
  }
  if (components?.["minecraft:max_stack_size"]) {
    properties.push(`Stacks to ${components["minecraft:max_stack_size"]}`);
  }
  const enchantments = components?.["minecraft:enchantments"];
  if (enchantments && typeof enchantments === "object") {
    for (const [enchantment, level] of Object.entries(enchantments)) {
      properties.push(`${titleCase(enchantment)} ${level}`);
    }
  }
  const modifiers = components?.["minecraft:attribute_modifiers"];
  if (Array.isArray(modifiers)) {
    for (const modifier of modifiers) {
      if (!modifier?.type || typeof modifier.amount !== "number") continue;
      const amount =
        modifier.amount > 0 ? `+${modifier.amount}` : `${modifier.amount}`;
      properties.push(`${amount} ${titleCase(modifier.type)}`);
    }
  }
  return properties.slice(0, 8);
}

const itemMap = new Map();

function ensureItem(id, overrides = {}) {
  const normalizedId = normalizeId(id);
  const model = normalizeId(overrides.model || normalizedId);
  const key = model || normalizedId;
  const current = itemMap.get(key) || {
    key,
    id: normalizedId,
    model,
    name: nameForModel(model, normalizedId),
    texture: resolveItemTexture(model, normalizedId),
    color: null,
    lore: [],
    effects: [],
    properties: [],
    outputOf: [],
    usedIn: [],
    obscured: false,
    rarity: null,
  };

  const merged = {
    ...current,
    ...overrides,
    key,
    id: normalizedId || current.id,
    model,
    name: overrides.name || current.name,
    texture:
      overrides.texture ??
      current.texture ??
      resolveItemTexture(model, normalizedId),
    lore: overrides.lore?.length ? overrides.lore : current.lore,
    effects: overrides.effects?.length ? overrides.effects : current.effects,
    properties: overrides.properties?.length
      ? overrides.properties
      : current.properties,
    outputOf: current.outputOf,
    usedIn: current.usedIn,
  };
  itemMap.set(key, merged);
  return key;
}

function findFirstLootItem(node) {
  if (!node || typeof node !== "object") return null;
  if (
    node.type === "minecraft:item" &&
    typeof node.name === "string" &&
    node.name.includes(":")
  ) {
    return node;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = findFirstLootItem(value);
      if (found) return found;
    }
  }
  return null;
}

function lootTableItemKey(tableId) {
  const [namespace, tablePath] = splitId(tableId);
  const table = readJson(
    path.join(packRoot, "data", namespace, "loot_table", `${tablePath}.json`),
  );
  const entry = findFirstLootItem(table);
  if (!entry) return null;

  const components =
    entry.functions?.find(
      (candidate) => candidate?.function === "minecraft:set_components",
    )?.components || {};
  const itemName = textComponent(
    components["minecraft:item_name"] || components["minecraft:custom_name"],
  );
  const model = normalizeId(components["minecraft:item_model"] || entry.name);
  const overrides = {
    model,
    color:
      components["minecraft:item_name"]?.color ||
      components["minecraft:custom_name"]?.color ||
      null,
    lore: (components["minecraft:lore"] || [])
      .map(textComponent)
      .filter(Boolean),
    effects: extractEffects(components),
    properties: extractProperties(components),
  };
  if (itemName) overrides.name = itemName;
  return ensureItem(entry.name, overrides);
}

function packFile(relativePath) {
  return path.join(packRoot, ...relativePath.split("/"));
}

function hasPackFile(relativePath) {
  return fs.existsSync(packFile(relativePath));
}

function firstScoreValue(relativePath, pattern) {
  const match = readText(packFile(relativePath)).match(pattern);
  return match ? Number(match[1]) : null;
}

const heartMilestones = [
  "copper",
  "iron",
  "diamond",
  "nether",
  "netherite",
  "electrum",
  "end",
].filter((stage) =>
  hasPackFile(
    `data/main/function/mechanic/heart_container/decreases/decrease_${stage}_age.mcfunction`,
  ),
);
const heartAnnouncementText = readText(
  packFile(
    "data/main/function/mechanic/heart_container/decreases/decrease_announcement.mcfunction",
  ),
);
const announcedHeartFloors = [
  ...heartAnnouncementText.matchAll(/matches (\d+) run tellraw/g),
].map((match) => Number(match[1]) / 2);
const progressionRules = hasPackFile(
  "data/main/function/mechanic/heart_container/detect_death.mcfunction",
)
  ? {
      deathHeartLoss:
        (firstScoreValue(
          "data/main/function/mechanic/heart_container/hpdown.mcfunction",
          /players remove @s Hearts (\d+)/,
        ) || 2) / 2,
      startingMinimumHearts:
        (firstScoreValue(
          "data/main/function/setup/set_minimum_hearts_on_first_load.mcfunction",
          /current_minimum_hearts Hearts (\d+)/,
        ) || 20) / 2,
      lowestMinimumHearts: announcedHeartFloors.length
        ? Math.min(...announcedHeartFloors)
        : null,
      easyMinimumHearts:
        (firstScoreValue(
          "data/main/function/mechanic/heart_container/set_max_hp.mcfunction",
          /matches 1[^\n]+set @s Hearts (\d+)/,
        ) || 20) / 2,
      maximumHearts:
        (firstScoreValue(
          "data/main/function/setup/scoreboard.mcfunction",
          /maximum_hearts Hearts (\d+)/,
        ) || 60) / 2,
      crystalHeartGain:
        (firstScoreValue(
          "data/main/function/mechanic/heart_container/clear_heart_container.mcfunction",
          /players add @s Hearts (\d+)/,
        ) || 2) / 2,
      hardDifficultyAtMinimum:
        (firstScoreValue(
          "data/main/function/mechanic/difficulty_scaling/check_difficulty_condition.mcfunction",
          /current_minimum_hearts Hearts matches (\d+)/,
        ) || 10) / 2,
      milestones: heartMilestones.map(titleCase),
    }
  : null;

const tagFallbacks = {
  "minecraft:acacia_logs": ["minecraft:acacia_log"],
  "minecraft:bamboo_blocks": ["minecraft:bamboo_block"],
  "minecraft:birch_logs": ["minecraft:birch_log"],
  "minecraft:cherry_logs": ["minecraft:cherry_log"],
  "minecraft:coals": ["minecraft:coal"],
  "minecraft:copper_tool_materials": ["minecraft:copper_ingot"],
  "minecraft:crimson_stems": ["minecraft:crimson_stem"],
  "minecraft:dark_oak_logs": ["minecraft:dark_oak_log"],
  "minecraft:diamond_tool_materials": ["minecraft:diamond"],
  "minecraft:eggs": ["minecraft:egg"],
  "minecraft:fishes": ["minecraft:cod", "minecraft:salmon"],
  "minecraft:gold_tool_materials": ["minecraft:gold_ingot"],
  "minecraft:iron_tool_materials": ["minecraft:iron_ingot"],
  "minecraft:jungle_logs": ["minecraft:jungle_log"],
  "minecraft:logs": ["minecraft:oak_log"],
  "minecraft:logs_that_burn": ["minecraft:oak_log"],
  "minecraft:mangrove_logs": ["minecraft:mangrove_log"],
  "minecraft:oak_logs": ["minecraft:oak_log"],
  "minecraft:pale_oak_logs": ["minecraft:pale_oak_log"],
  "minecraft:planks": ["minecraft:oak_planks"],
  "minecraft:sand": ["minecraft:sand", "minecraft:red_sand"],
  "minecraft:soul_fire_base_blocks": ["minecraft:soul_sand"],
  "minecraft:spruce_logs": ["minecraft:spruce_log"],
  "minecraft:stone_crafting_materials": ["minecraft:cobblestone"],
  "minecraft:terracotta": ["minecraft:terracotta"],
  "minecraft:warped_stems": ["minecraft:warped_stem"],
  "minecraft:wool": ["minecraft:white_wool"],
  "minecraft:wooden_tool_materials": ["minecraft:oak_planks"],
};

const tagCache = new Map();

function expandTag(tagId, seen = new Set()) {
  const normalized = normalizeId(tagId);
  if (tagCache.has(normalized)) return tagCache.get(normalized);
  if (seen.has(normalized)) return [];
  seen.add(normalized);

  const [namespace, tagPath] = splitId(normalized);
  const candidates = [
    path.join(packRoot, "data", namespace, "tags/item", `${tagPath}.json`),
    path.join(packRoot, "data", namespace, "tags/items", `${tagPath}.json`),
  ];
  const tag = candidates.map(readJson).find(Boolean);
  const values = tag?.values || tagFallbacks[normalized] || [];
  const expanded = [];
  for (const rawValue of values) {
    const value = typeof rawValue === "string" ? rawValue : rawValue?.id || "";
    if (!value) continue;
    if (value.startsWith("#")) {
      expanded.push(...expandTag(value.slice(1), seen));
    } else {
      expanded.push(normalizeId(value, namespace));
    }
  }
  const unique = [...new Set(expanded)];
  tagCache.set(normalized, unique);
  return unique;
}

function ingredientAlternatives(raw, defaultNamespace = "minecraft") {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) =>
      ingredientAlternatives(entry, defaultNamespace),
    );
  }
  if (typeof raw === "string") {
    if (raw.startsWith("#")) {
      return expandTag(normalizeId(raw.slice(1), defaultNamespace));
    }
    return [normalizeId(raw, defaultNamespace)];
  }
  if (!raw || typeof raw !== "object") return [];
  if (raw.tag) return expandTag(normalizeId(raw.tag, defaultNamespace));
  const id = raw.item || raw.id;
  return id ? [normalizeId(id, defaultNamespace)] : [];
}

function makeIngredient(raw, defaultNamespace = "minecraft") {
  const isTag =
    (typeof raw === "string" && raw.startsWith("#")) || Boolean(raw?.tag);
  const rawTag =
    typeof raw === "string" && raw.startsWith("#") ? raw.slice(1) : raw?.tag;
  const alternatives = ingredientAlternatives(raw, defaultNamespace);
  const keys = alternatives.map((id) => ensureItem(id));
  return {
    keys,
    label: isTag
      ? `Any ${titleCase(normalizeId(rawTag, defaultNamespace))}`
      : keys.length > 1
        ? keys.map((key) => itemMap.get(key)?.name).join(" or ")
        : keys[0]
          ? itemMap.get(keys[0])?.name
          : "Unknown ingredient",
    tag: isTag ? normalizeId(rawTag, defaultNamespace) : null,
  };
}

function stationFor(recipe, namespace) {
  const type = String(recipe.type || "");
  if (type.includes("crafting")) return "crafting";
  if (type.includes("stonecut")) return "stonecutting";
  if (type.includes("smithing")) return "smithing";
  if (type.includes("blasting")) return "blasting";
  if (type.includes("smoking")) return "smoking";
  if (type.includes("campfire")) return "campfire";
  if (type.includes("smelting")) return "furnace";
  return namespace === "potions" ? "chemistry" : "crafting";
}

function recipeGrid(recipe, defaultNamespace) {
  const type = String(recipe.type || "");
  if (type.includes("crafting_shaped")) {
    const rows = recipe.pattern || [];
    const width = Math.max(0, ...rows.map((row) => row.length));
    const top = Math.floor((3 - rows.length) / 2);
    const left = Math.floor((3 - width) / 2);
    const grid = Array(9).fill(null);
    rows.forEach((row, rowIndex) => {
      [...row].forEach((symbol, columnIndex) => {
        if (symbol === " ") return;
        const raw = recipe.key?.[symbol];
        if (!raw) return;
        grid[(rowIndex + top) * 3 + columnIndex + left] = makeIngredient(
          raw,
          defaultNamespace,
        );
      });
    });
    return grid;
  }

  if (type.includes("crafting_shapeless")) {
    const ingredients = (recipe.ingredients || []).map((ingredient) =>
      makeIngredient(ingredient, defaultNamespace),
    );
    return [...ingredients, ...Array(9).fill(null)].slice(0, 9);
  }
  return [];
}

function recipeIngredients(recipe, defaultNamespace) {
  const type = String(recipe.type || "");
  if (type.includes("crafting")) {
    return recipeGrid(recipe, defaultNamespace).filter(Boolean);
  }
  if (type.includes("smithing")) {
    return [recipe.template, recipe.base, recipe.addition]
      .filter(Boolean)
      .map((ingredient) => makeIngredient(ingredient, defaultNamespace));
  }
  const input = recipe.ingredient ?? recipe.input;
  return input ? [makeIngredient(input, defaultNamespace)] : [];
}

const woodFamilies = [
  "pale_oak",
  "dark_oak",
  "acacia",
  "bamboo",
  "birch",
  "cherry",
  "crimson",
  "jungle",
  "mangrove",
  "spruce",
  "warped",
  "oak",
];
const materialFamilies = [
  "copper",
  "deepslate",
  "sandstone",
  "blackstone",
  "prismarine",
  "quartz",
  "granite",
  "diorite",
  "andesite",
  "tuff",
  "limestone",
  "hellbrick",
  "mud",
  "steel",
  "iron",
  "dirt",
  "cinnabar",
  "sulfur",
  "stone",
];

function familyFor(recipePath, station, ingredients, category, namespace) {
  if (station === "stonecutting") {
    const comparable = `${recipePath} ${ingredients[0]?.label || ""}`
      .toLowerCase()
      .replaceAll("_", " ");
    const wood = woodFamilies.find((family) =>
      comparable.includes(family.replaceAll("_", " ")),
    );
    if (wood) return `${titleCase(wood)} wood`;
    if (comparable.includes("any logs")) return "Mixed wood";
    const material = materialFamilies.find((family) =>
      comparable.includes(family),
    );
    if (material) return `${titleCase(material)} family`;
    return "Other stonecutting";
  }
  const comparable = recipePath.toLowerCase();
  const wood = woodFamilies.find((family) => comparable.includes(family));
  if (wood) return `${titleCase(wood)} wood`;
  const material = materialFamilies.find((family) =>
    comparable.includes(family),
  );
  if (material) return `${titleCase(material)} family`;
  if (namespace === "food") return "Food & drink";
  if (namespace === "blessings") return "Blessings";
  if (namespace === "custom_music") return "Music";
  if (namespace === "potions") return "Chemistry";
  const categoryLabel = titleCase(category || "misc");
  return categoryLabel === "Misc" ? "Other recipes" : categoryLabel;
}

function recipeResult(recipe, defaultNamespace) {
  const raw = recipe.result;
  const rawId = typeof raw === "string" ? raw : raw?.id || raw?.item || "";
  const normalizedId = normalizeId(rawId, defaultNamespace);
  const components = resultComponents(recipe);
  const customModelString =
    components["minecraft:custom_model_data"]?.strings?.[0];
  const model = normalizeId(
    components["minecraft:item_model"] || customModelString || normalizedId,
    defaultNamespace,
  );
  const itemName =
    textComponent(
      components["minecraft:item_name"] || components["minecraft:custom_name"],
    ) || nameForId(normalizedId);
  const color =
    components["minecraft:item_name"]?.color ||
    components["minecraft:custom_name"]?.color ||
    null;
  const lore = (components["minecraft:lore"] || [])
    .map(textComponent)
    .filter(Boolean);
  const key = ensureItem(normalizedId, {
    model,
    name: itemName,
    color,
    lore,
    effects: extractEffects(components),
    properties: extractProperties(components),
  });
  return {
    key,
    count: typeof raw === "object" && Number(raw.count) ? Number(raw.count) : 1,
  };
}

const recipeFiles = walk(path.join(packRoot, "data")).filter(
  (file) => file.endsWith(".json") && file.split(path.sep).includes("recipe"),
);
const vanillaRecipeFiles = walk(
  path.join(vanillaRoot, "data/minecraft/recipe"),
).filter((file) => file.endsWith(".json"));
if (!vanillaRecipeFiles.length) {
  throw new Error(
    "Minecraft recipe data is required to exclude unchanged vanilla recipes.",
  );
}
const vanillaRecipeFingerprints = new Set(
  vanillaRecipeFiles.map(readJson).filter(Boolean).map(recipeSemanticSha1),
);
const vanillaRecipeNames = new Set(
  vanillaRecipeFiles.map((file) => path.basename(file, ".json")),
);

const visibilityManifest = readJson(visibilityManifestFile)?.recipes || {};
const hasVisibilityManifest = Object.keys(visibilityManifest).length > 0;
const visibilityByHash = new Map();
for (const recipe of Object.values(visibilityManifest)) {
  if (!recipe?.visibility) continue;
  const fingerprint = recipe.contentSha1 || recipe.sha1;
  if (!fingerprint) continue;
  const decisions = visibilityByHash.get(fingerprint) || new Set();
  decisions.add(recipe.visibility);
  visibilityByHash.set(fingerprint, decisions);
}

function visibilityForRecipe(id, file) {
  if (!hasVisibilityManifest) {
    return {
      secret: secretRecipeIds.has(id),
      reviewPending: false,
    };
  }
  const hash = crypto
    .createHash("sha1")
    .update(fs.readFileSync(file))
    .digest("hex");
  const approved = visibilityManifest[id];
  if (approved?.sha1 === hash) {
    return {
      secret: approved.visibility === "secret",
      reviewPending: false,
    };
  }
  const movedRecipeDecisions = visibilityByHash.get(hash);
  const contentHash = recipeContentSha1(readJson(file));
  const movedContentDecisions = visibilityByHash.get(contentHash);
  const inheritedDecision =
    movedRecipeDecisions?.size === 1
      ? movedRecipeDecisions
      : movedContentDecisions?.size === 1
        ? movedContentDecisions
        : null;
  if (inheritedDecision) {
    return {
      secret: inheritedDecision.has("secret"),
      reviewPending: false,
    };
  }
  return {
    secret: true,
    reviewPending: true,
  };
}

const recipes = [];
const excludedVanillaRecipeIds = [];

for (const file of recipeFiles) {
  const recipe = readJson(file);
  if (!recipe?.type || !recipe.result) continue;
  const relative = path.relative(packRoot, file).replaceAll(path.sep, "/");
  const [, namespace, , ...recipePathParts] = relative.split("/");
  const recipePath = recipePathParts.join("/").replace(/\.json$/, "");
  const id = `${namespace}:${recipePath}`;
  if (vanillaRecipeFingerprints.has(recipeSemanticSha1(recipe))) {
    excludedVanillaRecipeIds.push(id);
    continue;
  }
  const station = stationFor(recipe, namespace);
  const visibility = visibilityForRecipe(id, file);
  const secret = visibility.secret;
  const result = recipeResult(recipe, "minecraft");
  const ingredients = secret ? [] : recipeIngredients(recipe, "minecraft");
  const grid = secret ? [] : recipeGrid(recipe, "minecraft");
  const ingredientKeys = [
    ...new Set(ingredients.flatMap((ingredient) => ingredient.keys)),
  ];
  const outputItem = itemMap.get(result.key);
  const family = familyFor(
    recipePath,
    station,
    ingredients,
    recipe.category,
    namespace,
  );

  const record = {
    id,
    slug: id.replace(":", "--").replaceAll("/", "--"),
    name: outputItem?.name || titleCase(recipePath),
    namespace,
    path: recipePath,
    type: recipe.type,
    station,
    stationLabel: stationLabels[station],
    stationTexture: versionedAssetUrl(stationTextures[station]),
    category: recipe.category || "misc",
    family,
    changeKind: vanillaRecipeNames.has(path.basename(file, ".json"))
      ? "changed"
      : "added",
    secret,
    reviewPending: visibility.reviewPending,
    result,
    ingredientKeys,
    ingredients,
    grid,
    cookingTime: Number(recipe.cookingtime || 0),
    experience: Number(recipe.experience || 0),
  };
  recipes.push(record);
  outputItem?.outputOf.push(id);
  for (const key of ingredientKeys) {
    itemMap.get(key)?.usedIn.push(id);
  }
}

function advancementIcon(display) {
  const icon = display?.icon;
  if (!icon) return null;
  const id = normalizeId(icon.id || icon.item || icon);
  const model = normalizeId(icon.components?.["minecraft:item_model"] || id);
  return ensureItem(id, { model });
}

const advancements = walk(path.join(packRoot, "data/main/advancement"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => {
    const advancement = readJson(file);
    const display = advancement?.display;
    if (!display || display.hidden === true) return null;
    const relative = path
      .relative(path.join(packRoot, "data/main/advancement"), file)
      .replaceAll(path.sep, "/")
      .replace(/\.json$/, "");
    return {
      id: `main:${relative}`,
      section: relative.split("/")[0] || "progression",
      title: textComponent(display.title) || titleCase(relative),
      description: textComponent(display.description),
      frame: display.frame || "task",
      iconKey: advancementIcon(display),
      parent: advancement.parent || null,
    };
  })
  .filter(Boolean);

const fishTiers = {
  1: { label: "Common", stars: 1, obscured: false },
  2: { label: "Uncommon", stars: 2, obscured: false },
  3: { label: "Rare", stars: 3, obscured: true },
  4: { label: "Epic", stars: 4, obscured: true },
};

const fish = [];
for (const [levelText, tier] of Object.entries(fishTiers)) {
  const level = Number(levelText);
  const tradeFiles = walk(
    path.join(packRoot, `data/minecraft/villager_trade/fisherman/${level}`),
  )
    .filter(
      (file) => file.endsWith(".json") && path.basename(file) !== "filler.json",
    )
    .sort();

  tradeFiles.forEach((file, index) => {
    const trade = readJson(file);
    const wanted = trade?.wants || {};
    const components = wanted.components || {};
    let itemKey;
    if (tier.obscured) {
      itemKey = `matcha:hidden_fish_${level}_${index + 1}`;
      const actualName =
        textComponent(components["minecraft:item_name"]) ||
        titleCase(path.basename(file, ".json"));
      const actualModel = normalizeId(
        components["minecraft:item_model"] || path.basename(file, ".json"),
      );
      itemMap.set(itemKey, {
        key: itemKey,
        id: normalizeId(wanted.id || "minecraft:cod"),
        model: itemKey,
        name: `${tier.label} Fish`,
        texture: resolveItemTexture(actualModel, wanted.id),
        color: tier.label === "Epic" ? "#b983d0" : "#63b7d4",
        lore: [],
        effects: [],
        properties: [`${tier.stars}-star catch`],
        outputOf: [],
        usedIn: [],
        obscured: true,
        rarity: tier.label,
        sga: [...actualName.toLowerCase()]
          .filter((character) => character === " " || /[a-z]/.test(character))
          .map((character) => character.charCodeAt(0)),
      });
    } else {
      const model = normalizeId(
        components["minecraft:item_model"] || path.basename(file, ".json"),
      );
      itemKey = ensureItem(wanted.id || "minecraft:cod", {
        model,
        name:
          textComponent(components["minecraft:item_name"]) || titleCase(model),
        lore: (components["minecraft:lore"] || [])
          .map(textComponent)
          .filter(Boolean),
        obscured: false,
        rarity: tier.label,
      });
    }
    fish.push({
      itemKey,
      tier: tier.label,
      stars: tier.stars,
      obscured: tier.obscured,
      saleCount: Number(wanted.count || 1),
    });
  });
}

const waterRegionTags = [
  "freshwater_cold",
  "freshwater_cool",
  "freshwater_hot_dry",
  "freshwater_hot_wet",
  "freshwater_temperate",
  "saltwater_cold",
  "saltwater_cool",
  "saltwater_hot",
  "saltwater_temperate",
  "saltwater_warm",
].filter((tag) =>
  hasPackFile(`data/minecraft/tags/worldgen/biome/${tag}.json`),
);
const waterRegionCatchCounts = waterRegionTags.map((table) => {
  const contents = JSON.stringify(
    readJson(
      packFile(`data/minecraft/loot_table/gameplay/fishing/${table}.json`),
    ) || {},
  );
  return new Set(
    contents.match(/minecraft:gameplay\/fishing\/fish\/[a-z0-9_]+/g) || [],
  ).size;
});
const mainFishingPoolSize = Math.min(...waterRegionCatchCounts.filter(Boolean));
const villageStructures = [
  "plains",
  "desert",
  "savanna",
  "snowy",
  "taiga",
].filter((variant) =>
  hasPackFile(`data/minecraft/worldgen/structure/village_${variant}.json`),
);
const specialFishingTables = [
  "deep_dark",
  "pale_garden",
  "sulfur_caves",
  "swamps",
].filter((table) =>
  hasPackFile(`data/minecraft/loot_table/gameplay/fishing/${table}.json`),
);
const bastionCacheFiles = [
  "data/minecraft/loot_table/chests/bastion_bridge.json",
  "data/minecraft/loot_table/chests/bastion_hoglin_stable.json",
  "data/minecraft/loot_table/chests/bastion_other.json",
  "data/minecraft/loot_table/chests/bastion_treasure.json",
];
const rubyBastionCaches = bastionCacheFiles.filter((file) =>
  fs
    .readFileSync(packFile(file), "utf8")
    .includes("minecraft:kleis_items/ruby"),
);

const wardingStoneKey = ensureItem("minecraft:flower_banner_pattern", {
  model: "minecraft:warding_stone",
  name: "Warding Stone",
});
const abbeyMapKey = ensureItem("minecraft:map", {
  model: "minecraft:abbey_map",
  name: "Abbey Explorer Map",
});
const papalOutpostMapKey = ensureItem("minecraft:map", {
  model: "minecraft:papal_outpost_map",
  name: "Papal Outpost Explorer Map",
});
const compoundBowKey = ensureItem("minecraft:bow", {
  model: "minecraft:compound_bow",
  name: "Compound Bow",
});
const woodenCrossKey = ensureItem("minecraft:poisonous_potato", {
  model: "minecraft:wooden_cross",
  name: "Wooden Cross",
});
const divineFragmentKey =
  lootTableItemKey("minecraft:kleis_items/divine_fragment") ||
  ensureItem("minecraft:turtle_scute");
const crystalHeartKey =
  lootTableItemKey("minecraft:kleis_items/crystal_heart") ||
  ensureItem("minecraft:poisonous_potato");
const rubyKey = lootTableItemKey("minecraft:kleis_items/ruby");
const topazKey = lootTableItemKey("minecraft:kleis_items/topaz");
const solomonKey = lootTableItemKey("minecraft:kleis_items/solomon");
const avestaKey = lootTableItemKey("minecraft:kleis_items/avesta");
const enochKey = lootTableItemKey("minecraft:kleis_items/enoch");
const specialCompassKey = lootTableItemKey(
  "minecraft:chests/equipment/special_compass",
);

const locations = [];

function addLocation(sourceFiles, record) {
  const detectedSources = sourceFiles.filter(hasPackFile);
  if (!detectedSources.length) return;
  locations.push({
    ...record,
    facts: record.facts || [
      { label: "Field measure", value: record.metric },
      {
        label: "Verified for",
        value: `Release ${releaseMetadata?.version || "current"}`,
      },
    ],
    sections: record.sections || [
      {
        title: "What Matcha changes here",
        body: record.summary,
        points: record.findings,
      },
    ],
    itemKeys: [...new Set((record.itemKeys || []).filter(Boolean))],
    sourceCount: detectedSources.length,
  });
}

addLocation(
  [
    "data/minecraft/worldgen/biome/plains.json",
    "data/minecraft/worldgen/biome/desert.json",
    "data/minecraft/worldgen/biome/frozen_ocean.json",
  ],
  {
    id: "biome-palettes",
    group: "Living world",
    name: "Biome palettes",
    kicker: "The horizon is part of the map",
    summary:
      "You do not need a debug screen to feel the climate change. Look up, look through the fog, then check the water at your boots.",
    metric: "Watch sky · fog · water",
    findings: [
      "Cross into snow country and the scene turns milk-blue; small white flecks drift through the air.",
      "Badlands and deserts wash toward dusty grey-green water, while jungle, mangrove, and lush-cave water becomes a clearer bright blue.",
      "The biome names stay familiar. Treat the colour shift as a travel cue: if the whole horizon changes, your local rules may have changed too.",
    ],
    facts: [
      { label: "Best clue", value: "Sky, fog, and water colour" },
      { label: "Changes gameplay", value: "No, this page covers the view" },
      { label: "Useful beside", value: "Regional fishing" },
    ],
    sections: [
      {
        title: "Reading the horizon",
        body: "Matcha gives familiar biomes a stronger colour language. The effect is decorative, but it is also a handy clue that you have crossed into a different fishing or freezing region.",
        points: [
          "Snow country leans toward pale blue and carries drifting white flecks.",
          "Deserts and badlands use dustier water colours.",
          "Jungles, mangroves, and lush caves use a clearer, brighter blue.",
        ],
      },
      {
        title: "What the colours do not mean",
        body: "The palette does not rename the biome or add a status effect by itself. Use it as a travel cue, then check the relevant fishing or hazard entry for the rules that matter.",
        points: [],
      },
    ],
    markerKey: ensureItem("minecraft:filled_map"),
    itemKeys: [
      ensureItem("minecraft:water_bucket"),
      ensureItem("minecraft:packed_ice"),
      ensureItem("minecraft:red_sand"),
    ],
    tone: "sage",
  },
);

addLocation(["data/minecraft/loot_table/gameplay/fishing.json"], {
  id: "regional-fishing",
  group: "Living world",
  name: "Regional fishing",
  kicker: "Same rod, different supper",
  summary:
    "A good fishing trip involves moving camp. Each ordinary climate pool keeps its own little roster instead of serving the same fish everywhere.",
  metric: `${mainFishingPoolSize} species in each main pool`,
  findings: [
    `${waterRegionTags.length / 2} freshwater climates and ${waterRegionTags.length / 2} saltwater climates give you ten ordinary rosters to complete.`,
    `Swamps mix their own five-fish set. The Deep Dark, Pale Garden, and Sulfur Caves make up the other ${specialFishingTables.length - 1} special stops, each interrupting the normal catch with something local.`,
    "Common and uncommon names are written plainly. Rare and epic specimens keep their real texture but answer to enchanting-table script here.",
  ],
  facts: [
    { label: "Ordinary regions", value: "5 freshwater + 5 saltwater" },
    {
      label: "Base roster",
      value: `${mainFishingPoolSize} species per region`,
    },
    { label: "Names protected", value: "Rare and epic catches" },
  ],
  sections: [
    {
      title: "How the map is divided",
      body: "Fresh water and salt water each split into five climate bands. Moving from a cold coast to a warm one changes the local roster even when the rod, bait, and weather stay the same.",
      points: [
        "Freshwater bands are cold, cool, temperate, hot-dry, and hot-wet.",
        "Saltwater bands are cold, cool, temperate, warm, and hot.",
        "Swamps, the Deep Dark, Pale Garden, and Sulfur Caves have special pools layered into the system.",
      ],
    },
    {
      title: "Keeping discoveries intact",
      body: "This wiki shows the real fish textures, but it does not print the names of higher-tier catches before you discover them. Their labels stay in enchanting-table script throughout the site.",
      points: [
        "Common and uncommon fish are safe to browse by name.",
        "Fisherman progression expects lower tiers before higher tiers.",
        "The Angler's Almanac is the in-game checklist for finishing each region.",
      ],
    },
  ],
  markerKey: ensureItem("minecraft:fishing_rod"),
  itemKeys: fish
    .filter((entry) => !entry.obscured)
    .slice(0, 5)
    .map((entry) => entry.itemKey),
  tone: "water",
});

addLocation(
  [
    "data/main/function/environmental/check_freezing_water_conditions.mcfunction",
    "data/main/function/environmental/freezing_water.mcfunction",
  ],
  {
    id: "frozen-waters",
    group: "Living world",
    name: "Frozen waters",
    kicker: "The water bites back",
    summary:
      "Once your head goes under in a frozen biome, this stops being a scenic swim and becomes a five-second problem.",
    metric: "½ heart · 5 seconds",
    findings: [
      "Each check deals 1 point of freeze damage. That is half a heart.",
      "The same dip applies Slowness V and Darkness for five seconds, which makes the shoreline feel much farther away.",
      "Freezing Protection III on your chest gear cancels the hazard. Creative-mode swimmers are left alone.",
    ],
    facts: [
      { label: "Damage per check", value: "½ heart" },
      { label: "Effects", value: "Slowness V + Darkness" },
      { label: "Protection", value: "Freezing Protection III on chest gear" },
    ],
    sections: [
      {
        title: "When the hazard starts",
        body: "The check is aimed at submerged survival players in biomes tagged as frozen. Creative players are ignored, and standing beside the water is safe.",
        points: [
          "The pack checks for water at head height.",
          "A successful check deals half a heart of freeze damage.",
          "Slowness V and Darkness both last five seconds, so getting out is the urgent part.",
        ],
      },
      {
        title: "Reliable protection",
        body: "Freezing Protection III on the chest slot cancels the full hazard check. Lower levels do not satisfy the pack's protection rule.",
        points: [
          "Put the enchantment on chest gear, not boots or a helmet.",
          "Carry a boat or blocks when crossing broad frozen water before you have the enchantment.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:packed_ice"),
    itemKeys: [
      ensureItem("minecraft:leather_chestplate"),
      ensureItem("minecraft:powder_snow_bucket"),
    ],
    tone: "frost",
  },
);

addLocation(
  [
    "data/minecraft/worldgen/structure_set/villages.json",
    "data/minecraft/worldgen/template_pool/village_beta/town_centers.json",
    "data/main/function/environmental/village_eerie_sound.mcfunction",
  ],
  {
    id: "beta-villages",
    group: "Settlements",
    name: "Rebuilt villages",
    kicker: "Pack lunch; the next bell is not nearby",
    summary:
      "A village feels like a rare little event now: one rough, older building style dressed for five climates, with a silence that notices you back.",
    metric: `${villageStructures.length} rebuilt climate variants`,
    findings: [
      `${villageStructures.length} climates use the same beta-style bones: plains, desert, savanna, snowy, and taiga. The silhouette becomes easy to recognise.`,
      "Cross the settlement boundary and the music stops. Spare footsteps, soft breaks, and cave-like sounds make an empty street feel occupied.",
      "Wandering Traders can sell maps to all five village climates for one Obol each, and some offers let you recruit an Asylum Seeker.",
    ],
    facts: [
      {
        label: "Village styles",
        value: `${villageStructures.length} climate variants`,
      },
      { label: "Map seller", value: "Wandering Trader" },
      { label: "Map price", value: "1 Obol" },
    ],
    sections: [
      {
        title: "What a Matcha village is",
        body: "Matcha replaces the normal village layout with a rough beta-style settlement used across plains, desert, savanna, snowy, and taiga climates.",
        points: [
          "The shared silhouette makes distant villages easier to recognise after you have found one.",
          "Inside the boundary, ordinary music is stopped and environmental sounds take over.",
          "The atmosphere is deliberate. Footsteps and small sounds may come from the village system rather than another player.",
        ],
      },
      {
        title: "Finding the climate you want",
        body: "Wandering Traders can sell a map for each of the five village climates. Each map costs one Obol, which makes targeted travel possible without exposing generation settings.",
        points: [
          "Trader offers can also include an Asylum Seeker application.",
          "Bring the matching map if a specific climate build is the goal.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:bell"),
    itemKeys: [
      wardingStoneKey,
      ensureItem("minecraft:emerald"),
      ensureItem("minecraft:map"),
      ensureItem("minecraft:villager_spawn_egg", {
        model: "minecraft:application",
        name: "Asylum Seeker",
      }),
    ],
    tone: "parchment",
  },
);

addLocation(
  [
    "data/minecraft/worldgen/structure/abbey_overgrown.json",
    "data/minecraft/worldgen/structure_set/abbey.json",
    "data/minecraft/loot_table/chests/abbey/tower.json",
    "data/main/function/abbey/copper_eye_check.mcfunction",
  ],
  {
    id: "abbey",
    group: "Expeditions",
    name: "The Abbey",
    kicker: "A tower above, a dungeon below",
    summary:
      "The Abbey is a full expedition with an overgrown tower, underground rooms, target-block mechanisms, archaeology, and rewards that justify a properly packed bag.",
    metric: "1 tower book · Warding forbidden",
    findings: [
      "A journeyman Cartographer can trade an Abbey map for either The Divine Comedy or Paradise Lost.",
      "The tower chest always selects one of two books: the Quran or the Tanakh.",
      "Warding Stones placed inside are destroyed immediately, just as they are in Trial Chambers.",
    ],
    facts: [
      { label: "Map seller", value: "Journeyman Cartographer" },
      { label: "Map payment", value: "The Divine Comedy or Paradise Lost" },
      { label: "Bring", value: "A projectile weapon" },
      { label: "Do not bring", value: "A placed Warding Stone" },
    ],
    sections: [
      {
        title: "Finding an Abbey",
        body: "The direct route is a Cartographer at villager level three. Two separate offers point to the same structure: one accepts The Divine Comedy and the other accepts Paradise Lost.",
        points: [
          "Both offers return the dedicated Abbey Explorer Map.",
          "The structure starts with an overgrown tower and continues below ground.",
          "Allays can appear around the structure in groups of one to three.",
        ],
      },
      {
        title: "How the dungeon behaves",
        body: "Abbey rooms include combat spaces, puzzle rooms, and boon rooms. Target blocks act as copper eyes, so a projectile can open doors, move grates, or break a linked lantern.",
        points: [
          "A bow or another reliable projectile tool belongs in the field kit.",
          "The room pool includes drawbridges, pitfall halls, baths, water and lava rooms, and checkpoint or vault boons.",
          "The pack checks target hits and updates the nearby copper-eye mechanism.",
        ],
      },
      {
        title: "Rewards and warnings",
        body: "The tower and barracks use their own loot. Archaeology at Abbey graves adds a separate small pool. One recipe can be found somewhere in the structure, but this wiki leaves that discovery sealed.",
        points: [
          "Tower gear can include a Compound Bow or an iron sword with Anemos I.",
          "A tower chest always includes either the Quran or the Tanakh, plus 16 to 32 arrows.",
          "Grave archaeology can uncover a Wooden Cross, emeralds, bones, a skull, or a clay statue roll.",
          "Placed Warding Stones are removed with an immediate TNT burst and sculk-soul particles.",
        ],
      },
    ],
    markerKey: abbeyMapKey,
    itemKeys: [abbeyMapKey, compoundBowKey, woodenCrossKey, wardingStoneKey],
    tone: "deep",
  },
);

addLocation(
  [
    "data/minecraft/worldgen/structure/pillager_outpost.json",
    "data/minecraft/worldgen/template_pool/pillager_outpost/towers.json",
    "data/minecraft/villager_trade/cartographer/1/papal_outpost.json",
    "data/minecraft/loot_table/chests/pillager_outpost.json",
  ],
  {
    id: "papal-outposts",
    group: "Expeditions",
    name: "Papal Outposts",
    kicker: "A familiar landmark after a very strange renovation",
    summary:
      "Matcha rebuilds the Pillager Outpost into the Papal Outpost, with ruined tower variants, cobwebbed side structures, its own map art, and a revised supply chest.",
    metric: "1 emerald map · 2 tower states",
    findings: [
      "A novice Cartographer sells the dedicated explorer map for one emerald.",
      "The tower can appear intact or overgrown, and the surrounding features use cobwebbed or weathered variants.",
      "The chest always includes arrows and a goat horn, with a chance for two Sentry trims.",
    ],
    facts: [
      { label: "Map seller", value: "Novice Cartographer" },
      { label: "Map price", value: "1 emerald" },
      { label: "Guaranteed chest gear", value: "Arrows + goat horn" },
    ],
    sections: [
      {
        title: "Finding the outpost",
        body: "You do not need to wait for a high-level villager. A novice Cartographer can sell the Papal Outpost Explorer Map for one emerald.",
        points: [
          "The map still targets the structure registered as a Pillager Outpost.",
          "The dedicated item texture and map name identify it as a Papal Outpost in play.",
        ],
      },
      {
        title: "Recognising the rebuild",
        body: "The tower pool contains a standing watchtower and an overgrown version. Side features include cages, tents, logs, targets, and an Allay cage, with cobweb processors used across the set.",
        points: [
          "The outpost can look occupied by decay before you account for its actual defenders.",
          "Allay cages remain one of the possible side structures.",
        ],
      },
      {
        title: "What is in the chest",
        body: "The revised outpost chest is compact and predictable enough to plan around, while still leaving one fashion roll to chance.",
        points: [
          "Expect 8 to 16 arrows and one regular goat horn.",
          "Bone, glowstone dust, emeralds, and rabbit hide make up the supply pool.",
          "The Sentry trim roll can award two templates, or nothing.",
        ],
      },
    ],
    markerKey: papalOutpostMapKey,
    itemKeys: [
      papalOutpostMapKey,
      ensureItem("minecraft:goat_horn"),
      ensureItem("minecraft:sentry_armor_trim_smithing_template"),
      ensureItem("minecraft:arrow"),
    ],
    tone: "parchment",
  },
);

addLocation(
  [
    "data/main/function/mechanic/spawn_mechanic/check_mob_spawn.mcfunction",
    "data/main/function/mechanic/spawn_mechanic/safe_surface.mcfunction",
    "data/main/function/mechanic/first_dragon_killed_reward.mcfunction",
  ],
  {
    id: "overworld-surface",
    group: "Living world",
    name: "Overworld surface spawning",
    kicker: "The night changes when the Dragon falls",
    summary:
      "Matcha gives the Overworld two surface-spawn rules: one for the early game and a stricter safe-surface state after the first Ender Dragon kill.",
    metric: "2 world states · 1 Dragon trigger",
    findings: [
      "Before the Dragon, exposed non-undead hostiles are removed while undead can still make the open night dangerous.",
      "After the Dragon, ordinary hostile mobs are removed when they can see the sky or spawn at Y 63 and above.",
      "Drowned use a lower post-Dragon cutoff at Y 43 and above.",
    ],
    facts: [
      { label: "Early surface", value: "Undead remain outdoors" },
      { label: "Safe surface trigger", value: "First Ender Dragon kill" },
      { label: "Post-Dragon cutoff", value: "Y 63, Drowned Y 43" },
    ],
    sections: [
      {
        title: "Before the Ender Dragon",
        body: "The open Overworld is not vanilla. Non-undead mundane hostiles are removed when they spawn with a clear view of the sky, while undead can remain. Creepers receive an additional surface check.",
        points: [
          "Caves and covered spaces still matter because the sky check no longer applies there.",
          "Zombies, skeletons, and other undead are the main outdoor threat in this phase.",
        ],
      },
      {
        title: "After the first Dragon kill",
        body: "The pack enables its safe-surface state for the world. Mundane hostiles are removed if they can see the sky or appear at Y 63 and above, turning the late-game surface into a much calmer place.",
        points: [
          "Underground danger remains. The rule changes where hostiles survive, not whether they exist.",
          "Drowned are removed if exposed to the sky or at Y 43 and above.",
          "The Dragon reward also summons a Nether Star at the End's central exit area.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:grass_block"),
    itemKeys: [
      ensureItem("minecraft:ender_eye"),
      ensureItem("minecraft:nether_star"),
      ensureItem("minecraft:torch"),
    ],
    tone: "sage",
  },
);

addLocation(
  [
    "data/main/worldgen/placed_feature/ore_coal_deep_large.json",
    "data/minecraft/worldgen/placed_feature/ore_emerald.json",
    "data/minecraft/worldgen/biome/nether_wastes.json",
    "data/minecraft/worldgen/biome/soul_sand_valley.json",
  ],
  {
    id: "resource-routes",
    group: "Living world",
    name: "Ore and resource routes",
    kicker: "The best mine depends on what you came for",
    summary:
      "Release 1.12.1 spreads Silver more widely, rewards deep desert mining with large Coal veins, raises Quartz hunting, and lets Hellspore grow outside fortresses.",
    metric: "4 routes worth changing camp for",
    findings: [
      "Silver can appear in every biome, with better odds in mountains and deeper stone.",
      "Deep desert layers receive large Coal deposits with veins up to 17 blocks.",
      "Hellspore patches now generate in Nether Wastes and Soul Sand Valleys.",
    ],
    facts: [
      { label: "Silver", value: "Every biome, better deep and mountainous" },
      { label: "Deep desert Coal", value: "Veins up to 17 blocks" },
      { label: "Hellspore", value: "Wastes + Soul Sand Valleys" },
    ],
    sections: [
      {
        title: "Silver prospecting",
        body: "Silver is no longer a mountain-only material. Rare deposits can appear in every biome, while mountains and deeper mining remain the better route.",
        points: [
          "High-elevation mountain Silver still exists, but is less common than before.",
          "Depth and mountain terrain improve the practical odds compared with casual surface mining.",
          "Only newly generated chunks receive the current world-generation changes.",
        ],
      },
      {
        title: "Coal beneath deserts",
        body: "Deserts receive a deep Coal feature aimed at the deepslate layers. The configured veins can reach 17 blocks and the placement makes repeated attempts across the lower 64 blocks of the world.",
        points: [
          "This route is for bulk fuel, not the quickest first-night Coal.",
          "Look in newly generated desert chunks at deepslate depth.",
        ],
      },
      {
        title: "Nether gathering",
        body: "Quartz is intended to be easier to gather at higher elevations and in larger quantities. Hellspore, Matcha's Nether Wart, also grows in Nether Wastes and Soul Sand Valleys.",
        points: [
          "A fortress is no longer the only route to your first Hellspore patch.",
          "Nether gravel is removed by the current terrain setup.",
          "These generation changes also require fresh chunks.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:prismarine_crystals"),
    itemKeys: [
      ensureItem("minecraft:prismarine_crystals"),
      ensureItem("minecraft:coal"),
      ensureItem("minecraft:quartz"),
      ensureItem("minecraft:nether_wart"),
    ],
    tone: "nether",
  },
);

addLocation(
  [
    "data/main/function/mechanic/warding_stone/warding_stone_forbidden.mcfunction",
    "data/main/function/mechanic/warding_stone_forbidden.mcfunction",
    "data/minecraft/loot_table/chests/trial_chambers/reward_unique.json",
    "data/minecraft/loot_table/chests/trial_chambers/reward_ominous_unique.json",
  ],
  {
    id: "trial-chambers",
    group: "Expeditions",
    name: "Trial Chambers",
    kicker: "The Warding Stone says: absolutely not",
    summary:
      "Bring a Warding Stone if you enjoy receiving exactly zero seconds of protection and one very loud correction.",
    metric: "0 seconds of warding",
    findings: [
      "Place the stone anywhere inside the structure and it is immediately removed in a TNT burst with a cloud of sculk souls.",
      "Open an ordinary unique reward and a trident is now one of the headline prizes.",
      "Take on the ominous route and its special pool can hand over a Heavy Core or Divine Fragment.",
    ],
    facts: [
      { label: "Warding", value: "Disabled inside" },
      { label: "Normal unique pool", value: "Trident or Crystal Heart added" },
      { label: "Ominous unique pool", value: "Heavy Core, Fragment, or Heart" },
    ],
    sections: [
      {
        title: "The Warding Stone rule",
        body: "Trial Chambers are one of two structures where a placed Warding Stone is explicitly forbidden. The pack removes the block immediately instead of letting it simplify the encounter.",
        points: [
          "The removal creates an instant TNT burst and 100 sculk-soul particles.",
          "Carry the stone elsewhere, but do not plan a chamber strategy around placing it.",
        ],
      },
      {
        title: "Normal vault rewards",
        body: "The normal unique reward pool keeps the familiar trim, banner pattern, and music disc, then adds Matcha's own reasons to return.",
        points: [
          "A Trident equipment roll and a Crystal Heart are both in the one-roll unique pool.",
          "Golden Apples, the Bolt trim, Guster pattern, and Precipice remain possible outcomes.",
        ],
      },
      {
        title: "Ominous vault rewards",
        body: "The ominous unique pool is the route to its strongest Matcha additions. It still gives only one result from that pool, so no single vault promises the whole list.",
        points: [
          "Heavy Core, Divine Fragment, and Crystal Heart are all possible.",
          "Enchanted Golden Apple and the Creator music disc remain in the same pool.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:trial_key"),
    itemKeys: [
      wardingStoneKey,
      ensureItem("minecraft:trident"),
      ensureItem("minecraft:heavy_core"),
      divineFragmentKey,
    ],
    tone: "copper",
  },
);

addLocation(
  [
    "data/minecraft/loot_table/chests/stronghold_corridor.json",
    "data/minecraft/loot_table/chests/stronghold_library.json",
    "data/main/advancement/tutorial/find_stronghold.json",
  ],
  {
    id: "strongholds",
    group: "Expeditions",
    name: "Strongholds",
    kicker: "The library finally has a reading list",
    summary:
      "The portal is still the grand objective, but the shelves and corridor chests now make the walk there worth rummaging through.",
    metric: "5 named finds to recognise",
    findings: [
      "Step into the structure and The End of Dreams milestone records the discovery.",
      "Check corridor chests for three Matcha finds: a Divine Fragment, Crystal Heart, and the Labyrinthine record.",
      "Check the library for two more: a Titanium Compass and The Lesser Key of Solomon.",
    ],
    facts: [
      { label: "Corridor additions", value: "3 named finds" },
      { label: "Library additions", value: "2 named finds" },
      { label: "Milestone", value: "The End of Dreams" },
    ],
    sections: [
      {
        title: "Why search beyond the portal room",
        body: "Matcha spreads five notable finds across corridor and library chests. A quick portal-only visit can miss most of the structure's new value.",
        points: [
          "Corridors can hold a Divine Fragment, Crystal Heart, or the Labyrinthine record.",
          "Libraries can hold a Titanium Compass or The Lesser Key of Solomon.",
          "Entering the structure records The End of Dreams milestone.",
        ],
      },
      {
        title: "A practical search order",
        body: "Mark the portal room, then search corridors before leaving the library for last. The named additions sit alongside ordinary Stronghold loot, so inspect every chest rather than looking for a special container.",
        points: [
          "The Eye trim still appears in Stronghold loot.",
          "The Labyrinthine record uses an Otherside disc as its base item, so trust the texture and item name.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:ender_eye"),
    itemKeys: [
      divineFragmentKey,
      crystalHeartKey,
      ensureItem("minecraft:music_disc_otherside", {
        model: "minecraft:music_disc_labyrinthine",
        name: "Labyrinthine",
      }),
      specialCompassKey,
      solomonKey,
    ],
    tone: "stone",
  },
);

addLocation(
  [
    "data/minecraft/loot_table/chests/ancient_city.json",
    "data/minecraft/loot_table/gameplay/fishing/deep_dark.json",
    "data/minecraft/villager_trade/cartographer/4/ancient_city.json",
  ],
  {
    id: "ancient-cities",
    group: "Expeditions",
    name: "Ancient Cities",
    kicker: "One map in, three treasures out",
    summary:
      "The Deep Dark now has a clearer expedition loop: buy the map, mind the shrieking, check the chests, and go fishing if bravery has become poor judgement.",
    metric: "1 map · 3 special finds",
    findings: [
      "An expert Cartographer can sell the explorer map that points the way.",
      "City chests add three special finds to watch for: Topaz, Crystal Hearts, and Divine Fragments.",
      "Deep Dark water has one local catch layered over an ordinary freshwater pool. Its name stays in enchanting-table script.",
    ],
    facts: [
      { label: "Map seller", value: "Expert Cartographer" },
      { label: "Matcha chest finds", value: "Topaz, Heart, Fragment" },
      { label: "Local fishing", value: "1 protected-name catch" },
    ],
    sections: [
      {
        title: "Getting there on purpose",
        body: "An expert Cartographer can sell the explorer map, making the city a planned expedition rather than a lucky cave discovery.",
        points: [
          "The map trade appears at villager level four.",
          "Bring wool and a route out. Matcha improves the rewards, not the Warden's manners.",
        ],
      },
      {
        title: "City chest additions",
        body: "Ancient City chests add a one-roll Matcha pool beside their normal contents. The pool contains three special rewards with different weights.",
        points: [
          "Topaz is the most heavily weighted of the three additions.",
          "Crystal Hearts and Divine Fragments share the rarer weight.",
          "Ward and Silence trims remain in the same special part of the chest table.",
        ],
      },
      {
        title: "Fishing in the Deep Dark",
        body: "Deep Dark water adds one local high-tier catch over a normal freshwater route. Its texture remains visible here, but its name stays in enchanting-table script.",
        points: [
          "This is a location-specific fishing discovery, not a replacement for the full freshwater pool.",
          "The wiki will not print the protected name before discovery.",
        ],
      },
    ],
    markerKey: ensureItem("minecraft:echo_shard"),
    itemKeys: [
      topazKey,
      crystalHeartKey,
      divineFragmentKey,
      ensureItem("minecraft:echo_shard"),
    ],
    tone: "deep",
  },
);

addLocation(
  [
    "data/minecraft/loot_table/chests/abandoned_mineshaft.json",
    "data/minecraft/loot_table/chests/simple_dungeon.json",
    "data/minecraft/loot_table/chests/desert_pyramid.json",
    "data/minecraft/loot_table/chests/buried_treasure.json",
    "data/minecraft/loot_table/chests/shipwreck_treasure.json",
  ],
  {
    id: "roads-and-ruins",
    group: "Expeditions",
    name: "Ruins worth stopping for",
    kicker: "Check the chest before calling it clutter",
    summary:
      "The small stops on a long walk now carry real reasons to dismount. Five familiar landmark families hide books, equipment, food, and one sealed note.",
    metric: "5 stops · 1 secret",
    findings: [
      "Desert Pyramid chests can hold The Avesta.",
      "Simple Dungeon chests can hold The Book of Enoch or a Crystal Heart.",
      "Buried treasure and shipwrecks are the places to check for special books, tridents, sturdy gear, and Titanium Compasses.",
      "Abandoned Mineshafts can hold one secret. This notebook has suddenly run out of ink.",
    ],
    facts: [
      { label: "Landmarks covered", value: "5 familiar ruin types" },
      { label: "Books to watch for", value: "Avesta + Enoch" },
      { label: "Mineshaft recipe", value: "Secret" },
    ],
    sections: [
      {
        title: "Books in small structures",
        body: "Desert Pyramids and Simple Dungeons now matter to the pack's book trail, so even a familiar chest can advance a much larger collection.",
        points: [
          "Desert Pyramid chests can contain The Avesta.",
          "Simple Dungeon chests can contain The Book of Enoch or a Crystal Heart.",
        ],
      },
      {
        title: "Coastal treasure routes",
        body: "Buried treasure and shipwrecks carry several of Matcha's useful travel and equipment rewards beside their normal valuables.",
        points: [
          "Watch for Titanium Compasses, Tridents, sturdy equipment, and special books.",
          "Buried treasure remains useful to Silver progression as well.",
        ],
      },
      {
        title: "The sealed Mineshaft note",
        body: "Abandoned Mineshafts can contain a recipe intended to be discovered in play. Its ingredients and result remain secret here.",
        points: ["The page confirms that a secret exists and stops there."],
      },
    ],
    markerKey: ensureItem("minecraft:compass"),
    itemKeys: [
      avestaKey,
      enochKey,
      crystalHeartKey,
      ensureItem("minecraft:trident"),
      specialCompassKey,
    ],
    tone: "sand",
  },
);

addLocation(
  [
    "data/minecraft/loot_table/chests/bastion_bridge.json",
    "data/minecraft/loot_table/chests/bastion_hoglin_stable.json",
    "data/minecraft/loot_table/chests/bastion_other.json",
    "data/minecraft/loot_table/chests/bastion_treasure.json",
  ],
  {
    id: "bastions",
    group: "Other dimensions",
    name: "Bastion Remnants",
    kicker: "Three Ruby stops, one very hot walk",
    summary:
      "The piglins have excellent taste in red gemstones and terrible opinions about visitors. Three parts of a Bastion can pay for the risk.",
    metric: `${rubyBastionCaches.length} Ruby-bearing cache types`,
    findings: [
      "Bridge, Hoglin Stable, and Treasure caches each include a Ruby roll.",
      "Gold and damaged diamond gear arrive through the pack’s curated equipment sets instead of a long scatter of separate tool rolls.",
      "Treasure rooms still carry Netherite Upgrade templates, scrap, ingots, and ancient debris beside the new gem.",
    ],
    facts: [
      { label: "Ruby cache types", value: `${rubyBastionCaches.length}` },
      { label: "Ruby locations", value: "Bridge, Stable, Treasure" },
      { label: "Treasure upgrade", value: "Netherite template guaranteed" },
    ],
    sections: [
      {
        title: "Where Ruby enters the loot",
        body: "Ruby is attached to three Bastion chest families. The bridge, Hoglin Stable, and Treasure tables each include a Ruby roll.",
        points: [
          "Do not assume every generic Bastion chest uses the same gem pool.",
          "Treasure rooms are the strongest combined route because Ruby sits beside Netherite materials.",
        ],
      },
      {
        title: "Treasure-room haul",
        body: "The Treasure table still pays in ancient debris, scrap, blocks, ingots, and templates. Matcha adds Ruby without removing the main reason players raid the room.",
        points: [
          "The Netherite Upgrade template remains a guaranteed one-roll entry.",
          "Snout trim, Crying Obsidian, Quartz, and Gilded Blackstone remain possible supporting loot.",
        ],
      },
    ],
    markerKey: rubyKey || ensureItem("minecraft:gilded_blackstone"),
    itemKeys: [
      rubyKey,
      ensureItem("minecraft:netherite_upgrade_smithing_template"),
      ensureItem("minecraft:netherite_scrap"),
    ],
    tone: "nether",
  },
);

addLocation(["data/minecraft/loot_table/chests/end_city_treasure.json"], {
  id: "end-cities",
  group: "Other dimensions",
  name: "End Cities",
  kicker: "Less lottery, more loadout",
  summary:
    "The purple towers still pay well, but their chests are easier to read: one curated diamond-equipment pool replaces a pile of separate enchanted gear rolls.",
  metric: "1 curated diamond gear pool",
  findings: [
    "When diamond gear rolls, it comes from one shared enchanted set rather than a random parade of separately defined tools and armour.",
    "Iron blocks, loose diamonds, emeralds, gold, iron, and horse armour still fill out the haul.",
    "The Spire armour trim remains in the same city chest, so fashion survives the cleanup.",
  ],
  facts: [
    { label: "Gear source", value: "1 shared enchanted diamond pool" },
    { label: "Trim", value: "Spire" },
    { label: "Bulk find", value: "Iron blocks" },
  ],
  sections: [
    {
      title: "How the equipment roll changed",
      body: "Instead of defining separate enchanted diamond tools and armour throughout the chest table, Matcha points the gear result to one curated diamond equipment pool.",
      points: [
        "The change makes the loot definition more consistent, not less valuable.",
        "Any individual chest can still miss the equipment roll.",
      ],
    },
    {
      title: "What still comes home",
      body: "End City treasure remains a broad late-game haul. The pool still includes loose metals and gems, horse armour, building blocks, and the local trim.",
      points: [
        "Iron blocks, diamonds, iron, gold, and emeralds remain in the main rolls.",
        "Golden and diamond horse armour are still possible.",
        "The Spire trim remains the location's fashion prize.",
      ],
    },
  ],
  markerKey: ensureItem("minecraft:ender_chest"),
  itemKeys: [
    ensureItem("minecraft:diamond_chestplate"),
    ensureItem("minecraft:iron_block"),
    ensureItem("minecraft:spire_armor_trim_smithing_template"),
  ],
  tone: "end",
});

const untexturedItemKeys = new Set(
  [...itemMap.values()].filter((item) => !item.texture).map((item) => item.key),
);
const brokenPublicRecipe = recipes.find(
  (recipe) => !recipe.secret && untexturedItemKeys.has(recipe.result.key),
);
if (brokenPublicRecipe) {
  throw new Error(
    `Public recipe output has no pack or Minecraft texture: ${brokenPublicRecipe.id}`,
  );
}
const quarantinedRecipes = recipes.filter(
  (recipe) => recipe.secret && untexturedItemKeys.has(recipe.result.key),
);
const publishableRecipes = recipes.filter(
  (recipe) => !untexturedItemKeys.has(recipe.result.key),
);

publishableRecipes.sort((a, b) => {
  if (a.station !== b.station) {
    return a.stationLabel.localeCompare(b.stationLabel);
  }
  if (a.family !== b.family) return a.family.localeCompare(b.family);
  return a.name.localeCompare(b.name);
});

const items = [...itemMap.values()]
  .filter((item) => item.texture)
  .map((item) => ({
    ...item,
    outputOf: [...new Set(item.outputOf)],
    usedIn: [...new Set(item.usedIn)],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const stationCounts = Object.fromEntries(
  Object.keys(stationLabels).map((station) => [
    station,
    publishableRecipes.filter((recipe) => recipe.station === station).length,
  ]),
);

const fallbackRelease = {
  version: "1.02",
  name: "Tutorialisation Hotfix",
  minecraft: "26.2",
  published: "July 26, 2026",
  modrinthUrl: "https://modrinth.com/datapack/matcha-flavoured",
  downloadUrl:
    "https://cdn.modrinth.com/data/QI0EmgZ1/versions/RVX0a6It/Matcha_Flavoured.zip",
  sha1: "c3a927d6f178d7d13478d63fdfede08a688faca5",
  versionId: "RVX0a6It",
  highlights: [
    "Clearer campfire, food, and warding guidance",
    "Wheat seeds now drop when hoeing grass",
    "Steel blasts faster and fortune works on spawners",
  ],
};

const output = {
  release: {
    ...fallbackRelease,
    ...(releaseMetadata || {}),
  },
  stats: {
    recipeCount: publishableRecipes.length,
    craftingCount: stationCounts.crafting,
    itemCount: items.length,
    advancementCount: advancements.length,
    locationCount: locations.length,
    textureCount: walk(
      path.join(publicRoot, "minecraft/assets/minecraft/textures"),
    ).filter((file) => file.endsWith(".png")).length,
    reviewPendingRecipeCount: publishableRecipes.filter(
      (recipe) => recipe.reviewPending,
    ).length,
    excludedVanillaRecipeCount: excludedVanillaRecipeIds.length,
    quarantinedRecipeCount: quarantinedRecipes.length,
    untexturedItemCount: untexturedItemKeys.size,
    stationCounts,
  },
  stations: Object.entries(stationLabels)
    .filter(([id]) => stationCounts[id] > 0)
    .map(([id, label]) => ({
      id,
      label,
      texture: versionedAssetUrl(stationTextures[id]),
      count: stationCounts[id],
    })),
  recipes: publishableRecipes,
  items,
  advancements,
  fish,
  locations,
  progressionRules,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(output));
console.log(
  `Generated ${publishableRecipes.length} recipes, ${items.length} items, and ${advancements.length} advancements.` +
    ` Excluded ${excludedVanillaRecipeIds.length} unchanged Minecraft recipes.` +
    (quarantinedRecipes.length
      ? ` Quarantined ${quarantinedRecipes.length} hidden recipes with missing source textures.`
      : ""),
);
