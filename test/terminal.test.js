import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TerminalSession, terminalSequences } from '../src/terminal.js';

class FakeInput extends EventEmitter {
  setRawMode(value) {
    this.isRaw = value;
  }

  resume() {
    this.resumed = true;
  }

  pause() {
    this.paused = true;
  }
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.output = '';
  }

  write(value) {
    this.output += value;
    return true;
  }
}

test('终端会话集中进入和恢复 raw mode、光标及备用屏幕', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const session = new TerminalSession(input, output);
  session.enter();
  assert.equal(input.isRaw, true);
  session.render('first\nsecond');
  session.close();
  session.close();
  assert.equal(input.isRaw, false);
  assert.equal(input.paused, true);
  assert.equal(output.output.includes(terminalSequences.ENTER_ALTERNATE_SCREEN), true);
  assert.equal(output.output.includes(terminalSequences.LEAVE_ALTERNATE_SCREEN), true);
  assert.equal(output.output.split(terminalSequences.LEAVE_ALTERNATE_SCREEN).length - 1, 1);
});

test('差分帧使用绝对光标定位，不通过换行追加动画', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const session = new TerminalSession(input, output);
  session.enter();
  session.render('line one\nline two');
  session.render('line one\nchanged');
  session.close();
  const frameWrites = output.output
    .replace(terminalSequences.ENTER_ALTERNATE_SCREEN, '')
    .replace(terminalSequences.LEAVE_ALTERNATE_SCREEN, '');
  assert.doesNotMatch(frameWrites, /\n/u);
  assert.match(frameWrites, /\u001b\[2;1H/u);
});
