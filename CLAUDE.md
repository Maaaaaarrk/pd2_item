# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PD2 Theoretical Item Builder — a single-page static HTML app for designing and simulating Project Diablo 2 magic/rare items with affix odds calculation. Deployed to GitHub Pages at https://maaaaaarrk.github.io/pd2_item/item-builder.html

No build step, no dependencies, no tests, no linting. Pure HTML/CSS/JS in a single file.

## Data Pipeline

Tab-delimited `.txt` files in `data/` are the source of truth. These are converted to `data/js/*.js` files that export global `const` variables (e.g., `const ARMOR_DATA = [...]`). The JS files are loaded via `<script>` tags — no fetch/import.

**Do not create `data/json/` files** — they were removed to avoid sync issues.

### Regenerating JS from TXT

Run this Node.js script from the repo root to convert a `.txt` file to its `.js` equivalent:

```js
const fs = require('fs');
const fname = 'Armor';           // change per file
const varName = 'ARMOR_DATA';    // change per file

const content = fs.readFileSync('data/' + fname + '.txt', 'utf-8');
const lines = content.split(/\r?\n/).filter(l => l.trim());
const headers = lines[0].split('\t');
const rows = [];
for (let i = 1; i < lines.length; i++) {
  const vals = lines[i].split('\t');
  const obj = {};
  for (let j = 0; j < headers.length; j++) {
    const key = headers[j].trim();
    if (!key) continue;
    obj[key] = vals[j] !== undefined ? vals[j].trim() : '';
  }
  rows.push(obj);
}
fs.writeFileSync('data/js/' + fname + '.js',
  'const ' + varName + ' = ' + JSON.stringify(rows, null, 2) + ';\n');
```

### File-to-variable mapping

| TXT file | JS variable |
|---|---|
| Armor.txt | `ARMOR_DATA` |
| Weapons.txt | `WEAPONS_DATA` |
| ItemTypes.txt | `ITEM_TYPES_DATA` |
| MagicPrefix.txt | `MAGIC_PREFIX_DATA` |
| MagicSuffix.txt | `MAGIC_SUFFIX_DATA` |
| RarePrefix.txt | `RARE_PREFIX_DATA` |
| RareSuffix.txt | `RARE_SUFFIX_DATA` |
| WeaponClass.txt | `WEAPON_CLASS_DATA` |
| Properties.txt | `PROPERTIES_DATA` |

## Architecture

### State
Single global `state` object drives everything. Changes flow: UI event → state update → `buildAffixSlots()`/`renderPreview()` → `stateToHash()`.

### Item Type Hierarchy
`ItemTypes.txt` defines a tree via `Equiv1`/`Equiv2` fields (e.g., `helm` → `armo` → root). `getTypeChain()` walks this tree. Affix matching uses two sets:
- **Full chain** (all ancestors) for `itype` inclusion — so `itype: armo` matches helms
- **Direct types only** (`item.type`, `item.type2`) for `etype` exclusion — so `etype: thro` doesn't exclude javelins that inherit `thro` via ancestors

### Affix Filtering Layers
1. **Type match** (`getValidAffixes`) — itype/etype + frequency > 0 + rare flag
2. **alvl filter** (`filterByAlvl`) — `affix.level <= alvl <= affix.maxlevel`, applied for odds calculation only (dropdowns show all type-matched affixes)
3. **Group exclusion** — one affix per group across slots, enforced in dropdown population

### alvl Formula (from d2mods.info)
```
ilvl capped at 99; if qlvl > ilvl, use qlvl
if magic_lvl > 0: alvl = ilvl + magic_lvl
else if ilvl < (99 - floor(qlvl/2)): alvl = ilvl - floor(qlvl/2)
else: alvl = 2*ilvl - 99
alvl capped at 99
```

### Odds Calculation
- Pool = alvl-eligible affixes for the item type
- Individual: `freq / sum(all eligible freqs)`, displayed as "1 in X"
- Combined: `P(N,K) × product(individual probs)` where P(N,K) = permutations of K selected in N slots
- Slot counts: magic=1+1, rare=3+3, rare jewel=special (1 guaranteed prefix + 1 guaranteed suffix + 2 wild)
- Empty frequency defaults to 1; frequency "0" affixes are excluded entirely
- Ethereal adds ×(1/20)

### Misc Item Categories
Ring, Amulet, Jewel, and Charms are defined as `miscItems` array in JS (not from data files). They skip tier/class dropdowns. Charms are magic-only. Rare jewels cap at 4 total affixes.

### URL Hash Sharing
Format: `#b=<code>&q=m|r&e=1&i=<ilvl>&p=<idx.idx>&s=<idx.idx>&rn=<pre.suf>`
Indices reference positions in the filtered `prefixes`/`suffixes` arrays.

## Deployment

Push to `main` triggers `.github/workflows/pages.yml` which deploys the repo root to GitHub Pages.
