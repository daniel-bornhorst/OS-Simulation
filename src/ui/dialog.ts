import { h } from './dom';
import { overlayRoot } from './overlay';

interface DialogOptions {
  title: string;
  message?: string;
  okLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  input?: string;
}

function openDialog(opts: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const input =
      opts.input !== undefined ? h('input', { class: 'input dialog-input', type: 'text', value: opts.input }) : null;

    const finish = (value: string | null) => {
      backdrop.remove();
      resolve(value);
    };
    const ok = () => finish(input ? input.value : 'ok');

    const backdrop = h(
      'div',
      { class: 'dialog-backdrop' },
      h(
        'form',
        {
          class: 'dialog',
          role: 'dialog',
          'aria-modal': 'true',
          onsubmit: (e: Event) => {
            e.preventDefault();
            ok();
          },
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === 'Escape') finish(null);
          },
        },
        h('div', { class: 'dialog-title' }, opts.title),
        opts.message ? h('div', { class: 'dialog-message' }, opts.message) : null,
        input,
        h(
          'div',
          { class: 'dialog-buttons' },
          opts.cancelLabel === null
            ? null
            : h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, opts.cancelLabel ?? 'Cancel'),
          h('button', { type: 'submit', class: `btn btn-primary${opts.danger ? ' btn-danger' : ''}` }, opts.okLabel ?? 'OK'),
        ),
      ),
    );

    overlayRoot().append(backdrop);
    if (input) {
      input.focus();
      // Select just the file name without its extension, like most file managers do.
      const start = input.value.lastIndexOf('/') + 1;
      const dot = input.value.lastIndexOf('.');
      input.setSelectionRange(start, dot > start ? dot : input.value.length);
    } else {
      backdrop.querySelector<HTMLButtonElement>('.btn-primary')!.focus();
    }
  });
}

export function promptDialog(title: string, message: string, value = '', okLabel = 'OK'): Promise<string | null> {
  return openDialog({ title, message, input: value, okLabel });
}

export async function confirmDialog(
  title: string,
  message: string,
  okLabel = 'OK',
  danger = false,
): Promise<boolean> {
  return (await openDialog({ title, message, okLabel, danger })) !== null;
}

export async function alertDialog(title: string, message: string): Promise<void> {
  await openDialog({ title, message, cancelLabel: null });
}
