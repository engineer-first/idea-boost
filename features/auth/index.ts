// auth feature（ログイン・ログアウト・OAuth コールバック支援）の公開境界。
// lib/session（Cookie / JWT の発行・検証）はインフラとして別レイヤーに置き、
// ここは「ログイン UI と認証フローの配線」だけを持つ。
export {
  type DevAuthState,
  signInWithDevPassword,
  signInWithGoogle,
  signOut,
} from "./logic/actions";
export { isEmailVerified } from "./logic/google-claims";
export { getLoginPath, sanitizeNextPath } from "./logic/redirects";
export { RoomAdmissionContext } from "./logic/room-admission-context";
export {
  bindRoomEntryContinuation,
  consumeRoomEntry,
  consumeRoomResume,
  startRoomReauthentication,
} from "./logic/room-reauthentication";
export { LoginCard } from "./molecules/login-card";
