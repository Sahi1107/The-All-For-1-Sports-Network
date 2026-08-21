import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAllowed, classify } from './news';

// The news rail renders next to minors' profiles and pulls from feeds we don't
// control, so the two gates that decide what can appear there are tested here:
// where an item is allowed to link, and which headlines are allowed through.

test('linkAllowed: keeps https links on the outlet and its subdomains', () => {
  assert.ok(linkAllowed('https://thebridge.in/hockey/story-123', 'thebridge.in'));
  assert.ok(linkAllowed('https://www.hindustantimes.com/sports/x', 'hindustantimes.com'));
});

test('SECURITY: linkAllowed refuses a look-alike host', () => {
  // Suffix-matched on a dot — the classic bypass must not pass.
  assert.equal(linkAllowed('https://thebridge.in.evil.com/x', 'thebridge.in'), null);
  assert.equal(linkAllowed('https://eviltthebridge.in/x', 'thebridge.in'), null);
});

test('SECURITY: linkAllowed refuses another host entirely, and any non-https scheme', () => {
  assert.equal(linkAllowed('https://evil.com/x', 'thebridge.in'), null);
  assert.equal(linkAllowed('http://thebridge.in/x', 'thebridge.in'), null);
  assert.equal(linkAllowed('javascript:alert(1)', 'thebridge.in'), null);
  assert.equal(linkAllowed('not a url', 'thebridge.in'), null);
});

test('SECURITY: betting and adult headlines are dropped whatever the outlet filed them under', () => {
  assert.equal(classify('IPL betting odds: who the bookmakers favour'), null);
  assert.equal(classify('India vs Australia: best Dream11 fantasy team tips'), null);
  assert.equal(classify('Casino sponsor signs Indian league deal'), null);
});

test('the platform’s own subjects rank above general coverage', () => {
  const grassroots = classify('Khelo India Youth Games: the academies feeding the national squad');
  const ministry = classify('Sports Ministry clears new national sports policy');
  const cricket = classify('Cricket: Australia name squad for the Ashes');

  assert.equal(grassroots?.tag, 'Grassroots');
  assert.equal(ministry?.tag, 'Sports Ministry');
  assert.ok(grassroots!.weight > cricket!.weight);
  assert.ok(ministry!.weight > cricket!.weight);
});

test('India-facing coverage outranks the same story without the India angle', () => {
  const indian = classify('Indian football: ISL side promote three youth prospects');
  const foreign = classify('Football: Serie A side promote three youth prospects');
  assert.ok(indian!.weight > foreign!.weight);
});

test('a headline on no sport this platform covers is left out', () => {
  assert.equal(classify('Stock markets close higher on Friday'), null);
});
