const ENTER_ALTERNATE_SCREEN = '\x1b[?1049h';
const LEAVE_ALTERNATE_SCREEN = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const RESET_STYLE = '\x1b[0m';

export class TerminalSession {
  constructor(input = process.stdin, output = process.stdout) {
    this.input = input;
    this.output = output;
    this.active = false;
    this.closed = false;
    this.previousLines = [];
    this.pendingFrame = null;
    this.waitingForDrain = false;
  }

  enter() {
    if (this.active) return;
    this.closed = false;
    if (typeof this.input.setRawMode === 'function') this.input.setRawMode(true);
    this.input.resume();
    this.output.write(`${ENTER_ALTERNATE_SCREEN}${HIDE_CURSOR}\x1b[2J`);
    this.active = true;
  }

  resetFrame() {
    this.previousLines = [];
  }

  render(frame) {
    if (!this.active || this.closed) return;
    this.pendingFrame = frame;
    if (this.waitingForDrain) return;
    this.flushFrame();
  }

  flushFrame() {
    if (!this.pendingFrame || this.closed) return;
    const nextLines = this.pendingFrame.split('\n');
    this.pendingFrame = null;
    const count = Math.max(this.previousLines.length, nextLines.length);
    let output = this.previousLines.length === 0 ? '\x1b[H' : '';
    for (let index = 0; index < count; index += 1) {
      const previous = this.previousLines[index] || '';
      const next = nextLines[index] || '';
      if (previous !== next) output += `\x1b[${index + 1};1H\x1b[2K${next}`;
    }
    this.previousLines = nextLines;
    if (!output) return;
    if (!this.output.write(output)) {
      this.waitingForDrain = true;
      this.output.once('drain', () => {
        this.waitingForDrain = false;
        this.flushFrame();
      });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pendingFrame = null;
    try {
      if (typeof this.input.setRawMode === 'function' && this.input.isRaw) this.input.setRawMode(false);
      this.input.pause();
    } finally {
      if (this.active) this.output.write(`${RESET_STYLE}${SHOW_CURSOR}${LEAVE_ALTERNATE_SCREEN}`);
      this.active = false;
    }
  }
}

export const terminalSequences = {
  ENTER_ALTERNATE_SCREEN,
  LEAVE_ALTERNATE_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  RESET_STYLE
};
