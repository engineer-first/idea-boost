export type ReactionBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const POSITIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];

/** 空いた候補を無作為に選び、空きがない狭幅では重なり面積を最小にする。 */
export function chooseSharingReactionPosition(
  area: ReactionBounds & { size: number },
  occupied: readonly ReactionBounds[],
  random: number,
): number {
  const scores = POSITIONS.map((position) => {
    const left =
      area.left + Math.max(0, area.right - area.left - area.size) * position;
    const overlap = occupied.reduce(
      (total, other) =>
        total +
        Math.max(
          0,
          Math.min(left + area.size, other.right) - Math.max(left, other.left),
        ) *
          Math.max(
            0,
            Math.min(area.bottom, other.bottom) - Math.max(area.top, other.top),
          ),
      0,
    );
    return { position, overlap };
  });
  const minimum = Math.min(...scores.map(({ overlap }) => overlap));
  const candidates = scores.filter(({ overlap }) => overlap === minimum);
  return (
    candidates[
      Math.min(candidates.length - 1, Math.floor(random * candidates.length))
    ]?.position ?? 0.5
  );
}
