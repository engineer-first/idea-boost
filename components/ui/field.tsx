// Field コンポーネント。Label + Input + Description + Error をグループ化する。
// Radix の Field を使う（Field.Root, Field.Label, ...）と同等の機能を
// 自前で軽く実装する。data-slot で shadcn 風のコンポーネント識別子を提供する。
import * as React from "react";
import { cn } from "@/lib/utils";

function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}
Field.displayName = "Field";

// FieldLabel は Radix Label ではなく生 <label> を使う。`htmlFor` で input
// と関連付ける使い方を想定しているが、コンポーネント単体では input がないため
// biome の noLabelWithoutControl は disable する（利用者の責務）。
const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: 呼び出し側で htmlFor + input を紐付ける前提
  <label
    ref={ref}
    data-slot="field-label"
    className={cn(
      "text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

function FieldDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
FieldDescription.displayName = "FieldDescription";

function FieldError({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-error"
      className={cn("text-base text-destructive", className)}
      {...props}
    />
  );
}
FieldError.displayName = "FieldError";

export { Field, FieldDescription, FieldError, FieldLabel };
