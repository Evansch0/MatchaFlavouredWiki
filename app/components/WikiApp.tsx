import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import wikiDataJson from "../data/wiki-data.json";

type Item = {
  key: string;
  id: string;
  model: string;
  name: string;
  texture: string;
  color: string | null;
  lore: string[];
  effects: { name: string; level: number; seconds: number }[];
  properties: string[];
  outputOf: string[];
  usedIn: string[];
  obscured?: boolean;
  rarity?: string | null;
  sga?: number[];
};

type Recipe = {
  id: string;
  slug: string;
  name: string;
  namespace: string;
  path: string;
  type: string;
  station: string;
  stationLabel: string;
  stationTexture: string;
  category: string;
  family: string;
  secret: boolean;
  result: { key: string; count: number };
  ingredientKeys: string[];
  ingredients: Ingredient[];
  grid: (Ingredient | null)[];
  cookingTime: number;
  experience: number;
  reviewPending?: boolean;
};

type Ingredient = {
  keys: string[];
  label: string;
  tag: string | null;
};

type Advancement = {
  id: string;
  section: string;
  title: string;
  description: string;
  frame: string;
  iconKey: string | null;
  parent: string | null;
};

type FishEntry = {
  itemKey: string;
  tier: string;
  stars: number;
  obscured: boolean;
  saleCount: number;
};

type ChangelogEntry = {
  versionId: string;
  version: string;
  name: string;
  published: string;
  minecraft: string[];
  channel: string;
  featured: boolean;
  blocks: {
    type: "heading" | "bullet" | "paragraph";
    text: string;
  }[];
};

type WikiData = {
  release: {
    version: string;
    name: string;
    minecraft: string;
    published: string;
    modrinthUrl: string;
    downloadUrl: string;
    versionId?: string;
    highlights?: string[];
    changelog?: ChangelogEntry[];
    changelogHash?: string;
    checkedAt?: string;
  };
  stats: {
    recipeCount: number;
    craftingCount: number;
    itemCount: number;
    advancementCount: number;
    textureCount: number;
    reviewPendingRecipeCount?: number;
  };
  stations: {
    id: string;
    label: string;
    texture: string;
    count: number;
  }[];
  items: Item[];
  recipes: Recipe[];
  advancements: Advancement[];
  fish: FishEntry[];
};

const wikiData = wikiDataJson as unknown as WikiData;

