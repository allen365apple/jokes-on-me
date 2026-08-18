#!/bin/bash
# 看我動作片｜演出前收圖
# 用法：在 Finder 裡對著這個檔案按兩下。
# 做的事：Google Drive 的圖 → 下載到本機 → 收進網站 → 現場就不靠網路

cd "$(dirname "$0")" || exit 1

echo ""
echo "===================================="
echo " 看我動作片｜演出前收圖"
echo "===================================="
echo ""

python3 - <<'PYEOF'
# -*- coding: utf-8 -*-
import json, os, re, shutil, subprocess, urllib.request, urllib.parse

IMG = re.compile(r'\.(jpe?g|png|webp|gif)$', re.I)          # 瀏覽器看得懂的
ANY = re.compile(r'\.(jpe?g|jfif|png|webp|gif|heic|heif)$', re.I) # Drive 上收得到的
MAP_FILE = '.drive-對照.json'      # Drive 檔案 ↔ 本機檔名（避免同名互相蓋掉）
MAX_BYTES = 1200 * 1024            # 超過就縮圖
MAX_PIXEL = 1800                   # 長邊縮到這個大小，投影綽綽有餘
SIPS = shutil.which('sips')        # macOS 內建的圖片處理工具

def 是圖片(blob, ctype):
    """別只信伺服器標的 Content-Type（.jfif 之類常常被標成 octet-stream），
       直接看檔案開頭的特徵碼比較準。"""
    if ctype.startswith('image/'):
        return True
    return (blob[:3] == b'\xff\xd8\xff'                      # jpeg / jfif
            or blob[:8] == b'\x89PNG\r\n\x1a\n'                # png
            or blob[:6] in (b'GIF87a', b'GIF89a')             # gif
            or (blob[:4] == b'RIFF' and blob[8:12] == b'WEBP') # webp
            or blob[4:8] == b'ftyp')                          # heic / heif

def get(url, timeout=60):
    # 網址若含中文等非 ASCII 字元要先編碼，否則 urllib 會直接炸掉
    parts = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit((
        parts.scheme, parts.netloc,
        urllib.parse.quote(parts.path, safe='/%'),
        urllib.parse.quote(parts.query, safe='=&%'), parts.fragment))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=timeout)

# ---------- 讀設定 ----------
try:
    cfg = json.load(open('drive.json', encoding='utf-8'))
except Exception:
    cfg = {}
api = (cfg.get('url') or '').strip()

groups = []
if not api:
    print('⚠️  還沒設定 Drive 網址（drive.json 裡的 url 是空的）。')
    print('    這次只會重新整理本機已經有的圖。')
    print('    要從 Drive 收圖的話，請先照 drive-images.gs 裡的步驟部署，')
    print('    再把 .../exec 網址給 Claude 填進去。')
    print('')
else:
    print('【1/4】跟 Google Drive 對照⋯⋯')
    try:
        data = json.loads(get(api).read().decode('utf-8'))
        if not data.get('ok'):
            raise RuntimeError(data.get('error', '未知錯誤'))
        groups = data.get('groups', [])
        print('      Drive 上共 %d 個回合' % len(groups))
        for g in groups:
            print('        ・%s：%d 張' % (g['name'], len(g.get('files', []))))
    except Exception as e:
        print('❌ 連不到 Drive：%s' % e)
        print('   （網路不通，或 Apps Script 網址不對／沒設成「所有人」可存取）')
        print('   這次只會重新整理本機已經有的圖。')
        groups = []
    print('')

# ---------- 下載新的圖 ----------
try:
    對照 = json.load(open(MAP_FILE, encoding='utf-8'))
except Exception:
    對照 = {}

