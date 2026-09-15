"use client";

// Step 2-1（HMW 個人執筆）の入力の起点パネル。キャンバス左端に浮かせる view で、
// 「props in、コールバック out」だけでデータ層に依存しない。
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HMW_EXAMPLES, HMW_HEADING, HMW_TEMPLATES } from "../logic/hmw-content";

export type HmwTemplatePanelProps = {
  // テンプレートを選んだとき、その文言を起点に付箋を作る
  onTemplateSelect: (content: string) => void;
  disabled?: boolean;
  className?: string;
};

export function HmwTemplatePanel({
  onTemplateSelect,
  disabled = false,
  className,
}: HmwTemplatePanelProps) {
  return (
    <Card
      data-testid="hmw-template-panel"
      className={cn("w-64 shadow-md", className)}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-semibold text-sm">{HMW_HEADING}</p>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">テンプレート</span>
          <div className="flex flex-wrap gap-1.5">
            {HMW_TEMPLATES.map((template) => (
              <Button
                key={template}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onTemplateSelect(template)}
              >
                {template}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">具体例</span>
          {/* お手本として読むだけの表示専用リスト。クリックで付箋は作らない */}
          <ul className="flex flex-col gap-1">
            {HMW_EXAMPLES.map((example) => (
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
