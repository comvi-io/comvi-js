import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/**
 * The class string per token kind lives in a module-level table evaluated at
 * import time, so each test re-evaluates the module: a suite reading only the
 * copy imported at collection time pins a snapshot taken before it ran.
 */
let useTranslationHighlighter: typeof import("../src/composables/useTranslationHighlighter").useTranslationHighlighter;

beforeEach(async () => {
  vi.resetModules();
  ({ useTranslationHighlighter } = await import("../src/composables/useTranslationHighlighter"));
});

/** The four class sets the highlighter is contracted to emit, one per token kind. */
const NEUTRAL = "bg-muted text-muted-foreground";
const PLACEHOLDER = "bg-accent-soft text-primary";
const UNCLOSED = "bg-destructive/15 text-destructive";
const INVALID = "bg-destructive/20 text-destructive";

function span(classes: string, escapedValue: string): string {
  return `<span class="${classes}">${escapedValue}</span>`;
}

function highlight(text: string): string {
  return useTranslationHighlighter(ref(text)).highlightedHtml.value;
}

describe("useTranslationHighlighter()", () => {
  describe("plain text", () => {
    it("empty text → an empty string", () => {
      expect(highlight("")).toBe("");
    });

    it("text with HTML-special characters → each one escaped, nothing highlighted", () => {
      expect(highlight(`5 > 3 & 2 < 4 "q" 'a'`)).toBe(
        `5 &gt; 3 &amp; 2 &lt; 4 &quot;q&quot; &#039;a&#039;`,
      );
    });

    it("unicode text → returned unchanged", () => {
      expect(highlight("Привіт, 世界 👋")).toBe("Привіт, 世界 👋");
    });
  });

  describe("XML tag pairs", () => {
    it("a matched pair → both tags neutral, the text between them escaped", () => {
      expect(highlight("<b>bold & brave</b>")).toBe(
        span(NEUTRAL, "&lt;b&gt;") + "bold &amp; brave" + span(NEUTRAL, "&lt;/b&gt;"),
      );
    });

    it("a pair whose names differ in case → still matched", () => {
      expect(highlight("<B>hi</b>")).toBe(
        span(NEUTRAL, "&lt;B&gt;") + "hi" + span(NEUTRAL, "&lt;/b&gt;"),
      );
    });

    it("correctly nested pairs → all four tags neutral", () => {
      expect(highlight("<a><b>y</b></a>")).toBe(
        span(NEUTRAL, "&lt;a&gt;") +
          span(NEUTRAL, "&lt;b&gt;") +
          "y" +
          span(NEUTRAL, "&lt;/b&gt;") +
          span(NEUTRAL, "&lt;/a&gt;"),
      );
    });

    it("an opening tag with attributes → the attributes stay inside the one token", () => {
      expect(highlight(`<a href="x">link</a>`)).toBe(
        span(NEUTRAL, "&lt;a href=&quot;x&quot;&gt;") + "link" + span(NEUTRAL, "&lt;/a&gt;"),
      );
    });

    it("a closing tag with whitespace after the slash → still closes the pair", () => {
      expect(highlight("<b>x</ b>")).toBe(
        span(NEUTRAL, "&lt;b&gt;") + "x" + span(NEUTRAL, "&lt;/ b&gt;"),
      );
    });

    it("a closing tag also written self-closing → read as a closing tag, not a lone element", () => {
      expect(highlight("<b>x</b/>")).toBe(
        span(NEUTRAL, "&lt;b&gt;") + "x" + span(NEUTRAL, "&lt;/b/&gt;"),
      );
    });
  });

  describe("self-closing tags", () => {
    it("a self-closing tag → neutral, and never reported unclosed", () => {
      expect(highlight("line<br/>break")).toBe("line" + span(NEUTRAL, "&lt;br/&gt;") + "break");
    });

    it("a self-closing tag with a space before the slash → still self-closing", () => {
      expect(highlight("line<br />break")).toBe("line" + span(NEUTRAL, "&lt;br /&gt;") + "break");
    });
  });

  describe("malformed tags", () => {
    it("an opening tag that is never closed → flagged unclosed", () => {
      expect(highlight("<b>bold")).toBe(span(UNCLOSED, "&lt;b&gt;") + "bold");
    });

    it("a closing tag with nothing open → flagged invalid", () => {
      expect(highlight("</b>done")).toBe(span(INVALID, "&lt;/b&gt;") + "done");
    });

    it("a closing tag matching no open tag → it is flagged invalid and the open one unclosed", () => {
      expect(highlight("<strong>hi</span>")).toBe(
        span(UNCLOSED, "&lt;strong&gt;") + "hi" + span(INVALID, "&lt;/span&gt;"),
      );
    });

    it("crossed nesting → the outer pair is honoured and the inner tag flagged unclosed", () => {
      expect(highlight("<a><b>x</a>")).toBe(
        span(NEUTRAL, "&lt;a&gt;") +
          span(UNCLOSED, "&lt;b&gt;") +
          "x" +
          span(NEUTRAL, "&lt;/a&gt;"),
      );
    });

    it("two identical open tags and one close → the innermost is closed, the outer flagged unclosed", () => {
      expect(highlight("<b><b>x</b>")).toBe(
        span(UNCLOSED, "&lt;b&gt;") +
          span(NEUTRAL, "&lt;b&gt;") +
          "x" +
          span(NEUTRAL, "&lt;/b&gt;"),
      );
    });
  });

  describe("ICU placeholders", () => {
    it("a single-brace placeholder → highlighted, surrounding text left alone", () => {
      expect(highlight("Hello {name}!")).toBe("Hello " + span(PLACEHOLDER, "{name}") + "!");
    });

    it("a double-brace placeholder → highlighted as one token, not split", () => {
      expect(highlight("Hello {{name}}!")).toBe("Hello " + span(PLACEHOLDER, "{{name}}") + "!");
    });

    it("an ICU argument with a comma → left as plain text", () => {
      expect(highlight("{count, plural}")).toBe("{count, plural}");
    });

    it("empty braces → left as plain text", () => {
      expect(highlight("{}")).toBe("{}");
    });
  });

  describe("overlapping markup", () => {
    it("placeholders inside a tag's attributes → covered by the tag, not highlighted twice", () => {
      expect(highlight(`<a t="{{x}}" u="{y}">z</a>`)).toBe(
        span(NEUTRAL, "&lt;a t=&quot;{{x}}&quot; u=&quot;{y}&quot;&gt;") +
          "z" +
          span(NEUTRAL, "&lt;/a&gt;"),
      );
    });

    it("placeholders touching a tag on either side → each still highlighted", () => {
      expect(highlight("{a}<b>x</b>{z}")).toBe(
        span(PLACEHOLDER, "{a}") +
          span(NEUTRAL, "&lt;b&gt;") +
          "x" +
          span(NEUTRAL, "&lt;/b&gt;") +
          span(PLACEHOLDER, "{z}"),
      );
    });

    // The next three pin that a half-overlapping brace run never produces a
    // second, nested span inside a tag token — whichever end overlaps.
    it("a double brace opening inside a tag → dropped in favour of the tag", () => {
      expect(highlight("<a {{x>y}}")).toBe(span(UNCLOSED, "&lt;a {{x&gt;") + "y}}");
    });

    it("a double brace closing inside a tag → dropped in favour of the tag", () => {
      expect(highlight("{{x<y}}>")).toBe("{{x" + span(UNCLOSED, "&lt;y}}&gt;"));
    });

    it("a double brace spanning a whole tag → dropped in favour of the tag", () => {
      expect(highlight("{{a<b>}}")).toBe("{{a" + span(UNCLOSED, "&lt;b&gt;") + "}}");
    });
  });

  describe("mixed content", () => {
    it("a placeholder before a tag → tokens emitted in source order", () => {
      expect(highlight("Hi {name}, <b>welcome</b>!")).toBe(
        "Hi " +
          span(PLACEHOLDER, "{name}") +
          ", " +
          span(NEUTRAL, "&lt;b&gt;") +
          "welcome" +
          span(NEUTRAL, "&lt;/b&gt;") +
          "!",
      );
    });

    it("a change to the source ref → the highlighted HTML is recomputed", () => {
      const text = ref("{name}");
      const { highlightedHtml } = useTranslationHighlighter(text);
      expect(highlightedHtml.value).toBe(span(PLACEHOLDER, "{name}"));

      text.value = "<b>x</b>";

      expect(highlightedHtml.value).toBe(
        span(NEUTRAL, "&lt;b&gt;") + "x" + span(NEUTRAL, "&lt;/b&gt;"),
      );
    });
  });
});