function assetUrl(url: string) {
  if (!url.startsWith("/")) return url;
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${url.replace(/^\/+/, "")}`;
}

function releaseAsset(url: string) {
  const revision = wikiData.release.versionId || wikiData.release.version;
  const resolved = assetUrl(url);
  const separator = resolved.includes("?") ? "&" : "?";
  return `${resolved}${separator}v=${encodeURIComponent(revision)}`;
}

const navItems = [
  { route: "home", label: "Home", icon: "⌂" },
  { route: "recipes", label: "Recipe Book", icon: "▦" },
  { route: "items", label: "Item Pantry", icon: "◇" },
  { route: "progression", label: "Progression", icon: "✦" },
  { route: "guides", label: "Field Guides", icon: "☘" },
  { route: "changelog", label: "Changelog", icon: "✎" },
];

const stationIcons: Record<string, string> = {
  crafting:
    "/minecraft/assets/minecraft/textures/block/crafting_table_front.png",
  furnace: "/minecraft/assets/minecraft/textures/block/furnace_front.png",
  blasting:
    "/minecraft/assets/minecraft/textures/block/blast_furnace_front.png",
  smoking: "/minecraft/assets/minecraft/textures/block/smoker_front.png",
  campfire: "/minecraft/assets/minecraft/textures/item/campfire.png",
  smithing:
    "/minecraft/assets/minecraft/textures/block/smithing_table_front.png",
  stonecutting:
    "/minecraft/assets/minecraft/textures/block/stonecutter_side.png",
};

const lightSurfaceItemColors: Record<string, string> = {
  gold: "#9b6200",
  yellow: "#766400",
  white: "#62584d",
  aqua: "#087a7d",
};

function readableItemColor(color?: string | null) {
  if (!color) return undefined;
  return lightSurfaceItemColors[color.toLowerCase()] || color;
}

function friendlyCategory(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function routeFromHash() {
  if (typeof window === "undefined") return "home";
  return window.location.hash.replace(/^#\//, "") || "home";
}

function findItem(name: string) {
  return wikiData.items.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
}

function ItemSprite({
  item,
  size = "md",
  onOpen,
}: {
  item?: Item;
  size?: "sm" | "md" | "lg";
  onOpen?: (item: Item) => void;
}) {
  if (!item) return <span className={`item-sprite ${size} missing`}>?</span>;
  const image = (
    <img
      src={assetUrl(item.texture)}
      alt=""
      width={64}
      height={64}
      draggable={false}
    />
  );
  if (!onOpen) {
    return (
      <span className={`item-sprite ${size}`} title={item.name}>
        {image}
      </span>
    );
  }
  return (
    <button
      className={`item-sprite ${size} is-clickable`}
      type="button"
      title={`Open ${item.name}`}
      aria-label={`Open ${item.name}`}
      onClick={() => onOpen(item)}
    >
      {image}
    </button>
  );
}

function GalacticText({
  glyphs = [],
  className = "",
}: {
  glyphs?: number[];
  className?: string;
}) {
  return (
    <span
      className={`sga-text ${className}`}
      aria-label="Name written in enchanting-table script"
    >
      {glyphs.map((code, index) =>
        code === 32 ? (
          <span className="sga-space" key={`space-${index}`} />
        ) : (
          <span
            className="sga-glyph"
            key={`${code}-${index}`}
            style={
              {
                "--sga-column": code % 16,
                "--sga-row": Math.floor(code / 16),
              } as CSSProperties
            }
          />
        ),
      )}
    </span>
  );
}

function itemCategory(item: Item) {
  const lower = item.name.toLowerCase();
  if (item.rarity) return "Fish";
  if (
    item.effects.length > 0 ||
    item.outputOf.some((recipe) => recipe.startsWith("food:"))
  ) {
    return "Food & drink";
  }
  if (
    item.properties.some((property) =>
      /durability|attack|armor|movement|reach/i.test(property),
    ) ||
    /sword|axe|pickaxe|shovel|hoe|spear|mattock|helmet|chestplate|leggings|boots|shield|bow|mace|elytra/.test(
      lower,
    )
  ) {
    return "Gear";
  }
  if (
    /block|bricks|stairs|slab|wall|fence|door|trapdoor|planks| log| wood|terracotta|glass|sandstone|stone$/.test(
      lower,
    )
  ) {
    return "Blocks";
  }
  if (
    item.usedIn.length >= 4 ||
    /ingot|alloy|nugget|scrap|fragment|dust|dye|wire|leather|flour|dough|wax|sulfur|quartz|diamond|copper|iron|gold/.test(
      lower,
    )
  ) {
    return "Materials";
  }
  return "Curios";
}

function ItemCard({
  item,
  onOpen,
}: {
  item: Item;
  onOpen: (item: Item) => void;
}) {
  return (
    <button
      className={`item-card ${item.obscured ? "is-obscured" : ""}`}
      type="button"
      onClick={() => onOpen(item)}
    >
      <ItemSprite item={item} size="lg" />
      <span className="item-card-copy">
        {item.obscured ? (
          <strong className="obscured-name">
            <GalacticText glyphs={item.sga} />
          </strong>
        ) : (
          <strong
            style={
              item.color ? { color: readableItemColor(item.color) } : undefined
            }
          >
            {item.name}
          </strong>
        )}
        <small>
          {item.obscured
            ? `${item.rarity} · identity hidden`
            : itemCategory(item)}
        </small>
      </span>
      <span className="item-card-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

function ItemsPage({ openItem }: { openItem: (item: Item) => void }) {
  const categories = [
    "All items",
    "Fish",
    "Food & drink",
    "Gear",
    "Materials",
    "Blocks",
    "Curios",
  ];
  const [category, setCategory] = useState("All items");
  const [visibleCount, setVisibleCount] = useState(72);

  const categorized = useMemo(
    () =>
      wikiData.items.filter(
        (item) => category === "All items" || itemCategory(item) === category,
      ),
    [category],
  );

  const chooseCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setVisibleCount(72);
  };

  return (
    <div className="page collection-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">Texture-accurate shelves</p>
          <h1>Item Pantry</h1>
        </div>
        <p>
          Every icon comes from Matcha Flavoured or the matching Minecraft
          release. Open anything to see where it comes from and what it makes.
        </p>
      </header>

      <div
        className="category-tabs"
        role="tablist"
        aria-label="Item categories"
      >
        {categories.map((option) => {
          const count =
            option === "All items"
              ? wikiData.items.length
              : wikiData.items.filter((item) => itemCategory(item) === option)
                  .length;
          return (
            <button
              key={option}
              className={category === option ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={category === option}
              onClick={() => chooseCategory(option)}
            >
              {option} <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="collection-meta">
        <strong>{categorized.length.toLocaleString()} entries</strong>
        <span>Click any item to follow its recipe trail.</span>
      </div>

      <div className="item-grid">
        {categorized.slice(0, visibleCount).map((item) => (
          <ItemCard key={item.key} item={item} onOpen={openItem} />
        ))}
      </div>

      {visibleCount < categorized.length && (
        <div className="load-more">
          <button
            className="button button-earth"
            type="button"
            onClick={() => setVisibleCount((count) => count + 72)}
          >
            Unpack 72 more items
          </button>
          <small>{categorized.length - visibleCount} still tucked away</small>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "Instant";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder}s`;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function RecipeLinkCard({
  recipe,
  openRecipe,
}: {
  recipe: Recipe;
  openRecipe: (recipe: Recipe) => void;
}) {
  const output = wikiData.items.find((item) => item.key === recipe.result.key);
  return (
    <button
      type="button"
      className="recipe-link-card"
      onClick={() => openRecipe(recipe)}
    >
      <ItemSprite item={output} size="md" />
      <span>
        <strong>{recipe.name}</strong>
        <small>{recipe.stationLabel}</small>
      </span>
      {recipe.secret ? <em>Secret</em> : <span aria-hidden="true">→</span>}
    </button>
  );
}

function ItemPage({
  item,
  openItem,
  openRecipe,
  go,
}: {
  item?: Item;
  openItem: (item: Item) => void;
  openRecipe: (recipe: Recipe) => void;
  go: (route: string) => void;
}) {
  const [showAllUses, setShowAllUses] = useState(false);

  if (!item) {
    return (
      <div className="page empty-state">
        <span>?</span>
        <h1>That item wandered off.</h1>
        <p>It may have changed between releases.</p>
        <button className="button button-earth" onClick={() => go("items")}>
          Return to the pantry
        </button>
      </div>
    );
  }

  if (item.obscured) {
    return (
      <div className="page item-detail-page">
        <button className="back-link" type="button" onClick={() => go("items")}>
          ← Back to the pantry
        </button>
        <section className="mystery-fish">
          <div className="mystery-fish-sprite">
            <img src={assetUrl(item.texture)} alt="" />
          </div>
          <p className="eyebrow">{item.rarity} catch · discovery protected</p>
          <h1>
            <GalacticText glyphs={item.sga} className="is-large" />
          </h1>
          <p>
            This higher-tier fish is intentionally obscured. Cast your line in
            different waters, sell earlier catches to a Fisherman, and let the
            reveal happen in-game.
          </p>
          <div className="mystery-stars" aria-label={`${item.rarity} fish`}>
            {item.rarity === "Epic" ? "★★★★" : "★★★"}
          </div>
        </section>
      </div>
    );
  }

  const madeBy = item.outputOf
    .map((id) => wikiData.recipes.find((recipe) => recipe.id === id))
    .filter(Boolean) as Recipe[];
  const usedIn = item.usedIn
    .map((id) => wikiData.recipes.find((recipe) => recipe.id === id))
    .filter(Boolean) as Recipe[];
  const visibleUses = showAllUses ? usedIn : usedIn.slice(0, 12);

  return (
    <div className="page item-detail-page">
      <button className="back-link" type="button" onClick={() => go("items")}>
        ← Back to the pantry
      </button>

      <section className="item-hero">
        <div className="item-display" aria-hidden="true">
          <img src={assetUrl(item.texture)} alt="" />
        </div>
        <div className="item-heading">
          <p className="eyebrow">{itemCategory(item)}</p>
          <h1 style={item.color ? { color: item.color } : undefined}>
            {item.name}
          </h1>
          <p>
            {madeBy.length
              ? `Made by ${madeBy.length} ${madeBy.length === 1 ? "recipe" : "recipes"}`
              : "Found, traded, gathered, or used as a base ingredient"}
            {" · "}
            {usedIn.length
              ? `appears in ${usedIn.length} more`
              : "a fine thing on its own"}
          </p>
          <div className="technical-id">
            <span>Item model</span>
            <code>{item.model}</code>
          </div>
        </div>
      </section>

      {(item.lore.length > 0 ||
        item.effects.length > 0 ||
        item.properties.length > 0) && (
        <section className="item-facts-grid">
          {item.lore.length > 0 && (
            <article className="fact-card lore-card">
              <p className="section-kicker">In-game tooltip</p>
              <h2>What it tells you</h2>
              <div className="tooltip-lines">
                {item.lore.map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
              </div>
            </article>
          )}

          {item.effects.length > 0 && (
            <article className="fact-card">
              <p className="section-kicker">Intrinsic effects</p>
              <h2>What it does</h2>
              <div className="effect-list">
                {item.effects.map((effect, index) => (
                  <div key={`${effect.name}-${index}`}>
                    <span aria-hidden="true">✦</span>
                    <p>
                      <strong>
                        {effect.name} {effect.level > 1 ? effect.level : ""}
                      </strong>
                      <small>{formatDuration(effect.seconds)}</small>
                    </p>
                  </div>
                ))}
              </div>
            </article>
          )}

          {item.properties.length > 0 && (
            <article className="fact-card">
              <p className="section-kicker">Item properties</p>
              <h2>Useful numbers</h2>
              <div className="property-chips">
                {item.properties.map((property) => (
                  <span key={property}>{property}</span>
                ))}
              </div>
            </article>
          )}
        </section>
      )}

      <section className="recipe-trails">
        <div className="trail-section">
          <div className="section-heading compact">
            <div>
              <p className="section-kicker">Ways to obtain it</p>
              <h2>Made by</h2>
            </div>
            <span>{madeBy.length}</span>
          </div>
          {madeBy.length ? (
            <div className="recipe-link-grid">
              {madeBy.map((recipe) => (
                <RecipeLinkCard
                  key={recipe.id}
                  recipe={recipe}
                  openRecipe={openRecipe}
                />
              ))}
            </div>
          ) : (
            <div className="soft-empty">
              <span>☘</span>
              <p>
                No recipe in the pack creates this exact item. Look for it in
                the world, in loot, or through trading.
              </p>
            </div>
          )}
        </div>

        <div className="trail-section">
          <div className="section-heading compact">
            <div>
              <p className="section-kicker">Where it goes next</p>
              <h2>Used in</h2>
            </div>
            <span>{usedIn.length}</span>
          </div>
          {visibleUses.length ? (
            <>
              <div className="recipe-link-grid">
                {visibleUses.map((recipe) => (
                  <RecipeLinkCard
                    key={recipe.id}
                    recipe={recipe}
                    openRecipe={openRecipe}
                  />
                ))}
              </div>
              {!showAllUses && usedIn.length > visibleUses.length && (
                <button
                  className="text-link trail-more"
                  type="button"
                  onClick={() => setShowAllUses(true)}
                >
                  Show all {usedIn.length} uses →
                </button>
              )}
            </>
          ) : (
            <div className="soft-empty">
              <span>◇</span>
              <p>
                This item is an endpoint, a treasure, or simply good company.
              </p>
            </div>
          )}
        </div>
      </section>

      {usedIn.length > 0 && (
        <aside className="item-neighbor-note">
          <strong>Keep wandering.</strong>
          <p>
            Every ingredient and output in the recipe book is clickable, so you
            can move through the whole pack one item at a time.
          </p>
          {usedIn[0]?.ingredientKeys
            .filter((key) => key !== item.key)
            .slice(0, 4)
            .map((key) => {
              const neighbor = wikiData.items.find(
                (candidate) => candidate.key === key,
              );
              return neighbor ? (
                <ItemSprite
                  key={neighbor.key}
                  item={neighbor}
                  size="md"
                  onOpen={openItem}
                />
              ) : null;
            })}
        </aside>
      )}
    </div>
  );
}

function HomePage({
  go,
  openItem,
}: {
  go: (route: string) => void;
  openItem: (item: Item) => void;
}) {
  const featured = [
    findItem("Crystal Heart"),
    findItem("Hepatizon Alloy"),
    findItem("Japanese Curry"),
    findItem("Warding Stone"),
    findItem("Divine Fragment"),
  ].filter(Boolean) as Item[];

  return (
    <div className="page page-home">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">
            Unofficial field notes · v{wikiData.release.version}
          </p>
          <h1>
            Minecraft,
            <span> steeped a little slower.</span>
          </h1>
          <p className="hero-lede">
            A friendly guide to Matcha Flavoured&apos;s foods, alloys,
            blessings, equipment, and delightfully strange progression.
          </p>
          <div className="hero-actions">
            <button
              className="button button-primary"
              onClick={() => go("recipes")}
            >
              Open the recipe book
            </button>
            <button
              className="button button-quiet"
              onClick={() => go("guides")}
            >
              Plan your first morning
            </button>
          </div>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <img src={releaseAsset("/matcha/pack.png")} alt="" />
          <span>Take your time.</span>
        </div>
      </section>

      <section className="stat-ribbon" aria-label="Wiki coverage">
        <div>
          <strong>{wikiData.stats.recipeCount.toLocaleString()}</strong>
          <span>mapped recipes</span>
        </div>
        <div>
          <strong>{wikiData.stats.itemCount.toLocaleString()}</strong>
          <span>clickable items</span>
        </div>
        <div>
          <strong>{wikiData.stats.textureCount.toLocaleString()}</strong>
          <span>real textures</span>
        </div>
        <div>
          <strong>{wikiData.stats.advancementCount}</strong>
          <span>visible milestones</span>
        </div>
      </section>

      <section className="home-grid">
        <article className="paper-card start-card">
          <div className="section-kicker">Your first morning</div>
          <h2>A soft landing in a tougher early game</h2>
          <ol className="start-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Gather grass and make a wooden hoe.</strong>
                <p>
                  Stone tools are gone, so copper is your first real upgrade.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Build a campfire and cook what you find.</strong>
                <p>
                  Cooking reveals the intrinsic effects hidden in ingredients.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Work toward the Mud Kiln.</strong>
                <p>
                  Advancements and locked recipes gently point the way onward.
                </p>
              </div>
            </li>
          </ol>
          <button className="text-link" onClick={() => go("progression")}>
            Follow the early-game trail <span>→</span>
          </button>
        </article>

        <article className="paper-card update-card">
          <div className="section-kicker">Latest release</div>
          <h2>{wikiData.release.name}</h2>
          <p className="release-line">
            {wikiData.release.published} · Minecraft{" "}
            {wikiData.release.minecraft}
          </p>
          <ul className="leaf-list">
            {(
              wikiData.release.highlights || [
                "Wiki data and textures synchronized from Modrinth",
                "Recipes, items, and advancements rebuilt locally",
                "Secret recipes remain protected",
              ]
            ).map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          <button
            className="text-link"
            type="button"
            onClick={() => go("changelog")}
          >
            Read the full changelog <span>→</span>
          </button>
        </article>
      </section>

      <section className="portal-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Pick a path</p>
            <h2>What are we making today?</h2>
          </div>
          <p>Everything links together, so wandering is encouraged.</p>
        </div>
        <div className="portal-grid">
          <button className="portal-card recipes" onClick={() => go("recipes")}>
            <span className="portal-glyph">▦</span>
            <strong>Recipe Book</strong>
            <small>Every station, neatly tucked into families</small>
          </button>
          <button className="portal-card items" onClick={() => go("items")}>
            <span className="portal-glyph">◇</span>
            <strong>Item Pantry</strong>
            <small>Foods, tools, curios, blocks, and ingredients</small>
          </button>
          <button
            className="portal-card progression"
            onClick={() => go("progression")}
          >
            <span className="portal-glyph">✦</span>
            <strong>Progression</strong>
            <small>A spoiler-light route through the pack</small>
          </button>
          <button className="portal-card guides" onClick={() => go("guides")}>
            <span className="portal-glyph">☘</span>
            <strong>Field Guides</strong>
            <small>Food, fishing, alloys, blessings, and more</small>
          </button>
        </div>
      </section>

      <section className="featured-section">
        <div className="section-heading compact">
          <div>
            <p className="section-kicker">A pocketful of curiosities</p>
            <h2>Tap an item to follow its thread</h2>
          </div>
        </div>
        <div className="featured-items">
          {featured.map((item) => (
            <button key={item.key} onClick={() => openItem(item)}>
              <ItemSprite item={item} size="lg" />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="spoiler-note">
        <span aria-hidden="true">?</span>
        <div>
          <strong>Some things taste better discovered.</strong>
          <p>
            Secret items still have pages here, but their recipes stay tucked
            away. You&apos;ll get a wink, not a spoiler.
          </p>
        </div>
      </aside>
    </div>
  );
}

function itemByKey(key?: string) {
  return key ? wikiData.items.find((item) => item.key === key) : undefined;
}

function MachineItem({
  item,
  quantity,
  className = "",
  title,
  onOpen,
}: {
  item?: Item;
  quantity?: number;
  className?: string;
  title?: string;
  onOpen: (item: Item) => void;
}) {
  if (!item) return null;
  return (
    <button
      className={`mc-item ${className}`}
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open ${item.name}`}
      title={title || item.name}
    >
      <img src={assetUrl(item.texture)} alt="" />
      {quantity && quantity > 1 ? <span>{quantity}</span> : null}
    </button>
  );
}

function MachineCanvas({
  recipe,
  openItem,
}: {
  recipe: Recipe;
  openItem: (item: Item) => void;
}) {
  const output = itemByKey(recipe.result.key);
  const stationClass =
    recipe.station === "furnace" ||
    recipe.station === "blasting" ||
    recipe.station === "smoking" ||
    recipe.station === "campfire"
      ? "cooking"
      : recipe.station;

  return (
    <div className="machine-scroll">
      <div
        className={`mc-machine mc-${stationClass}`}
        style={{
          backgroundImage: `url("${assetUrl(recipe.stationTexture)}")`,
        }}
        aria-label={`${recipe.stationLabel} interface for ${recipe.name}`}
      >
        {recipe.station === "crafting" &&
          recipe.grid.map((ingredient, index) => {
            const item = itemByKey(ingredient?.keys[0]);
            return (
              <MachineItem
                key={`grid-${index}`}
                item={item}
                className={`mc-grid-${index}`}
                title={ingredient?.label}
                onOpen={openItem}
              />
            );
          })}

        {recipe.station === "smithing" &&
          recipe.ingredients
            .slice(0, 3)
            .map((ingredient, index) => (
              <MachineItem
                key={`${ingredient.label}-${index}`}
                item={itemByKey(ingredient.keys[0])}
                className={`mc-smithing-${index}`}
                title={ingredient.label}
                onOpen={openItem}
              />
            ))}

        {recipe.station !== "crafting" && recipe.station !== "smithing" && (
          <MachineItem
            item={itemByKey(recipe.ingredients[0]?.keys[0])}
            className="mc-station-input"
            title={recipe.ingredients[0]?.label}
            onOpen={openItem}
          />
        )}

        <MachineItem
          item={output}
          quantity={recipe.result.count}
          className="mc-output"
          onOpen={openItem}
        />
      </div>
    </div>
  );
}

function SecretRecipe({
  recipe,
  openItem,
}: {
  recipe: Recipe;
  openItem: (item: Item) => void;
}) {
  const output = itemByKey(recipe.result.key);
  return (
    <div className="secret-recipe">
      <div className="secret-output">
        <ItemSprite item={output} size="lg" onOpen={openItem} />
      </div>
      <p className="eyebrow">
        {recipe.reviewPending
          ? "Recipe awaiting safe review"
          : "Recipe intentionally withheld"}
      </p>
      <h2>
        {recipe.reviewPending
          ? "Details tucked away for now."
          : "It\u0027s a secret."}
      </h2>
      <p>
        {recipe.reviewPending
          ? "This recipe changed in the newest release. Its ingredients stay hidden until the update is checked for surprises."
          : "The item is real, the recipe is real, and discovering it is part of the fun. This wiki will not show the ingredients, arrangement, or unlock."}
      </p>
      <span>?</span>
    </div>
  );
}

function IngredientLedger({
  recipe,
  openItem,
}: {
  recipe: Recipe;
  openItem: (item: Item) => void;
}) {
  const summarized = useMemo(() => {
    const entries = new Map<
      string,
      { ingredient: Ingredient; count: number }
    >();
    for (const ingredient of recipe.ingredients) {
      const key = `${ingredient.label}|${ingredient.keys.join(",")}`;
      const current = entries.get(key);
      entries.set(key, {
        ingredient,
        count: (current?.count || 0) + 1,
      });
    }
    return [...entries.values()];
  }, [recipe]);

  return (
    <aside className="ingredient-ledger">
      <p className="section-kicker">Clickable ingredients</p>
      <h3>What goes in</h3>
      <div className="ledger-list">
        {summarized.map(({ ingredient, count }) => (
          <div key={`${ingredient.label}-${ingredient.keys.join("-")}`}>
            <ItemSprite
              item={itemByKey(ingredient.keys[0])}
              size="md"
              onOpen={openItem}
            />
            <span>
              <strong>{ingredient.label}</strong>
              <small>
                {count > 1 ? `×${count}` : "×1"}
                {ingredient.keys.length > 1
                  ? ` · ${ingredient.keys.length} choices`
                  : ""}
              </small>
            </span>
            {ingredient.keys.length > 1 && (
              <details>
                <summary aria-label={`Show choices for ${ingredient.label}`}>
                  +
                </summary>
                <div>
                  {ingredient.keys.slice(0, 10).map((key) => {
                    const option = itemByKey(key);
                    return option ? (
                      <ItemSprite
                        key={key}
                        item={option}
                        size="sm"
                        onOpen={openItem}
                      />
                    ) : null;
                  })}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
      {(recipe.cookingTime > 0 || recipe.experience > 0) && (
        <div className="cook-facts">
          {recipe.cookingTime > 0 && (
            <span>
              <strong>{recipe.cookingTime / 20}s</strong>
              cook time
            </span>
          )}
          {recipe.experience > 0 && (
            <span>
              <strong>{recipe.experience}</strong>
              experience
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

function RecipeWorkbench({
  recipe,
  openItem,
}: {
  recipe: Recipe;
  openItem: (item: Item) => void;
}) {
  const output = itemByKey(recipe.result.key);
  return (
    <section className="recipe-workbench">
      <header className="workbench-heading">
        <ItemSprite item={output} size="lg" onOpen={openItem} />
        <div>
          <p className="section-kicker">
            {recipe.stationLabel} · {recipe.family}
          </p>
          <h2
            style={
              output?.color
                ? { color: readableItemColor(output.color) }
                : undefined
            }
          >
            {recipe.name}
          </h2>
          <span>
            Makes {recipe.result.count}
            {recipe.result.count === 1 ? " item" : " items"}
          </span>
        </div>
        <code>{recipe.id}</code>
      </header>

      {recipe.secret ? (
        <SecretRecipe recipe={recipe} openItem={openItem} />
      ) : (
        <div className="workbench-body">
          <div className="machine-card">
            <span className="machine-label">{recipe.stationLabel}</span>
            <MachineCanvas recipe={recipe} openItem={openItem} />
            <p>Select any ingredient or the output to open its item page.</p>
          </div>
          <IngredientLedger recipe={recipe} openItem={openItem} />
        </div>
      )}
    </section>
  );
}

function RecipesPage({
  openRecipe,
  station,
  onStationChange,
}: {
  openRecipe: (recipe: Recipe) => void;
  station: string;
  onStationChange: (station: string) => void;
}) {
  const [query, setQuery] = useState("");

  const stationRecipes = useMemo(
    () => wikiData.recipes.filter((recipe) => recipe.station === station),
    [station],
  );
  const families = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const groups = new Map<string, Recipe[]>();
    for (const recipe of stationRecipes) {
      if (
        normalizedQuery &&
        ![recipe.name, recipe.family, recipe.category, recipe.id].some(
          (value) => normalizeSearchText(value).includes(normalizedQuery),
        )
      ) {
        continue;
      }
      const current = groups.get(recipe.family) || [];
      current.push(recipe);
      groups.set(recipe.family, current);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query, stationRecipes]);

  const chooseStation = (nextStation: string) => {
    onStationChange(nextStation);
    setQuery("");
  };

  const chooseRecipe = (recipe: Recipe) => {
    openRecipe(recipe);
  };

  return (
    <div className="page recipes-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">All {wikiData.stats.recipeCount} recipes</p>
          <h1>Recipe Book</h1>
        </div>
        <p>
          Pick a station, open a family, and choose what you want to make. Each
          recipe gets a clean page of its own.
        </p>
      </header>

      <div className="station-tabs" aria-label="Crafting stations">
        {wikiData.stations.map((option) => (
          <button
            type="button"
            key={option.id}
            className={station === option.id ? "is-active" : ""}
            onClick={() => chooseStation(option.id)}
          >
            <span aria-hidden="true">
              <img src={releaseAsset(stationIcons[option.id])} alt="" />
            </span>
            <strong>{option.label}</strong>
            <small>{option.count}</small>
          </button>
        ))}
      </div>

      <section className="recipe-catalogue">
        <header className="recipe-catalogue-tools">
          <div>
            <p className="section-kicker">Browse by family</p>
            <h2>
              {wikiData.stations.find((item) => item.id === station)?.label}
            </h2>
            <span>
              {stationRecipes.length} recipes · {families.length} visible
              families
            </span>
          </div>
          <label className="recipe-filter">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a recipe in this station…"
              aria-label="Find a recipe in this station"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear recipe search"
              >
                ×
              </button>
            ) : null}
          </label>
        </header>

        {families.length ? (
          <div className="recipe-family-list">
            {families.map(([family, recipes]) => (
              <details
                className="recipe-family"
                key={family}
                open={query.trim() ? true : undefined}
              >
                <summary>
                  <span className="family-toggle" aria-hidden="true" />
                  <span className="family-copy">
                    <strong>{family}</strong>
                    <small>
                      {recipes.length}{" "}
                      {recipes.length === 1 ? "recipe" : "recipes"}
                    </small>
                  </span>
                  <span className="summary-sprites" aria-hidden="true">
                    {recipes.slice(0, 4).map((recipe) => {
                      const output = itemByKey(recipe.result.key);
                      return output ? (
                        <img
                          key={recipe.id}
                          src={assetUrl(output.texture)}
                          alt=""
                        />
                      ) : null;
                    })}
                  </span>
                  <span className="family-open-copy" aria-hidden="true" />
                </summary>
                <div className="family-recipe-grid">
                  {recipes.map((recipe) => {
                    const output = itemByKey(recipe.result.key);
                    return (
                      <button
                        type="button"
                        key={recipe.id}
                        onClick={() => chooseRecipe(recipe)}
                        aria-label={`Open ${recipe.name} recipe`}
                      >
                        <ItemSprite item={output} size="md" />
                        <span>
                          <strong>{recipe.name}</strong>
                          <small>
                            {recipe.secret
                              ? "Secret recipe"
                              : recipe.result.count > 1
                                ? `Makes ${recipe.result.count}`
                                : friendlyCategory(recipe.category)}
                          </small>
                        </span>
                        <span aria-hidden="true">→</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="recipe-filter-empty">
            <span aria-hidden="true">⌕</span>
            <strong>No recipes found in this station.</strong>
            <p>Try a shorter search, or clear it and browse the families.</p>
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function RecipePage({
  recipe,
  openItem,
  go,
}: {
  recipe?: Recipe;
  openItem: (item: Item) => void;
  go: (route: string) => void;
}) {
  if (!recipe) {
    return (
      <div className="page empty-state">
        <span>?</span>
        <h1>That recipe slipped away.</h1>
        <p>Try finding it again from an item page or the recipe book.</p>
        <button className="button button-earth" onClick={() => go("recipes")}>
          Return to the recipe book
        </button>
      </div>
    );
  }
  return (
    <div className="page recipe-detail-page">
      <button className="back-link" type="button" onClick={() => go("recipes")}>
        ← Back to the recipe book
      </button>
      <RecipeWorkbench recipe={recipe} openItem={openItem} />
    </div>
  );
}

function ProgressionPage({ openItem }: { openItem: (item: Item) => void }) {
  const sections = [
    { id: "tutorial", label: "Early Trail" },
    { id: "hell", label: "The Nether" },
    { id: "end", label: "The End" },
    { id: "mechanics", label: "Mechanics" },
  ];
  const [section, setSection] = useState("tutorial");
  const milestones = [
    {
      item: findItem("Wheat Grain"),
      title: "Read the grass",
      note: "Hoe grass, collect grain, and take the first food clues seriously.",
    },
    {
      item: findItem("Kindling"),
      title: "Light a campfire",
      note: "Cooking reveals the intrinsic character of simple ingredients.",
    },
    {
      item: findItem("Mud Kiln"),
      title: "Shape a Mud Kiln",
      note: "This is the first important processing station on the trail.",
    },
    {
      item: findItem("Copper Ingot"),
      title: "Commit to copper",
      note: "There are no stone tools here: wood leads into copper.",
    },
    {
      item: findItem("Steel Alloy"),
      title: "Learn the alloys",
      note: "The blast furnace and smithing table carry progression onward.",
    },
  ];

  const visibleAdvancements = wikiData.advancements.filter(
    (advancement) => advancement.section === section,
  );

  return (
    <div className="page progression-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">Spoiler-light trail markers</p>
          <h1>Progression</h1>
        </div>
        <p>
          Follow what the pack openly teaches. Hidden advancements stay out of
          this index, and secret recipes remain secret.
        </p>
      </header>

      <section className="trail-map">
        <div className="trail-map-copy">
          <p className="section-kicker">Recommended first loop</p>
          <h2>Slow is a valid speed.</h2>
          <p>
            The early game is deliberately firmer than vanilla. The pack expects
            observation, cooking, and small upgrades—not a sprint for diamonds.
          </p>
        </div>
        <div className="milestone-path">
          {milestones.map((milestone, index) => (
            <button
              type="button"
              key={milestone.title}
              disabled={!milestone.item}
              onClick={() => milestone.item && openItem(milestone.item)}
            >
              <span className="milestone-number">{index + 1}</span>
              <ItemSprite item={milestone.item} size="lg" />
              <span>
                <strong>{milestone.title}</strong>
                <small>{milestone.note}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="advancement-index">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Visible field markers</p>
            <h2>The advancement notebook</h2>
          </div>
          <p>
            Descriptions are read directly from release{" "}
            {wikiData.release.version}.
          </p>
        </div>
        <div className="advancement-tabs" role="tablist">
          {sections.map((option) => {
            const count = wikiData.advancements.filter(
              (advancement) => advancement.section === option.id,
            ).length;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={section === option.id}
                className={section === option.id ? "is-active" : ""}
                key={option.id}
                onClick={() => setSection(option.id)}
              >
                {option.label} <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="advancement-grid">
          {visibleAdvancements.map((advancement) => {
            const icon = itemByKey(advancement.iconKey || undefined);
            return (
              <article
                className={`advancement-card frame-${advancement.frame}`}
                key={advancement.id}
              >
                <ItemSprite
                  item={icon}
                  size="lg"
                  onOpen={icon ? openItem : undefined}
                />
                <div>
                  <span>{advancement.frame}</span>
                  <h3>{advancement.title}</h3>
                  <p>{advancement.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ChangelogPage() {
  const entries = wikiData.release.changelog?.length
    ? wikiData.release.changelog
    : [
        {
          versionId: wikiData.release.versionId || "",
          version: wikiData.release.version,
          name: wikiData.release.name,
          published: wikiData.release.published,
          minecraft: [wikiData.release.minecraft],
          channel: "release",
          featured: true,
          blocks: (wikiData.release.highlights || []).map((text) => ({
            type: "bullet" as const,
            text,
          })),
        },
      ];

  return (
    <div className="page changelog-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">
            Publisher&apos;s notes · pulled from Modrinth
          </p>
          <h1>Changelog</h1>
        </div>
        <p>
          The datapack&apos;s own release notes, gathered without rewriting
          them. The newest field report stays open; older ones fold away neatly.
        </p>
      </header>

      <section className="changelog-ledger" aria-label="Release history">
        {entries.map((entry, index) => (
          <details
            className="changelog-entry"
            key={entry.versionId || `${entry.version}-${index}`}
            open={index === 0}
          >
            <summary>
              <span className="changelog-marker" aria-hidden="true">
                {index === 0
                  ? "NEW"
                  : String(entries.length - index).padStart(2, "0")}
              </span>
              <span className="changelog-title">
                <span>
                  v{entry.version}
                  {index === 0 ? <em>Current release</em> : null}
                </span>
                <strong>{entry.name}</strong>
                <small>
                  {entry.published}
                  {entry.minecraft.length
                    ? ` · Minecraft ${entry.minecraft.join(", ")}`
                    : ""}
                </small>
              </span>
              <span className="changelog-toggle" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="changelog-copy">
              {entry.blocks.length ? (
                entry.blocks.map((block, blockIndex) => {
                  if (block.type === "heading") {
                    return (
                      <h2 key={`${block.text}-${blockIndex}`}>{block.text}</h2>
                    );
                  }
                  if (block.type === "bullet") {
                    return (
                      <p
                        className="changelog-bullet"
                        key={`${block.text}-${blockIndex}`}
                      >
                        <span aria-hidden="true">◆</span>
                        {block.text}
                      </p>
                    );
                  }
                  return (
                    <p key={`${block.text}-${blockIndex}`}>{block.text}</p>
                  );
                })
              ) : (
                <p className="changelog-empty">
                  No written release notes were published for this version.
                </p>
              )}
              <a
                className="text-link"
                href={`${wikiData.release.modrinthUrl}/version/${entry.versionId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open this version on Modrinth <span>↗</span>
              </a>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}

function ResearchNote({
  number,
  label = "FIELD NOTE",
  title,
  subtitle,
  children,
  margin,
}: {
  number: string;
  label?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  margin: string;
}) {
  return (
    <article className="research-note" id={`field-note-${number}`}>
      <header>
        <span>
          {label} {number}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="research-body">{children}</div>
      <aside>{margin}</aside>
    </article>
  );
}

function FishResearch({ openItem }: { openItem: (item: Item) => void }) {
  const tiers = ["Common", "Uncommon", "Rare", "Epic"];
  return (
    <div className="fish-ledger">
      {tiers.map((tier) => {
        const entries = wikiData.fish.filter((fish) => fish.tier === tier);
        return (
          <section key={tier}>
            <div className="fish-tier-heading">
              <span>{"★".repeat(entries[0]?.stars || 1)}</span>
              <strong>{tier} specimens</strong>
              <small>{entries.length} logged</small>
            </div>
            <div className="fish-specimens">
              {entries.map((entry) => {
                const item = itemByKey(entry.itemKey);
                if (!item) return null;
                return (
                  <button
                    type="button"
                    key={entry.itemKey}
                    className={entry.obscured ? "is-obscured" : ""}
                    onClick={() => openItem(item)}
                  >
                    <img src={assetUrl(item.texture)} alt="" />
                    {entry.obscured ? (
                      <GalacticText glyphs={item.sga} />
                    ) : (
                      <span>{item.name}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FieldGuidesPage({
  openItem,
  go,
}: {
  openItem: (item: Item) => void;
  go: (route: string) => void;
}) {
  const jumpTo = (number: string) => {
    document
      .getElementById(`field-note-${number}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="page field-guides-page">
      <header className="field-journal-cover">
        <div>
          <p>RESEARCH JOURNAL · COPY 01</p>
          <h1>Notes from a Matcha-Flavoured World</h1>
          <span>
            Observations recorded against release {wikiData.release.version},
            Minecraft {wikiData.release.minecraft}
          </span>
        </div>
        <img src={releaseAsset("/matcha/pack.png")} alt="" />
      </header>

      <nav className="journal-index" aria-label="Field note index">
        {[
          ["01", "Recommended Setup"],
          ["02", "First Morning"],
          ["03", "Food & Recovery"],
          ["04", "Alloys & Tools"],
          ["05", "Fishing Survey"],
          ["06", "Blessings"],
          ["07", "Settlements"],
          ["08", "Known Anomalies"],
        ].map(([number, label]) => (
          <button key={number} type="button" onClick={() => jumpTo(number)}>
            <span>{number}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="research-stack">
        <ResearchNote
          number="01"
          label="RECOMMENDATION"
          title="The easy way to get started"
          subtitle="One zip, two folders, then off you go"
          margin="Tiny tip: keep the zip packed. Minecraft likes it just the way it is."
        >
          <p className="observation">
            <strong>Recommendation.</strong> Use the same Matcha_Flavoured zip
            as both your datapack and resource pack. It keeps the recipes and
            textures happily together.
          </p>
          <ol className="research-steps">
            <li>
              While making a world, open{" "}
              <b>More → Data Packs → Open Pack Folder</b>. Drop in the untouched
              zip, then move it to the Selected side.
            </li>
            <li>
              Put the same zip in Minecraft&apos;s <b>resourcepacks</b> folder
              and turn it on from the Resource Packs menu.
            </li>
            <li>
              Join the world. If chat says <q>Matcha Flavoured is now loaded</q>
              , you&apos;re ready to wander.
            </li>
          </ol>
          <div className="research-warning">
            <strong>Fresh worlds work best.</strong> Older worlds may contain
            shuffled items, so starting somewhere new is the smoother little
            adventure.
          </div>
          <a
            className="field-action"
            href={wikiData.release.downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            Grab release {wikiData.release.version} ↗
          </a>
        </ResearchNote>

        <ResearchNote
          number="02"
          title="The first morning"
          subtitle="Survival log · grass, fire, clay, copper"
          margin="Working theory: locked recipes are part of the tutorial, not a punishment."
        >
          <p className="observation">
            <strong>Observation.</strong> Stone tools do not occur. The tool
            line moves from wood to copper, so familiar vanilla instincts
            produce a short but educational dead end.
          </p>
          <div className="research-columns">
            <div>
              <h3>Initial kit</h3>
              <ul>
                <li>Wooden hoe</li>
                <li>Grass and wheat grain</li>
                <li>Campfire / Kindling</li>
                <li>Food suitable for cooking</li>
              </ul>
            </div>
            <div>
              <h3>First hypothesis</h3>
              <p>
                Cooking, not mining, is the first progression gate. Once the
                intrinsic side of food becomes visible, the Mud Kiln and copper
                path begin to make sense.
              </p>
            </div>
          </div>
          <button
            className="field-action"
            type="button"
            onClick={() => go("progression")}
          >
            Compare with the advancement trail →
          </button>
        </ResearchNote>

        <ResearchNote
          number="03"
          title="On appetite and recovery"
          subtitle="Physiology notes · hunger absent, regeneration deliberate"
          margin="Do not read the heart symbols as hunger points; prepared food is the recovery system."
        >
          <p className="observation">
            <strong>Observation.</strong> Hunger and natural regeneration have
            been removed. Twelve basic food ingredients carry special intrinsic
            effects, first revealed by cooking them on a Campfire or in an Oven.
          </p>
          <p>
            More elaborate foods combine direct healing with long-duration
            effects. Preserving and preparing ingredients is therefore survival
            equipment, not decorative cuisine.
          </p>
          <div className="specimen-row">
            {[
              "Japanese Curry",
              "Honey Ginger Tea",
              "Golden Carrot Cupcake",
              "Pickled Carrots",
              "Baked Apple",
            ].map((name) => {
              const item = findItem(name);
              return item ? (
                <button key={name} type="button" onClick={() => openItem(item)}>
                  <ItemSprite item={item} size="lg" />
                  <span>{item.name}</span>
                </button>
              ) : null;
            })}
          </div>
          <button
            className="field-action"
            type="button"
            onClick={() => go("recipes")}
          >
            Open the food recipe families →
          </button>
        </ResearchNote>

        <ResearchNote
          number="04"
          title="A short metallurgical survey"
          subtitle="Workshop notes · alloys, blast heat, smithing"
          margin="Recent hotfix: steel now requires less blasting time."
        >
          <p className="observation">
            <strong>Observation.</strong> Equipment progression has been rebuilt
            around copper and four alloy families. The Blast Furnace processes
            materials; the Smithing Table turns those materials into specialised
            tools, weapons, and armour.
          </p>
          <div className="alloy-line">
            {[
              "Hepatizon Alloy",
              "Steel Alloy",
              "Shakudo Alloy",
              "Electrum Alloy",
              "Adamant Alloy",
            ].map((name) => {
              const item = findItem(name);
              return (
                <div key={name}>
                  <ItemSprite
                    item={item}
                    size="lg"
                    onOpen={item ? openItem : undefined}
                  />
                  <span>{item?.name || name}</span>
                </div>
              );
            })}
          </div>
          <p className="hypothesis">
            <strong>Working rule.</strong> If a gear recipe appears impossible
            at a crafting table, inspect its alloy and open the Smithing Table
            family. The base item matters.
          </p>
        </ResearchNote>

        <ResearchNote
          number="05"
          title="Freshwater and saltwater survey"
          subtitle="Fishing log · ten water groups, four recorded tiers"
          margin="Identities above the uncommon tier are written in the table's own alphabet. Textures remain as observed."
        >
          <p className="observation">
            <strong>Observation.</strong> Freshwater and saltwater biomes are
            each divided into five climate groups. A location normally supports
            two common, one uncommon, one rare, and one epic catch.
          </p>
          <p>
            The Fisherman asks for lower-tier specimens before accepting more
            valuable catches. This journal records common and uncommon names
            plainly. Higher-tier names remain in enchanting-table script.
          </p>
          <FishResearch openItem={openItem} />
        </ResearchNote>

        <ResearchNote
          number="06"
          title="Blessings instead of easy enchantment"
          subtitle="Arcane notes · grouped enchantments and prayer-like craft"
          margin="Potion brewing is absent in this release; the old stand has become a Chemistry Stand."
        >
          <p className="observation">
            <strong>Observation.</strong> Enchanting has been reworked.
            Blessings package related enchantments into crafted objects, often
            pairing effects that share a practical theme.
          </p>
          <div className="specimen-row">
            {[
              ["Apollo", "minecraft:blessing_apollo"],
              ["Demeter", "minecraft:blessing_demeter"],
              ["Icarus", "minecraft:blessing_icarus"],
              ["Prometheus", "minecraft:blessing_prometheus"],
              ["Warding", "minecraft:blessing_warding"],
            ].map(([label, key]) => {
              const item = itemByKey(key);
              return item ? (
                <button key={key} type="button" onClick={() => openItem(item)}>
                  <ItemSprite item={item} size="lg" />
                  <span>{label}&apos;s Blessing</span>
                </button>
              ) : null;
            })}
          </div>
          <p className="hypothesis">
            <strong>Research advice.</strong> Read the blessing&apos;s tooltip,
            then inspect its crafting recipe. The associated enchantments are
            often more legible there than in a long catalogue.
          </p>
        </ResearchNote>

        <ResearchNote
          number="07"
          title="Settlements, trade, and useful solitude"
          subtitle="Social notes · abandoned world, recruited neighbours"
          margin="The world is meant to feel quiet until the player makes a place alive."
        >
          <p className="observation">
            <strong>Observation.</strong> Villager trades and village structures
            have been overhauled. Trading is a progression system: Fishermen
            grade catches, specialist villagers provide unusual goods, and some
            recipes are learned through the people who know them.
          </p>
          <p>
            Warding Stones and warding equipment protect friendly company. The
            current stone heals players, villagers, wandering traders, wolves,
            cats, and golems in a sixteen-block range.
          </p>
          <div className="research-warning">
            <strong>Ethical note.</strong> The pack is designed for casual play
            without villager torture chambers or technical mob farms. Its
            economy assumes a slower relationship with the world.
          </div>
        </ResearchNote>

        <ResearchNote
          number="08"
          title="Known anomalies"
          subtitle="Troubleshooting log · reloads, sleep, existing worlds"
          margin={`All observations are specific to release ${wikiData.release.version} and may change.`}
        >
          <dl className="anomaly-list">
            <div>
              <dt>Sleep does not work after first entry</dt>
              <dd>
                Re-log, restart the server, or run <code>/reload</code>. The
                initial scoreboards sometimes fail to establish themselves.
              </dd>
            </div>
            <div>
              <dt>The load message never appears</dt>
              <dd>
                Confirm that the zip is selected as a data pack. Do not unpack
                it, and do not rely on the Modrinth app&apos;s automatic loader.
              </dd>
            </div>
            <div>
              <dt>Items have missing or incorrect textures</dt>
              <dd>
                Enable the same Matcha_Flavoured zip as a resource pack. Both
                halves are required.
              </dd>
            </div>
            <div>
              <dt>An old world contains strange items</dt>
              <dd>
                Items have been shuffled. A new world is safest; otherwise keep
                cheats available for repairs.
              </dd>
            </div>
          </dl>
        </ResearchNote>
      </div>
    </div>
  );
}

function SearchOverlay({
  open,
  onClose,
  openItem,
  openRecipe,
}: {
  open: boolean;
  onClose: () => void;
  openItem: (item: Item) => void;
  openRecipe: (recipe: Recipe) => void;
}) {
  const [query, setQuery] = useState("");

  const normalized = normalizeSearchText(query);
  const itemResults = normalized
    ? wikiData.items
        .filter(
          (item) =>
            !item.obscured &&
            (normalizeSearchText(item.name).includes(normalized) ||
              normalizeSearchText(itemCategory(item)).includes(normalized)),
        )
        .slice(0, 10)
    : wikiData.items
        .filter((item) => item.outputOf.length > 0 && !item.obscured)
        .slice(0, 6);
  const recipeResults = normalized
    ? wikiData.recipes
        .filter(
          (recipe) =>
            normalizeSearchText(recipe.name).includes(normalized) ||
            normalizeSearchText(recipe.family).includes(normalized) ||
            normalizeSearchText(recipe.stationLabel).includes(normalized),
        )
        .slice(0, 10)
    : [];

  if (!open) return null;
  return (
    <div
      className="search-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Search wiki"
    >
      <button
        className="search-scrim"
        type="button"
        aria-label="Close search"
        onClick={onClose}
      />
      <section className="search-panel">
        <header>
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items, recipes, stations, or families…"
            aria-label="Search the Matcha Flavoured wiki"
          />
          <button type="button" onClick={onClose}>
            Esc
          </button>
        </header>
        <div className="search-results">
          <div>
            <p>{normalized ? "Matching items" : "A few useful threads"}</p>
            {itemResults.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => {
                  onClose();
                  openItem(item);
                }}
              >
                <ItemSprite item={item} size="sm" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{itemCategory(item)}</small>
                </span>
                <em>→</em>
              </button>
            ))}
          </div>
          {normalized && (
            <div>
              <p>Matching recipes</p>
              {recipeResults.map((recipe) => (
                <button
                  type="button"
                  key={recipe.id}
                  onClick={() => {
                    onClose();
                    openRecipe(recipe);
                  }}
                >
                  <ItemSprite item={itemByKey(recipe.result.key)} size="sm" />
                  <span>
                    <strong>{recipe.name}</strong>
                    <small>
                      {recipe.stationLabel} · {recipe.family}
                    </small>
                  </span>
                  <em>{recipe.secret ? "Secret" : "→"}</em>
                </button>
              ))}
            </div>
          )}
          {normalized &&
            itemResults.length === 0 &&
            recipeResults.length === 0 && (
              <div className="search-empty">
                <span>?</span>
                <p>No field notes match that phrase.</p>
              </div>
            )}
        </div>
      </section>
    </div>
  );
}

export function WikiApp() {
  const [route, setRoute] = useState("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recipeStation, setRecipeStation] = useState("crafting");

  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const routeRoot = route.split("/")[0] || "home";
  const currentLabel = useMemo(
    () =>
      navItems.find((item) => item.route === routeRoot)?.label ||
      (routeRoot === "item"
        ? "Item Pantry"
        : routeRoot === "recipe"
          ? "Recipe Book"
          : "Wiki"),
    [routeRoot],
  );

  const go = (nextRoute: string) => {
    window.location.hash = `#/${nextRoute}`;
    setRoute(nextRoute);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openItem = (item: Item) => {
    go(`item/${encodeURIComponent(item.key)}`);
  };

  const openRecipe = (recipe: Recipe) => {
    go(`recipe/${encodeURIComponent(recipe.id)}`);
  };

  let content = <HomePage go={go} openItem={openItem} />;
  if (routeRoot === "recipes") {
    content = (
      <RecipesPage
        openRecipe={openRecipe}
        station={recipeStation}
        onStationChange={setRecipeStation}
      />
    );
  } else if (routeRoot === "recipe") {
    const recipeId = decodeURIComponent(route.split("/").slice(1).join("/"));
    const selectedRecipe = wikiData.recipes.find(
      (recipe) => recipe.id === recipeId,
    );
    content = (
      <RecipePage recipe={selectedRecipe} openItem={openItem} go={go} />
    );
  } else if (routeRoot === "items") {
    content = <ItemsPage openItem={openItem} />;
  } else if (routeRoot === "item") {
    const itemKey = decodeURIComponent(route.split("/").slice(1).join("/"));
    const selectedItem = wikiData.items.find((item) => item.key === itemKey);
    content = (
      <ItemPage
        item={selectedItem}
        openItem={openItem}
        openRecipe={openRecipe}
        go={go}
      />
    );
  } else if (routeRoot === "progression") {
    content = <ProgressionPage openItem={openItem} />;
  } else if (routeRoot === "guides") {
    content = <FieldGuidesPage openItem={openItem} go={go} />;
  } else if (routeRoot === "changelog") {
    content = <ChangelogPage />;
  }

  return (
    <div
      className="wiki-shell"
      style={
        {
          "--matcha-panorama": `url("${releaseAsset("/matcha/panorama.png")}")`,
          "--sga-texture": `url("${releaseAsset("/minecraft/assets/minecraft/textures/font/ascii_sga.png")}")`,
        } as CSSProperties
      }
    >
      <aside className={`side-nav ${mobileNavOpen ? "is-open" : ""}`}>
        <button className="brand" type="button" onClick={() => go("home")}>
          <img src={releaseAsset("/matcha/pack.png")} alt="" />
          <span>
            <strong>Matcha Flavoured</strong>
            <small>Field Wiki</small>
          </span>
        </button>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.route}
              className={routeRoot === item.route ? "is-active" : ""}
              onClick={() => go(item.route)}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <span className="status-dot" />
          <div>
            <strong>Release {wikiData.release.version}</strong>
            <small>Minecraft {wikiData.release.minecraft}</small>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="top-bar">
          <button
            className="mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-label="Toggle navigation"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="breadcrumbs">
            <button onClick={() => go("home")}>Wiki</button>
            <span>/</span>
            <strong>{currentLabel}</strong>
          </div>
          <div className="top-actions">
            <button
              className="search-trigger"
              type="button"
              onClick={() => setSearchOpen(true)}
            >
              <span aria-hidden="true">⌕</span>
              Search
              <kbd>/</kbd>
            </button>
            <a
              className="version-pill"
              href={wikiData.release.modrinthUrl}
              target="_blank"
              rel="noreferrer"
            >
              v{wikiData.release.version} <span>↗</span>
            </a>
          </div>
        </header>
        <main>{content}</main>
        <footer>
          <p>
            Made as a companion to Matcha Flavoured. Textures belong to their
            respective creators.
          </p>
          <div className="footer-links">
            <a
              href={wikiData.release.modrinthUrl}
              target="_blank"
              rel="noreferrer"
            >
              Original datapack on Modrinth ↗
            </a>
            <a
              href="https://github.com/Evansch0/MatchaFlavouredWiki/blob/main/ATTRIBUTIONS.md"
              target="_blank"
              rel="noreferrer"
            >
              Attributions ↗
            </a>
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-NC-SA 4.0 ↗
            </a>
          </div>
        </footer>
      </div>
      {mobileNavOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        openItem={openItem}
        openRecipe={openRecipe}
      />
    </div>
  );
}
