import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Horizontally scrollable table so wide reports stay readable on phones. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-bamboo-300/60 bg-cream-200/60 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-wood-600 whitespace-nowrap first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-bamboo-300/30 px-3 py-2.5 align-middle first:pl-5 last:pr-5", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-cream-200/40", className)} {...props} />;
}
