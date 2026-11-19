/**
 * The marker format (`src/marker.ts`, editor plan §3.2): the codec on its own, then what a
 * translator sees through the scanner. The Unicode cases are the plan's К1/К2 defects of
 * the 0.7 encoder, recorded red against it on 2026-11-19 (Thai ending in ZWSP and Persian
 * ending in ZWNJ decoded to no key; the preview lost ZWNJ in `می‌خواهم` and ZWJ in `👩‍💻`).
 */
import { afterEach, describe, expect, it } from "vitest";
import { decodeFrames, encodeFrame, stripFrames } from "../src/marker";
import { TranslationScanner } from "../src/TranslationScanner";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { EventBus } from "../src/EventBus";
import { TAG_ATTRIBUTES } from "../src/constants";
import { cleanupDOM } from "./helpers";

const START = "\u{E007E}";
const END = "\u{E007F}";
/** ASCII written in the payload alphabet (tag characters). */
const tag = (ascii: string) =>
  [...ascii].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join("");
/** The payload of `frame`, read back as ASCII. */
const payload = (frame: string) =>
  [...frame.slice(START.length, -END.length)]
    .map((c) => String.fromCharCode(c.codePointAt(0)! - 0xe0000))
    .join("");
const keys = (text: string) =>
  decodeFrames(text).map(({ inst, ns, key, close }) => ({ inst, ns, key, close }));

describe("encodeFrame", () => {
  it.each([
    ["é", "%C3%A9"],
    ["😀", "%F0%9F%98%80"],
    ["~", "%7E"],
    ["a|b", "a%7Cb"],
    ["50%", "50%25"],
    ["a b", "a%20b"],
  ])("key %s → written as %s", (key, written) => {
    expect(payload(encodeFrame("", "default", key))).toBe(`|default|${written}`);
  });

  it("inst | ns | key, framed by U+E007E and U+E007F", () => {
    const frame = encodeFrame("comvi-1", "default", "save");

    expect({
      start: frame.startsWith(START),
      end: frame.endsWith(END),
      payload: payload(frame),
    }).toEqual({
      start: true,
      end: true,
      payload: "comvi-1|default|save",
    });
  });

  it("measured length: comvi-1|default|save is 44 UTF-16 units", () => {
    expect(encodeFrame("comvi-1", "default", "save").length).toBe(44);
  });

  it("a closing frame carries the payload behind /; an opening one never starts with /", () => {
    expect({
      close: payload(encodeFrame("", "default", "save", true)),
      openSlashInst: payload(encodeFrame("/x", "default", "save")),
    }).toEqual({ close: "/|default|save", openSlashInst: "%2Fx|default|save" });
  });

  it("never writes ~ (U+E007E) into the payload, so no frame start can appear inside one", () => {
    const frame = encodeFrame("~", "~", "~~");

    expect(frame.indexOf(START, 1)).toBe(-1);
  });
});

