// auth feature（ログイン・ログアウト・OAuth コールバック支援）の公開境界。
// lib/session（Cookie / JWT の発行・検証）はインフラとして別レイヤーに置き、
// ここは「ログイン UI と認証フローの配線」だけを持つ。
export {
  type DevAuthState,
  signInWithDevPassword,
  signInWithGoogle,
  signOut,
} from "./logic/actions";
export {
  type DisplayNameResult,
  loadDisplayName,
  saveDisplayName,
} from "./logic/display-name-actions";
export { isEmailVerified } from "./logic/google-claims";
export {
  type PreparedPrincipal,
  type PrepareGuestIdentityResult,
  prepareGuestIdentity,
} from "./logic/guest-identity-actions";
export { getLoginPath, sanitizeNextPath } from "./logic/redirects";
export { RoomAdmissionContext } from "./logic/room-admission-context";
export {
  bindRoomEntryContinuation,
  consumeRoomEntry,
  consumeRoomResume,
  startRoomReauthentication,
} from "./logic/room-reauthentication";
export {
  type DisplayNameControls,
  useDisplayName,
} from "./logic/use-display-name";
export { DisplayNameDialog } from "./molecules/display-name-dialog";
export {
  GuestNameForm,
  type GuestNameFormProps,
} from "./molecules/guest-name-form";
export {
  GuestNameFormView,
  type GuestNameFormViewProps,
} from "./molecules/guest-name-form-view";
export { LoginCard } from "./molecules/login-card";
