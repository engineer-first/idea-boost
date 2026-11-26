"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ROOM_DISPLAY_NAME_MAX_LENGTH } from "@/contracts/room-protocol";

export type GuestNameFormViewProps = {
  name: string;
  pending: boolean;
  error: string | null;
  submitLabel?: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
};

export function GuestNameFormView({
  name,
  pending,
  error: serverError,
  submitLabel,
  onNameChange,
  onSubmit,
}: GuestNameFormViewProps) {
  const t = useTranslations("app.guestName");
  const id = useId();
  const tooLong = name.trim().length > ROOM_DISPLAY_NAME_MAX_LENGTH;
  const error = tooLong
    ? t("tooLong", { max: ROOM_DISPLAY_NAME_MAX_LENGTH })
    : serverError;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error && !pending) inputRef.current?.focus();
  }, [error, pending]);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!tooLong) onSubmit();
      }}
    >
      <Field className="gap-2">
        <FieldLabel htmlFor={id}>{t("label")}</FieldLabel>
        <Input
          ref={inputRef}
          id={id}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={pending}
          className="h-11 text-base"
          autoComplete="nickname"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing)
              event.preventDefault();
          }}
        />
        {error ? (
          <FieldError id={`${id}-error`} role="alert" className="text-base">
            {error}
          </FieldError>
        ) : null}
      </Field>
      <p className="text-base text-muted-foreground">{t("notice")}</p>
      <Button type="submit" className="min-h-11" disabled={pending || tooLong}>
        {pending ? t("pending") : (submitLabel ?? t("submit"))}
      </Button>
    </form>
  );
}
