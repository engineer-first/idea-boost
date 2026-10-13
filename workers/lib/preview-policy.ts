export function isPreviewEmailAllowed(
  email: string,
  allowed: string | undefined,
): boolean {
  return Boolean(
    allowed
      ?.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase()),
  );
}
