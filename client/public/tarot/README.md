# 塔罗静态图源

牌面来自 Wikimedia Commons 的 Rider-Waite-Smith tarot deck (TaionWC)，原作 Pamela Colman Smith，1909/1910 年。

每张图片的来源页、原始文件 URL 及本次核对的 Public domain 标记保存在 sources.json。下载脚本逐张核对标记，只接受 upload.wikimedia.org 的 JPEG；没有使用现代重绘版或设计稿截图。资源运行时全部由本项目静态提供。

目录：https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC)

back.svg 为本项目原创书页与星盘纹样。中文正逆位简短牌义为本项目原创，数据事实源为 shared/tarot/deck.json；修改后运行 node scripts/sync-tarot-deck.mjs 同步两包数据。

paper-grain.svg 为本项目编写的 SVG 程序纸纹，使用 feTurbulence 生成，不使用设计稿截图或外部纹理。牌桌角花、枝叶与空状态线稿也由页面内 SVG 绘制。
