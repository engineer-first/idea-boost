import type { JSX } from "react";
import { PERMISSIONS } from "@/contracts/access";
import { AccessConsole } from "./access-console";

export function AccessManagement(): JSX.Element {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
      <header className="mx-auto max-w-3xl space-y-2 px-6 pt-6 sm:pt-10">
        <h1 className="text-2xl font-semibold">閲覧権限管理</h1>
        <p className="text-sm text-muted-foreground">
          成果と意見の閲覧者をそれぞれ管理します。対象の権限の欄から追加・取消してください。
        </p>
      </header>
      <AccessConsole />
      <AccessConsole permission={PERMISSIONS.readFeedback} />
    </main>
  );
}
