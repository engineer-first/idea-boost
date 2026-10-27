"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function LandingFaqItem({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!id) return;
    const openFromHash = () => {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [id]);

  return (
    <details ref={ref} id={id} className="py-1">
      {children}
    </details>
  );
}
