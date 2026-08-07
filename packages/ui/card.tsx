import { type JSX } from "react";

/**
 * A simple card container component.
 *
 * Renders a `<div>` element with optional custom class names. Use this as a
 * building block for content sections, panels, or any UI that benefits from
 * a card-like wrapper.
 *
 * @param props.className - Optional CSS class names applied to the outer `<div>`.
 * @param props.children - Content rendered inside the card.
 * @returns A `<div>` wrapper containing the children.
 *
 * @example
 * ```tsx
 * <Card className="p-4 rounded-lg shadow-md">
 *   <h2>Title</h2>
 *   <p>Content goes here.</p>
 * </Card>
 * ```
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
