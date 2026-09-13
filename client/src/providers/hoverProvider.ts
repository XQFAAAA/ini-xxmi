import * as vscode from 'vscode';
import { parseCached } from '../parser/parser';
import { IniDocument, IniSection, KeyKind } from '../parser/types';
import { KEY_DOCS } from '../data/keys';
import { sectionDocs } from '../data/sections';
import { commandDoc } from '../data/commands';
import { FUNCTION_DOCS, RUNTIME_PARAMS } from '../data/functions';
import { DXGI_FORMATS } from '../data/formats';

/** 变量声明 / 语言关键字文档（悬停） */
const KEYWORD_DOCS: Record<string, string> = {
    global: '**global** — 全局变量作用域\n\n声明后可在任意命令列表 / section 中访问。',
    local: '**local** — 局部变量作用域\n\n仅在当前命令列表内有效（离开命令列表即失效）。',
    locked: '**locked** — 锁定变量\n\n声明后不可再赋值；再次赋值会被解析器忽略并告警。',
    persist: '**persist** — 持久化变量\n\n标记的全局变量会被自动保存到 `d3dx_user.ini`，在 INI 重载 / 下次启动时恢复。仅 `global` 作用域可用。',
    namespace: '**namespace** — 声明文件命名空间\n\n须位于文件开头、所有 section 之前；用于跨文件引用：`$\\命名空间\\变量`、`节\\命名空间\\键`、`run = CommandList\\命名空间\\名称`。',
};

/** 流控制关键字文档（悬停） */
const FLOW_DOCS: Record<string, string> = {
    if: '**if** — 条件分支\n\n表达式为真时执行以下命令，可配 `elif` / `else` / `endif`。',
    elif: '**elif** — 否则如果\n\n前一个 `if` / `elif` 为假且本表达式为真时执行。',
    else: '**else** — 否则\n\n所有前置条件为假时执行。',
    endif: '**endif** — 结束条件分支。',
};

/** KEY_DOCS 的大小写不敏感副本（INI key 匹配不区分大小写） */
const KEY_DOCS_LOWER: Record<string, string> = Object.fromEntries(
    Object.entries(KEY_DOCS).map(([k, v]) => [k.toLowerCase(), v]),
);

/** DXGI 格式 → 字节数（常见格式） */
const DXGI_BYTES: Record<string, number> = {
    R32G32B32A32_FLOAT: 16, R32G32B32A32_UINT: 16, R32G32B32A32_SINT: 16,
    R32G32B32_FLOAT: 12, R32G32B32_UINT: 12, R32G32B32_SINT: 12,
    R16G16B16A16_FLOAT: 8, R16G16B16A16_UNORM: 8, R16G16B16A16_UINT: 8, R16G16B16A16_SNORM: 8, R16G16B16A16_SINT: 8,
    R32G32_FLOAT: 8, R32G32_UINT: 8, R32G32_SINT: 8,
    R10G10B10A2_UNORM: 4, R11G11B10_FLOAT: 4, R8G8B8A8_UNORM: 4, R8G8B8A8_UNORM_SRGB: 4, R8G8B8A8_UINT: 4, R8G8B8A8_SNORM: 4, R8G8B8A8_SINT: 4,
    R16G16_FLOAT: 4, R16G16_UNORM: 4, R16G16_UINT: 4, R16G16_SNORM: 4, R16G16_SINT: 4,
    R32_FLOAT: 4, R32_UINT: 4, R32_SINT: 4,
    R8G8_UNORM: 2, R8G8_UINT: 2, R8G8_SNORM: 2, R8G8_SINT: 2,
    R16_FLOAT: 2, R16_UNORM: 2, R16_UINT: 2, R16_SNORM: 2, R16_SINT: 2,
    R8_UNORM: 1, R8_UINT: 1, R8_SNORM: 1, R8_SINT: 1,
    R9G9B9E5_SHAREDEXP: 4,
    D32_FLOAT_S8X24_UINT: 8, D32_FLOAT: 4, D24_UNORM_S8_UINT: 4, D16_UNORM: 2,
    B8G8R8A8_UNORM: 4, B8G8R8A8_UNORM_SRGB: 4,
};

const WORD_CHAR = /[A-Za-z0-9_.$\\-]/;

function wordAt(raw: string, ch: number): string {
    let start = ch;
    let end = ch;
    while (start > 0 && WORD_CHAR.test(raw[start - 1])) {
        start--;
    }
    while (end < raw.length && WORD_CHAR.test(raw[end])) {
        end++;
    }
    return raw.slice(start, end);
}

