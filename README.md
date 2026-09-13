# XXMI INI Language Support

为 **3DMigoto / XXMI** 扩展 INI 语言提供语法高亮、智能感知、校验与格式化的 VS Code 扩展。适用于编写 XXMI 模组的 `*.ini` 配置文件与 3DMigoto 的 `d3dx.ini`。

## 功能

### 语法高亮
基于 TextMate 语法，区分节名、键、`IniParams` 寄存器（`$x`…`$w`）、运行时内置变量（`FRAME_NUMBER`、`res_width` 等）、DXGI 格式与虚拟键枚举值、正则 / 字符串、条件与命令。

### 大纲与折叠
以 `[Section]` 为单位生成文档大纲（Document Symbols），并支持按节折叠。

### 诊断（Problems 面板）
- `run` / `ref` / `copy` 引用了本文件未定义的 CommandList 或 Resource
- 变量未声明即使用
- `[ShaderRegex]` `.Pattern` 内容的基础 PCRE2 语法检查（括号配对、字符类、未知转义）
- 表达式语法检查（括号 / 字符串配对、运算符操作数、未知函数调用）
- `[Resource*]` 的 `filename` 指向的文件是否存在

### 智能补全
- 节名模板（输入 `[` 触发）
- 当前节可用的键（输入 `=` 触发，带文档说明）
- 运行时内置变量与函数（输入 `$` 触发）
- DXGI 格式、虚拟键等枚举值
- 本文件内的 Resource / CommandList / 变量引用

### 悬停提示
键、内置变量、节引用等的说明与定义摘要。

### 跳转定义 / 查找引用
`run = CommandList`、`ref/copy = Resource`、变量等可跳转到本文件内的定义处（`F12`），并支持查找引用（`Shift+F12`）。

### 文档格式化
Shift+Alt+F 格式化整个文档：
- `if / else / endif` 命令体缩进
- 顶层键值对等号对齐（可选）
- 去除行尾空白
- 缩进宽度可配置

### 颜色自定义
`iniXxmi.color.key` / `iniXxmi.color.iniParam` / `iniXxmi.color.parameter` 三类颜色可配置。修改后运行命令 **XXMI INI: 应用颜色设置**，将颜色规则写入用户 `settings.json` 的 `editor.tokenColorCustomizations.textMateRules`，可在其中继续微调。

### 代码片段
`TextureOverride`、`ShaderOverride`、`CustomShader`、`Resource`、`Pool`（ring / fifo）、`CommandList`、`Key`、`Preset`、`ShaderRegex`、`if / else / endif`、`run`、`store`、`ref / copy`、`global`（含 `locked` / `persist`）等。

## 语言关联

扩展会接管所有 `.ini` 文件以及 `d3dx.ini`、`d3dx_user.ini`。若某些 `.ini` 不想使用本扩展，可在 `settings.json` 中覆盖：

```jsonc
"files.associations": {
  "**/other/*.ini": "plaintext"
}
```

## 扩展设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `iniXxmi.diagnostics.enabled` | `true` | 启用诊断 |
| `iniXxmi.diagnostics.maxProblems` | `500` | 每个文件最多报告的问题数 |
| `iniXxmi.diagnostics.checkUnknownReferences` | `true` | 检查 run / ref / copy 的未知引用 |
| `iniXxmi.diagnostics.checkUndeclaredVariables` | `true` | 检查未声明变量 |
| `iniXxmi.diagnostics.checkRegexSyntax` | `true` | ShaderRegex 正则基础校验 |
| `iniXxmi.diagnostics.checkExpressionSyntax` | `true` | 表达式语法校验 |
| `iniXxmi.diagnostics.checkFileExists` | `true` | 检查 Resource 文件是否存在 |
| `iniXxmi.format.indentFlowControl` | `true` | if/else/endif 命令体缩进 |
| `iniXxmi.format.alignEquals` | `false` | 节内等号对齐 |
| `iniXxmi.format.trimTrailingWhitespace` | `true` | 去除行尾空白 |
| `iniXxmi.format.indentSize` | `4` | 缩进宽度（空格数） |
| `iniXxmi.color.key` | `#e06c75` | 键颜色 |
| `iniXxmi.color.iniParam` | `#e06c75` | IniParams 寄存器颜色 |
| `iniXxmi.color.parameter` | `#3FB950` | 内置变量颜色 |

## 安装

- 扩展市场发布后：在 VS Code 扩展面板搜索 **XXMI INI**
- 本地 VSIX：`npm run package` 生成 `.vsix`，在扩展面板右上角 `…` 菜单选择 **从 VSIX 安装**

## 开发

```bash
npm ci
npm run lint            # 类型检查
npm test                # 语法高亮快照测试
npm run test:parser     # 解析器测试
npm run test:diagnostics # 诊断测试
npm run test:format     # 格式化测试
npm run package         # 打包 .vsix
```

在 VS Code 中按 `F5` 启动 Extension Development Host 进行调试。

## License

[MIT](./LICENSE)
