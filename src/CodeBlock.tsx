import {memo} from 'react';
import hljs from 'highlight.js/lib/common';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const codeLanguages = ['plaintext', 'javascript', 'typescript', 'python', 'java', 'sql', 'json', 'html', 'css', 'bash', 'c', 'cpp', 'csharp', 'go', 'rust', 'yaml', 'markdown'];
export function highlightCode(text: string, language: string) {
  return hljs.highlight(text, { language: hljs.getLanguage(language) ? language : 'plaintext', ignoreIllegals: true }).value;
}
export const CodeRead=memo(function CodeRead({ text, language }: { text: string; language: string }) {
  // highlight.js escapes all source text before producing its own token spans.
  return <code className="syntax-code" dangerouslySetInnerHTML={{ __html: highlightCode(text, language) }} />;
});
export function codeHighlight(getLanguage: () => string) {
  return Extension.create({
    name: 'remoSyntax',
    addProseMirrorPlugins() {
      let previousDoc:unknown,previousLanguage='',cached=DecorationSet.empty;
      return [new Plugin({ props: { decorations(state) {
        const language = getLanguage();
        if (!language) return DecorationSet.empty;
        if(previousDoc===state.doc&&previousLanguage===language)return cached;
        const text = state.doc.textBetween(0, state.doc.content.size, '\n', '\n');
        const container = document.createElement('div');
        container.innerHTML = highlightCode(text, language);
        let offset = 1;
        const decorations: Decoration[] = [];
        const walk = (node: globalThis.Node, classes: string[]) => {
          if (node.nodeType === 3) {
            const length = node.textContent?.length || 0;
            if (length && classes.length) decorations.push(Decoration.inline(offset, offset + length, { class: classes.join(' ') }));
            offset += length;
          } else {
            const next = node instanceof HTMLElement && node.className ? [...classes, node.className] : classes;
            node.childNodes.forEach(child => walk(child, next));
          }
        };
        walk(container, []);
        previousDoc=state.doc;previousLanguage=language;cached=DecorationSet.create(state.doc, decorations);return cached;
      } } })];
    },
  });
}
