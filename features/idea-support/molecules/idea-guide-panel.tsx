"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const t = useTranslations("app.boardIdeaGuide");
  const translate = t as (key: string) => string;
  const hints = Array.from({ length: 5 }, (_, index) =>
    translate(`hint${index + 1}`),
  );
  const examples = Array.from({ length: 5 }, (_, index) =>
    translate(`example${index + 1}`),
  );
  const [examplesOpen, setExamplesOpen] = useState(false);
  const examplesId = useId();
  return (
    <Card
      data-testid="idea-guide-panel"
      className={cn("w-64 shadow-tool", className)}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-semibold text-base">{t("heading")}</p>
          <p className="text-muted-foreground text-xs">{t("description")}</p>
        </div>

        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-2 text-muted-foreground text-xs">{t("example")}</p>
          <dl className="space-y-2 text-base">
            <div>
              <dt className="text-muted-foreground text-xs">{t("question")}</dt>
              <dd>{t("sampleQuestion")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t("idea")}</dt>
              <dd>{t("sampleIdea")}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">
            {t("selectWrite")}
          </span>
          <p className="text-muted-foreground text-xs">
            {t("hintDescription")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hints.map((hint) => (
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
            {examplesOpen ? t("otherClose") : t("otherOpen")}
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
            {examples.map((example) => (
              <li key={example} className="text-base leading-relaxed">
                {example}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
