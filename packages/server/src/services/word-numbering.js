/**
 * Word 列表编号（仅 structure / 通用说明用；1104 语义树不调用）
 */

function readAttrVal(xml, attrLocal) {
  const re = new RegExp(`<w:${attrLocal}[^>]*w:val="([^"]*)"`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1] : null;
}

function parseNumPr(pXml) {
  const numPrMatch = pXml.match(/<w:numPr\b[\s\S]*?<\/w:numPr>/i);
  if (!numPrMatch) return null;
  const chunk = numPrMatch[0];
  const numId = readAttrVal(chunk, 'numId');
  const ilvl = readAttrVal(chunk, 'ilvl');
  if (numId == null || ilvl == null) return null;
  return { numId: String(numId), ilvl: Number(ilvl) || 0 };
}

function parseAbstractNumLevel(lvlXml) {
  const ilvl = Number(readAttrVal(lvlXml, 'ilvl') ?? 0);
  const numFmt = readAttrVal(lvlXml, 'numFmt') || 'decimal';
  const lvlTextMatch = lvlXml.match(/<w:lvlText[^>]*w:val="([^"]*)"/i);
  const lvlText = lvlTextMatch ? lvlTextMatch[1] : '%1.';
  const startMatch = lvlXml.match(/<w:start[^>]*w:val="([^"]*)"/i);
  const start = startMatch ? Number(startMatch[1]) : 1;
  return { ilvl, numFmt, lvlText, start };
}

/**
 * @param {string} [numberingXml]
 */
export function buildNumberingLookup(numberingXml) {
  /** @type {Map<string, { abstractId: string, levels: Map<number, object> }>} */
  const byNumId = new Map();
  if (!numberingXml) return { byNumId, formatLabel: () => '' };

  const xml = String(numberingXml);
  /** @type {Map<string, Map<number, object>>} */
  const abstractLevels = new Map();

  const abstractRe = /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/gi;
  let m;
  while ((m = abstractRe.exec(xml)) !== null) {
    const abstractId = m[1];
    const block = m[0];
    const levels = new Map();
    const lvlRe = /<w:lvl\b[\s\S]*?<\/w:lvl>/gi;
    let lm;
    while ((lm = lvlRe.exec(block)) !== null) {
      const lvl = parseAbstractNumLevel(lm[0]);
      levels.set(lvl.ilvl, lvl);
    }
    abstractLevels.set(abstractId, levels);
  }

  const numRe = /<w:num\b[^>]*w:numId="(\d+)"[\s\S]*?<\/w:num>/gi;
  while ((m = numRe.exec(xml)) !== null) {
    const numId = m[1];
    const abstractMatch = m[0].match(/<w:abstractNumId[^>]*w:val="(\d+)"/i);
    if (!abstractMatch) continue;
    const abstractId = abstractMatch[1];
    byNumId.set(numId, {
      abstractId,
      levels: abstractLevels.get(abstractId) || new Map(),
    });
  }

  return { byNumId };
}

function formatCounterValue(numFmt, value) {
  if (numFmt === 'decimal' || numFmt === 'decimalZero') {
    return numFmt === 'decimalZero' && value < 10 ? `0${value}` : String(value);
  }
  if (numFmt === 'bullet') return '•';
  return String(value);
}

function applyLvlText(lvlText, countersByLevel, ilvl) {
  let out = String(lvlText || '%1.');
  for (let i = 0; i <= ilvl; i += 1) {
    const val = countersByLevel[i] ?? 1;
    out = out.replace(new RegExp(`%${i + 1}`, 'g'), String(val));
  }
  return out.replace(/%\d+/g, '').trim();
}

/**
 * @param {string} pXml
 * @param {string} visibleText
 * @param {ReturnType<typeof buildNumberingLookup>} lookup
 * @param {Map<string, number[]>} countersState numId -> counter per ilvl
 */
export function prependListNumberToParagraph(pXml, visibleText, lookup, countersState) {
  const numPr = parseNumPr(pXml);
  if (!numPr || !lookup.byNumId.size) return visibleText;

  const def = lookup.byNumId.get(numPr.numId);
  if (!def) return visibleText;

  const lvlDef = def.levels.get(numPr.ilvl) || def.levels.get(0);
  if (!lvlDef || lvlDef.numFmt === 'bullet') {
    const bullet = formatCounterValue('bullet', 1);
    if (visibleText.startsWith(bullet)) return visibleText;
    return visibleText ? `${bullet} ${visibleText}` : bullet;
  }

  const stateKey = numPr.numId;
  if (!countersState.has(stateKey)) {
    countersState.set(stateKey, []);
  }
  const counters = countersState.get(stateKey);
  while (counters.length <= numPr.ilvl) counters.push(lvlDef.start - 1);
  counters[numPr.ilvl] += 1;
  for (let i = numPr.ilvl + 1; i < counters.length; i += 1) {
    counters[i] = lvlDef.start - 1;
  }

  const label = applyLvlText(lvlDef.lvlText, counters, numPr.ilvl);
  const prefix = /[.)．、]$/.test(label) ? label : `${label}.`;
  const trimmed = String(visibleText || '').trim();
  if (!trimmed) return prefix;
  if (trimmed.startsWith(prefix) || trimmed.startsWith(label)) return trimmed;
  return `${prefix} ${trimmed}`;
}
