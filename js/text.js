// Textnormalisierung und Suche (ohne DOM, testbar mit Node).

/**
 * Macht Text vergleichbar: Kleinschreibung, ä = ae = a, ö = oe = o, ü = ue = u, å = a, ß = ss,
 * Akzente weg, Satzzeichen → Leerzeichen.
 */
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Durchsucht vorbereitete Einträge [{text (normalisiert), name, key}].
 * Alle Suchwörter müssen vorkommen (Teilwortsuche). Bewertung: Name beginnt mit Suchbegriff > Wortanfang >
 * irgendwo enthalten; kürzere Namen leicht bevorzugt; Nutzungshäufigkeit gibt einen Bonus.
 */
export function searchEntries(entries, query, { usage = {}, limit = 60 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const results = [];
  for (const e of entries) {
    let ok = true;
    for (const w of words) if (!e.text.includes(w)) { ok = false; break; }
    if (!ok) continue;
    const name = e.normName ?? (e.normName = normalize(e.name));
    let score = 0;
    if (name === q) score += 100;
    else if (name.startsWith(q)) score += 60;
    else if ((' ' + name).includes(' ' + words[0])) score += 35;
    else if (name.includes(words[0])) score += 20;
    else score += 5; // nur in Synonym/anderer Sprache gefunden
    for (const w of words) {
      if ((' ' + e.text).includes(' ' + w)) score += 4; // Wortanfang
      if ((' ' + name + ' ').includes(' ' + w + ' ')) score += 8; // ganzes Wort im Namen
    }
    score -= Math.min(name.length, 60) / 6;
    const u = usage[e.key];
    if (u) score += Math.min(60, 15 * Math.log2(1 + u));
    results.push({ entry: e, score });
  }
  results.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'de'));
  return results.slice(0, limit).map((r) => r.entry);
}
