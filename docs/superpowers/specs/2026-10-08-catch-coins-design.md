# 接金币：第一步设计

目标：通过一个可以运行的最小项目，学习 Node.js 服务与浏览器游戏代码的分工。用户已有 Node.js 接口开发经验，没有游戏开发经验。

本次只完成静态游戏画面：浏览器显示标题、简短说明，以及 480 × 640 的 Canvas 游戏区域。画布内绘制背景、地面和底部居中的篮子。篮子使用简单图形绘制，无需图片素材。暂不加入移动、金币、碰撞或排行榜，这些按学习路线逐步加入。

## 文件结构

- package.json：提供 npm start 命令，依赖 Express。
- server.js：启动 Express，提供 public 目录，默认端口 3000，可通过 PORT 配置。
- public/index.html：页面结构和 Canvas 元素。
- public/style.css：页面布局及画布显示尺寸。
- public/game.js：获得 Canvas 2D 上下文，绘制背景和篮子。
- README.md：启动步骤、浏览器与服务端的分工、代码阅读顺序和小练习。
- .gitignore：排除 node_modules。

## 运行与数据流

执行 npm start 后，打开 http://localhost:3000。浏览器向 Express 获取 HTML、CSS 和 JavaScript；浏览器运行 game.js 并绘制画面。服务器本阶段只发送文件，不处理游戏规则。

Canvas 内部坐标固定为 480 × 640；CSS 缩小显示时保持比例。原点在左上角，x 向右增加，y 向下增加。

## 错误处理与验收

启动失败应给出可理解的终端提示。无法获得 Canvas 2D 上下文时显示页面提示。

验收：服务能启动；首页及 CSS、JavaScript 均返回成功；JavaScript 语法检查通过；浏览器显示背景和篮子；小屏幕下画布保持比例。

## 教学安排

解释服务端和浏览器的执行位置、Canvas 坐标和 fillRect 的四个参数。练习：修改篮子颜色和位置，刷新页面观察结果。第二步再加入键盘移动。

## 当前环境

项目目录为空，Node.js 版本为 v24.19.0，终端尚未找到 npm。实施时先定位现有 npm；如确实缺失，说明环境限制并给出解决步骤。
