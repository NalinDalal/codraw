"use client";

import { ReactNode } from "react";

/**
 * Props accepted by the {@link Button} component.
 *
 * @property variant - Visual style of the button. `"primary"` renders a solid primary,
 *   `"outline"` renders a bordered outline button, and `"secondary"` renders a muted secondary style.
 * @property size - Controls padding. `"lg"` produces larger padding, `"sm"` produces compact padding.
 * @property className - Optional extra CSS class names appended to the default styles.
 * @property onClick - Optional click handler invoked when the button is pressed.
 * @property children - Content rendered inside the button (text, icons, etc.).
 */
interface ButtonProps {
  variant: "primary" | "outline" | "secondary";
  className?: string;
  onClick?: () => void;
  size: "lg" | "sm";
  children: ReactNode;
}

/**
 * A versatile button component with support for multiple visual variants and sizes.
 *
 * Renders a native `<button>` element with Tailwind CSS classes applied based on
 * the `variant` and `size` props. An optional `className` can be provided to extend
 * or override default styles.
 *
 * @param props - {@link ButtonProps}
 * @returns A styled `<button>` element containing the provided children.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="lg" onClick={() => alert("Clicked!")}>
 *   Click me
 * </Button>
 * ```
 */
export const Button = ({
  size,
  variant,
  className,
  onClick,
  children,
}: ButtonProps) => {
  return (
    <button
      type="button"
      className={`${className}
        ${variant === "primary" ? "bg-primary" : variant == "secondary" ? "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80" : "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"}
        ${size === "lg" ? "px-4 py-2" : "px-2 py-1"}
      `}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
