# 接金币第一步实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 启动 Express 服务，在浏览器展示背景和篮子，并帮助用户理解 Canvas 绘图。

**Architecture:** Express 提供 public 静态文件。浏览器执行 game.js，使用 Canvas 2D 绘制固定坐标的场景；CSS 保持画布显示比例。

**Tech Stack:** Node.js、Express、原生 JavaScript、HTML、CSS、Canvas 2D。

**Spec:** ../specs/2026-10-08-catch-coins-design.md

## Global Constraints

- 默认端口 3000，可通过 PORT 配置。
- Canvas 内部坐标固定为 480 × 640；CSS 缩小显示时保持比例。
- 本次只完成静态游戏画面，不加入移动、金币、碰撞或排行榜。
- 无需图片素材。

## Review Focus

- 窄屏：画布不溢出，保持 3:4 比例。
- 端口被占用：终端提示原因，服务退出。
- 无 Canvas 2D 支持：页面显示可理解的提示。
- 静态资源地址：HTML、CSS 和 JavaScript 均能获取。
- 服务重启及刷新：画面一致，无状态依赖。

## Task 1: 可启动的静态游戏画面

**Files:** 创建 package.json、server.js、public/index.html、public/style.css、public/game.js、README.md、.gitignore。

**Interfaces:** npm start 启动服务；GET / 返回页面；GET /style.css 和 GET /game.js 返回静态资源。game.js 从 #game 获取 2D 上下文，通过 drawScene() 绘制背景、地面和篮子。

- [ ] 定位现有 npm CLI，并安装 Express，生成 package-lock.json；如果 npm 确实缺失，先报告环境问题。
- [ ] 创建 package.json、server.js 和 .gitignore；静态目录使用基于 server.js 的绝对路径，监听错误给出中文提示。
- [ ] 创建 HTML 和 CSS；设置画布 width=480、height=640，显示宽度不超过容器且高度自动。
- [ ] 创建 game.js；篮子包含 x、y、width、height、color 属性，居中放置；drawScene() 使用 fillRect 绘制背景、地面和篮子，无动画循环；无法获取上下文时显示提示。
- [ ] 编写 README：包含启动命令、文件阅读顺序、执行环境区别、坐标说明、fillRect(x, y, width, height) 和修改颜色及位置的练习。
- [ ] 对 server.js 和 game.js 执行 node --check；预期退出码 0。
- [ ] 启动服务，检查首页、CSS、JS 返回 200；请求不存在的文件应返回 404。
- [ ] 检查占用端口时的错误提示，并验证服务重启后页面仍可访问。
- [ ] 用浏览器检查画面、窄屏比例及刷新效果；检查 Canvas 不可用提示分支。如浏览器工具不可用，明确报告未完成视觉验证。
- [ ] 交付文件链接和简短教学说明，保留运行入口供用户练习。

本阶段是低影响的静态演示，以语法、HTTP 和浏览器检查验收，不添加重复实现逻辑的自动测试。不初始化 Git 或创建提交，当前目录尚无 Git 仓库。
