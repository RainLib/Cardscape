const assert = require('node:assert/strict');
const test = require('node:test');
const { language, text } = require('../dist/renderer/ui-i18n.js');

test('the interface defaults to English and accepts the two shipped locales', () => {
  assert.equal(language(null), 'en');
  assert.equal(language('fr'), 'en');
  assert.equal(language('zh-CN'), 'zh-CN');
  assert.equal(text('新建卡片', language(null)), 'New Card');
  assert.equal(text('新建卡片', language('zh-CN')), '新建卡片');
});

test('dynamic labels preserve authored names and translate independent help lines', () => {
  assert.equal(text(' 打开卡片 图层 ', 'en'), ' Open card 图层 ');
  assert.equal(text('编辑\n预览', 'en'), 'Edit\nPreview');
  assert.equal(text('奈莉丝 · 人物动效 · 已应用，可撤销', 'en'),
    'Neris Vale · Character Effects · Applied. You can undo this change.');
});
