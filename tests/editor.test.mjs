import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  toEditor,
  fromEditor,
  unsupportedFormatting,
  notationParts,
  notationFormatting,
  RichRead,
} from "./.build/editor.mjs";
import { bullet, marks } from "../src/domain.mjs";
test("rendered equations inherit source color, highlight and emphasis", () => {
  const node = bullet("math", { text: "Before $x^2$ after", formatting: "8:11:COLOR_2463BB;7:12:HIGHLIGHT_FFE082;8:11:BOLD;8:11:UNDERLINE" });
  const part = notationParts(node.text)[0];
  assert.deepEqual(notationFormatting(node, part.start, part.end), {
    color: "#2463BB", backgroundColor: "#FFE082", fontWeight: 700, fontStyle: undefined, textDecoration: "underline",
  });
  assert.equal(notationFormatting(node, 0, 6).color, undefined);
  const html = renderToStaticMarkup(React.createElement(RichRead, { node }));
  assert.match(html, /class="notation " style="color:#2463BB;background-color:#FFE082;font-weight:700;text-decoration:underline"/);
  assert.match(html, /Before /);
  assert.match(html, / after/);
});
test("notation parsing supports inline and display LaTeX and fenced Mermaid", () => {
  const text = 'Energy $E=mc^2$ and \\(x^2\\)\n$$\\frac{1}{2}$$\n```mermaid\nflowchart LR\nA-->B\n```';
  const parts = notationParts(text);
  assert.deepEqual(parts.map(p => [p.kind, p.display]), [["math", false], ["math", false], ["math", true], ["mermaid", true]]);
  assert.equal(parts[3].source.trim(), "flowchart LR\nA-->B");
  assert.equal(notationParts("Price $20 and escaped \\$x").length, 0);
});
test("rich-text adapter preserves Unicode, hard breaks, overlapping marks and colors", () => {
  const n = bullet("n", {
    text: "A😀B\nnext",
    formatting: "0:4:BOLD;1:3:ITALIC;2:8:COLOR_AABBCC;5:9:HIGHLIGHT_FFE082",
  });
  const result = fromEditor(toEditor(n));
  assert.equal(result.text, n.text);
  for (let i = 0; i < n.text.length; i++) {
    const at = (encoded) =>
      marks(encoded, n.text.length)
        .filter((m) => m.start <= i && m.end > i)
        .map((m) => m.style)
        .sort();
    assert.deepEqual(at(result.formatting), at(n.formatting));
  }
});
test("unknown formatting is detected before editable conversion", () => {
  assert.ok(
    unsupportedFormatting(
      bullet("n", { text: "abc", formatting: "0:3:FUTURE_STYLE" }),
    ),
  );
  assert.ok(
    !unsupportedFormatting(
      bullet("n", { text: "abc", formatting: "0:3:BOLD" }),
    ),
  );
});

test("code blocks highlight tokens and escape source markup, including unknown languages", () => {
  const html = renderToStaticMarkup(React.createElement(RichRead, { node: bullet("code", { text: 'const x = "<script>alert(1)</script>";', codeLanguage: "javascript" }) }));
  assert.match(html, /hljs-keyword/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const unknown = renderToStaticMarkup(React.createElement(RichRead, { node: bullet("code", { text: "<tag>", codeLanguage: "unknown" }) }));
  assert.match(unknown, /&lt;tag&gt;/);
});

test('mask formatting round trips UTF-16 ranges and wraps notation and other styles as a single patch', () => {
  const node = bullet('masked', { text: 'A secret $x^2$ 😀 Z', formatting: '2:17:MASK;4:10:BOLD;2:8:COLOR_2463BB' });
  const converted = fromEditor(toEditor(node));
  assert.equal(converted.text,node.text);
  for(let at=0;at<node.text.length;at++) {
    const atStyles = format => marks(format,node.text.length).filter(m => m.start <= at && m.end > at).map(m => m.style).sort();
    assert.deepEqual(atStyles(converted.formatting),atStyles(node.formatting));
  }
  assert.equal(unsupportedFormatting(node),false);
  const html = renderToStaticMarkup(React.createElement(RichRead,{node}));
  assert.equal((html.match(/data-remo-mask="true"/g)||[]).length,1);
  assert.match(html,/class="masked-content"/);
  assert.match(html,/tabindex="0"/);
  assert.match(html.replace(/<[^>]*>/g, ""),/secret/);
});
