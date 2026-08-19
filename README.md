# Termcloak

[![CI](https://github.com/SamCheng0717/termcloak/actions/workflows/ci.yml/badge.svg)](https://github.com/SamCheng0717/termcloak/actions/workflows/ci.yml)

一个本地优先、纯终端运行的 TXT 阅读器。正文显示在通用 AI 编程会话界面中，包含固定底部输入框、运行状态动画、斜杠命令和一键工作遮罩。

Termcloak 不调用 Claude、Codex 或其他 AI 服务，不覆盖它们的命令，也不是任何 AI 厂商的官方产品。状态、耗时和 token 数只属于本地界面动画。

## 直接运行

需要 Node.js 20 或更高版本。

```bash
git clone https://github.com/SamCheng0717/termcloak.git
cd termcloak
npm start
```

读取自己的 TXT（自动识别 UTF-8、GBK 和 GB18030）：

```bash
node ./bin/termcloak.js /绝对路径/小说.txt
```

安装成本地命令：

```bash
npm link
termcloak /绝对路径/小说.txt
```

查看不进入交互模式的静态效果：

```bash
npm run preview
termcloak preview /绝对路径/小说.txt --width 90 --height 28 --no-color
```

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `j` / `Space` / `→` | 下一页 |
| `k` / `←` | 上一页 |
| `[` / `]` | 上一章 / 下一章 |
| `a` | 开关自动翻页 |
| `i` / `/` | 激活底部输入框 |
| `h` | 显示或隐藏帮助 |
| `Esc` | 切换工作遮罩 |
| `q` / `Ctrl+C` | 保存进度并退出 |

输入框支持 `/next`、`/prev`、`/next-chapter`、`/prev-chapter`、`/auto`、`/cover`、`/help`、`/btw <note>` 和 `/quit`。中文命令同样可用。

搜索、章节和书签命令包括：

```text
/chapters
/jump <章节序号或标题>
/goto <0-100%>
/back
/search <关键词>
/search-next
/search-prev
/bookmark <备注>
/bookmarks
/bookmark-open <序号>
/bookmark-delete <序号>
```

输入命令时可以使用 `↑` / `↓` 查看历史，按 `Tab` 补全命令。`termcloak books` 显示本机阅读记录，`termcloak doctor` 输出不包含正文的终端诊断信息。编码识别不正确时可使用 `--encoding utf-8|gbk|gb18030` 覆盖。

底部运行态会逐帧播放 spinner，动态显示模拟耗时、模拟 token 数和轮播 Tip。使用 `--reduced-motion` 可以关闭逐帧动画，`NO_COLOR=1` 或 `--no-color` 可以关闭颜色。

阅读进度默认保存在 `~/.termcloak/progress.json`；使用 `--no-save` 可以禁用进度读写。进度按照书籍内容指纹识别，移动文件后仍可继续阅读。

程序默认不联网、不遥测，只读取用户指定的本地 TXT。正文中的 ANSI、OSC 和危险终端控制字符会在渲染前清除。请仅使用自己有权阅读的内容。

## 验证

```bash
npm test
npm run check
```

项目从当前 Alpha 走向公开稳定版的完整任务、评分标准和发布门槛见：[从 Alpha 到 10 分产品：执行与验收方案](./docs/ROADMAP_TO_10.md)。

## 兼容性和故障处理

当前自动测试覆盖 Node.js 20/22/24，并配置了 macOS、Ubuntu 和 Windows CI。发布前仍以 CI 真实结果和兼容矩阵为准，不把“配置了测试”当成“已经在所有终端验收”。

- 文字乱码：尝试 `--encoding gbk` 或 `--encoding gb18030`。
- 终端不支持颜色：使用 `--no-color` 或设置 `NO_COLOR=1`。
- 动画影响低速 SSH/tmux：使用 `--reduced-motion`。
- 窗口太小：至少调整到 49 列 × 21 行。
- 上次异常退出后终端仍不正常：执行 `reset`；同时请提交终端名称和 `termcloak doctor` 输出，不要提交小说正文。
- Windows 方向键异常：优先在最新版 Windows Terminal 和 PowerShell 中复现，并附 Node.js 版本。

卸载全局命令：

```bash
npm uninstall -g termcloak
```

删除本地阅读历史：

```bash
rm -r ~/.termcloak
```
