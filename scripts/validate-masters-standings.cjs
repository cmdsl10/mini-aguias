'use strict';

// Pure, read-only validation. No network or database access.
function validateStandings(rows, previous = []) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length !== 12) errors.push('Expected exactly 12 teams');
  const names = new Set();
  for (const [i, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const name = String(row?.team_name || '').trim();
    if (!name || names.has(name)) errors.push('Missing or duplicate team at row ' + i);
    names.add(name);
    for (const field of ['played','wins','draws','losses','goals_for','goals_against','points']) {
      if (!Number.isSafeInteger(row?.[field]) || row[field] < 0) errors.push(name + ': invalid ' + field);
    }
    if (Number.isSafeInteger(row?.played) && [row?.wins,row?.draws,row?.losses].every(Number.isSafeInteger)
      && row.played !== row.wins + row.draws + row.losses) errors.push(name + ': inconsistent matches');
    if ([row?.wins,row?.draws,row?.points].every(Number.isSafeInteger)
      && row.points !== 3 * row.wins + row.draws) errors.push(name + ': inconsistent points (3/1 rule)');
  }
  const priorPlayed = previous.some(row => Number(row?.played) > 0);
  const allZero = Array.isArray(rows) && rows.length > 0 && rows.every(row => row?.played === 0);
  if (priorPlayed && allZero) errors.push('Refusing to overwrite previously played matches with zero standings');
  return { ok: errors.length === 0, errors };
}

module.exports = { validateStandings };
