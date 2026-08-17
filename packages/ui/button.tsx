"use client";

import { ReactNode } from "react";

interface ButtonProps {
  variant: "primary" | "outline" | "secondary";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  size: "lg" | "sm";
  children: ReactNode;
}

export const Button = ({
  size,
  variant,
  className,
  onClick,
  disabled,
  children,
}: ButtonProps) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "h-7 px-2.5 rounded-md text-xs",
    lg: "h-9 px-4 rounded-md text-sm",
  };
  const variants = {
    primary:
      "bg-primary text-primary-foreground hover:bg-accent-hover dark:hover:bg-accent-hover-dark",
    secondary:
      "text-text-secondary dark:text-text-secondary-dark border border-border dark:border-border-dark bg-transparent hover:bg-hover dark:hover:bg-hover-dark",
    outline:
      "text-text-secondary dark:text-text-secondary-dark border border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className ?? ""}`}
    >
      {children}
    </button>
  );
};
