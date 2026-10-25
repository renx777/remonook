// Map the rendered reader back to the stored UTF-16 text, including emoji
// tokens and equations whose on-screen text differs from their source.
function sourceLength(node: globalThis.Node): number {
  if (node.nodeType === 3) return node.textContent?.length || 0;
  if (node instanceof window.Element) {
    const source = node.getAttribute('data-emoji-token') ?? node.getAttribute('data-selection-source');
    if (source !== null) return source.length;
    if (node.tagName === 'BR') return 1;
  }
  return Array.from(node.childNodes).reduce((sum, child) => sum + sourceLength(child), 0);
}

export function sourceOffset(root: HTMLElement, target: globalThis.Node | null, offset: number): number | null {
  if (!target || !root.contains(target)) return null;
  const walk = (node: globalThis.Node): number => {
    if (node === target) {
      return node.nodeType === 3 ? offset : Array.from(node.childNodes).slice(0, offset).reduce((sum, child) => sum + sourceLength(child), 0);
    }
    if (node instanceof window.Element && (node.hasAttribute('data-emoji-token') || node.hasAttribute('data-selection-source')) && node.contains(target)) {
      return offset ? sourceLength(node) : 0;
    }
    let total = 0;
    for (const child of node.childNodes) {
      if (child === target || child.contains(target)) return total + walk(child);
      total += sourceLength(child);
    }
    return total;
  };
  return walk(root);
}

export function readerSelection(root: HTMLElement, x: number, y: number, length: number) {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    const anchor = sourceOffset(root, selection.anchorNode, selection.anchorOffset);
    const head = sourceOffset(root, selection.focusNode, selection.focusOffset);
    if (anchor !== null && head !== null) return { anchor, head };
  }
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: globalThis.Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const point = doc.caretPositionFromPoint?.(x, y);
  const range = !point ? doc.caretRangeFromPoint?.(x, y) : null;
  const pos = sourceOffset(root, point?.offsetNode || range?.startContainer || null, point?.offset ?? range?.startOffset ?? 0) ?? length;
  return { anchor: pos, head: pos };
}
