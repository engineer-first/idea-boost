import { DurableObject } from "cloudflare:workers";
import type { VerificationActive } from "../contracts/verification";

// ローカル検証で全ブラウザが追従するルームの参照だけを保存する。
// 付箋・フェーズ等の実データは各RoomDOが持つ。
export class VerificationWorkspace extends DurableObject {
  async getActive(): Promise<VerificationActive | null> {
    return (await this.ctx.storage.get<VerificationActive>("active")) ?? null;
  }
  async setActive(active: VerificationActive): Promise<void> {
    await this.ctx.storage.put("active", active);
  }
}
