/** Layer for menus and dialogs, above windows and shell chrome. */
export function overlayRoot(): HTMLElement {
  return document.getElementById('os') ?? document.body;
}
