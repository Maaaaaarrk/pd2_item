/**
 * convert-data.js
 * Converts tab-delimited .txt data files to .js files.
 * For MagicPrefix and MagicSuffix, also resolves affix display names
 * from Diablo 2 string tables (.tbl files).
 */
const fs = require('fs');
const path = require('path');

// --- String Table (.tbl) Parser ---
function parseTbl(filePath) {
  const buf = fs.readFileSync(filePath);
  const map = new Map();
  let offset = 0;
  /* Header: crc(2) + indices(2) + entries(4) + version(1) + first(4) + limit(4) + last(4) */
  offset += 2; // crc
  const numIndices = buf.readUInt16LE(offset); offset += 2;
  const numEntries = buf.readUInt32LE(offset); offset += 4;
  offset += 1; // version
  offset += 4; // first
  offset += 4; // limit
  offset += 4; // last
  offset += numIndices * 2; // skip index table

  const entries = [];
  for (let i = 0; i < numEntries; i++) {
    const used = buf.readUInt8(offset); offset += 1;
    const index = buf.readUInt16LE(offset); offset += 2;
    const hash = buf.readUInt32LE(offset); offset += 4;
    const keyIndex = buf.readUInt32LE(offset); offset += 4;
    const stringIndex = buf.readUInt32LE(offset); offset += 4;
    const length = buf.readUInt16LE(offset); offset += 2;
    entries.push({ keyIndex, stringIndex, length });
  }
  const dataStart = offset;

  function readNullTermString(absIdx) {
    const rel = absIdx - dataStart;
    if (rel < 0) return '';
    let end = rel;
    while (dataStart + end < buf.length && buf[dataStart + end] !== 0) end++;
    return buf.toString('latin1', dataStart + rel, dataStart + end);
  }

  for (const entry of entries) {
    if (entry.length <= 0) continue;
    const key = readNullTermString(entry.keyIndex);
    if (!key || map.has(key)) continue;
    const rel = entry.stringIndex - dataStart;
    if (rel < 0) continue;
    const value = buf.toString('latin1', dataStart + rel, dataStart + rel + entry.length - 1);
    map.set(key, value);
  }
  return map;
}

// --- Load string tables (priority order) ---
const tblDir = path.join(__dirname, 'data', 'tbl');
let stringTables = null;
if (fs.existsSync(tblDir)) {
  stringTables = [
    parseTbl(path.join(tblDir, 'patchstring.tbl')),
    parseTbl(path.join(tblDir, 'expansionstring.tbl')),
    parseTbl(path.join(tblDir, 'string.tbl')),
  ];
}

function resolveDisplayName(key) {
  if (!stringTables) return key;
  for (const table of stringTables) {
    if (table.has(key)) {
      // Clean control characters used for color codes
      return table.get(key).replace(/\xC3.../g, '');
    }
  }
  return key;
}

// --- Generic TXT-to-JS converter ---
function convertFile(fname, varName, addDisplayName = false) {
  const txtPath = path.join(__dirname, 'data', fname + '.txt');
  const jsPath = path.join(__dirname, 'data', 'js', fname + '.js');
  const content = fs.readFileSync(txtPath, 'utf-8');
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
    if (addDisplayName && obj.Name) {
      const display = resolveDisplayName(obj.Name);
      if (display !== obj.Name) {
        obj.displayName = display;
      }
    }
    rows.push(obj);
  }
  fs.writeFileSync(jsPath, 'const ' + varName + ' = ' + JSON.stringify(rows, null, 2) + ';\n');
  console.log(`Converted ${fname}.txt -> ${fname}.js (${rows.length} rows${addDisplayName ? ', with displayName' : ''})`);
}

// --- Convert all files ---
const files = [
  { name: 'Armor', var: 'ARMOR_DATA' },
  { name: 'Weapons', var: 'WEAPONS_DATA' },
  { name: 'ItemTypes', var: 'ITEM_TYPES_DATA' },
  { name: 'MagicPrefix', var: 'MAGIC_PREFIX_DATA', localize: true },
  { name: 'MagicSuffix', var: 'MAGIC_SUFFIX_DATA', localize: true },
  { name: 'RarePrefix', var: 'RARE_PREFIX_DATA' },
  { name: 'RareSuffix', var: 'RARE_SUFFIX_DATA' },
  { name: 'WeaponClass', var: 'WEAPON_CLASS_DATA' },
  { name: 'Properties', var: 'PROPERTIES_DATA' },
];

for (const f of files) {
  convertFile(f.name, f.var, f.localize || false);
}

// Count localizations
if (stringTables) {
  let prefixCount = 0, suffixCount = 0;
  const prefixContent = fs.readFileSync(path.join(__dirname, 'data', 'MagicPrefix.txt'), 'utf-8');
  const suffixContent = fs.readFileSync(path.join(__dirname, 'data', 'MagicSuffix.txt'), 'utf-8');
  for (const line of prefixContent.split(/\r?\n/).slice(1)) {
    const name = line.split('\t')[0].trim();
    if (name && resolveDisplayName(name) !== name) prefixCount++;
  }
  for (const line of suffixContent.split(/\r?\n/).slice(1)) {
    const name = line.split('\t')[0].trim();
    if (name && resolveDisplayName(name) !== name) suffixCount++;
  }
  console.log(`\nLocalized ${prefixCount} prefix names and ${suffixCount} suffix names.`);
}
