# ルーム作成の受付と回復

同じ利用者・要求ID・正規化入力の再試行は同じルームへ収束する。作成の受付はID内のサーバーUTC時刻から24時間、`now >= expiry`で停止する。これはルームの利用期限ではない。D1実行時計の秒精度は切上げるため、境界で最大1秒早く受付を閉じる。未来時刻の許容は60秒で、正規UIはサーバー発行IDを使う。署名による発行証明は提供しない。

ホームの「前回の作成を確認」は本人の結果照会から始める。既知結果は通常認可でルームへ戻り、24時間後も照会できる。unknownは作成されなかった証明ではない。「別のルーム」を選ぶと別IDになり、前回が成功していた場合は両方残る。ブラウザ控えは利用者・要求ごとにIndexedDBへ保存し、transaction完了後にだけ送信する。タブ閉鎖後は同じブラウザprofileで回復できるが、保存削除・別端末では意図発見を保証しない。端末時計で控えを消したり再発行したりしない。

## 保存と公開

| 記録                                              | 整理の条件                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1要求詳細（名前・招待コードの二重保持）          | 24h期限＋5分猶予を過ぎ、毎時GCで100件ずつ削除。停止/失敗中は物理削除が遅れる                                                                                      |
| D1最小対応（creator/request/room/deadline/state） | ready/closedは受付退役後、通常roomと有効成果がなくなったら100件ずつ削除。旧方式で任意のv7時刻を送っていた特殊データは、そのIDの時刻帯も退役するまで最小対応を保持 |
| 未確定unknownの最小対応                           | DOが応答し決着可能になるまで保持。名前は上記の詳細整理で消す                                                                                                      |
| DO作成marker                                      | 初期化・閉鎖の証拠。今回積極廃棄しない保持例外                                                                                                                    |
| 通常room名・成果・履歴                            | 従来の通常lifecycle・30日成果保持。作成24hによる削除はない                                                                                                        |
| ブラウザ控え                                      | サーバー確認済みexpired/closed/knownでは名前を消す。オフライン保存・backup/logの消去時刻はD1と別                                                                  |

作成中のroomsと成果はhidden。DOの初期化事実から、同identity・pending・既存hiddenへのD1 CASだけで公開する。成果outboxのUPDATEは公開証拠を変更しない。旧ルームの成果索引欠落は明示legacyディレクトリを根拠に補完し、INSERT時にそのlegacy証拠を成果索引へ移す。新規hiddenや単なる不存在は公開根拠にしない。要求詳細がなくてもhiddenを公開せず、正常解散後も成立済み成果の公開証拠は残る。盤面・参加・ホストの権威はDOのまま。

## rolloutとGCの有効化

本番操作はリリース担当が[リリース運用](release.md)に従って実施する。このPRではdeployしない。D1 migration0009は既存v4だけへ適用時刻＋24hの固定互換猶予を設定する。新規v4は拒否し、旧タブは更新してから明示別作成する。D1のINSERT guardで、migration後の旧Workerがcontrolなしの要求を予約するSQLもbatch全体で拒否する。既存v4の大小衝突はどちらも消さず409にする。名前・状態・所有者を照合して運用者が個別判断する。

1. 追加D1 migration→新API/DO→新Appの順に配備する。GCは既定無効。混在中の旧RPCは初回初期化を拒否し、新Appが旧DOへ到達した一時障害は控えを保持する。
2. 新Appの発行・保存・作成・結果照会、新DO guard、公開gate、既存v4照会を確認する。古いWorkerの実行が残っていないことを確認してからGCを有効化する。migrationを知らない旧DOへのrollbackは不可。新migrationを含む互換版またはforward fixを使う。
3. 対象を明示してpolicyを確認し、有効化する。ローカル検証では`--remote`を`--local`へ置換し、本番と混同しない。

```sh
npx wrangler d1 execute DB --remote --config workers/wrangler.jsonc --command "SELECT * FROM room_creation_policy;"
npx wrangler d1 execute DB --remote --config workers/wrangler.jsonc --command "UPDATE room_creation_policy SET cleanup_enabled=1 WHERE id=1;"
```

4. 次の毎時cronで`room_creation_cleanup`の件数/最古期限/最大attemptを確認し、詳細件数の減少とunknownの収束をリリース確認に記録する。無効時は`room_creation_cleanup_disabled`が出る。有効化を未実施のまま「短期削除を運用開始した」と扱わない。

停止は同じ対象へ`UPDATE room_creation_policy SET cleanup_enabled=0 WHERE id=1;`。受付期限と公開gateは停止中も有効。watermarkを下げない。再開は配備・時計・DO到達性を確認後に同じ有効化操作を使う。

## 監視・障害・復旧

GCは25件のDO照合をCAS claimし、失敗は1時間から最大24時間のbackoffで再試行する。詳細・終端対応整理も100件上限。一件のDO timeoutで他の照合を止めない。unknown件数、最古期限、最大attempt、反復失敗と削除SQL失敗を監視し、最古期限が24時間以上経過して残る場合はリリース担当がDO到達性と投影失敗を調査する。氏名・名前・cookieを監視に加えない。

手動処理でも`workers/lib/room-creation-cleanup.ts`の`reconcileCreation`と同じDO `inspectOrCloseExpiredCreation(identity)`→D1 CASを使う。timeoutだけでrooms/controlを削除しない。DO不通が長期化してもunknownを捨てる最終期限は設けていない。未知の作成を消す保証緩和は別判断とする。

退役watermarkはGC時にD1実行時計から単調に進め、全新規予約SQLが比較する。時計が後退しても整理済み時間帯の同IDを新規予約しない。大幅な未来時計でwatermarkが進むと正当な要求も拒否し得るため、clock異常時は作成APIの受付とGCをメンテナンスで止め、時計・policy・control・DOを照合する。5分猶予は絶対的なclock精度保証ではない。

D1/DOのPITRや管理者のデータ巻戻しは通常の通信障害に対する同ID収束保証の対象外。片側だけ巻き戻して受付を再開しない。作成・公開を停止し、24h窓内の対応喪失・DO初期化事実・公開投影を照合してから再開する。watermarkの無条件リセットや旧migrationの編集は行わない。
