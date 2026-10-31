#!/usr/bin/env python3
"""从 index.html 重新生成 浪浪山单文件版.html（图片全部内嵌，发文件即玩）。

做法：复用旧单文件版里的 IMG base64 映射；把新版 index.html 里所有
`cards/xxx.jpg` 引用替换成 `${IMG[...]}`，再注入 IMG 映射。
"""
import base64
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(HERE, "index.html")
OLD = os.path.join(HERE, "浪浪山单文件版.html")
OUT = os.path.join(HERE, "浪浪山单文件版.html")

old = open(OLD, encoding="utf-8").read()
i = old.find("const IMG=")
if i < 0:
    sys.exit("旧单文件版里找不到 IMG 映射")
k = old.find("};", i)
img_map_src = old[i:k + 2]  # const IMG={...};
nums = re.findall(r'"(\d+)"\s*:', img_map_src)
print(f"旧 IMG 映射含 {len(nums)} 张图")

# 补齐可能缺失的卡图（直接从 cards/ 目录编码）
have = set(nums)
missing = [n for n in (f"{x:03d}" for x in range(1, 81)) if n not in have and os.path.exists(os.path.join(HERE, "cards", f"{n}.jpg"))]
if missing:
    print(f"补编码 {len(missing)} 张: {missing}")
    extra = ",".join(f'"{n}": "data:image/jpeg;base64,{base64.b64encode(open(os.path.join(HERE,"cards",n+".jpg"),"rb").read()).decode()}"' for n in missing)
    img_map_src = img_map_src[:-2] + "," + extra + "}"

s = open(IDX, encoding="utf-8").read()

# 1) JS 模板里的动态引用 cards/${expr}.jpg -> ${IMG[expr]}
s, n_dyn = re.subn(r'cards/\$\{([^}]+)\}\.jpg', r'${IMG[\1]}', s)

# 2) 静态 <img src="cards/001.jpg">（标题页装饰）-> 内嵌 data URI
m = re.search(r'const IMG=\{"(\d+)":', img_map_src)
first_num = m.group(1)
uri_first = re.search(r'"%s":\s*"([^"]+)"' % first_num, img_map_src).group(1)
s, n_art = re.subn(r'src="cards/%s\.jpg"' % first_num, 'src="%s"' % uri_first, s)

# 其余静态引用（如有）直接报错提醒
left = re.findall(r'src="cards/(\d+)\.jpg"', s)
if left:
    sys.exit(f"还有未处理的静态卡图引用: {left}")

# 3) 注入 IMG 映射（放在 const CARDS 之前）
s = s.replace("const CARDS=[", img_map_src + "\nconst CARDS=[", 1)

# 4) 云服务 SDK 由外链内联（单文件版发给别人时也能联机）
sdk_path = os.path.join(HERE, "wb-cloud.js")
if os.path.exists(sdk_path) and '<script src="wb-cloud.js"></script>' in s:
    sdk = open(sdk_path, encoding="utf-8").read()
    s = s.replace('<script src="wb-cloud.js"></script>', "<script>\n" + sdk + "\n</script>", 1)
    print("已内联云服务 SDK")

open(OUT, "w", encoding="utf-8").write(s)
size_mb = os.path.getsize(OUT) / 1048576
print(f"动态引用替换 {n_dyn} 处，标题图替换 {n_art} 处")
print(f"已生成 {OUT} ({size_mb:.1f} MB)")
