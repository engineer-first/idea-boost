"use client";

// phase4 の投票結果を重ねて表示する Dialog。閉じるとボードに戻って
// 話し合える（結果は「投票結果を表示」ボタンで何度でも開ける）。
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Note } from "@/features/notes";
import { VoteTotalingPanel } from "@/features/vote-totaling";
import type { Decision, Member } from "../logic/room-reducer";

export type VoteTotalingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isVotingComplete: boolean;
  members: Member[];
  notes: Note[];
  decision: Decision | null;
  isHost: boolean;
  isDisconnected: boolean;
  onNoteDecide: (noteId: string) => void;
};

export function VoteTotalingDialog({
  open,
  onOpenChange,
  isVotingComplete,
  members,
  notes,
  decision,
  isHost,
  isDisconnected,
  onNoteDecide,
}: VoteTotalingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>投票結果</DialogTitle>
          <DialogDescription>
            付箋ごとの投票結果を確認し、ボードに戻って話し合います。
          </DialogDescription>
        </DialogHeader>
        <VoteTotalingPanel
          isVotingComplete={isVotingComplete}
          members={members}
          notes={notes}
          decision={decision}
          isHost={isHost}
          isDisconnected={isDisconnected}
          onNoteDecide={onNoteDecide}
        />
      </DialogContent>
    </Dialog>
  );
}
