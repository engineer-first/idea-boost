import { ArrowRight, Check, LockKeyhole, MousePointer2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DotVotePalette, DotVoteSticker } from "@/features/dot-vote";
import { IdeaSupportSidebarContent } from "@/features/idea-support";
import { StickyNote } from "@/features/notes";
import { RoomLobbyView, RoomTimer } from "@/features/room";
import { CreateRoomSectionView } from "@/features/room-lifecycle";
import { VoteTotalingPanel } from "@/features/vote-totaling";
import { mix, ramp, snap } from "./launch-motion";
import {
  LaunchBoard,
  LaunchNote,
  LaunchPrivateDock,
  noop,
} from "./launch-product";
import {
  getLaunchState,
  LAUNCH_COPY,
  LAUNCH_MEMBERS,
  LAUNCH_SCENES,
  type LaunchState,
} from "./launch-state";

const abs = (left: number, top: number): CSSProperties => ({
  position: "absolute",
  left,
  top,
});

function Pointer({
  x,
  y,
  click = 0,
  label,
}: {
  x: number;
  y: number;
  click?: number;
  label?: string;
}) {
  return (
    <div
      style={{
        ...abs(x, y),
        zIndex: 120,
        filter: "drop-shadow(0 3px 5px #0008)",
      }}
    >
      {click > 0 && click < 1 && (
        <div
          style={{
            position: "absolute",
            width: 65,
            height: 65,
            border: "2px solid #c8b9ff",
            borderRadius: "50%",
            transform: `translate(-50%,-50%) scale(${mix(0.3, 1.8, click)})`,
            opacity: 1 - click,
          }}
        />
      )}
      <MousePointer2
        size={30}
        stroke="#272333"
        fill="#faf8ff"
        strokeWidth={1.3}
        style={{ transform: "rotate(-15deg)", transformOrigin: "0 0" }}
      />
      {label && (
        <span
          style={{
            position: "absolute",
            left: 28,
            top: 31,
            background: "#9b8acb",
            color: "white",
            borderRadius: 5,
            fontSize: 16,
            padding: "3px 9px",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function Backdrop({ frame }: { frame: number }) {
  const travel = Math.min(frame, 2400) / 2400;
  return (
    <>
      <div className="launch-grid" />
      <div
        style={{
          ...abs(550 + travel * 180, 310),
          width: 1250,
          height: 780,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, #8271ba1c, transparent 68%)",
          transform: "rotate(-28deg)",
        }}
      />
      <div
        style={{
          ...abs(-300, -620),
          width: 1500,
          height: 950,
          background: "radial-gradient(ellipse, #cfc0ef13, transparent 68%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 170px #0005",
        }}
      />
    </>
  );
}

function Chrome({ state }: { state: LaunchState }) {
  const progress = Math.min(1, state.frame / 2280);
  return (
    <>
      <div
        style={{
          ...abs(96, 52),
          display: "flex",
          gap: 15,
          alignItems: "center",
        }}
      >
        <span className="launch-wordmark" style={{ fontSize: 28 }}>
          Idea Boost
        </span>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#c4b2f8",
          }}
        />
      </div>
      <span
        style={{
          position: "absolute",
          top: 59,
          right: 96,
          fontSize: 14,
          color: "#7d7b8a",
          letterSpacing: ".08em",
        }}
      >
        考える。広げる。決める。
      </span>
      <div
        style={{
          ...abs(96, 105),
          width: 1728,
          height: 1,
          background: "#ffffff12",
        }}
      />
      <div
        style={{
          ...abs(96, 1034),
          width: 1728,
          height: 1,
          background: "#ffffff15",
          zIndex: 130,
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: 1,
            background: "#c8b9ef99",
          }}
        />
      </div>
    </>
  );
}

function Copy({
  state,
  left = 96,
  top = 151,
  size = 70,
}: {
  state: LaunchState;
  left?: number;
  top?: number;
  size?: number;
}) {
  const enter = snap(state.localFrame, 0, 0.55);
  return (
    <div
      style={{
        ...abs(left, top),
        transform: `translateY(${(1 - enter) * 25}px)`,
        opacity: Math.min(1, enter),
        zIndex: 80,
      }}
    >
      <p className="launch-eyebrow" style={{ marginBottom: 18 }}>
        {state.scene.eyebrow}
      </p>
      <h1 className="launch-heading" style={{ fontSize: size }}>
        {state.scene.copy}
      </h1>
    </div>
  );
}

function BoardStage({
  state,
  style,
  children,
}: {
  state: LaunchState;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const enter = snap(state.localFrame, 0, 0.7);
  const pointer = state.pointer;
  return (
    <div
      style={{
        ...abs(269, 274),
        width: 1728,
        height: 972,
        transformOrigin: "0 0",
        transform: `perspective(2200px) scale(.8) rotateX(${(1 - enter) * 7}deg) rotateY(${(1 - enter) * -8}deg) translateY(${(1 - enter) * 35}px)`,
        ...style,
      }}
    >
      <div
        className="launch-glass"
        style={{
          position: "absolute",
          inset: -15,
          transform: "translate3d(10px,16px,-20px)",
        }}
      />
      <LaunchBoard state={state} />
      {pointer && <Pointer x={pointer.x} y={pointer.y} label="Yuki" />}
      {children}
    </div>
  );
}

function Blank({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  return (
    <>
      <div
        className="launch-glass"
        style={{
          ...abs(805, 215),
          width: 950,
          height: 620,
          transform: `perspective(1600px) rotateY(-16deg) rotateX(10deg) translateY(${mix(15, 0, ramp(f, 0, 150))}px)`,
          opacity: 0.5,
        }}
      >
        <div
          style={{
            borderBottom: "1px solid #ffffff15",
            height: 48,
            padding: 19,
            display: "flex",
            gap: 7,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#716c83",
              }}
            />
          ))}
        </div>
        <div className="launch-grid" />
        <div
          style={{
            ...abs(450, 270),
            width: 2,
            height: 38,
            background: "#c7c1df",
            opacity: Math.floor(f / 34) % 2 === 0 ? 1 : 0,
          }}
        />
      </div>
      <Copy state={state} top={346} size={88} />
      <span style={{ ...abs(100, 733), color: "#8d899c", fontSize: 23 }}>
        チームで「何を作るか」を決める、その前に。
      </span>
    </>
  );
}

function Problems({ state }: { state: LaunchState }) {
  const index = Math.min(3, Math.floor(state.localFrame / 60));
  const f = state.localFrame % 60;
  const enter = snap(f, 0, 0.35);
  return (
    <>
      <div
        style={{
          ...abs(180, 280),
          width: 1560,
          height: 570,
          perspective: 1400,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              ...abs(930 + i * 54, 180 + i * 29),
              transform: `rotateX(18deg) rotateY(-20deg) rotateZ(${i * 4 - 10}deg) scale(1.5)`,
              opacity: 0.16 + i * 0.045,
              filter: `blur(${i < 2 ? 3 : 0}px)`,
            }}
          >
            <StickyNote noteId={`problem-${i}`} color="purple">
              <div
                style={{
                  height: 6,
                  width: 116,
                  margin: 20,
                  background: "#33294333",
                }}
              />
              <div
                style={{
                  height: 6,
                  width: 84,
                  margin: "0 20px",
                  background: "#33294322",
                }}
              />
            </StickyNote>
          </div>
        ))}
      </div>
      <div
        style={{
          ...abs(96, 348),
          opacity: Math.min(1, enter),
          transform: `translateY(${(1 - enter) * 35}px)`,
        }}
      >
        <p className="launch-eyebrow" style={{ marginBottom: 25 }}>
          0{index + 1} / THE MOMENT WE GET STUCK
        </p>
        <h1 className="launch-heading" style={{ fontSize: 108 }}>
          {LAUNCH_COPY.problems[index]}
        </h1>
      </div>
      <div style={{ ...abs(100, 740), display: "flex", gap: 14 }}>
        {LAUNCH_COPY.problems.map((text, i) => (
          <div
            key={text}
            style={{
              width: 56,
              height: 3,
              background: i <= index ? "#bfb0eb" : "#ffffff15",
            }}
          />
        ))}
      </div>
    </>
  );
}

