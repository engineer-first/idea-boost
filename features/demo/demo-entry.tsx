"use client";

import { useState } from "react";
import type { DemoCheckpoint } from "@/contracts/demo";
import { DemoEntryView } from "./demo-entry-view";
import { useDemoCreate } from "./use-demo-create";

export function DemoEntry() {
  const [checkpoint, setCheckpoint] = useState<DemoCheckpoint>("start");
  const { create, pending, error } = useDemoCreate();
  return (
    <DemoEntryView
      checkpoint={checkpoint}
      pending={pending}
      error={error}
      onCheckpointChange={setCheckpoint}
      onStart={() => void create(checkpoint)}
    />
  );
}
