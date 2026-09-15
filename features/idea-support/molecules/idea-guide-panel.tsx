"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  IDEA_GUIDE_DESCRIPTION,
  IDEA_GUIDE_EXAMPLES,
  IDEA_GUIDE_HEADING,
  IDEA_GUIDE_HINTS,
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

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">発想のヒント</span>
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
          <span className="text-muted-foreground text-xs">考え方の例</span>
          <ul className="flex flex-col gap-1">
            {IDEA_GUIDE_EXAMPLES.map((example) => (
              <li key={example} className="text-muted-foreground text-xs">
                {example}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
