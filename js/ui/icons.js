const paths = {
  home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  scores: '<path d="M4 17V9m5 8V5m6 12v-6m5 6V3M2 21h20"/>',
  trade: '<path d="M4 7h14m-4-4 4 4-4 4M20 17H6m4 4-4-4 4-4"/>',
  research: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  keeper: '<path d="M12 3v18M5 6h14M5 6 2 12h6L5 6Zm14 0-3 6h6l-3-6ZM7 21h10M8 12c0 2 1.8 4 4 4s4-2 4-4"/>',
  rankings: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  tools: '<path d="M14 6a4 4 0 0 0-5-3l2.5 2.5-3 3L6 6a4 4 0 0 0 5 5l8 8a2 2 0 0 0 3-3l-8-8ZM6 14l-3 3a2 2 0 0 0 3 3l3-3"/>',
  news: '<path d="M5 4h14v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 4h8M8 12h8m-8 4h5"/>',
  spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

export function icon(name, className = '') {
  return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}