function posIn(r: { start: { line: number; ch: number }; end: { line: number; ch: number } }, pos: vscode.Position): boolean {
    if (pos.line < r.start.line || pos.line > r.end.line) {
        return false;
    }
    if (pos.line === r.start.line && pos.character < r.start.ch) {
        return false;
    }
    if (pos.line === r.end.line && pos.character > r.end.ch) {
        return false;
    }
    return true;
}

function sectionAt(doc: IniDocument, pos: vscode.Position): IniSection | undefined {
    return doc.sections.find((s) => pos.line >= s.start && pos.line < s.end);
}

/**
 * 提取光标处的完整引用 token（含 $/#/@ 前缀与 [..] 下标）：
 * 如 `PoolMergeStatus_0[*]`、`$PoolInstanceID[0]`、`#PoolInstanceID[22.11]`、`@PoolMergeStatus_0`。
 */
function refTokenAt(raw: string, ch: number): string {
    let start = ch;
    let end = ch;
    while (start > 0 && /[A-Za-z0-9_.$#@-]/.test(raw[start - 1])) {
        start--;
    }
    while (end < raw.length && (/[A-Za-z0-9_.$#@-]/.test(raw[end]) || raw[end] === '[' || raw[end] === ']')) {
        end++;
    }
    return raw.slice(start, end);
}

/** 从 token 提取池 / 资源 / 命令列表名（支持 $/#/@ 前缀与 [..] 下标；资源名可含 -） */
function poolResourceRefName(tok: string): string | undefined {
    const m = /^(?:[$#@])?(Pool[\w-]*|Resource[\w-]*|CommandList\w+)/i.exec(tok);
    return m ? m[1] : undefined;
}

/** 变量名归一化：去 `$` 前缀与命名空间前缀（`$\Ns\var` → `var`），保留变量大小写 */
function normalizeVarName(name: string): string {
    let n = name.trim();
    if (n.startsWith('$')) {
        n = n.slice(1);
    }
    const i = n.lastIndexOf('\\');
    return i >= 0 ? n.slice(i + 1) : n;
}

function variableHover(doc: IniDocument, name: string): vscode.MarkdownString | undefined {
    const want = normalizeVarName(name);
    for (const s of doc.sections) {
        for (const l of s.lines) {
            if (l.type === 'variable-decl' && normalizeVarName(l.name) === want) {
                const md = new vscode.MarkdownString();
                md.appendCodeblock(`[${s.name}] ${l.line + 1}`, 'ini');
                md.appendMarkdown(`**${l.scope}**${l.locked ? ' **locked**' : ''}${l.persist ? ' **persist**' : ''} 变量 \`${l.name}\``);
                if (l.initValue !== null) {
                    md.appendMarkdown(`\n\n初始值：\`${l.initValue}\``);
                }
                return md;
            }
        }
    }
    return undefined;
}

const KIND_NAMES: Record<string, string> = {
    'command-list': '命令列表',
    'resource': '资源 / 池',
    'config': '全局配置',
    'interaction': '键位 / 预设',
    'other': '其他',
};

/** section 头部 / 引用的悬停内容（类型标签 + 简洁说明） */
function sectionHoverMd(s: IniSection): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${s.name}** — ${KIND_NAMES[s.kind] ?? s.kind}`);
    const sdoc = sectionDocs(s.name);
    if (sdoc) {
        md.appendMarkdown(`\n\n${sdoc}`);
    }
    if (s.regexSub) {
        md.appendMarkdown(`\n\n（ShaderRegex ${s.regexSub} 子节）`);
    }
    return md;
}

/**
 * 悬停提示：section 类型文档 / 变量声明信息与关键字 / key 文档 / 表达式函数签名 / 运行时参数。
 */
export class IniHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        const text = document.getText();
        const doc = parseCached(text);
        const rawLine = text.split(/\r?\n/)[position.line] ?? '';
        const word = wordAt(rawLine, position.character);

        // 0. namespace = X（文件头声明，位于所有 section 之前）
        if (/^\s*namespace\s*=/i.test(rawLine) && word.toLowerCase() === 'namespace') {
            return new vscode.Hover(new vscode.MarkdownString(KEYWORD_DOCS.namespace));
        }

        // 1. section 名
        const section = sectionAt(doc, position);
        if (section && posIn(section.nameRange, position)) {
            return new vscode.Hover(sectionHoverMd(section));
        }

        // 2. 变量声明关键字：global / local / locked / persist（仅当所在行是变量声明）
        const kw = word.toLowerCase();
        if (KEYWORD_DOCS[kw] && /^(?:global|local|locked|persist)$/i.test(word)) {
            const curLine = section?.lines.find((l) => l.line === position.line);
            if (curLine?.type === 'variable-decl' || /^\s*(?:global|local)\b/i.test(rawLine)) {
                return new vscode.Hover(new vscode.MarkdownString(KEYWORD_DOCS[kw]));
            }
        }

        // 2.2 流控制关键字：if / elif / else / endif
        const flowDoc = FLOW_DOCS[kw];
        if (flowDoc) {
            const curLine = section?.lines.find((l) => l.line === position.line);
            if (curLine?.type === 'flow') {
                return new vscode.Hover(new vscode.MarkdownString(flowDoc));
            }
        }

        // 2.5 池 / 资源 / 命令列表引用（PoolX[*] / $PoolX[0] / #PoolX[..] / @PoolX / ResourceX / CommandListX）→ 其定义节
        const refName = poolResourceRefName(refTokenAt(rawLine, position.character)) ?? poolResourceRefName(word);
        if (refName) {
            const sec = doc.sections.find((x) => x.name.toLowerCase() === refName.toLowerCase());
            if (sec) {
                return new vscode.Hover(sectionHoverMd(sec));
            }
        }

        // 3. 变量
        if (word.startsWith('$')) {
            const vh = variableHover(doc, word);
            if (vh) {
                return new vscode.Hover(vh);
            }
            // 命名空间变量 / 赋值目标（$\Namespace\... = v 形式）
            const want = normalizeVarName(word);
            for (const s of doc.sections) {
                for (const l of s.lines) {
                    if (l.type === 'key-value' && normalizeVarName(l.key) === want) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${word}**\n\n当前值：\`${l.value}\``);
                        return new vscode.Hover(md);
                    }
                }
            }
        }

        // 4. key 文档 / store 命令说明
        if (section) {
            for (const l of section.lines) {
                if (l.type !== 'key-value') {
                    continue;
                }
                if (posIn(l.keyRange, position)) {
                    // 槽位绑定（vs-t0 / ps-cb3 / o0 / vb0 ...）
                    if (l.keyKind === KeyKind.Slot) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${l.key}** — 槽位绑定\n\n`);
                        md.appendMarkdown('将资源绑定到该管线槽位（t=纹理 u=UAV o=渲染目标 c=常量缓冲 s=采样器；vb/ib 为顶点/索引缓冲）');
                        return new vscode.Hover(md);
                    }
                    const docText = KEY_DOCS_LOWER[l.key.toLowerCase()];
                    if (docText) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${l.key}**\n\n${docText}`);
                        return new vscode.Hover(md);
                    }
                    // 命令（drawindexed / dispatch / commandlistN / CheckTextureOverride 等）
                    const cmdText = commandDoc(l.key);
                    if (cmdText) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${l.key}** — 命令\n\n${cmdText}`);
                        return new vscode.Hover(md);
                    }
                }
                if (/^store$/i.test(l.key) && posIn(l.valueRange, position)) {
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown('**store** — GPU→CPU 回读\n\n');
                    md.appendMarkdown('`store = $out, ResourceFoo, $offset`：从资源回读 32 位浮点值到变量（回读代价高，按需使用）');
                    return new vscode.Hover(md);
                }
                // 值内 run / ref·copy 目标
                if (posIn(l.valueRange, position)) {
                    if (/^run$/i.test(l.key)) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`运行命令列表 \`[${l.value.trim()}]\``);
                        return new vscode.Hover(md);
                    }
                    const ref = /^(?:ref|copy)\s+(Resource[\w-]*|Pool[\w-]*)/i.exec(l.value.trim());
                    if (ref) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`${/^ref/i.test(ref[0]) ? '引用' : '复制'}资源 \`[${ref[1]}]\``);
                        return new vscode.Hover(md);
                    }
                    // DXGI 格式
                    const fmt = DXGI_FORMATS.find((f) => f.toLowerCase() === word.toLowerCase());
                    if (fmt) {
                        const md = new vscode.MarkdownString();
                        const bytes = DXGI_BYTES[fmt.replace(/^DXGI_FORMAT_/i, '')];
                        md.appendMarkdown(`**${fmt}** — DXGI 格式${bytes ? `（每元素 ${bytes} 字节）` : ''}`);
                        return new vscode.Hover(md);
                    }
                    // 命令值说明（clear / draw* / dispatch 等）
                    const cmdVal = commandDoc(l.key);
                    if (cmdVal) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${l.key}** — 命令\n\n${cmdVal}`);
                        return new vscode.Hover(md);
                    }
                }
            }
        }

        // 5. 表达式函数
        const fn = FUNCTION_DOCS[word];
        if (fn) {
            const md = new vscode.MarkdownString();
            md.appendCodeblock(fn.signature, 'ini');
            md.appendMarkdown(fn.doc);
            return new vscode.Hover(md);
        }

        // 6. 运行时参数
        const rp = RUNTIME_PARAMS[word];
        if (rp) {
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**${word}** — 运行时参数\n\n${rp}`);
            return new vscode.Hover(md);
        }

        return undefined;
    }
}