function Brand({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="launch-glass"
          style={{
            ...abs(455 + i * 23, 285 + i * 22),
            width: 960,
            height: 430,
            opacity: (0.3 - i * 0.065) * Math.min(1, snap(f, i * 6)),
            transform: `perspective(1600px) rotateX(32deg) rotateZ(-12deg) translateY(${(1 - snap(f, i * 6)) * 150}px)`,
          }}
        >
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                ...abs(50 + n * 216, 210),
                width: 185,
                height: 140,
                borderRadius: 8,
                border: "1px solid #ffffff30",
                background: "#ffffff06",
                transform: `translateY(${(1 - snap(f, 10 + n * 5)) * 70}px)`,
              }}
            />
          ))}
        </div>
      ))}
      <div
        style={{
          ...abs(0, 422),
          width: 1920,
          textAlign: "center",
          opacity: Math.min(1, snap(f, 8)),
          transform: `translateY(${(1 - snap(f, 8)) * 50}px)`,
        }}
      >
        <p className="launch-eyebrow" style={{ marginBottom: 27 }}>
          THINK. SHARE. DECIDE.
        </p>
        <h1 className="launch-wordmark" style={{ fontSize: 172 }}>
          Idea Boost<span style={{ color: "#bbaaee" }}>.</span>
        </h1>
      </div>
    </>
  );
}

