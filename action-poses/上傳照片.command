#!/bin/bash
# 看我動作片｜上傳本機的圖（不碰 Google Drive）
# 用法：在 Finder 裡對著這個檔案按兩下。
# 適用：你自己手動把圖丟進回合資料夾，想直接上網站。
# 平常請用「收圖.command」（那個會先跟 Drive 對照）。

cd "$(dirname "$0")" || exit 1

echo ""
echo "===================================="
echo " 看我動作片｜上傳本機的圖"
echo "===================================="
echo ""

python3 - <<'PYEOF'
# -*- coding: utf-8 -*-
import json, os, re
IMG = re.compile(r'\.(jpe?g|png|webp|gif)$', re.I)

回合 = []
for folder in sorted(os.listdir('.')):
    if not os.path.isdir(folder) or folder.startswith('.'):
        continue
    files = sorted([x for x in os.listdir(folder)
                    if IMG.search(x) and not x.startswith('.')])
    if files:
        回合.append({'名稱': folder, '檔案': files})

with open('清單.json', 'w', encoding='utf-8') as fh:
    json.dump({'回合': 回合}, fh, ensure_ascii=False, indent=2)

總數 = sum(len(r['檔案']) for r in 回合)
if 回合:
    for i, r in enumerate(回合):
        print('      第 %d 回合「%s」：%d 張' % (i + 1, r['名稱'], len(r['檔案'])))
else:
    print('      還沒有任何圖。')
    print('      作法：在這個資料夾裡開子資料夾（一個回合一個），把圖放進去。')
    print('      例如：1 動作／　2 動漫／　3 迷因／')
print('')
open('.收圖結果', 'w').write('%d %d' % (len(回合), 總數))
PYEOF

[ $? -ne 0 ] && { echo "❌ 整理失敗，把這個畫面截圖給 Claude 看。"; exit 1; }
read ROUNDS TOTAL < .收圖結果 2>/dev/null
rm -f .收圖結果

cd .. || exit 1
git add action-poses >/dev/null 2>&1

if git diff --cached --quiet; then
  echo "網站上已經是最新的了，不用上傳。"
  echo ""
  echo "✅ 目前：${ROUNDS:-0} 個回合、共 ${TOTAL:-0} 張。"
  echo ""
  echo "（這個視窗可以直接關掉）"
  exit 0
fi

echo "上傳中⋯⋯"
git commit -q -m "feat(action-draw): 更新動作圖（${ROUNDS:-0} 個回合、${TOTAL:-0} 張）" || {
  echo "❌ 存檔失敗，把這個畫面截圖給 Claude 看。"; exit 1; }

if ! git push -q origin main 2>/dev/null; then
  echo ""
  echo "❌ 上傳失敗（可能沒網路，或網站上有別人的新變更）。"
  echo "   圖已經存到本機了，把這個畫面截圖給 Claude 看。"
  exit 1
fi

echo ""
echo "===================================="
echo " ✅ 已上傳：${ROUNDS:-0} 個回合、共 ${TOTAL:-0} 張"
echo "===================================="
echo ""
echo "網站約 1 分鐘後生效："
echo "  https://allen365apple.github.io/jokes-on-me/action-draw.html"
echo ""
echo "（這個視窗可以直接關掉）"
