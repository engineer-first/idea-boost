// shadcn 風の Input コンポーネント。
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    data-slot="input"
    className={cn(
      "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors",
      "file:border-0 file:bg-transparent file:text-base file:font-medium file:text-foreground",
      "placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