describe("decodeFrames: round trip and grammar", () => {
  it.each([
    ["plain", "", "default", "save"],
    ["non-ASCII key and ns", "comvi-2", "магазин", "кошик.додати"],
    ["~ | % in every component", "a~|%", "n|s%", "k~|%y"],
    ["emoji key", "", "default", "👩\u200D💻.title"],
    ["empty key", "", "default", ""],
  ])("%s → decodes to what was encoded", (_name, inst, ns, key) => {
    expect(keys(`text${encodeFrame(inst, ns, key)}`)).toEqual([{ inst, ns, key, close: false }]);
  });

  it("truncated %X → dropped", () => {
    expect(keys(`${START}${tag("|default|k%4")}${END}`)).toEqual([]);
  });

  it("a second start before the end restarts the frame (resynchronisation)", () => {
    const text = `${START}${tag("|default|lost")}${encodeFrame("", "default", "kept")}`;

    expect(keys(text)).toEqual([{ inst: "", ns: "default", key: "kept", close: false }]);
  });

  it("truncated frame (no end) → dropped, and the next frame still decodes", () => {
    const text = `${START}${tag("|default|cut")} more ${encodeFrame("", "default", "next")}`;

    expect(keys(text)).toEqual([{ inst: "", ns: "default", key: "next", close: false }]);
  });

  it("a frame split inside a surrogate pair by other text → dropped", () => {
    const frame = encodeFrame("", "default", "key");
    const split = frame.slice(0, 5) + "x" + frame.slice(5);

    expect(keys(split)).toEqual([]);
  });

  it("not exactly three components → dropped", () => {
    expect({
      two: keys(`${START}${tag("default|key")}${END}`),
      four: keys(`${START}${tag("|a|b|c")}${END}`),
    }).toEqual({ two: [], four: [] });
  });

  it("bytes that are not UTF-8 → dropped", () => {
    expect(keys(`${START}${tag("|default|%FF")}${END}`)).toEqual([]);
  });

  it("an emoji subdivision flag (tag characters + U+E007F, no U+E007E) is never read as a frame", () => {
    const scotland = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";

    expect({
      alone: keys(scotland),
      beforeFrame: keys(`${scotland}${encodeFrame("", "default", "flag")}`),
      stripped: stripFrames(`${scotland}${encodeFrame("", "default", "flag")}`),
    }).toEqual({
      alone: [],
      beforeFrame: [{ inst: "", ns: "default", key: "flag", close: false }],
      stripped: scotland,
    });
  });

  it("ZWSP, ZWNJ and ZWJ around a frame change nothing it decodes to", () => {
    const frame = encodeFrame("", "default", "k");

    expect(keys(`\u200B\u200C\u200D${frame}\u200D\u200C\u200B`)).toEqual([
      { inst: "", ns: "default", key: "k", close: false },
    ]);
  });
});

describe("through the scanner: the 0.7 encoder's Unicode defects (К1, К2)", () => {
  let bus: EventBus;
  let registry: TranslationRegistry;
  let scanner: TranslationScanner;

  afterEach(() => {
    scanner.destroy();
    cleanupDOM();
  });

  function scan(text: string) {
    bus = new EventBus();
    registry = new TranslationRegistry(bus);
    scanner = new TranslationScanner(bus, registry, {
      targetElement: document,
      tagAttributes: TAG_ATTRIBUTES,
    });
    const p = document.createElement("p");
    const node = document.createTextNode(text);
    p.append(node);
    document.body.append(p);
    bus.emit("structureChanges", [p]);
    return registry.get(p)?.nodes.get(node) ?? null;
  }

  it.each([
    ["Thai ending in ZWSP", "สวัสดีครับ​"],
    ["Persian ending in ZWNJ", "می‌"],
    ["Persian with ZWNJ inside", "می‌خواهم"],
    ["emoji ZWJ sequence", "👩‍💻"],
    ["Devanagari with ZWJ", "क्‍ष"],
    ["emoji subdivision flag", "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"],
  ])("%s → clickable with the right key, the preview keeps every character", (_name, text) => {
    const data = scan(`${text}${encodeFrame("", "default", "the.key")}`);

    expect(data).toEqual({ inst: "", key: "the.key", ns: "default", textPreview: text });
  });

  it("a missing key's output (the key itself) is clickable", () => {
    expect(scan(`gone.key${encodeFrame("", "default", "gone.key")}`)).toMatchObject({
      key: "gone.key",
    });
  });

  it("an attribute ending in ZWNJ → clickable, preview intact", () => {
    const input = document.createElement("input");
    input.setAttribute("placeholder", `جستجو‌${encodeFrame("", "default", "search")}`);
    document.body.append(input);
    bus = new EventBus();
    registry = new TranslationRegistry(bus);
    scanner = new TranslationScanner(bus, registry, {
      targetElement: document,
      tagAttributes: TAG_ATTRIBUTES,
    });

    bus.emit("structureChanges", [input]);

    expect(registry.get(input)?.nodes.get(input.getAttributeNode("placeholder")!)).toEqual({
      inst: "",
      key: "search",
      ns: "default",
      textPreview: "جستجو‌",
    });
  });
});
