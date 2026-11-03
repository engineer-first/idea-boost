import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// DESIGN.mdの独自トークンも、呼び出し側のnone指定などで上書きできるようにする。
const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["tool"],
      radius: ["note"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs));
}