def 縮圖(path):
    """手機原圖動輒 3～5MB，縮一下省空間也讓現場載得快。用 macOS 內建的 sips。"""
    if not SIPS:
        return
    try:
        if os.path.getsize(path) <= MAX_BYTES:
            return
        subprocess.run([SIPS, '-Z', str(MAX_PIXEL), path],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    except Exception:
        pass

新增 = 0
轉檔 = 0
失敗 = []
if groups:
    print('【2/4】下載新的圖⋯⋯')
    for g in groups:
        folder = g['name']
        os.makedirs(folder, exist_ok=True)
        本回合 = 對照.setdefault(folder, {})
        已用 = set(本回合.values())

        for f in g.get('files', []):
            name = f['name']
            if not ANY.search(name):
                continue

            # 這張之前收過了嗎？（用 Drive 的檔案 ID 認，不是用檔名）
            舊 = 本回合.get(f['id'])
            if 舊 and os.path.exists(os.path.join(folder, 舊)) and os.path.getsize(os.path.join(folder, 舊)) > 0:
                continue

            # heic / jfif 這類瀏覽器不一定看得懂的格式 → 轉成 jpg
            web = bool(IMG.search(name))
            base = re.sub(r'\.[^.]+$', '', name)
            ext = name[len(base):] if web else '.jpg'
            # 子資料夾（例如「雙人照」）的圖，檔名前面補上資料夾名，
            # 網頁就會把它當成一個類別
            if f.get('sub'):
                base = f['sub'] + ' ' + base

            # 不同人可能丟同名檔案，後來的不能蓋掉先來的
            檔名 = base + ext
            n = 2
            while 檔名 in 已用:
                檔名 = '%s-%d%s' % (base, n, ext)
                n += 1

            dest = os.path.join(folder, 檔名)
            urls = ([f['url']] if f.get('url') else []) + [
                'https://drive.google.com/uc?export=download&id=' + f['id'],
                'https://drive.google.com/thumbnail?id=%s&sz=w%d' % (f['id'], MAX_PIXEL)]
            ok = False
            for u in urls:
                try:
                    r = get(u)
                    blob = r.read()
                    if len(blob) < 1000 or not 是圖片(blob, r.headers.get('Content-Type', '')):
                        continue              # 抓到的不是圖，換下一個網址試
                    if web:
                        with open(dest, 'wb') as fh:
                            fh.write(blob)
                    else:
                        # heic 等格式：先存原檔，再用 sips 轉成瀏覽器看得懂的 jpg
                        tmp = dest + '.原檔'
                        with open(tmp, 'wb') as fh:
                            fh.write(blob)
                        轉好 = False
                        if SIPS:
                            轉好 = subprocess.run(
                                [SIPS, '-s', 'format', 'jpeg', '-Z', str(MAX_PIXEL), tmp, '--out', dest],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                            ).returncode == 0 and os.path.exists(dest)
                        if not 轉好:
                            # sips 也轉不動，就退回讓 Drive 幫忙轉（thumbnail 一律回傳 JPEG）
                            os.remove(tmp)
                            continue
                        os.remove(tmp)
                    ok = True
                    break
                except Exception:
                    continue

            if ok:
                縮圖(dest)
                本回合[f['id']] = 檔名
                已用.add(檔名)
                新增 += 1
                if not web:
                    轉檔 += 1
                    print('      ＋ %s／%s　(%s 已自動轉成 jpg)' % (folder, 檔名, name))
                elif 檔名 != name:
                    print('      ＋ %s／%s　(原檔名 %s 已有人用了，自動改名)' % (folder, 檔名, name))
                else:
                    print('      ＋ %s／%s' % (folder, 檔名))
            else:
                失敗.append('%s／%s' % (folder, name))

    with open(MAP_FILE, 'w', encoding='utf-8') as fh:
        json.dump(對照, fh, ensure_ascii=False, indent=1)

    if 新增 == 0 and not 失敗:
        print('      沒有新的圖，本機已經是最新的。')
    if 失敗:
        print('')
        print('      ⚠️ 這幾張抓不下來（現場還是會即時去 Drive 抓）：')
        for x in 失敗:
            print('         ・' + x)
    print('')

# ---------- 產生清單 ----------
print('【3/4】整理清單⋯⋯')
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
    for r in 回合:
        print('      第 %d 回合「%s」：%d 張' % (回合.index(r) + 1, r['名稱'], len(r['檔案'])))
else:
    print('      本機還沒有任何圖，網頁會用內建火柴人。')
print('')

open('.收圖結果', 'w').write('%d %d' % (len(回合), 總數))
PYEOF

[ $? -ne 0 ] && { echo "❌ 整理失敗，把這個畫面截圖給 Claude 看。"; exit 1; }

read ROUNDS TOTAL < .收圖結果 2>/dev/null
rm -f .收圖結果

# ---------- 上傳 ----------
cd .. || exit 1
git add action-poses >/dev/null 2>&1

if git diff --cached --quiet; then
  echo "【4/4】網站上已經是最新的了，不用上傳。"
  echo ""
  echo "✅ 收圖完成：${ROUNDS:-0} 個回合、共 ${TOTAL:-0} 張。"
  echo ""
  echo "（這個視窗可以直接關掉）"
  exit 0
fi

echo "【4/4】上傳到網站⋯⋯"
git commit -q -m "feat(action-draw): 收圖（${ROUNDS:-0} 個回合、${TOTAL:-0} 張）" || {
  echo "❌ 存檔失敗，把這個畫面截圖給 Claude 看。"; exit 1; }

if ! git push -q origin main 2>/dev/null; then
  echo ""
  echo "❌ 上傳失敗（可能沒網路，或網站上有別人的新變更）。"
  echo "   圖已經存到本機了，把這個畫面截圖給 Claude 看。"
  exit 1
fi

echo ""
echo "===================================="
echo " ✅ 收圖完成：${ROUNDS:-0} 個回合、共 ${TOTAL:-0} 張"
echo "===================================="
echo ""
echo "網站約 1 分鐘後生效："
echo "  https://allen365apple.github.io/jokes-on-me/action-draw.html"
echo ""
echo "打開後點下方「動作清單」可以核對每個回合收到幾張。"
echo "演出當天如果有人臨時丟新圖到 Drive，網頁開場時會自動補進來，"
echo "抓不到也沒關係，會用剛剛收好的這批照跑。"
echo ""
echo "（這個視窗可以直接關掉）"
