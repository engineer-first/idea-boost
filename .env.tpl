# 1Password の Automation 保管庫から .env.local と workers/.dev.vars に入れる値（op:// の参照だけ。値は書かない）。
# scripts/worktree-env.sh が、サービスアカウントで読めるとき（ループの Mac mini）だけ op inject で埋める。
# 読めない環境（メンバーの PC・CI）や項目が無いときは、example の値（空）のまま作る。
# 項目の決まりは docs/loop/README.md の「秘密の置き場」。名前を足すときは、同じ名前の行を example にも置く。
GOOGLE_CLIENT_ID=op://Automation/idea-boost-GOOGLE_CLIENT_ID/credential
GOOGLE_CLIENT_SECRET=op://Automation/idea-boost-GOOGLE_CLIENT_SECRET/credential
