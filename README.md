# emvalue

一个“盒子”里装着 108 个风格迥异、可以真正操作的小网站。访客可以在主站里沉浸式打开它们（电脑 / 平板 / 手机三种框）、换上自己的店名试穿，再把喜欢的风格连同需求发给工作室。

- 英文主站：`site/index.html`；中文版：`site/zh/index.html`
- 业务范围：`site/services/index.html`；中文版：`site/zh/services/index.html`，源文案为 `src/services.json`
- 108 个 demo：`site/demos/NNN-slug/`（每个都是独立单文件网站，附 `meta.json` 说明实际用到的技术）
- 共享小工具：`site/demos/_kit/kit.js`（店名试穿、诚实的 demo 提示、独立访问时的角标）
- 内容源：`src/studio.json`（工作室信息）、`src/content.json`（主站中英文文案）、`src/demos.json`（108 个 demo 的目录与设计说明）
- demo 制作规范：`docs/demo-contract.md`

## 本地预览

```bash
python3 -m http.server 8080 -d site
# 浏览器打开 http://localhost:8080/  （中文版 http://localhost:8080/zh/）
```

macOS 上也可以直接双击 `preview.command`。

## 最常见的修改

| 想改什么 | 改哪里 | 然后 |
|---|---|---|
| 工作室名称、邮箱、电话、WhatsApp、微信、Instagram、ABN、正式域名 | `src/studio.json`（`null` 表示未提供，页面会隐藏或如实显示“待接通”） | `python3 tools/build.py` |
| 业务范围页中英文文案 | `src/services.json` | `python3 tools/build.py` |
| 主站中英文文案（服务、流程、FAQ、按钮文字） | `src/content.json` | `python3 tools/build.py` |
| demo 的名称、行业、风格标签 | `src/demos.json` | `python3 tools/build.py` |
| 某个 demo 的页面本身 | `site/demos/NNN-slug/index.html` | `node tools/qa.mjs --ids NNN`，再 `node tools/qa.mjs --ids NNN --thumbs --no-shots` 更新缩略图 |

配置了 `site_url`（例如 `https://example.com.au`）之后，构建会自动：取消 noindex，生成 canonical / hreflang / sitemap.xml / robots.txt。没有正式域名前，主站保持 `noindex`。所有 demo 永远是 `noindex`（它们是虚构商家）。

## 工具

```bash
python3 tools/build.py            # 生成中英主站，统计真实数据（demo 数、行业数、字体数、平均体积）
python3 tools/build.py --check    # 同上；有 demo 违反制作规范时返回 1
node tools/qa.mjs --all           # 用本机 Chrome 检查全部 demo：控制台错误、横向溢出、noindex、店名替换，并截图
node tools/qa.mjs --all --thumbs --sprite --no-shots   # 重新生成缩略图和首页“盒子”雪碧图
node tools/qa.mjs --pages index.html,zh/index.html --viewports 320x640,390x844,768x1024,1440x900
python3 tools/content_scan.py     # 诚实检查：假奖项、假评分、非虚构电话/邮箱、外链
sh tools/checkpoint.sh "<ids>" "<说明>"   # 质检 → 缩略图 → 重建 → git 提交 → 打包备份
```

只需要 Python 3.9+、Node 22+ 和 Google Chrome，不需要安装任何 npm 包。质检截图和报告写到 `evidence/`（不进版本库）。

## 在线预览

预览地址：https://ericcccccc777.github.io/demo-web/ （中文版在 `/zh/`），由 GitHub Pages 免费托管。

改好内容、运行 `python3 tools/build.py`，再把改动推送到 `main`。只要 `site/` 有变化，就会自动重新发布，大约一两分钟后生效。发布设置见 `.github/workflows/pages.yml`，进度可以在仓库的 Actions 页面查看。预览地址没有配置 `site_url`，所以保持 `noindex`，搜索引擎不会收录。

## 上线

纯静态网站，把 `site/` 整个文件夹上传到任意静态托管即可（Netlify / Cloudflare Pages / Vercel / GitHub Pages / 任何主机的网站根目录）。上线前：

1. 在 `src/studio.json` 填好工作室正式名称、接单邮箱等联系方式、ABN（如需显示）和 `site_url`，然后 `python3 tools/build.py`。
2. 在正式域名上检查一遍：HTTPS、页面标题、语言切换、需求单邮件是否真的能收到。

## 说明

盒子里的所有 demo 都是虚构商家的概念设计：名称、价格、评价和联系方式仅作示意（电话使用澳洲通讯管理局保留的虚构号段，邮箱使用 example.com）。
