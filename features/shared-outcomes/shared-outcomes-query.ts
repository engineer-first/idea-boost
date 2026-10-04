import {
  type SharedOutcomeFilters,
  SharedOutcomeFiltersSchema,
} from "@/contracts/shared-outcomes";
export const DEFAULT_OUTCOME_FILTERS: SharedOutcomeFilters =
  SharedOutcomeFiltersSchema.parse({});
export function readOutcomeFilters(
  params: URLSearchParams,
): SharedOutcomeFilters {
  const result = SharedOutcomeFiltersSchema.safeParse(
    Object.fromEntries(params),
  );
  return result.success ? result.data : DEFAULT_OUTCOME_FILTERS;
}
export function outcomeParams(filters: SharedOutcomeFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.phase !== "all") params.set("phase", filters.phase);
  if (filters.saveStatus !== "all")
    params.set("saveStatus", filters.saveStatus);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params;
}
export function outcomeHref(
  filters: SharedOutcomeFilters,
  roomId?: string,
): string {
  const params = outcomeParams(filters);
  if (roomId) params.set("roomId", roomId);
  return `/shared-outcomes${params.size ? `?${params}` : ""}`;
}
