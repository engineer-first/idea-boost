export interface ProjectItem {
  id: string;
  isArchived: boolean;
  priority: { number: number } | null;
  content: {
    __typename: string;
    number: number;
    state: string;
    repository: { nameWithOwner: string };
    issueType: { name: string } | null;
    parent: { id: string } | null;
  } | null;
}

export interface PriorityUpdate {
  itemId: string;
  number: number;
  from: number | null;
  to: number;
}

export function planPriorityUpdates(
  items: ProjectItem[],
  repository: string,
): PriorityUpdate[];
export function syncPbiPriority(options: {
  graphql: (
    query: string,
    variables: Record<string, unknown>,
  ) => Promise<unknown>;
  dryRun?: boolean;
}): Promise<{ planned: PriorityUpdate[]; updated: number; dryRun: boolean }>;
