import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genderCategoryLabel, ageCategoryLabel, categoryLabels } from './tournamentCategory.ts';

test('the admin form values label cleanly', () => {
  assert.equal(genderCategoryLabel('MEN'), 'Men');
  assert.equal(genderCategoryLabel('WOMEN'), 'Women');
  assert.equal(genderCategoryLabel('MIXED'), 'Mixed');
  assert.equal(genderCategoryLabel('OPEN'), 'Open');
});

test('free-text spellings label the same way the ranking boards read them', () => {
  // These are the spellings genderFromCategory (server) already treats as men's
  // and women's. A card must not disagree with the board the same tournament
  // ranks on.
  for (const s of ["Men's", 'Mens', 'MEN’S', 'male', 'Males', 'Boys', 'M', ' men ']) {
    assert.equal(genderCategoryLabel(s), 'Men', `${JSON.stringify(s)} should read as Men`);
  }
  for (const s of ["Women's", 'Womens', 'WOMEN’S', 'female', 'Females', 'Girls', 'Ladies', 'W', ' women ']) {
    assert.equal(genderCategoryLabel(s), 'Women', `${JSON.stringify(s)} should read as Women`);
  }
});

test('"WOMEN" is never labelled "Men"', () => {
  // Substring matching here would put a women's tournament under a Men chip —
  // the same trap the server's parser is anchored against.
  assert.equal(genderCategoryLabel('WOMEN'), 'Women');
  assert.equal(genderCategoryLabel("Women's"), 'Women');
});

test('nothing set means no chip', () => {
  assert.equal(genderCategoryLabel(null), null);
  assert.equal(genderCategoryLabel(''), null);
  assert.equal(genderCategoryLabel('   '), null);
  assert.equal(ageCategoryLabel(undefined), null);
  assert.deepEqual(categoryLabels({}), []);
});

test('an unrecognised category is shown as typed, never dropped', () => {
  assert.equal(genderCategoryLabel('Corporate'), 'Corporate');
  assert.equal(ageCategoryLabel('Veterans league'), 'Veterans league');
});

test('age groups normalise to the U-form', () => {
  for (const s of ['U19', 'u19', 'U-19', 'Under 19', 'under-19']) {
    assert.equal(ageCategoryLabel(s), 'U19', `${JSON.stringify(s)} should read as U19`);
  }
  assert.equal(ageCategoryLabel('O35'), 'O35');
  assert.equal(ageCategoryLabel('MASTERS'), 'Masters');
  assert.equal(ageCategoryLabel('OPEN'), 'Open');
});

test('both labels read in order: category, then age', () => {
  assert.deepEqual(categoryLabels({ genderCategory: 'WOMEN', ageCategory: 'U19' }), ['Women', 'U19']);
  assert.deepEqual(categoryLabels({ genderCategory: 'MEN' }), ['Men']);
  assert.deepEqual(categoryLabels({ ageCategory: 'U16' }), ['U16']);
});