function Room({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  return (
    <>
      <Copy state={state} />
      {f < 62 ? (
        <>
          <div
            className="launch-glass"
            style={{
              ...abs(600, 340),
              padding: 18,
              width: 380,
              transformOrigin: "0 0",
              transform: `perspective(1200px) rotateY(${mix(-7, 0, snap(f))}deg) scale(1.8)`,
            }}
          >
            <CreateRoomSectionView pending={f >= 43} onSubmit={noop} />
          </div>
          <Pointer
            x={mix(1370, 936, ramp(f, 0, 38))}
            y={mix(780, 768, ramp(f, 0, 38))}
            click={ramp(f, 43, 60)}
          />
        </>
      ) : (
        <div
          className="launch-glass"
          style={{
            ...abs(474, 290),
            width: 900,
            height: 680,
            transformOrigin: "0 0",
            transform: `scale(1.08) translateY(${(1 - snap(f, 62, 0.4)) * 20}px)`,
            overflow: "hidden",
          }}
        >
          <RoomLobbyView
            members={LAUNCH_MEMBERS.slice(
              0,
              Math.min(4, 1 + Math.floor((f - 62) / 12)),
            )}
            currentUserId={state.currentUserId}
            hostUserId={state.currentUserId}
            isHost
            phase={{ kind: "lobby" }}
            inviteCode={LAUNCH_COPY.roomCode}
            inviteUrl=""
            connectionStatus="open"
            isStarting={false}
            onStart={noop}
            onLeave={noop}
            isLeaving={false}
          />
        </div>
      )}
    </>
  );
}

function Flow({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  const step = Math.min(2, Math.floor(f / 60));
  return (
    <>
      <BoardStage
        state={state}
        style={{
          top: 515,
          opacity: 0.36,
          filter: "blur(1.5px)",
          transform: "perspective(1800px) scale(.8) rotateX(24deg)",
        }}
      />
      <Copy state={state} top={172} size={76} />
      <div
        className="launch-glass"
        style={{
          ...abs(160, 497),
          width: 1600,
          padding: "42px 56px",
          zIndex: 90,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 88,
            right: 100,
            top: 68,
            height: 1,
            background: "#ffffff20",
          }}
        >
          <div
            style={{
              height: 2,
              width: `${ramp(f, 15, 155) * 100}%`,
              background: "#c4b0fa",
              boxShadow: "0 0 18px #ba9bf755",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          {LAUNCH_COPY.phases.map((name, i) => (
            <div
              key={name}
              style={{
                width: 375,
                transform: `translateY(${(1 - snap(f, i * 14)) * 35}px)`,
                opacity: Math.min(1, snap(f, i * 14)),
              }}
            >
              <span
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: 50,
                  height: 50,
                  border: `1px solid ${i <= step ? "#c4b0fa" : "#54505f"}`,
                  background: i <= step ? "#c4b0fa" : "#24222c",
                  borderRadius: "50%",
                  fontSize: 18,
                  color: i <= step ? "#211b2d" : "#aca5bb",
                  marginBottom: 26,
                }}
              >
                {i < step ? <Check size={24} /> : `0${i + 1}`}
              </span>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 550,
                  color: i <= step ? "#f4f0fc" : "#8e889a",
                }}
              >
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Private({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  const enter = snap(f, 0);
  return (
    <>
      <Copy state={state} top={343} size={86} />
      <div
        style={{
          ...abs(102, 664),
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "#b8adc8",
          fontSize: 24,
        }}
      >
        <LockKeyhole size={24} />
        {LAUNCH_COPY.private}
      </div>
      <div
        className="launch-glass"
        style={{
          ...abs(963, 255),
          width: 705,
          height: 670,
          transform: `perspective(1500px) rotateY(${(1 - enter) * -12 - 3}deg) rotateX(3deg)`,
        }}
      />
      <div
        style={{
          ...abs(1062, 329),
          transform: `scale(2.1) translateY(${(1 - enter) * 40}px)`,
          transformOrigin: "0 0",
        }}
      >
        <LaunchPrivateDock state={state} />
      </div>
      <div
        style={{
          ...abs(1453, 270),
          transform: "scale(1.6)",
          transformOrigin: "0 0",
        }}
      >
        {f < 36 ? (
          <Button size="sm" className="w-28" onClick={noop}>
            開始
          </Button>
        ) : (
          <RoomTimer
            timer={state.timer}
            renderTimeMs={state.renderTimeMs}
            serverOffsetMs={0}
            isHost={false}
            disabled={false}
            onStart={noop}
            onPause={noop}
            onResume={noop}
            onStop={noop}
            onExtend={noop}
          />
        )}
      </div>
      {f < 62 && (
        <Pointer
          x={mix(1670, 1525, ramp(f, 0, 30))}
          y={mix(415, 290, ramp(f, 0, 30))}
          click={ramp(f, 36, 56)}
        />
      )}
      {f >= 62 && f < 154 && (
        <div
          style={{
            ...abs(1138 + Math.min(275, (f - 62) * 3), 440),
            width: 2,
            height: 25,
            background: "#363044",
            opacity: Math.floor(f / 20) % 2 ? 0 : 0.8,
          }}
        />
      )}
    </>
  );
}

function Hints({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  const method =
    f < 38
      ? "osborn"
      : f < 68
        ? "scamper"
        : f < 92
          ? "reverse"
          : f < 116
            ? "industry"
            : "osborn";
  const enter = snap(f, 0);
  return (
    <>
      <Copy state={state} />
      <div
        className="launch-glass"
        style={{
          ...abs(112, 337),
          width: 600,
          padding: 10,
          transformOrigin: "0 0",
          transform: `perspective(1600px) rotateY(${(1 - enter) * 8}deg) scale(1.48)`,
        }}
      >
        <Card
          className={f >= 116 ? "launch-hint-panel" : ""}
          style={{ padding: "15px 0 24px" }}
        >
          <h2 style={{ padding: "0 18px", fontSize: 17, fontWeight: 600 }}>
            発想のヒント
          </h2>
          <IdeaSupportSidebarContent key={method} defaultContentId={method} />
        </Card>
      </div>
      <div style={{ ...abs(1160, 373), width: 590 }}>
        <div className="launch-eyebrow" style={{ marginBottom: 27 }}>
          問いから、アイデアへ
        </div>
        <p style={{ fontSize: 25, color: "#c7c0d5", lineHeight: 1.7 }}>
          {LAUNCH_COPY.hmw}
        </p>
      </div>
      <div
        style={{
          ...abs(1220, 546),
          transform: `perspective(1300px) rotateY(-5deg) scale(2.25) translateY(${(1 - snap(f, 12)) * 30}px)`,
          transformOrigin: "0 0",
        }}
      >
        {state.board.privateNotes[0] && (
          <LaunchNote note={state.board.privateNotes[0]} />
        )}
      </div>
      {f >= 116 && f < 144 && (
        <Pointer x={634} y={699} click={ramp(f, 120, 143)} />
      )}
      {f >= 144 && f < 218 && <Pointer x={1260} y={584} />}
      <ArrowRight
        style={{
          ...abs(1040, 674),
          color: "#a99bc8",
          opacity: ramp(f, 120, 150),
        }}
        size={44}
        strokeWidth={1}
      />
    </>
  );
}

const VOTE_POSITIONS = [
  { x: 527, y: 400 },
  { x: 967, y: 530 },
  { x: 1407, y: 420 },
] as const;

function Vote({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  if (state.revealed) return <Results state={state} />;
  const next = Math.min(3, state.votesPlaced);
  const start = next === 0 ? 18 : 55 + (next - 1) * 44 + 8;
  const end = 55 + next * 44;
  const moving = f >= start && f < end;
  const p = ramp(f, start, end);
  const noteIndex = next === 0 ? 0 : next - 1;
  const target = VOTE_POSITIONS[noteIndex];
  const tx =
    target.x + (next === 0 ? 0.78 : 0.62 + noteIndex * 0.08) * 200 * 1.8;
  const ty =
    target.y + (next === 0 ? 0.2 : 0.34 + noteIndex * 0.12) * 150 * 1.8;
  const px = mix(next === 0 ? 824 : 1082, tx, p);
  const py = mix(920, ty, p);
  return (
    <>
      <Copy state={state} />
      <p
        style={{
          ...abs(100, 290),
          color: "#b8b0c9",
          fontSize: 27,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <LockKeyhole size={23} />
        {LAUNCH_COPY.vote}
      </p>
      {state.board.notes.slice(0, 3).map((note, i) => (
        <div
          key={note.id}
          style={{
            ...abs(VOTE_POSITIONS[i].x, VOTE_POSITIONS[i].y),
            transform: `perspective(1600px) rotateY(${i === 0 ? -5 : 3}deg) scale(1.8) translateY(${(1 - snap(f, i * 7)) * 50}px)`,
            transformOrigin: "0 0",
          }}
        >
          <LaunchNote note={note} />
        </div>
      ))}
      <div
        style={{
          ...abs(685, 864),
          transform: "scale(2)",
          transformOrigin: "0 0",
        }}
      >
        <DotVotePalette
          voteRemaining={{
            subjective: state.votesPlaced > 0 ? 0 : 1,
            objective: 3 - Math.max(0, state.votesPlaced - 1),
          }}
          pendingOperationCount={0}
          feedback={null}
          disabled={false}
          selectedKind={null}
          onStickerSelect={noop}
          onStickerDragStart={noop}
        />
      </div>
      {moving && (
        <>
          <div
            style={{
              ...abs(px - 15, py - 15),
              transform: "scale(1.8)",
              transformOrigin: "0 0",
              zIndex: 110,
            }}
          >
            <DotVoteSticker
              kind={next === 0 ? "subjective" : "objective"}
              count={1}
              state="preview"
            />
          </div>
          <Pointer x={px} y={py} />
        </>
      )}
      <span style={{ ...abs(101, 917), color: "#888093", fontSize: 19 }}>
        🔴 主観 × 1　／　🔵 客観 × 3
      </span>
    </>
  );
}

function Results({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  const decided = state.board.decision !== null;
  return (
    <>
      <Copy state={state} />
      <p style={{ ...abs(100, 290), color: "#b8b0c9", fontSize: 26 }}>
        {LAUNCH_COPY.result}
      </p>
      <div
        style={{
          ...abs(decided ? 175 : 416, 367),
          width: 768,
          transform: `perspective(1600px) rotateY(${decided ? 12 : -2}deg) scale(${decided ? 1.1 : 1.42})`,
          transformOrigin: "0 0",
          opacity: decided ? 0.35 : 1,
          filter: decided ? "blur(2px)" : "none",
        }}
      >
        <VoteTotalingPanel
          notes={state.board.notes}
          members={LAUNCH_MEMBERS}
          isVotingComplete
          decision={state.board.decision}
          isHost
          isDisconnected={false}
          onNoteDecide={noop}
        />
      </div>
      {state.scene.id === "decision" && !decided && (
        <Pointer
          x={mix(1520, 1407, ramp(f, 55, 118))}
          y={mix(845, 590, ramp(f, 55, 118))}
          click={ramp(f, 119, 135)}
        />
      )}
      {decided && (
        <div
          className="launch-glass"
          style={{
            ...abs(984, 382),
            width: 695,
            padding: "36px 42px 48px",
            background: "linear-gradient(145deg,#292631f0,#17171de8)",
            transform: `perspective(1400px) rotateY(${(1 - snap(f, 126)) * -12}deg) translateY(${(1 - snap(f, 126)) * 65}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              color: "#cdbffa",
              fontSize: 23,
            }}
          >
            <Check size={25} />
            採用アイデア
          </div>
          <h2
            style={{
              fontSize: 45,
              fontWeight: 550,
              lineHeight: 1.55,
              letterSpacing: "-.035em",
              marginTop: 26,
            }}
          >
            {LAUNCH_COPY.idea}
          </h2>
          <div
            style={{
              height: 1,
              background: "#ffffff1b",
              margin: "36px 0 24px",
            }}
          />
          <p style={{ fontSize: 21, color: "#aaa2ba" }}>
            スプリント完了{" "}
            <span style={{ float: "right", color: "#d8cff0" }}>✓</span>
          </p>
        </div>
      )}
    </>
  );
}

function Closing({ state }: { state: LaunchState }) {
  const f = state.localFrame;
  const settled = snap(f, 0, 0.75);
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.12 * (1 - ramp(f, 0, 90)),
          filter: "blur(8px)",
        }}
      >
        <BoardStage state={state} />
      </div>
      <div
        style={{
          ...abs(0, 342),
          width: 1920,
          textAlign: "center",
          opacity: Math.min(1, settled),
          transform: `translateY(${(1 - settled) * 36}px)`,
        }}
      >
        <p className="launch-heading" style={{ fontSize: 71, fontWeight: 550 }}>
          アイデア出しに困ったときは、
          <span style={{ color: "#c5b3f0" }}>これ。</span>
        </p>
        <div
          style={{
            width: 72,
            height: 1,
            background: "#b5a2dd80",
            margin: "50px auto",
          }}
        />
        <h1 className="launch-wordmark" style={{ fontSize: 151 }}>
          Idea Boost<span style={{ color: "#bbaaee" }}>.</span>
        </h1>
      </div>
    </>
  );
}

export function LaunchView({ frame }: { frame: number }) {
  const state = getLaunchState(frame);
  const scene = state.scene.id;
  return (
    <div
      className="launch-root dark remotion-product-root"
      data-launch="true"
      data-scene={scene}
    >
      <Backdrop frame={frame} />
      {scene !== "brand" && scene !== "closing" && <Chrome state={state} />}
      {scene === "blank" && <Blank state={state} />}
      {scene === "problems" && <Problems state={state} />}
      {scene === "brand" && <Brand state={state} />}
      {scene === "room" && <Room state={state} />}
      {scene === "flow" && <Flow state={state} />}
      {scene === "private" && <Private state={state} />}
      {(scene === "share" || scene === "map") && (
        <>
          <Copy state={state} size={64} />
          <BoardStage state={state} />
        </>
      )}
      {scene === "hints" && <Hints state={state} />}
      {scene === "vote" && <Vote state={state} />}
      {scene === "decision" && <Results state={state} />}
      {scene === "closing" && <Closing state={state} />}
      <span
        style={{
          position: "absolute",
          left: 96,
          bottom: 15,
          color: "#5c5868",
          fontSize: 11,
          letterSpacing: ".12em",
        }}
      >
        {scene === "closing"
          ? ""
          : `${String(LAUNCH_SCENES.indexOf(state.scene) + 1).padStart(2, "0")} / IDEA BOOST`}
      </span>
    </div>
  );
}
