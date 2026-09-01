import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Both barrels build their class tables with a single `cva()` call at module
 * load. A suite that only reads the copy imported at collection time pins a
 * snapshot taken before the first test ran, so each test re-evaluates the
 * module instead (the shape `tests/constants-contract.test.ts` uses).
 */
let badgeVariants: typeof import("../src/components/ui/badge").badgeVariants;
let buttonVariants: typeof import("../src/components/ui/button").buttonVariants;

beforeEach(async () => {
  vi.resetModules();
  const [badge, button] = await Promise.all([
    import("../src/components/ui/badge"),
    import("../src/components/ui/button"),
  ]);
  badgeVariants = badge.badgeVariants;
  buttonVariants = button.buttonVariants;
});

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";
const BUTTON_DEFAULT_VARIANT = "bg-primary text-primary-foreground shadow hover:bg-primary/90";
const BUTTON_DEFAULT_SIZE = "h-9 px-4 py-2";

const BADGE_BASE =
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
const BADGE_DEFAULT_VARIANT = "border-transparent bg-primary text-primary-foreground";

describe("buttonVariants()", () => {
  it("no options → the base classes with the default variant and size", () => {
    expect(buttonVariants()).toBe(
      `${BUTTON_BASE} ${BUTTON_DEFAULT_VARIANT} ${BUTTON_DEFAULT_SIZE}`,
    );
  });

  it.each([
    ["default", BUTTON_DEFAULT_VARIANT],
    ["destructive", "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"],
    [
      "outline",
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
    ],
    ["secondary", "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"],
    ["ghost", "hover:bg-accent hover:text-accent-foreground"],
    ["link", "text-primary underline-offset-4 hover:underline"],
  ] as const)(
    "variant %s → its own classes on top of the base and default size",
    (variant, classes) => {
      expect(buttonVariants({ variant })).toBe(`${BUTTON_BASE} ${classes} ${BUTTON_DEFAULT_SIZE}`);
    },
  );

  it.each([
    ["default", BUTTON_DEFAULT_SIZE],
    ["xs", "h-7 rounded px-2"],
    ["sm", "h-8 rounded-md px-3 text-xs"],
    ["lg", "h-10 rounded-md px-8"],
    ["icon", "h-9 w-9"],
  ] as const)(
    "size %s → its own classes on top of the base and default variant",
    (size, classes) => {
      expect(buttonVariants({ size })).toBe(`${BUTTON_BASE} ${BUTTON_DEFAULT_VARIANT} ${classes}`);
    },
  );

  it("a variant and a size together → both applied", () => {
    expect(buttonVariants({ variant: "ghost", size: "icon" })).toBe(
      `${BUTTON_BASE} hover:bg-accent hover:text-accent-foreground h-9 w-9`,
    );
  });

  it("an explicitly undefined variant and size → the defaults apply", () => {
    expect(buttonVariants({ variant: undefined, size: undefined })).toBe(
      `${BUTTON_BASE} ${BUTTON_DEFAULT_VARIANT} ${BUTTON_DEFAULT_SIZE}`,
    );
  });
});

describe("badgeVariants()", () => {
  it("no options → the base classes with the default variant", () => {
    expect(badgeVariants()).toBe(`${BADGE_BASE} ${BADGE_DEFAULT_VARIANT}`);
  });

  it.each([
    ["default", BADGE_DEFAULT_VARIANT],
    ["secondary", "border-transparent bg-secondary text-secondary-foreground"],
    ["destructive", "border-transparent bg-destructive/15 text-destructive"],
    ["outline", "border-line-2 text-foreground"],
    ["outline-solid", "border-border bg-background text-foreground"],
    ["role", "border-line-2 bg-surface-2 text-foreground"],
    ["accent", "border-primary/30 bg-accent-soft text-primary"],
    ["success", "border-success/30 bg-success/12 text-success"],
    ["warning", "border-warn/30 bg-warn/12 text-warn"],
  ] as const)("variant %s → its own classes on top of the base", (variant, classes) => {
    expect(badgeVariants({ variant })).toBe(`${BADGE_BASE} ${classes}`);
  });

  it("an explicitly undefined variant → the default applies", () => {
    expect(badgeVariants({ variant: undefined })).toBe(`${BADGE_BASE} ${BADGE_DEFAULT_VARIANT}`);
  });
});
