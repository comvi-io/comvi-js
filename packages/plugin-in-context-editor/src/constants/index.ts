// Re-export encoding constants
export * from "./encoding";

export const TAG_ATTRIBUTES = {
  textarea: ["placeholder"],
  input: ["placeholder", "alt", "title"],
  "input[type=button]": ["value"],
  "input[type=submit]": ["value"],
  "input[type=reset]": ["value"],
  img: ["alt"],
  option: ["label"],
  optgroup: ["label"],
  table: ["summary"],
  th: ["abbr"],
  td: ["abbr"],
  "*": ["aria-label", "aria-description", "aria-placeholder", "aria-valuetext", "title"],
};

export const IGNORED_NODES = ["script", "style"];
export const PROCESSED_TO_PARENT_NODES = ["option", "optgroup"];
export const EDITOR_UI_SHADOW_HOST_ATTRIBUTE = "data-comvi-editor-ui-shadow-host";
