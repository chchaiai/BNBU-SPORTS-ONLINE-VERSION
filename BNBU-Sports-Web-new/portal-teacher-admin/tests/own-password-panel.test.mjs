import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {OwnPasswordPanel} from '../app/own-password-panel.tsx';

test('authenticated own-password form asks for current password and unrestricted new passwords', () => {
  for(const locale of ['zh-CN','en']) {
    const html=renderToStaticMarkup(React.createElement(OwnPasswordPanel,{locale,preview:false,onBack(){}}));
    assert.match(html,/autoComplete="current-password"/);
    assert.equal((html.match(/autoComplete="new-password"/g)??[]).length,2);
    assert.equal((html.match(/<input[^>]*required=""/g)??[]).length,3);
    assert.doesNotMatch(html,/maxLength|minLength|one-time-code|type="email"/);
    assert.match(html,/form="own-password-form"/);
    for(const field of ['currentPassword','newPassword','confirmPassword']) {
      assert.equal((html.match(new RegExp(`id="own-${field}"`,'g'))??[]).length,1);
      assert.match(html,new RegExp(`<input[^>]*id="own-${field}"`));
      assert.match(html,new RegExp(`<label[^>]*for="own-${field}"`));
    }
  }
});
test('preview disables password mutation', () => {
  const html=renderToStaticMarkup(React.createElement(OwnPasswordPanel,{locale:'en',preview:true,onBack(){}}));
  assert.match(html,/<button[^>]*type="submit"[^>]*disabled=""/);
});
