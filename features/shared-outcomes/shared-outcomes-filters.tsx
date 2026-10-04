"use client";
import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type SharedOutcomeFilters,
  SharedOutcomeFiltersSchema,
} from "@/contracts/shared-outcomes";
import {
  DEFAULT_OUTCOME_FILTERS,
  outcomeParams,
} from "./shared-outcomes-query";
export type SharedOutcomesFiltersProps = {
  filters: SharedOutcomeFilters;
  onSearch: (filters: SharedOutcomeFilters) => void;
};
const selectClass =
  "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring sm:text-sm";
export function SharedOutcomesFilters({
  filters,
  onSearch,
}: SharedOutcomesFiltersProps) {
  const id = useId();
  const [query, setQuery] = useState(filters.q);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [dateError, setDateError] = useState<string | null>(null);
  useEffect(() => setQuery(filters.q), [filters.q]);
  useEffect(() => {
    setFrom(filters.from);
    setTo(filters.to);
    setDateError(null);
  }, [filters.from, filters.to]);
  const active = outcomeParams(filters).size > 0;
  return (
    <search aria-label="共有成果を探す">
      <form
        className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const result = SharedOutcomeFiltersSchema.safeParse(
            Object.fromEntries(new FormData(event.currentTarget)),
          );
          if (!result.success) {
            setDateError(
              result.error.issues[0]?.message ?? "日付を確認してください。",
            );
            return;
          }
          setDateError(null);
          onSearch(result.data);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor={`${id}-q`} className="min-w-0 flex-1 space-y-2">
            <span className="text-sm font-medium">ルーム名・ルームID</span>
            <Input
              id={`${id}-q`}
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="名前やIDの一部で検索"
              maxLength={200}
              className="min-h-11 text-base caret-primary sm:text-sm"
            />
          </label>
          <Button type="submit" className="min-h-11 px-4">
            <Search aria-hidden />
            検索
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <label
              htmlFor={`${id}-status`}
              className="block text-sm font-medium"
            >
              記録
            </label>
            <select
              id={`${id}-status`}
              name="status"
              value={filters.status}
              className={selectClass}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="all">すべて</option>
              <option value="confirmed">確定した成果</option>
              <option value="partial">途中の成果</option>
            </select>
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`${id}-phase`}
              className="block text-sm font-medium"
            >
              到達フェーズ
            </label>
            <select
              id={`${id}-phase`}
              name="phase"
              value={filters.phase}
              className={selectClass}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="all">すべて</option>
              <option value="lobby">開始待ち</option>
              <option value="1">課題</option>
              <option value="2">問い</option>
              <option value="3">アイデア</option>
            </select>
          </div>
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <label
              htmlFor={`${id}-saveStatus`}
              className="block text-sm font-medium"
            >
              保存状態
            </label>
            <select
              id={`${id}-saveStatus`}
              name="saveStatus"
              value={filters.saveStatus}
              className={selectClass}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="all">すべて</option>
              <option value="saved">保存済み</option>
              <option value="pending">反映待ち</option>
              <option value="failed">保存失敗</option>
            </select>
          </div>
        </div>
        <fieldset className="min-w-0 space-y-3">
          <legend className="text-sm font-medium">
            最終利用日{" "}
            <span className="font-normal text-muted-foreground">
              （日本時間）
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
            <div className="min-w-0 space-y-2">
              <label
                htmlFor={`${id}-from`}
                className="block text-sm font-medium"
              >
                開始日
              </label>
              <Input
                id={`${id}-from`}
                type="date"
                name="from"
                min="0001-01-01"
                max="9999-12-31"
                value={from}
                onChange={(event) => {
                  setFrom(event.currentTarget.value);
                  setDateError(null);
                }}
                aria-describedby={`${id}-date-help`}
                className="min-h-11 min-w-0 text-base sm:text-sm"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <label htmlFor={`${id}-to`} className="block text-sm font-medium">
                終了日
              </label>
              <Input
                id={`${id}-to`}
                type="date"
                name="to"
                min="0001-01-01"
                max="9999-12-31"
                value={to}
                onChange={(event) => {
                  setTo(event.currentTarget.value);
                  setDateError(null);
                }}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={`${id}-date-help${dateError ? ` ${id}-date-error` : ""}`}
                className="min-h-11 min-w-0 text-base sm:text-sm"
              />
            </div>
          </div>
          <p
            id={`${id}-date-help`}
            className="text-sm leading-relaxed text-muted-foreground"
          >
            両端の日付を含みます。片方だけでも指定できます。「検索」で適用します。
          </p>
          {dateError && (
            <p
              id={`${id}-date-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {dateError}
            </p>
          )}
        </fieldset>
        {active && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">
              {filters.q ? `「${filters.q}」を検索中。` : ""}
              選択した条件で絞り込んでいます。
              {(filters.from || filters.to) && (
                <span className="block mt-1">
                  最終利用日：{filters.from || "指定なし"} 〜{" "}
                  {filters.to || "指定なし"}
                </span>
              )}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setQuery("");
                setFrom("");
                setTo("");
                setDateError(null);
                onSearch(DEFAULT_OUTCOME_FILTERS);
              }}
            >
              <X aria-hidden />
              条件をクリア
            </Button>
          </div>
        )}
      </form>
    </search>
  );
}
