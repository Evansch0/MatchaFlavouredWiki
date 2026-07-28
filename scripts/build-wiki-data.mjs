import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const projectRoot = process.cwd();
const packRoot = process.argv[2] || "/tmp/matcha-flavoured-1.02";
const outputFile =
  process.argv[3] || path.join(projectRoot, "app/data/wiki-data.json");
const releaseMetadataFile = process.argv[4] || "";
const publicRoot = process.argv[5] || path.join(projectRoot, "public");
const visibilityManifestFile =
  process.argv[6] || path.join(projectRoot, "app/data/recipe-visibility.json");
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
    name: nameForId(normalizedId),
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

const tagFallbacks = {
  "minecraft:coals": ["minecraft:coal"],
  "minecraft:eggs": ["minecraft:egg"],
  "minecraft:fishes": ["minecraft:cod", "minecraft:salmon"],
  "minecraft:logs": ["minecraft:oak_log"],
  "minecraft:planks": ["minecraft:oak_planks"],
  "minecraft:sand": ["minecraft:sand", "minecraft:red_sand"],
  "minecraft:stone_crafting_materials": ["minecraft:cobblestone"],
  "minecraft:wool": ["minecraft:white_wool"],
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
  "cinnabar",
  "sulfur",
  "stone",
];

function familyFor(recipePath, station, ingredients, category, namespace) {
  if (station === "stonecutting") {
    return ingredients[0]?.label
      ? `${ingredients[0].label} family`
      : "Other stonecutting";
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

const visibilityManifest = readJson(visibilityManifestFile)?.recipes || {};
const hasVisibilityManifest = Object.keys(visibilityManifest).length > 0;

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
  return {
    secret: true,
    reviewPending: true,
  };
}

const recipes = [];

for (const file of recipeFiles) {
  const recipe = readJson(file);
  if (!recipe?.type || !recipe.result) continue;
  const relative = path.relative(packRoot, file).replaceAll(path.sep, "/");
  const [, namespace, , ...recipePathParts] = relative.split("/");
  const recipePath = recipePathParts.join("/").replace(/\.json$/, "");
  const id = `${namespace}:${recipePath}`;
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

recipes.sort((a, b) => {
  if (a.station !== b.station) {
    return a.stationLabel.localeCompare(b.stationLabel);
  }
  if (a.family !== b.family) return a.family.localeCompare(b.family);
  return a.name.localeCompare(b.name);
});

const items = [...itemMap.values()]
  .map((item) => ({
    ...item,
    outputOf: [...new Set(item.outputOf)],
    usedIn: [...new Set(item.usedIn)],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const stationCounts = Object.fromEntries(
  Object.keys(stationLabels).map((station) => [
    station,
    recipes.filter((recipe) => recipe.station === station).length,
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
    recipeCount: recipes.length,
    craftingCount: stationCounts.crafting,
    itemCount: items.length,
    advancementCount: advancements.length,
    textureCount: walk(
      path.join(publicRoot, "minecraft/assets/minecraft/textures"),
    ).filter((file) => file.endsWith(".png")).length,
    reviewPendingRecipeCount: recipes.filter((recipe) => recipe.reviewPending)
      .length,
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
  recipes,
  items,
  advancements,
  fish,
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(output));
console.log(
  `Generated ${recipes.length} recipes, ${items.length} items, and ${advancements.length} advancements.`,
);
