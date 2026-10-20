const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStandings } = require('../scripts/validate-masters-standings.cjs');

const rows = () => Array.from({length:12}, (_,i) => ({
  team_name:'Team '+i, played:0, wins:0, draws:0, losses:0,
  goals_for:0, goals_against:0, points:0
}));

test('accepts valid initial 12-team table', () => {
  assert.equal(validateStandings(rows()).ok, true);
});
test('rejects incomplete table', () => {
  assert.equal(validateStandings(rows().slice(1)).ok, false);
});
test('rejects invalid match totals', () => {
  const data=rows(); data[0].played=1;
  assert.equal(validateStandings(data).ok, false);
});
test('rejects invalid points', () => {
  const data=rows(); data[0].points=3;
  assert.equal(validateStandings(data).ok, false);
});
test('protects previously recorded results against all-zero snapshot', () => {
  const previous=rows(); previous[0]={...previous[0],played:1,wins:1,goals_for:1,points:3};
  assert.equal(validateStandings(rows(),previous).ok, false);
});
test('rejects duplicate teams', () => {
  const data=rows(); data[1].team_name=data[0].team_name;
  assert.equal(validateStandings(data).ok, false);
});
