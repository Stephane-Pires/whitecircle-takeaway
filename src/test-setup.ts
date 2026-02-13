// Polyfill ResizeObserver — used by Radix ScrollArea, not in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill pointer capture APIs missing from jsdom.
// Required for vaul (shadcn Drawer) drag gesture handlers.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

// Polyfill computedStyle transform for vaul's translate parsing.
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (element, pseudoElt) => {
  const style = originalGetComputedStyle(element, pseudoElt);
  if (!style.transform) {
    Object.defineProperty(style, "transform", {
      value: "none",
      writable: true,
    });
  }
  return style;
};
