"use client";

import { useEffect, useState } from "react";
import {
  RoomConnectionNoticeView,
  type RoomConnectionNoticeViewProps,
} from "./room-connection-notice-view";

export type RoomConnectionNoticeProps = RoomConnectionNoticeViewProps;

export function RoomConnectionNotice(props: RoomConnectionNoticeProps) {
  const [currentHref, setCurrentHref] = useState<string>();
  // 戻り先未指定でも、検索パラメータを含む同じページへフルナビゲーションする。
  useEffect(() => {
    setCurrentHref(window.location.href);
  }, []);
  return (
    <RoomConnectionNoticeView
      {...props}
      returnHref={props.returnHref ?? currentHref}
    />
  );
}
