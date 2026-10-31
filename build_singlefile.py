#!/usr/bin/env python3
"""从 index.html 重新生成 浪浪山单文件版.html（图片全部内嵌，发文件即玩）。

做法：从 cards/ 重新生成 IMG base64 映射，将源码中的动态图片引用
替换为 `${IMG[...]}`，再内联脚本与静态资源。
"""
import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
IDX = os.path.join(HERE, "index.html")
OUT = os.path.join(HERE, "浪浪山单文件版.html")

cards_dir = os.path.join(HERE, "cards")
files = sorted(f for f in os.listdir(cards_dir) if re.fullmatch(r"\d{3}\.jpg", f))
if not files:
    sys.exit("cards/ 中找不到卡牌图片")
images = {}
for filename in files:
    with open(os.path.join(cards_dir, filename), "rb") as image_file:
        images[filename[:3]] = "data:image/jpeg;base64," + base64.b64encode(image_file.read()).decode("ascii")
img_map_src = "const IMG=" + json.dumps(images, separators=(",", ":")) + ";"
print(f"已编码 {len(images)} 张卡图")

s = open(IDX, encoding="utf-8").read()

# 先内联脚本，再统一替换脚本和模板中的图片引用。
for filename in ("wb-cloud.js", "game-rules-v3.js", "game-save-v3.js", "game-engine-v3.js", "game-arena-v3.js", "game-arena-ui-v3.js", "game-solo-ui-v3.js"):
    tag = f'<script src="{filename}"></script>'
    if tag not in s:
        continue
    script_path = os.path.join(HERE, filename)
    if not os.path.exists(script_path):
        sys.exit(f"缺少 {filename}，无法生成单文件版")
    with open(script_path, encoding="utf-8") as script_file:
        s = s.replace(tag, "<script>\n" + script_file.read() + "\n</script>", 1)
    print(f"已内联 {filename}")

# 1) JS 模板里的动态引用 cards/${expr}.jpg -> ${IMG[expr]}
s, n_dyn = re.subn(r'cards/\$\{([^}]+)\}\.jpg', r'${IMG[\1]}', s)

# 2) 静态 <img src="cards/001.jpg">（标题页装饰）-> 内嵌 data URI
first_num = next(iter(images))
uri_first = images[first_num]
s, n_art = re.subn(r'src="cards/%s\.jpg"' % first_num, 'src="%s"' % uri_first, s)

# 其余静态引用（如有）直接报错提醒
left = re.findall(r'src="cards/(\d+)\.jpg"', s)
if left:
    sys.exit(f"还有未处理的静态卡图引用: {left}")

# 3) 注入 IMG 映射（放在 const CARDS 之前）
s = s.replace("const CARDS=[", img_map_src + "\nconst CARDS=[", 1)

open(OUT, "w", encoding="utf-8").write(s)
size_mb = os.path.getsize(OUT) / 1048576
print(f"动态引用替换 {n_dyn} 处，标题图替换 {n_art} 处")
print(f"已生成 {OUT} ({size_mb:.1f} MB)")
