import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAllowed, classify, selectForSport } from './news';

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

test('a headline is tagged with the sport it is about', () => {
  assert.equal(classify('NBA: James Harden set to return to Cleveland')?.sport, 'BASKETBALL');
  assert.equal(classify('ISL 2026-27 to start in October with 13 teams')?.sport, 'FOOTBALL');
  assert.equal(classify('FIH Men’s Hockey World Cup: India face the Netherlands')?.sport, 'FIELD_HOCKEY');
  assert.equal(classify('Neeraj Chopra’s Lausanne Diamond League javelin entry list')?.sport, 'ATHLETICS');
});

test('“table tennis” is never mistaken for tennis', () => {
  assert.equal(classify('Table tennis: Indian paddler through to the final')?.sport, 'TABLE_TENNIS');
  assert.equal(classify('Tennis: Indian qualifier reaches the second round')?.sport, 'TENNIS');
});

test('a themed headline keeps its theme tag but still carries the sport', () => {
  // "Grassroots" is the more useful label; the sport is what the rail selects on.
  const hit = classify('Khelo India Youth Games: the basketball academies coming through');
  assert.equal(hit?.tag, 'Grassroots');
  assert.equal(hit?.sport, 'BASKETBALL');
});

test('SECURITY: celebrity personal-life filler is dropped', () => {
  assert.equal(classify('Is Holly Rowe married? All about her son and family'), null);
  assert.equal(classify('Cristiano Ronaldo net worth in 2026'), null);
  assert.equal(classify('Star striker’s girlfriend spotted at the ground'), null);
});

// ── Which items one viewer actually gets ─────────────────────────────────────

const item = (id: string, sport: string | null, source = 'The Bridge') => ({
  id, title: id, source, url: `https://thebridge.in/${id}`, category: 'x', sport, published: 0, weight: 0,
});

test('the rail leads with the viewer’s sport, then widens out', () => {
  const pool = [
    item('hockey-1', 'FIELD_HOCKEY', 'Sportstar'),
    item('hockey-2', 'FIELD_HOCKEY', 'Indian Express'),
    item('ball-1', 'BASKETBALL', 'The Bridge'),
    item('ball-2', 'BASKETBALL', 'Hindustan Times'),
    item('ball-3', 'BASKETBALL', 'NDTV Sports'),
    item('ball-4', 'BASKETBALL', 'Sportstar'),
  ] as any;

  const rail = selectForSport(pool, 5, 'BASKETBALL');
  assert.equal(rail.length, 5);
  // Three of five in the viewer's sport, and they lead.
  assert.deepEqual(rail.slice(0, 3).map((i) => i.sport), ['BASKETBALL', 'BASKETBALL', 'BASKETBALL']);
  // Still shows them the wider picture rather than only their own sport.
  assert.ok(rail.some((i) => i.sport !== 'BASKETBALL'));
});

test('nothing published in the viewer’s sport falls back to the general rail', () => {
  const pool = [
    item('hockey-1', 'FIELD_HOCKEY', 'Sportstar'),
    item('badminton-1', 'BADMINTON', 'The Bridge'),
    item('general-1', null, 'NDTV Sports'),
  ] as any;

  const rail = selectForSport(pool, 5, 'SWIMMING');
  assert.equal(rail.length, 3);
  assert.deepEqual(rail.map((i) => i.id), ['hockey-1', 'badminton-1', 'general-1']);
});

test('a viewer with no sport on their profile gets the plain ranked rail', () => {
  const pool = [
    item('a', 'FIELD_HOCKEY', 'Sportstar'),
    item('b', 'BASKETBALL', 'The Bridge'),
  ] as any;
  assert.deepEqual(selectForSport(pool, 5, null).map((i) => i.id), ['a', 'b']);
});

test('the served item never leaks the pool’s internal ranking fields', () => {
  const rail = selectForSport([item('a', 'BASKETBALL')] as any, 5, 'BASKETBALL');
  assert.ok(!('published' in rail[0]));
  assert.ok(!('weight' in rail[0]));
});
