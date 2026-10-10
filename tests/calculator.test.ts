import { describe, expect, it } from 'vitest';
import { Calculator } from '../src/apps/calculator/engine';

const calc = (keys: string) => {
  const c = new Calculator();
  for (const k of keys.split(' ')) c.press(k);
  return c.display;
};

describe('Calculator', () => {
  it('does basic arithmetic', () => {
    expect(calc('1 2 + 3 0 =')).toBe('42');
    expect(calc('9 ÷ 4 =')).toBe('2.25');
    expect(calc('7 × 6 =')).toBe('42');
    expect(calc('5 - 8 =')).toBe('-3');
  });
  it('chains operations left to right', () => {
    expect(calc('2 + 3 × 4 =')).toBe('20');
  });
  it('avoids floating point noise', () => {
    expect(calc('0 . 1 + 0 . 2 =')).toBe('0.3');
  });
  it('repeats the last operation on =', () => {
    expect(calc('2 + 3 = = =')).toBe('11');
  });
  it('handles division by zero', () => {
    expect(calc('1 ÷ 0 =')).toBe('Error');
    expect(calc('1 ÷ 0 = 5')).toBe('5');
  });
  it('supports percent, negate, backspace and clear', () => {
    expect(calc('5 0 %')).toBe('0.5');
    expect(calc('8 ±')).toBe('-8');
    expect(calc('1 2 3 Backspace')).toBe('12');
    expect(calc('1 2 3 C')).toBe('0');
  });
});
