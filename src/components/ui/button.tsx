import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap [&_svg]:size-[1.1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-forest-800 text-cream-50 hover:bg-forest-700 active:bg-forest-900 shadow-[0_2px_0_var(--color-forest-900)]",
        wood: "bg-wood-600 text-cream-50 hover:bg-wood-500 active:bg-wood-700 shadow-[0_2px_0_var(--color-wood-800)]",
        gold: "bg-gold-400 text-wood-800 hover:bg-gold-300 active:bg-gold-500 shadow-[0_2px_0_var(--color-gold-700)]",
        outline: "border border-bamboo-400 bg-cream-50 text-wood-700 hover:bg-cream-200 active:bg-cream-300",
        ghost: "text-wood-700 hover:bg-cream-200 active:bg-cream-300",
        danger: "bg-terracotta-600 text-cream-50 hover:bg-terracotta-500 active:bg-terracotta-700",
        link: "text-forest-700 underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-[0.95rem]",
        lg: "h-13 px-6 text-base",
        xl: "h-16 px-7 text-lg",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ComponentProps<"button"> & Variants) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: ComponentProps<typeof Link> & Variants) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
