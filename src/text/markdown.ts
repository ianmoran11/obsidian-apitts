export const AUDIO_BLOCK_START = "<!-- apitts-audio:start -->";
export const AUDIO_BLOCK_END = "<!-- apitts-audio:end -->";

export interface TtsSection {
  index: number;
  title: string;
  markdown: string;
}

export interface TtsChunk {
  section: TtsSection;
  chunkIndex: number;
  totalChunks: number;
  text: string;
}

const AUDIO_BLOCK_RE = new RegExp(
  `${escapeRegExp(AUDIO_BLOCK_START)}[\\s\\S]*?${escapeRegExp(AUDIO_BLOCK_END)}\\n*`,
  "g",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeExistingAudioBlock(markdown: string): string {
  return markdown.replace(AUDIO_BLOCK_RE, "").replace(/\n{4,}/g, "\n\n\n");
}

export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(AUDIO_BLOCK_RE, "")
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[[^\]]+\]\([^)]*\)/g, (match) => match.replace(/^\[([^\]]+)]\([^)]*\)$/, "$1"))
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[\t ]+/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitMarkdownByHeadingLevel(
  markdown: string,
  maxHeadingLevel: number,
): TtsSection[] {
  const lines = markdown.split("\n");
  const sections: TtsSection[] = [];
  let currentTitle = "Introduction";
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (stripMarkdownForSpeech(body)) {
      sections.push({
        index: sections.length + 1,
        title: currentTitle,
        markdown: body,
      });
    }
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    const level = match ? match[1].length : 0;
    if (match && level <= maxHeadingLevel) {
      flush();
      currentTitle = match[2].trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  flush();

  if (sections.length === 0) {
    return [
      {
        index: 1,
        title: "Whole note",
        markdown,
      },
    ];
  }

  return sections;
}

export function findMarkdownSectionAtLine(
  markdown: string,
  maxHeadingLevel: number,
  cursorLine: number,
): TtsSection {
  const lines = markdown.split("\n");
  const boundedCursorLine = Math.min(
    Math.max(Math.floor(cursorLine), 0),
    Math.max(lines.length - 1, 0),
  );
  const sections: Array<TtsSection & { startLine: number; endLine: number }> = [];
  let currentTitle = "Introduction";
  let currentStartLine = 0;
  let readableSectionCount = 0;

  const flush = (endLineExclusive: number) => {
    const markdown = lines.slice(currentStartLine, endLineExclusive).join("\n").trim();
    const hasReadableText = Boolean(stripMarkdownForSpeech(markdown));
    if (hasReadableText) readableSectionCount += 1;

    sections.push({
      index: hasReadableText ? readableSectionCount : readableSectionCount + 1,
      title: currentTitle,
      markdown,
      startLine: currentStartLine,
      endLine: endLineExclusive - 1,
    });
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const match = lines[lineIndex].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    const level = match ? match[1].length : 0;
    if (match && level <= maxHeadingLevel) {
      flush(lineIndex);
      currentTitle = match[2].trim();
      currentStartLine = lineIndex;
    }
  }

  flush(lines.length);

  const activeSection = sections.find(
    (section) =>
      boundedCursorLine >= section.startLine && boundedCursorLine <= section.endLine,
  );

  if (activeSection) {
    const { startLine: _startLine, endLine: _endLine, ...section } = activeSection;
    return section;
  }

  return makeWholeNoteSection(markdown);
}

export function splitTextIntoChunks(text: string, maxCharacters: number): string[] {
  const limit = Math.max(1000, maxCharacters);
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > limit) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLongParagraph(paragraph, limit));
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > limit) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitLongParagraph(paragraph: string, limit: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let start = 0; start < sentence.length; start += limit) {
        chunks.push(sentence.slice(start, start + limit).trim());
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > limit) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function buildAudioEmbedBlock(
  embeds: Array<{ label: string; path: string }>,
  generatedAt = new Date(),
): string {
  const lines = [
    AUDIO_BLOCK_START,
    `Generated text-to-speech audio (${generatedAt.toLocaleString()}):`,
    "",
  ];

  for (const embed of embeds) {
    lines.push(`- ${embed.label}`);
    lines.push(`![[${embed.path}]]`);
    lines.push("");
  }

  lines.push(AUDIO_BLOCK_END);
  return `${lines.join("\n")}\n`;
}

export function insertOrReplaceAudioBlock(markdown: string, block: string): string {
  if (AUDIO_BLOCK_RE.test(markdown)) {
    AUDIO_BLOCK_RE.lastIndex = 0;
    return markdown.replace(AUDIO_BLOCK_RE, `${block}\n`);
  }
  AUDIO_BLOCK_RE.lastIndex = 0;

  const frontmatter = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  if (frontmatter) {
    const index = frontmatter[0].length;
    return `${markdown.slice(0, index).trimEnd()}\n\n${block}\n${markdown.slice(index).trimStart()}`;
  }

  return `${block}\n${markdown.trimStart()}`;
}

export function makeWholeNoteSection(markdown: string): TtsSection {
  return { index: 1, title: "Whole note", markdown };
}

export function makeChunksForSection(section: TtsSection, maxCharacters: number): TtsChunk[] {
  const text = stripMarkdownForSpeech(section.markdown);
  if (!text) return [];
  const texts = splitTextIntoChunks(text, maxCharacters);
  return texts.map((chunkText, index) => ({
    section,
    chunkIndex: index + 1,
    totalChunks: texts.length,
    text: chunkText,
  }));
}
