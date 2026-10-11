# X Harness 官网

官网 https://x-harness.gemigo.app/。静态文件发布 dist，公开 TypeScript 源码位于本仓库。HTML/CSS 与 TypeScript 复制和回执模式交互由本目录拥有；业务 API 与发布版本在 本仓库根目录。

`node apps/x-harness-site/build.mjs` 构建并类型检查；`gemigo deploy dist --config ./gemigo.app.json` 首次部署从本目录执行。之后更新已有项目，禁止用首次部署重复创建。

发布与验证事实记录：docs/work/2026-10-11-x-harness-release/verification.md。
