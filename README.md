# louwbc.github.io

个人主页与博客（Jekyll）+ 两个小工具：

- 番茄钟：`/apps/pomodoro/`
- 全球FM：`/apps/global-fm/`

## 写博客

在 `_posts/` 新增文章文件：

- 文件名：`YYYY-MM-DD-title.md`
- 文件头：front matter（`layout/title/date/tags/excerpt`）

## 本地预览

GitHub Pages 会自动构建 Jekyll。
本地如果只用静态服务器预览（如 `python -m http.server`），不会渲染 Jekyll 页面；要本地渲染需安装 Jekyll 并运行 `jekyll serve`。
