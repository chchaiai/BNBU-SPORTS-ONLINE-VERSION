import assert from 'node:assert/strict';
import { it } from 'node:test';
import { normalizeHelpContent, type HelpContentInput } from '../../src/modules/v8/domain/help-article.js';
const content: HelpContentInput = { titleZh: ' 标题 ', titleEn: ' Title ', bodyZh: '', bodyEn: '', category: 'login',
  keywords: [], sortWeight: -0.5, status: 'draft' };
it('allows incomplete drafts and finite fractional negative sort weights', () => {
  assert.equal(normalizeHelpContent(content, ['login']).sortWeight, -0.5);
  assert.equal(normalizeHelpContent(content, ['login']).titleZh, '标题');
  for (const sortWeight of [NaN, Infinity, -Infinity]) assert.throws(() => normalizeHelpContent({ ...content, sortWeight }, ['login']));
});
it('requires both bodies and keywords for every publication and preserves legal transitions', () => {
  assert.throws(() => normalizeHelpContent({ ...content, status: 'published' }, ['login']));
  const published = normalizeHelpContent({ ...content, status: 'published', bodyZh: ' 内容 ', bodyEn: ' Body ', keywords: ['a， b', 'a', ' '] }, ['login']);
  assert.deepEqual(published.keywords, ['a', 'b']);
  assert.throws(() => normalizeHelpContent(content, ['login'], 'published'));
  assert.throws(() => normalizeHelpContent({ ...content, status: 'archived' }, ['login'], 'draft'));
  assert.equal(normalizeHelpContent({ ...published, status: 'archived' }, ['login'], 'published').status, 'archived');
  assert.equal(normalizeHelpContent(published, ['login'], 'archived').status, 'published');
});
