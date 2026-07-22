import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entryPoint = fileURLToPath(new URL("../src/text/markdown.ts", import.meta.url));
const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const { filterSectionsByTitle, splitMarkdownByHeadingLevel } = await import(moduleUrl);

const markdown = [
  "# Chapter",
  "Introduction",
  "## First steps",
  "Alpha",
  "### Detail",
  "Beta",
  "## Second steps",
  "Gamma",
  "## FIRST review",
  "Delta",
].join("\n");
const sections = splitMarkdownByHeadingLevel(markdown, 2);

test("filters heading sections by a case-insensitive substring", () => {
  const matched = filterSectionsByTitle(sections, "first");

  assert.deepEqual(
    matched.map((section) => ({ index: section.index, title: section.title })),
    [
      { index: 2, title: "First steps" },
      { index: 4, title: "FIRST review" },
    ],
  );
  assert.match(matched[0].markdown, /### Detail/);
});

test("treats a whitespace-only filter as no filter", () => {
  assert.strictEqual(filterSectionsByTitle(sections, "   "), sections);
});

test("returns no sections when no heading matches", () => {
  assert.deepEqual(filterSectionsByTitle(sections, "missing"), []);
});

test("only checks the supplied cursor section", () => {
  const sectionAtCursor = [sections[2]];

  assert.deepEqual(filterSectionsByTitle(sectionAtCursor, "first"), []);
});
