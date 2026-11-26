import {
  ChartScatter,
  Group,
  type LucideIcon,
  Megaphone,
  Pencil,
  Stamp,
  Sticker,
} from "lucide-react";
import type { LobbyFlowStepKind } from "../logic/lobby-flow";

// 画面でやることそのものの絵にする。鉛筆で書く・メガホンで発表する・仲間分けする・
// シールを貼る・はんこで決める・縦横の軸に置く。
export const STEP_KIND_ICONS: Record<LobbyFlowStepKind, LucideIcon> = {
  write: Pencil,
  share: Megaphone,
  group: Group,
  vote: Sticker,
  decide: Stamp,
  map: ChartScatter,
};
