#!/bin/bash
# 看我動作片｜把這個資料夾裡的照片更新到網站上
# 用法：在 Finder 裡對著這個檔案按兩下就好。
# 做的事：1) 重新掃描照片產生清單  2) 上傳到 GitHub  3) 網站自動換圖

cd "$(dirname "$0")" || exit 1
REPO="$(cd .. && pwd)"

echo ""
echo "===================================="
echo " 看我動作片｜上傳動作照片"
echo "===================================="
echo ""

# ---------- 1. 產生清單 ----------
{
  echo "# 看我動作片 — 動作照片清單（自動產生，不用手改）"
  echo "# 產生時間：$(date '+%Y-%m-%d %H:%M')"
  ls -1 | grep -iE '\.(jpg|jpeg|png|webp|gif)$' | grep -v '^\._' | sort
} > 清單.txt

COUNT=$(grep -vc '^#' 清單.txt)
echo "【1/3】掃描到 $COUNT 張照片："
grep -v '^#' 清單.txt | sed 's/^/      ・/'
echo ""

if [ "$COUNT" -eq 0 ]; then
  echo "⚠️  這個資料夾裡沒有照片。"
  echo "    照片檔名要寫成「類別＋編號」，例如：正經一.jpg、雙人3.jpg、荒謬二.jpg"
  echo ""
  echo "（這個視窗可以直接關掉）"
  exit 0
fi

# ---------- 2. 上傳 ----------
cd "$REPO" || exit 1
git add action-poses >/dev/null 2>&1

if git diff --cached --quiet; then
  echo "【2/3】照片跟網站上的一樣，沒有東西需要上傳。"
  echo ""
  echo "✅ 已經是最新的了。"
  echo ""
  echo "（這個視窗可以直接關掉）"
  exit 0
fi

echo "【2/3】正在上傳⋯⋯"
git commit -q -m "feat(action-draw): 更新動作照片（$COUNT 張）" || {
  echo ""
  echo "❌ 存檔失敗。把這個畫面截圖給 Claude 看，他會處理。"
  exit 1
}

if ! git push -q origin main 2>/dev/null; then
  echo ""
  echo "❌ 上傳失敗（可能是沒網路，或是網站上有別人的新變更）。"
  echo "   照片已經存好了，把這個畫面截圖給 Claude 看，他會處理。"
  exit 1
fi

# ---------- 3. 完成 ----------
echo ""
echo "【3/3】完成！"
echo ""
echo "===================================="
echo " ✅ $COUNT 張照片已上傳"
echo "===================================="
echo ""
echo "網站大約 1 分鐘後生效："
echo "  https://allen365apple.github.io/jokes-on-me/action-draw.html"
echo ""
echo "打開後點下方的「動作清單」，有照片的那幾格會變成照片、外框變橘色。"
echo ""
echo "（這個視窗可以直接關掉）"
