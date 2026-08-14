#!/bin/bash
# 看我動作片｜掃描這個資料夾裡的照片，產生「清單.txt」
# 用法：在 Finder 裡對著這個檔案按兩下就好。
# 每次新增／改名／刪除照片之後，都要再跑一次。

cd "$(dirname "$0")" || exit 1

OUT="清單.txt"

{
  echo "# 看我動作片 — 動作照片清單（由「更新清單.command」自動產生，不用手改）"
  echo "# 產生時間：$(date '+%Y-%m-%d %H:%M')"
  # -1 一行一個檔名；只留圖片；排除清單檔本身與 macOS 的隱藏檔
  ls -1 | grep -iE '\.(jpg|jpeg|png|webp|gif)$' | grep -v '^\._' | sort
} > "$OUT"

COUNT=$(grep -vc '^#' "$OUT")

echo ""
echo "===================================="
echo " 清單更新完成"
echo " 共 $COUNT 張照片"
echo "===================================="
echo ""
grep -v '^#' "$OUT" | sed 's/^/  ・/'
echo ""
echo "接下來："
echo "  1. 打開 action-draw.html 點「動作清單」確認照片有出現"
echo "  2. 要讓大家看到的話，記得把 action-poses 資料夾一起推上 GitHub"
echo ""
echo "（這個視窗可以直接關掉）"
