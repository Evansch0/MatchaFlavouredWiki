# Matcha Flavoured Field Wiki

Made by the community for the community <3

[Matcha Flavoured](https://modrinth.com/datapack/matcha-flavoured).

**Live site:** <https://evansch0.github.io/MatchaFlavouredWiki/>

The catalogue is generated from the datapack's recipes, item definitions,
translations, models, textures, advancements, villager trades, and Modrinth
release notes.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open <http://localhost:3001/>.

The development command checks Modrinth before startup and every 30 minutes
while it is running. If the network is unavailable, the current snapshot still
opens normally.

## Refresh and verify

```bash
npm run update:check
npm run update
npm run lint
npm test
```

New or modified recipe files fail closed: their ingredients remain withheld
until their hashes are reviewed in `app/data/recipe-visibility.json`. Release
decisions can be recorded in `app/data/recipe-review.json` and applied with:

```bash
node scripts/apply-recipe-review.mjs
```

## Automatic publishing

GitHub Pages publishes every push to `main`. A lightweight scheduled check runs
every 12 hours against Modrinth. When nothing changed, it stops before
dependency installation or site compilation. When a release or changelog
changes, it:

1. verifies the release archive;
2. rebuilds the generated data and textures;
3. preserves secret-recipe protections;
4. commits the synchronized snapshot; and
5. deploys the refreshed static site.

The workflow can also be run manually from the repository's Actions tab.

## Attribution

Matcha Flavoured was created by **Klei**, with the “Golden” music disc composed
by **Ciren**. The complete pack, inspiration, framework, and Minecraft notices
are in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

## License

This wiki follows the main project and is licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
Give appropriate credit, keep reuse non-commercial, and share adaptations under
the same license. See [`LICENSE`](LICENSE) for the repository notice.
