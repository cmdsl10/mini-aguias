'use strict';

// Safe adapter for a licensed/verified JSON feed. No scraping, credentials or writes.
// Feed format: { competition_id, fetched_at, source_url, standings: [...] }.
// Reject unverified sources; this is NOT a Zerozero HTML scraper.
const { compareStandings } = require('./compare-masters-standings.cjs');
const COMPETITION_ID = 'af-porto-masters-2-serie-2-2026-27';
const REQUIRED_FIELDS = ['team_name', 'position', 'played', 'wins', 'draws', 'losses', 'goals_for', 'goals_against', 'points'];

function previewStandingsFeed(feed, current, options = {}) {
  const errors = [];
  if (!feed || typeof feed !== 'object' || Array.isArray(feed)) {
    return { ready: false, errors: ['Feed must be a JSON object'], changes: [] };
  }
  if (feed.competition_id !== COMPETITION_ID) errors.push('Unexpected competition');
  if (typeof feed.source_url !== 'string' || !/^https:\/\//i.test(feed.source_url)) errors.push('Missing HTTPS source URL');
  const timestamp = Date.parse(feed.fetched_at);
  const now = options.now === undefined ? Date.now() : options.now;
  const maxAgeMs = options.maxAgeMs === undefined ? 36 * 60 * 60 * 1000 : options.maxAgeMs;
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000 || now - timestamp > maxAgeMs) {
    errors.push('Feed timestamp invalid, in the future or too old');
  }
  if (!Array.isArray(feed.standings)) errors.push('Standings must be an array');
  for (const [index, row] of (Array.isArray(feed.standings) ? feed.standings : []).entries()) {
    for (const field of REQUIRED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(row || {}, field)) errors.push('Row ' + index + ' missing ' + field);
    }
    if (!Number.isSafeInteger(row?.position) || row.position < 1 || row.position > 12) errors.push('Invalid position at row ' + index);
  }
  if (Array.isArray(feed.standings)) {
    const positions = feed.standings.map(x => x?.position);
    if (new Set(positions).size !== positions.length) errors.push('Duplicate positions');
  }
  if (errors.length) return { ready: false, errors, changes: [] };
  const comparison = compareStandings(feed.standings, current);
  return { ...comparison, source_url: feed.source_url, fetched_at: feed.fetched_at };
}

module.exports = { previewStandingsFeed, COMPETITION_ID };
