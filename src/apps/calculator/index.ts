import type { AppDefinition } from '../../core/appRegistry';
import { h } from '../../ui/dom';
import { Calculator } from './engine';
import './style.css';

const KEYS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

const KEY_ALIASES: Record<string, string> = { '*': '×', '/': '÷', Enter: '=', Escape: 'C', Delete: 'C' };

export const calculatorApp: AppDefinition = {
  id: 'calculator',
  name: 'Calculator',
  icon: 'calculator',
  defaultSize: { width: 300, height: 440 },
  minSize: { width: 240, height: 360 },

  launch({ win }) {
    const calc = new Calculator();
    const expression = h('div', { class: 'calc-expression' });
    const display = h('div', { class: 'calc-display', 'aria-live': 'polite' });
    const buttons = new Map<string, HTMLButtonElement>();

    const keypad = h(
      'div',
      { class: 'calc-keys' },
      KEYS.flat().map((key) => {
        const kind = /[0-9.]/.test(key) ? 'digit' : ['÷', '×', '-', '+', '='].includes(key) ? 'op' : 'fn';
        const button = h(
          'button',
          { class: `calc-key calc-${kind}${key === '0' ? ' calc-zero' : ''}`, onclick: () => press(key) },
          key === '-' ? '−' : key,
        );
        buttons.set(key, button);
        return button;
      }),
    );

    const root = h('div', { class: 'calc', tabindex: 0 }, h('div', { class: 'calc-screen' }, expression, display), keypad);
    win.body.append(root);

    function press(key: string) {
      calc.press(key);
      update();
    }

    function update() {
      display.textContent = calc.display;
      display.style.fontSize = calc.display.length > 10 ? '28px' : '';
      expression.textContent = calc.expression;
      for (const [key, button] of buttons) button.classList.toggle('is-active', key === calc.pendingOperator);
    }

    root.addEventListener('keydown', (e) => {
      const key = KEY_ALIASES[e.key] ?? e.key;
      if (/^[0-9.%=+\-×÷C]$/.test(key) || key === 'Backspace') {
        e.preventDefault();
        calc.press(key);
        update();
        const button = buttons.get(key);
        if (button) {
          button.classList.add('is-pressed');
          setTimeout(() => button.classList.remove('is-pressed'), 100);
        }
      }
    });

    update();
    root.focus();
  },
};
