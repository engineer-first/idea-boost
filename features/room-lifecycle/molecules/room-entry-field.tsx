import type { ComponentProps } from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RoomEntryFieldProps = Omit<
  ComponentProps<typeof Input>,
  "aria-invalid" | "aria-describedby"
> & {
  id: string;
  label: string;
  error?: string;
  // 何を書けばよいかの短い補足。エラーが無いときだけ、エラーと同じ枠に出す。
  description?: string;
};

// 作成・参加で入力の寸法とエラー用の余白を揃える。検証・送信処理は持たない。
export function RoomEntryField({
  id,
  label,
  error,
  description,
  className,
  ...inputProps
}: RoomEntryFieldProps) {
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
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
          aria-describedby={
            error ? errorId : description ? descriptionId : undefined
          }
        />
      </Field>
      {/* 空のときも16pxのエラー2行ぶんを確保し、検証結果でボタンの位置を動かさない。 */}
      <div className="min-h-[3.25rem] pt-1">
        {error ? (
          <FieldError id={errorId} role="alert">
            {error}
          </FieldError>
        ) : description ? (
          <FieldDescription id={descriptionId} className="text-sm leading-5">
            {description}
          </FieldDescription>
        ) : null}
      </div>
    </div>
  );
}
