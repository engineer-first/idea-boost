import { useEffect, useState } from "react";
import {
  Audio,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { LaunchView } from "./launch-view";
import "./launch.css";

export function launchFontCss(asset: (path: string) => string): string {
  return [
    ["Launch Geist", "geist.ttf"],
    ["Launch Noto", "noto-sans-jp.ttf"],
  ]
    .map(
      ([family, file]) =>
        `@font-face { font-family: "${family}"; src: url("${asset(`launch/fonts/${file}`)}") format("truetype"); font-weight: 100 900; font-display: block; }`,
    )
    .join("\n");
}

export function IdeaBoostLaunch() {
  const frame = useCurrentFrame();
  const [handle] = useState(() =>
    delayRender("Launch Video のローカルフォント"),
  );
  useEffect(() => {
    Promise.all([
      document.fonts.load('600 72px "Launch Geist"'),
      document.fonts.load('600 72px "Launch Noto"'),
      document.fonts.load('400 16px "Launch Noto"'),
    ])
      .then(() => continueRender(handle))
      .catch(cancelRender);
  }, [handle]);
  return (
    <>
      <style>{launchFontCss(staticFile)}</style>
      <LaunchView frame={frame} />
      <Audio src={staticFile("launch/idea-boost-score.wav")} />
    </>
  );
}
