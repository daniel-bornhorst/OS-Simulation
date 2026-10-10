export type Operator = '+' | '-' | '×' | '÷';

const SYMBOLS: Record<string, Operator> = { '+': '+', '-': '-', '*': '×', '×': '×', '/': '÷', '÷': '÷' };

function compute(a: number, op: Operator, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return a / b;
  }
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  // Round away float noise like 0.1 + 0.2 = 0.30000000000000004.
  const text = String(Number(n.toPrecision(12)));
  return text.length > 14 ? n.toExponential(8).replace(/\.?0+e/, 'e') : text;
}

/** A standard four-function calculator driven by key presses. */
export class Calculator {
  display = '0';
  private acc: number | null = null;
  private op: Operator | null = null;
  /** The next digit starts a new number instead of appending. */
  private fresh = true;
  private last: { op: Operator; operand: number } | null = null;

  get expression(): string {
    return this.acc !== null && this.op ? `${formatNumber(this.acc)} ${this.op}` : '';
  }

  get pendingOperator(): Operator | null {
    return this.fresh ? this.op : null;
  }

  press(key: string): void {
    if (this.display === 'Error' && key !== 'C') this.clear();
    if (/^[0-9]$/.test(key)) this.digit(key);
    else if (key === '.') this.decimal();
    else if (key in SYMBOLS) this.operator(SYMBOLS[key]);
    else if (key === '=' || key === 'Enter') this.equals();
    else if (key === '%') this.setValue(Number(this.display) / 100);
    else if (key === '±') this.negate();
    else if (key === 'C' || key === 'Escape') this.clear();
    else if (key === 'Backspace') this.backspace();
  }

  private digit(d: string): void {
    if (this.fresh) {
      this.display = d;
      this.fresh = false;
    } else if (this.display.replace(/[-.]/g, '').length < 14) {
      this.display = this.display === '0' ? d : this.display === '-0' ? `-${d}` : this.display + d;
    }
  }

  private decimal(): void {
    if (this.fresh) {
      this.display = '0.';
      this.fresh = false;
    } else if (!this.display.includes('.')) {
      this.display += '.';
    }
  }

  private operator(op: Operator): void {
    if (this.op && !this.fresh && this.acc !== null) {
      this.setValue(compute(this.acc, this.op, Number(this.display)));
      if (this.display === 'Error') return;
    }
    this.acc = Number(this.display);
    this.op = op;
    this.fresh = true;
  }

  private equals(): void {
    if (this.op && this.acc !== null) {
      const operand = Number(this.display);
      this.last = { op: this.op, operand };
      this.setValue(compute(this.acc, this.op, operand));
      this.acc = null;
      this.op = null;
    } else if (this.last) {
      // Pressing = again repeats the last operation.
      this.setValue(compute(Number(this.display), this.last.op, this.last.operand));
    }
    this.fresh = true;
  }

  private negate(): void {
    if (this.display === '0') return;
    this.display = this.display.startsWith('-') ? this.display.slice(1) : `-${this.display}`;
  }

  private backspace(): void {
    if (this.fresh) return;
    this.display = this.display.slice(0, -1);
    if (this.display === '' || this.display === '-') {
      this.display = '0';
      this.fresh = true;
    }
  }

  private setValue(n: number): void {
    this.display = formatNumber(n);
    this.fresh = true;
  }

  clear(): void {
    this.display = '0';
    this.acc = null;
    this.op = null;
    this.fresh = true;
    this.last = null;
  }
}
