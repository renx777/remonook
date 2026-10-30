/** Radix dispatches DOM events and walks focusable controls. Keep their constructors
 * in jsdom's realm, rather than Node's unrelated Event/CustomEvent classes. */
export function installOverlayGlobals(dom) {
  for (const key of ['Element','CustomEvent','Event','NodeFilter','HTMLButtonElement']) {
    Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
  }
}
