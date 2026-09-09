import assert from 'node:assert/strict';
import test from 'node:test';
import { readCareer, identityOperations, applyOperations } from '../server/career/bal-adapter.js';
import { careerFixture } from './helpers/career.js';

test('native coaching transaction supports two released coaches swapping clubs with complete references', () => {
  const { blocks } = careerFixture(), career = readCareer(blocks), ops = identityOperations(career).slice(0, 2);
  ops[0].newCoach = 2; ops[1].newCoach = 1;
  const result = applyOperations(blocks, ops, { 1: 'Test Coach 0', 2: 'Test Coach 1' });
  const updated = readCareer(result.blocks);
  assert.equal(updated.teams[0].coachId, 2);
  assert.equal(updated.teams[0].coachName, 'Test Coach 1');
  assert.equal(updated.teams[1].coachId, 1);
  assert.equal(blocks.data.readUInt32LE(career.teams[0].coachAt), 1);
});

test('native coaching transaction rejects two arrivals of the same coach and partial swaps', () => {
  const { blocks } = careerFixture(), ops = identityOperations(readCareer(blocks)).slice(0, 2);
  ops[0].newCoach = 9000; ops[1].newCoach = 9000;
  assert.throws(() => applyOperations(blocks, ops, { 9000: 'Free Coach' }), /deux équipes/);
  ops[0].newCoach = 2; delete ops[1].newCoach;
  assert.throws(() => applyOperations(blocks, ops, { 2: 'Test Coach 1' }), /employé/);
});
