"use client";

import { createContext } from "react";

// 入室を確認した後のロビー→盤面だけで使う署名済み継続情報。
export const RoomAdmissionContext = createContext<string | undefined>(
  undefined,
);
