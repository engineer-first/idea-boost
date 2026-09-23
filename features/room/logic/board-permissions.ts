import { isResultStep, type RoomPhase } from "@/contracts/phase";

export type BoardPermissions = {
  // 付箋作成入口
  showPrivateToolbar: boolean;

  // 付箋操作
  canCreateNote: boolean;
  canEditNote: boolean;
  canDeleteNote: boolean;
  canMoveNote: boolean;
  canExcludeNote: boolean;
  canRestoreNote: boolean;

  // グループ
  canGroupNote: boolean;

  //投票
  canShowVote: boolean;
  canVote: boolean;

  // 結果確定
  canDecide: boolean;
};

type BaseBoardPermissions = Omit<
  BoardPermissions,
  "canExcludeNote" | "canRestoreNote"
>;

const ALL_DISABLED: BaseBoardPermissions = {
  showPrivateToolbar: false,

  canCreateNote: false,
  canEditNote: false,
  canDeleteNote: false,
  canMoveNote: false,

  canGroupNote: false,

  canShowVote: false,
  canVote: false,

  canDecide: false,
};

function getBaseBoardPermissions(phase: RoomPhase): BaseBoardPermissions {
  if (phase.kind === "lobby") {
    return ALL_DISABLED;
  }

  // フェーズ1
  if (phase.phase === 1) {
    switch (phase.step) {
      case 1:
        return {
          showPrivateToolbar: true,

          canCreateNote: true,
          canEditNote: true,
          canDeleteNote: true,
          canMoveNote: false,

          canGroupNote: false,

          canShowVote: false,
          canVote: false,

          canDecide: false,
        };

      case 2:
        return {
          showPrivateToolbar: true,

          canCreateNote: false,
          canEditNote: true,
          canDeleteNote: false,
          canMoveNote: true,

          canGroupNote: false,

          canShowVote: false,
          canVote: false,

          canDecide: false,
        };

      case 3:
        return {
          showPrivateToolbar: false,

          canCreateNote: false,
          canEditNote: false,
          canDeleteNote: false,
          canMoveNote: true,

          canGroupNote: true,

          canShowVote: false,
          canVote: false,

          canDecide: false,
        };

      case 4:
        return {
          showPrivateToolbar: false,

          canCreateNote: false,
          canEditNote: false,
          canDeleteNote: false,
          canMoveNote: false,

          canGroupNote: false,

          canShowVote: true,
          canVote: true,

          canDecide: false,
        };

      case 5:
        return {
          showPrivateToolbar: false,

          canCreateNote: false,
          canEditNote: false,
          canDeleteNote: false,
          canMoveNote: false,

          canGroupNote: false,

          canShowVote: true,
          canVote: false,

          canDecide: true,
        };
    }
  }

  // フェーズ2 Step2-1 HMW個人執筆
  if (phase.phase === 2 && phase.step === 1) {
    return {
      showPrivateToolbar: true,

      canCreateNote: true,
      canEditNote: true,
      canDeleteNote: true,
      canMoveNote: false,

      canGroupNote: false,

      canShowVote: false,
      canVote: false,

      canDecide: false,
    };
  }

  // フェーズ2 Step2-2 HMW共有
  if (phase.phase === 2 && phase.step === 2) {
    return {
      showPrivateToolbar: true,

      canCreateNote: false,
      canEditNote: true,
      canDeleteNote: false,
      canMoveNote: true,

      canGroupNote: false,

      canShowVote: false,
      canVote: false,

      canDecide: false,
    };
  }

  // フェーズ2 Step2-3 HMWステルス投票
  if (phase.phase === 2 && phase.step === 3) {
    return {
      showPrivateToolbar: false,

      canCreateNote: false,
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,

      canGroupNote: false,

      canShowVote: true,
      canVote: true,

      canDecide: false,
    };
  }

  if (phase.phase === 2 && phase.step === 4) {
    return {
      showPrivateToolbar: false,
      canCreateNote: false,
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,
      canGroupNote: false,
      canShowVote: true,
      canVote: false,
      canDecide: true,
    };
  }

  // フェーズ3 Step3-1 アイデア個人執筆
  if (phase.phase === 3 && phase.step === 1) {
    return {
      showPrivateToolbar: true,

      canCreateNote: true,
      canEditNote: true,
      canDeleteNote: true,
      canMoveNote: false,

      canGroupNote: false,

      canShowVote: false,
      canVote: false,

      canDecide: false,
    };
  }

  // フェーズ3は、2軸マップでのグループ化を除き、フェーズ1の後半と同じ
  // 操作の流れを暫定的に使う。
  if (phase.phase === 3 && phase.step === 2) {
    return {
      showPrivateToolbar: true,

      canCreateNote: false,
      canEditNote: true,
      canDeleteNote: false,
      canMoveNote: true,

      canGroupNote: false,

      canShowVote: false,
      canVote: false,

      canDecide: false,
    };
  }

  if (phase.phase === 3 && phase.step === 3) {
    return {
      showPrivateToolbar: false,

      canCreateNote: false,
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: true,

      canGroupNote: false,

      canShowVote: false,
      canVote: false,

      canDecide: false,
    };
  }

  if (phase.phase === 3 && phase.step === 4) {
    return {
      showPrivateToolbar: false,

      canCreateNote: false,
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,

      canGroupNote: false,

      canShowVote: true,
      canVote: true,

      canDecide: false,
    };
  }

  if (phase.phase === 3 && phase.step === 5) {
    return {
      showPrivateToolbar: false,

      canCreateNote: false,
      canEditNote: false,
      canDeleteNote: false,
      canMoveNote: false,

      canGroupNote: false,

      canShowVote: true,
      canVote: false,

      canDecide: true,
    };
  }

  return ALL_DISABLED;
}

export function getBoardPermissions(
  phase: RoomPhase,
  isDecided = false,
): BoardPermissions {
  const canManageExclusion = isResultStep(phase) && !isDecided;
  return {
    ...getBaseBoardPermissions(phase),
    ...(isResultStep(phase)
      ? { canMoveNote: !isDecided, canDecide: !isDecided }
      : {}),
    canExcludeNote: canManageExclusion,
    canRestoreNote: canManageExclusion,
  };
}
