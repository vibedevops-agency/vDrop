import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,background-color,box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-signal)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent-signal)] text-[var(--on-accent)] shadow-[0_10px_24px_-12px_rgba(12,48,42,0.45)] hover:brightness-[0.97] active:translate-y-px",
        secondary:
          "bg-[var(--sky-wash)] text-[var(--ink-soft)] hover:bg-[var(--line)]/50",
        outline:
          "border border-[var(--line)] bg-[var(--panel-muted)] text-[var(--ink-soft)] hover:bg-[var(--panel-strong)]",
        ghost:
          "text-[var(--ink-muted)] hover:bg-[var(--sky-wash)] hover:text-[var(--ink)]",
        destructive:
          "border border-transparent bg-transparent text-[var(--ink-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)]",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
