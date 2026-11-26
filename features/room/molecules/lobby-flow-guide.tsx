import {
  ChartScatter,
  Check,
  Group,
  type LucideIcon,
  Megaphone,
  Pencil,
  Stamp,
  Sticker,
} from "lucide-react";
import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getLobbyFlowOverview,
  type LobbyFlowStepKind,
} from "../logic/lobby-flow";
import styles from "./lobby-flow-guide.module.css";

// 開始待ちの画面で、始める前に「進み方」と「全体の流れ」を見せる説明パネル。
// 操作は持たない。ステップ名・目安時間・やることは進行の定義から出す。

// 画面でやることそのものの絵にする。鉛筆で書く・メガホンで発表する・仲間分けする・
// シールを貼る・はんこで決める・縦横の軸に置く。
const KIND_ICONS: Record<LobbyFlowStepKind, LucideIcon> = {
  write: Pencil,
  share: Megaphone,
  group: Group,
  vote: Sticker,
  decide: Stamp,
  map: ChartScatter,
};

const PHASE_MARKERS = { 1: "①", 2: "②", 3: "③" } as const;

export type LobbyFlowGuideProps = {
  className?: string;
};

export function LobbyFlowGuide({ className }: LobbyFlowGuideProps) {
  const locale = useLocale();
  const t = useTranslations("app.lobbyFlow");
  const translate = t as (key: string, values?: Record<string, string | number>) => string;
  const overview = getLobbyFlowOverview(locale === "en" ? "en" : "ja");
  const howToTitleId = useId();
  const flowTitleId = useId();
  return (
    <section
      aria-label={t("aria")}
      // 収まらないときは中をスクロールして読む。中に押せる部品が無いので、
      // Safari でもキーボードで届くようパネル自体を Tab で選べるようにする。
      // biome-ignore lint/a11y/noNoninteractiveTabindex: スクロールする説明をキーボードでも読めるようにする。
      tabIndex={0}
      className={className ? `${styles.guide} ${className}` : styles.guide}
      data-testid="lobby-flow-guide"
    >
      <div className={styles.inner}>
        <h2 id={howToTitleId} className={styles.title}>
          {t("howTo")}
        </h2>
        <ol aria-labelledby={howToTitleId} className={styles.howTo}>
          <li>
            <span aria-hidden="true" className={styles.howToNumber}>
              1
            </span>
            <span className={styles.howToText}>{t("doStep")}</span>
          </li>
          <li>
            <span aria-hidden="true" className={styles.howToNumber}>
              2
            </span>
            <span className={styles.howToText}>
              {t("whenDone")}
              {/* 押せない見本。実際のボタンと同じ形で、どれを押すかを伝える。 */}
              <span className={styles.readySample}>
                <span aria-hidden="true" className={styles.readyMark}>
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                <span className="sr-only">「</span>
                {t("ready")}
                <span className="sr-only">」</span>
              </span>
              {t("press")}
            </span>
          </li>
          <li>
            <span aria-hidden="true" className={styles.howToNumber}>
              3
            </span>
            <span className={styles.howToText}>
              {t("allReady")}
              <span className={styles.nextSample}>
                <span className="sr-only">「</span>
                {t("next")}
                <span className="sr-only">」</span>
              </span>
            </span>
          </li>
        </ol>

        <div className={styles.flowHeading}>
          <h2 id={flowTitleId} className={styles.title}>
            {t("flowTitle")}
          </h2>
          <span className={styles.total}>
            {translate("total", { minutes: overview.totalMinutes })}
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
                <span className={styles.minutes}>{phase.minutes}{t("minuteSuffix")}</span>
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
                        <Icon className="size-4" />
                      </span>
                      <span className={styles.name}>
                        <span className={styles.number}>{step.number}</span>{" "}
                        {translate(`steps.${step.number}.name`)}
                      </span>
                      <span className={styles.action}>{translate(`steps.${step.number}.action`)}</span>
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
