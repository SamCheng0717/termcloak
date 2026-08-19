import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDefinitions, commandTips, completeCommand } from '../src/commands.js';

test('所有可见 Tip 都来自真实命令定义', () => {
  const registeredTips = commandDefinitions.map(({ tip }) => tip).filter(Boolean);
  assert.deepEqual(new Set(commandTips), new Set(registeredTips));
  assert.ok(commandDefinitions.some(({ name }) => name === '/btw'));
});

test('Tab 补全唯一命令并保留多候选公共前缀', () => {
  assert.equal(completeCommand('/bt'), '/btw ');
  assert.equal(completeCommand('/search-n'), '/search-next');
  assert.equal(completeCommand('/se'), '/search');
  assert.equal(completeCommand('普通文字'), '普通文字');
});
