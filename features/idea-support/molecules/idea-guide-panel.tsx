"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  IDEA_GUIDE_DESCRIPTION,
  IDEA_GUIDE_EXAMPLES,
  IDEA_GUIDE_HEADING,
  IDEA_GUIDE_HINTS,
  IDEA_GUIDE_SAMPLE,
  IDEA_HINT_DESCRIPTION,
} from "../logic/idea-guide-content";

export type IdeaGuidePanelProps = {
  onHintSelect: (content: string) => void;
  disabled?: boolean;
  className?: string;
};

export function IdeaGuidePanel({
  onHintSelect,
  disabled = false,
  className,
}: IdeaGuidePanelProps) {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const examplesId = useId();
  return (
    <Card
      data-testid="idea-guide-panel"
      className={cn("w-64 shadow-md", className)}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-semibold text-sm">{IDEA_GUIDE_HEADING}</p>
          <p className="text-muted-foreground text-xs">
            {IDEA_GUIDE_DESCRIPTION}
          </p>
        </div>

        <div className="rounded-md bg-muted/50 p-3">
          <p className="mb-2 text-muted-foreground text-xs">
            例：問い → アイデア
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">問い</dt>
              <dd>{IDEA_GUIDE_SAMPLE.question}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">アイデア</dt>
              <dd>{IDEA_GUIDE_SAMPLE.idea}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">書き出しを選ぶ</span>
          <p className="text-muted-foreground text-xs">
            {IDEA_HINT_DESCRIPTION}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {IDEA_GUIDE_HINTS.map((hint) => (
              <Button
                key={hint}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onHintSelect(hint)}
              >
                {hint}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-between"
            aria-expanded={examplesOpen}
            aria-controls={examplesId}
            onClick={() => setExamplesOpen((open) => !open)}
          >
            {examplesOpen ? "ほかの考え方を閉じる" : "ほかの考え方を見る"}
            {examplesOpen ? (
              <ChevronUp aria-hidden="true" />
            ) : (
              <ChevronDown aria-hidden="true" />
            )}
          </Button>
          <ul
            id={examplesId}
            hidden={!examplesOpen}
            className={examplesOpen ? "flex flex-col gap-1" : "hidden"}
          >
            {IDEA_GUIDE_EXAMPLES.map((example) => (
              <li key={example} className="text-sm leading-relaxed">
                {example}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
