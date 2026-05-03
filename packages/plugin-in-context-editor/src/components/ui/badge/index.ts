import { cva, type VariantProps } from "class-variance-authority";

export { default as Badge } from "./Badge.vue";

export const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "border-line-2 text-foreground",
        "outline-solid": "border-border bg-background text-foreground",
        role: "border-line-2 bg-surface-2 text-foreground",
        accent: "border-primary/30 bg-accent-soft text-primary",
        success: "border-success/30 bg-success/12 text-success",
        warning: "border-warn/30 bg-warn/12 text-warn",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
