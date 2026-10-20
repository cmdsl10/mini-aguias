const test = require('node:test');
const assert = require('node:assert/strict');
const { compareStandings } = require('../scripts/compare-masters-standings.cjs');

const zero = () => Array.from({length:12}, (_,i) => ({
  team_name:'Team '+i, position:i+1, played:0, wins:0, draws:0, losses:0,
  goals_for:0, goals_against:0, points:0
}));

test('unchanged standings produce empty diff', () => {
  const before=zero();
  assert.deepEqual(compareStandings(zero(),before),{ready:true,errors:[],changes:[]});
});

test('a valid match result produces a diff, not a write', () => {
  const before=zero(), after=zero();
  after[0]={...after[0],played:1,wins:1,goals_for:2,points:3};
  after[1]={...after[1],played:1,losses:1,goals_against:2};
  const result=compareStandings(after,before);
  assert.equal(result.ready,true);
  assert.equal(result.changes.length,2);
  assert.equal(before[0].played,0);
});

test('zero regression is rejected', () => {
  const before=zero();before[0]={...before[0],played:1,wins:1,goals_for:2,points:3};
  assert.equal(compareStandings(zero(),before).ready,false);
});

test('incomplete source snapshot is rejected', () => {
  assert.equal(compareStandings(zero().slice(1),zero()).ready,false);
});
