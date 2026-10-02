import type {
  VerificationCheckpoint,
  VerificationOutcomeScenario,
} from "@/contracts/verification";

export const VERIFICATION_DESCRIPTIONS: Record<VerificationCheckpoint, string> =
  {
    lobby: "Owner・Member・Viewerが参加済み。開始・招待・参加者一覧を確認。",
    "1-1": "3人各4枚の下書き。自分の付箋の追加・編集・削除を確認。",
    "1-2": "9枚共有済み、各自1枚はマイ付箋。共有・戻す・共同編集を確認。",
    "1-3": "2つの名前付きグループと未分類の付箋。移動・分類・命名を確認。",
    "1-4": "グループ化済み。Memberは投票完了、OwnerとViewerは未投票。",
    "1-5": "全員投票済み・採用前。0票の候補の除外・復元・採用を確認。",
    "2-1": "課題決定済み、問いの下書き各4枚。ヒントとマイ付箋を確認。",
    "2-2": "課題決定済み。共有した問い9枚と各自の未共有1枚。",
    "2-3": "問い共有済み。投票・取消・完了状態・集計への進行を確認。",
    "2-4": "問いの集計済み・採用前。候補整理と次フェーズへの進行を確認。",
    "3-1": "課題・問い決定済み、アイデアの下書き各4枚。発想支援を確認。",
    "3-2": "マップに共有アイデア9枚、各自の未共有1枚。共有と位置調整を確認。",
    "3-3": "12枚を2軸マップに配置済み。価値と実現のしやすさを調整。",
    "3-4": "マップ配置済み。Memberは投票完了、OwnerとViewerは未投票。",
    "3-5": "アイデアの集計済み・採用前。除外・復元・検討中候補の共有を確認。",
  };

export const OUTCOME_CASES: ReadonlyArray<{
  scenario: VerificationOutcomeScenario;
  label: string;
}> = [
  { scenario: "partial", label: "途中" },
  { scenario: "completed", label: "完了" },
  { scenario: "empty", label: "成果なし" },
  { scenario: "failure", label: "保存失敗" },
  { scenario: "expired", label: "期限切れ" },
];
