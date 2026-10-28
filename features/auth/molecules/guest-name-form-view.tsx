"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  guestIdentityNotice,
  guestIdentityPendingLabel,
  guestIdentitySubmitLabel,
  guestNameDescription,
  guestNameLabel,
} from "../logic/guest-identity-copy";

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
  error,
  submitLabel = guestIdentitySubmitLabel,
  onNameChange,
  onSubmit,
}: GuestNameFormViewProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error && !pending) inputRef.current?.focus();
  }, [error, pending]);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field className="gap-2">
        <FieldLabel htmlFor={id}>{guestNameLabel}</FieldLabel>
        <Input
          ref={inputRef}
          id={id}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={pending}
          className="h-11 text-base"
          autoComplete="nickname"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing)
              event.preventDefault();
          }}
        />
        <FieldDescription id={`${id}-hint`} className="text-sm">
          {guestNameDescription}
        </FieldDescription>
        {error ? (
          <FieldError id={`${id}-error`} role="alert" className="text-sm">
            {error}
          </FieldError>
        ) : null}
      </Field>
      <p className="text-sm text-muted-foreground">{guestIdentityNotice}</p>
      <Button type="submit" className="min-h-11" disabled={pending}>
        {pending ? guestIdentityPendingLabel : submitLabel}
      </Button>
    </form>
  );
}
