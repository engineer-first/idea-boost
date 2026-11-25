import {
  ChartScatter,
  Layers,
  type LucideIcon,
  Megaphone,
  PenLine,
  Stamp,
  Vote,
} from "lucide-react";
import { useId } from "react";
import {
  getLobbyFlowOverview,
  type LobbyFlowStepKind,
} from "../logic/lobby-flow";
import styles from "./lobby-flow-guide.module.css";

// 開始待ちの画面で、始める前に「進み方」と「全体の流れ」を見せる説明パネル。
// 操作は持たない。ステップ名・目安時間・やることは進行の定義から出す。

const KIND_ICONS: Record<LobbyFlowStepKind, LucideIcon> = {
  write: PenLine,
  share: Megaphone,
  group: Layers,
  vote: Vote,
  decide: Stamp,
  map: ChartScatter,
};

const PHASE_MARKERS = { 1: "①", 2: "②", 3: "③" } as const;

export type LobbyFlowGuideProps = {
  className?: string;
};

export function LobbyFlowGuide({ className }: LobbyFlowGuideProps) {
  const overview = getLobbyFlowOverview();
  const howToTitleId = useId();
  const flowTitleId = useId();
  return (
    <section
      aria-label="進み方と全体の流れ"
      className={className ? `${styles.guide} ${className}` : styles.guide}
      data-testid="lobby-flow-guide"
    >
      <div className={styles.inner}>
        <h2 id={howToTitleId} className={styles.title}>
          進み方
        </h2>
        <ol aria-labelledby={howToTitleId} className={styles.howTo}>
          <li>
            <span aria-hidden="true" className={styles.howToNumber}>
              1
            </span>
            <span>
              <strong>各ステップで</strong>やることをやる
            </span>
          </li>
          <li>
            <span aria-hidden="true" className={styles.howToNumber}>
              2
            </span>
            <span>
              <strong>「できた！」</strong>を押す
            </span>
          </li>
          <li>
            <span aria-hidden="true" className={styles.howToNumber}>
              3
            </span>
            <span>
              全員そろったら<strong>「次のステップへ」</strong>
            </span>
          </li>
        </ol>

        <div className={styles.flowHeading}>
          <h2 id={flowTitleId} className={styles.title}>
            全体の流れ
          </h2>
          <span className={styles.total}>
            3フェーズ・約{overview.totalMinutes}分
          </span>
        </div>
        <ol aria-labelledby={flowTitleId} className={styles.phases}>
          {overview.phases.map((phase) => (
            <li
              key={phase.phase}
              aria-labelledby={`${flowTitleId}-phase${phase.phase}`}
              className={styles.phase}
            >
              <h3
                id={`${flowTitleId}-phase${phase.phase}`}
                className={styles.phaseHeading}
              >
                <span>
                  {PHASE_MARKERS[phase.phase]} {phase.title}
                </span>
                <span className={styles.minutes}>{phase.minutes}分</span>
              </h3>
              <ol className={styles.steps}>
                {phase.steps.map((step) => {
                  const Icon = KIND_ICONS[step.kind];
                  return (
                    <li
                      key={step.number}
                      className={styles.step}
                      data-kind={step.kind}
                    >
                      <span aria-hidden="true" className={styles.icon}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className={styles.name}>
                        <span className={styles.number}>{step.number}</span>{" "}
                        {step.name}
                      </span>
                      <span className={styles.action}>{step.action}</span>
                      <span className={styles.minutes}>{step.minutes}分</span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
