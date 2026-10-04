import type { ComponentProps } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RoomEntryFieldProps = Omit<
  ComponentProps<typeof Input>,
  "aria-invalid" | "aria-describedby"
> & {
  id: string;
  label: string;
  error?: string;
};

// 作成・参加で入力の寸法とエラー用の余白を揃える。検証・送信処理は持たない。
export function RoomEntryField({
  id,
  label,
  error,
  className,
  ...inputProps
}: RoomEntryFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <Field className="gap-2">
        <FieldLabel htmlFor={id} className="leading-5">
          {label}
        </FieldLabel>
        <Input
          {...inputProps}
          id={id}
          className={cn("h-11 text-base", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </Field>
      {/* 空のときも1行ぶんだけ確保し、検証結果でボタンの位置を動かさない。 */}
      <div className="min-h-5 pt-1">
        {error ? (
          <FieldError id={errorId} role="alert">
            {error}
          </FieldError>
        ) : null}
      </div>
    </div>
  );
}
