import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, resolveRegion } from './locations';

test('parses the standard "City, State, Country" form and resolves region', () => {
  const p = parseLocation('Pune, Maharashtra, India');
  assert.equal(p.city, 'Pune');
  assert.equal(p.state, 'Maharashtra');
  assert.equal(p.country, 'India');
  assert.equal(p.region, 'West');
  assert.equal(p.recognized, true);
});

test('parses the 2-part "State, Country" form (no city)', () => {
  const p = parseLocation('Delhi, India');
  assert.equal(p.city, null);
  assert.equal(p.state, 'Delhi');
  assert.equal(p.region, 'North');
  assert.equal(p.recognized, true);
});

test('parses the 1-part "Country" form', () => {
  const p = parseLocation('India');
  assert.equal(p.state, null);
  assert.equal(p.country, 'India');
  assert.equal(p.region, null);
  assert.equal(p.recognized, false);
});

test('a multi-word city keeps its full name', () => {
  const p = parseLocation('Navi Mumbai, Maharashtra, India');
  assert.equal(p.city, 'Navi Mumbai');
  assert.equal(p.state, 'Maharashtra');
  assert.equal(p.region, 'West');
});

test('an unrecognized state parses but is flagged unrecognized (no region)', () => {
  const p = parseLocation('Springfield, Illinois, United States');
  assert.equal(p.state, 'Illinois');
  assert.equal(p.country, 'United States');
  assert.equal(p.region, null);
  assert.equal(p.recognized, false);
});

test('empty / null input is safe', () => {
  assert.equal(parseLocation('').recognized, false);
  assert.equal(parseLocation(null).state, null);
  assert.equal(parseLocation(undefined).country, null);
});

test('resolveRegion is case-insensitive and India-scoped', () => {
  assert.equal(resolveRegion('India', 'tamil nadu'), 'South');
  assert.equal(resolveRegion('india', 'Assam'), 'Northeast');
  assert.equal(resolveRegion('United States', 'California'), null);
  assert.equal(resolveRegion('India', 'Nowhere'), null);
});
