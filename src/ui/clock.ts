/** Keep `el` showing the current time. Returns a stop function. */
export function startClock(el: HTMLElement, format: (d: Date) => string): () => void {
  const tick = () => (el.textContent = format(new Date()));
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

export const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
