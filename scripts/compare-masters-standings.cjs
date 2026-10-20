'use strict';

// Read-only comparator: receives already validated snapshots, never contacts Supabase.
const { validateStandings } = require('./validate-masters-standings.cjs');

function compareStandings(incoming, current) {
  const validation = validateStandings(incoming, current);
  if (!validation.ok) return { ready: false, errors: validation.errors, changes: [] };

  const existing = new Map(current.map(row => [String(row.team_name).trim(), row]));
  const changes = [];
  for (const row of incoming) {
    const before = existing.get(String(row.team_name).trim());
    if (!before) {
      changes.push({ team_name: row.team_name, kind: 'new-team', after: row });
      continue;
    }
    const fields = ['position','played','wins','draws','losses','goals_for','goals_against','points'];
    const changed = fields.filter(field => before[field] !== row[field]);
    if (changed.length) changes.push({
      team_name: row.team_name,
      kind: 'changed',
      fields: changed,
      before: Object.fromEntries(changed.map(field => [field, before[field]])),
      after: Object.fromEntries(changed.map(field => [field, row[field]]))
    });
  }
  const removed = current.filter(row => !incoming.some(next => String(next.team_name).trim() === String(row.team_name).trim()));
  if (removed.length) return { ready: false, errors: ['Teams missing from incoming snapshot: ' + removed.map(x => x.team_name).join(', ')], changes: [] };
  return { ready: true, errors: [], changes };
}

module.exports = { compareStandings };
