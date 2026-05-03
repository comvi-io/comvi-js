/**
 * Test fixtures - sample data for tests
 */

/**
 * Sample translation keys
 */
export const SAMPLE_KEYS = {
  SIMPLE: "home.title",
  NESTED: "components.header.navigation.menu",
  WITH_DOTS: "error.messages.404.not.found",
  SHORT: "ok",
  LONG: "very.long.deeply.nested.translation.key.with.many.parts",
  SPECIAL_CHARS: "special_chars-test.key",
} as const;

/**
 * Sample translation key IDs (after registration)
 */
export const SAMPLE_IDS = {
  ONE: 1,
  FIVE: 5,
  HUNDRED: 100,
  THOUSAND: 1000,
  MAX_SAFE: 390624, // Max for 8-char base-5 encoding (5^8 - 1)
} as const;

/**
 * Sample HTML templates with placeholder keys
 */
export const HTML_TEMPLATES = {
  SIMPLE_TEXT: "<p>Hello {{key:title}}</p>",
  WITH_ATTRIBUTE: '<input placeholder="{{key:placeholder}}" />',
  NESTED: `
    <div>
      <h1>{{key:title}}</h1>
      <p>{{key:description}}</p>
    </div>
  `,
  WITH_ARIA: '<button aria-label="{{key:close}}">X</button>',
  MULTIPLE_KEYS: `
    <div>
      <span>{{key:label}}</span>
      <input placeholder="{{key:placeholder}}" aria-label="{{key:ariaLabel}}" />
    </div>
  `,
  SELECT_WITH_OPTIONS: `
    <select>
      <option>{{key:option1}}</option>
      <option>{{key:option2}}</option>
    </select>
  `,
  COMPLEX: `
    <div class="container">
      <header>
        <h1>{{key:header.title}}</h1>
        <nav>
          <a href="#" title="{{key:nav.home}}">Home</a>
          <a href="#" title="{{key:nav.about}}">About</a>
        </nav>
      </header>
      <main>
        <p>{{key:content}}</p>
        <img src="#" alt="{{key:img.alt}}" />
      </main>
    </div>
  `,
} as const;

/**
 * Sample DOM structures (without keys)
 */
export const DOM_STRUCTURES = {
  EMPTY: "<div></div>",
  TEXT_ONLY: "<p>Plain text without translation</p>",
  NESTED_DIVS: `
    <div>
      <div>
        <div>
          <div>Deep nesting</div>
        </div>
      </div>
    </div>
  `,
  MIXED_CONTENT: `
    <div>
      <span>Text</span>
      <button>Button</button>
      <input type="text" />
      <img src="#" />
    </div>
  `,
  TABLE: `
    <table>
      <thead>
        <tr>
          <th abbr="Header 1">H1</th>
          <th abbr="Header 2">H2</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td abbr="Data 1">D1</td>
          <td abbr="Data 2">D2</td>
        </tr>
      </tbody>
    </table>
  `,
  FORM: `
    <form>
      <input type="text" placeholder="Name" />
      <input type="email" placeholder="Email" />
      <input type="submit" value="Submit" />
      <textarea placeholder="Message"></textarea>
    </form>
  `,
} as const;

/**
 * Ignored elements that should not be processed
 */
export const IGNORED_ELEMENTS = {
  SCRIPT: '<script>console.log("should be ignored")</script>',
  STYLE: "<style>.class { color: red; }</style>",
  SCRIPT_WITH_KEY: '<script>var key = "{{key:test}}"</script>',
} as const;

/**
 * Edge case test data
 */
export const EDGE_CASES = {
  EMPTY_STRING: "",
  WHITESPACE_ONLY: "   \n\t  ",
  NULL_CHAR: "text\0with\0null",
  UNICODE: "🌍 Unicode 你好 مرحبا",
  VERY_LONG_TEXT: "A".repeat(10000),
  MIXED_INVISIBLE: "\u200B\u200C\u200D mixed with visible text",
} as const;

/**
 * Invalid/corrupted data for error handling tests
 */
export const INVALID_DATA = {
  INVALID_BASE5: "\uFFFF\uFFFE",
  TOO_SHORT_ENCODING: "\u200B\u200C",
  TOO_LONG_ENCODING: "\u200B".repeat(20),
  MIXED_VALID_INVALID: "\u200B\u200C\uFFFF\u200D",
} as const;

/**
 * Performance test data
 */
export const PERFORMANCE = {
  MANY_ELEMENTS: (count: number) => {
    const elements = Array.from(
      { length: count },
      (_, i) => `<div>Element ${i} {{key:item${i}}}</div>`,
    );
    return `<div>${elements.join("\n")}</div>`;
  },
  DEEP_NESTING: (depth: number) => {
    let html = "<div>Leaf</div>";
    for (let i = 0; i < depth; i++) {
      html = `<div>${html}</div>`;
    }
    return html;
  },
} as const;

/**
 * Mutation scenarios
 */
export const MUTATIONS = {
  TEXT_CHANGE: {
    before: "<p>Old text</p>",
    after: "<p>New text {{key:new}}</p>",
  },
  ATTRIBUTE_CHANGE: {
    before: '<input placeholder="Old" />',
    after: '<input placeholder="New {{key:placeholder}}" />',
  },
  ADD_NODE: {
    before: "<div><p>Existing</p></div>",
    after: "<div><p>Existing</p><p>New {{key:added}}</p></div>",
  },
  REMOVE_NODE: {
    before: "<div><p>Keep</p><p>Remove {{key:removed}}</p></div>",
    after: "<div><p>Keep</p></div>",
  },
  REPLACE_NODE: {
    before: "<div><p>Old {{key:old}}</p></div>",
    after: "<div><span>New {{key:new}}</span></div>",
  },
} as const;

/**
 * Highlight test scenarios
 */
export const HIGHLIGHT_SCENARIOS = {
  SINGLE_ELEMENT: "<button>Click {{key:button}}</button>",
  OVERLAPPING: `
    <div>
      <span>Outer {{key:outer}}</span>
      <span>Inner {{key:inner}}</span>
    </div>
  `,
  POSITIONED: (position: string) => `
    <div style="position: ${position}; top: 100px; left: 100px;">
      Element {{key:positioned}}
    </div>
  `,
  IN_SCROLLABLE: `
    <div style="overflow: auto; height: 100px;">
      <div style="height: 500px;">
        <p style="margin-top: 200px;">Scrolled {{key:scrolled}}</p>
      </div>
    </div>
  `,
} as const;
