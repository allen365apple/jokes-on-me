#!/bin/bash
# 看我動作片｜只重新整理清單，不上傳
# 用法：在 Finder 裡對著這個檔案按兩下。
# 適用：想先在自己電腦上看看效果，還不要推到網站上。
# 平常請用「收圖.command」。

cd "$(dirname "$0")" || exit 1

echo ""
echo "===================================="
echo " 看我動作片｜整理清單（不上傳）"
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

if 回合:
    for i, r in enumerate(回合):
        print('  第 %d 回合「%s」：%d 張' % (i + 1, r['名稱'], len(r['檔案'])))
        for f in r['檔案']:
            print('      ・' + f)
else:
    print('  還沒有任何圖。')
    print('  作法：在這個資料夾裡開子資料夾（一個回合一個），把圖放進去。')
    print('  例如：1 動作／　2 動漫／　3 迷因／')
PYEOF

echo ""
echo "清單已更新（只在你自己的電腦上）。"
echo "要讓網站也更新，請跑「收圖.command」或「上傳照片.command」。"
echo ""
echo "（這個視窗可以直接關掉）"
