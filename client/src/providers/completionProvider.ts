import * as vscode from 'vscode';
import { parseCached } from '../parser/parser';
import { IniDocument, IniSection, SectionKind } from '../parser/types';
import { SECTION_TEMPLATES } from '../data/sections';
import { KEY_DOCS, SECTION_KEYS } from '../data/keys';
import { FUNCTION_DOCS, RUNTIME_PARAMS, RUNTIME_PARAM_NAMES } from '../data/functions';
import { DXGI_FORMATS, VALUE_ENUMS } from '../data/formats';
import { WorkspaceIndex } from '../index/workspaceIndex';

function collectVariables(doc: IniDocument): string[] {
    const set = new Set<string>();
    for (const s of doc.sections) {
        for (const l of s.lines) {
            if (l.type === 'variable-decl') {
                set.add(l.name);
            } else if (l.type === 'key-value' && l.key.startsWith('$')) {
                // $name 赋值目标 / 命名空间变量 $\Namespace\...
                set.add(l.key.trim());
            }
        }
    }
    return [...set];
}

function isRunnableSection(s: IniSection): boolean {
    return s.kind === SectionKind.CommandList || s.regexSub !== undefined;
}

/**
 * 智能补全：
 * - section 模板（输入 `[` 后）
 * - key 建议（按当前 section 类型）
 * - 值补全：枚举 / DXGI 格式 / run= 命令列表 / ref·copy 资源 / 表达式函数 / 运行时参数 / 变量
 */
export class IniCompletionItemProvider implements vscode.CompletionItemProvider {
    constructor(private readonly index?: WorkspaceIndex) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const text = document.getText();
        const doc = parseCached(text);
        const rawLine = text.split(/\r?\n/)[position.line] ?? '';
        const before = rawLine.slice(0, position.character);

        // 1. section 头：`[` 后未闭合
        const openBracket = before.lastIndexOf('[');
        if (openBracket >= 0 && !before.slice(openBracket).includes(']')) {
            return this.sectionCompletion(openBracket, position);
        }

        // 2. 值上下文：`=` 之后
        const eqIdx = before.lastIndexOf('=');
        if (eqIdx >= 0 && !before.slice(0, eqIdx).includes('[')) {
            const key = rawLine.slice(0, eqIdx).trim();
            const valPrefix = before.slice(eqIdx + 1).replace(/^\s+/, '');
            const curSection = doc.sections.find((s) => position.line >= s.start && position.line < s.end);
            const items = this.valueCompletion(doc, key, valPrefix, position, document.uri, curSection);
            if (items.length > 0) {
                return items;
            }
        }

        // 3. 变量 `$` 前缀
        const dollarIdx = before.lastIndexOf('$');
        if (dollarIdx >= 0 && /^\$[A-Za-z0-9_.]*$/.test(before.slice(dollarIdx))) {
            const vars = collectVariables(doc);
            const range = new vscode.Range(position.line, dollarIdx, position.line, position.character);
            return vars.map((v) => {
                const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
                item.range = range;
                return item;
            });
        }

        // 4. key 建议（当前 section 内）
        return this.keyCompletion(doc, position.line);
    }

    private sectionCompletion(openBracket: number, position: vscode.Position): vscode.CompletionItem[] {
        return SECTION_TEMPLATES.map((t) => {
            const item = new vscode.CompletionItem(`[${t.label}]`, vscode.CompletionItemKind.Snippet);
            item.detail = t.detail;
            item.documentation = new vscode.MarkdownString(t.body.join('\n'));
            item.insertText = new vscode.SnippetString(t.body.join('\n'));
            item.range = new vscode.Range(position.line, openBracket + 1, position.line, position.character);
            return item;
        });
    }

    private keyCompletion(doc: IniDocument, line: number): vscode.CompletionItem[] {
        const section = doc.sections.find((s) => line >= s.start && line < s.end);
        // 无 section 时仅提供文件级键（IniHandler.cpp：节外的 condition / namespace）
        const keys = section ? SECTION_KEYS[section.kind] ?? [] : ['condition', 'namespace'];
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();
        for (const k of keys) {
            if (seen.has(k)) {
                continue;
            }
            seen.add(k);
            const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Property);
            item.documentation = KEY_DOCS[k] ? new vscode.MarkdownString(KEY_DOCS[k]) : undefined;
            items.push(item);
        }
        for (const v of collectVariables(doc)) {
            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
            item.detail = '变量赋值';
            items.push(item);
        }
        return items;
    }

    private valueCompletion(doc: IniDocument, key: string, prefix: string, position: vscode.Position, uri: vscode.Uri, section?: IniSection): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        const range = new vscode.Range(position.line, position.character - prefix.length, position.line, position.character);

        // store = $out, Resource, $offset —— 按参数位补全
        if (/^store$/i.test(key.trim())) {
            const argIndex = prefix.split(',').length - 1;
            if (argIndex <= 0) {
                for (const v of collectVariables(doc)) {
                    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
                    item.detail = '输出变量';
                    item.range = range;
                    items.push(item);
                }
            } else if (argIndex === 1) {
                for (const s of doc.sections) {
                    if (s.kind === SectionKind.Resource) {
                        const item = new vscode.CompletionItem(s.name, vscode.CompletionItemKind.Reference);
                        item.detail = '资源目标';
                        item.range = range;
                        items.push(item);
                    }
                }
            } else {
                for (const name of Object.keys(FUNCTION_DOCS)) {
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
                    item.detail = FUNCTION_DOCS[name].signature;
                    item.range = range;
                    items.push(item);
                }
                for (const name of RUNTIME_PARAM_NAMES) {
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
                    item.range = range;
                    items.push(item);
                }
                for (const v of collectVariables(doc)) {
                    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
                    item.range = range;
                    items.push(item);
                }
            }
            return items;
        }

        // 绘制命令特殊值：from_caller / auto（仅第一个参数位，CommandList.cpp ParseDrawCommand）
        const drawKey = key.trim().toLowerCase();
        if (/^draw(?:indexed(?:instanced)?)?$/.test(drawKey) && !prefix.includes(',')) {
            const specials = drawKey === 'draw' ? ['from_caller', 'auto'] : ['auto'];
            for (const s of specials) {
                const item = new vscode.CompletionItem(s, vscode.CompletionItemKind.Keyword);
                item.detail = drawKey === 'draw' && s === 'from_caller' ? '重放宿主本次绘制调用' : '数量取自当前绑定的 ib/vb';
                item.range = range;
                items.push(item);
            }
            return items;
        }

        // run = 命令列表
        if (/^run$/i.test(key.trim())) {
            for (const s of doc.sections) {
                if (isRunnableSection(s)) {
                    const item = new vscode.CompletionItem(s.name, vscode.CompletionItemKind.Reference);
                    item.detail = `[${s.name}] 命令列表`;
                    item.range = range;
                    items.push(item);
                }
            }
            const builtins = [
                'BuiltInCommandListUnbindAllRenderTargets',
                'BuiltInCustomShaderEnableScissorClipping',
                'BuiltInCustomShaderDisableScissorClipping',
            ];
            for (const b of builtins) {
                const item = new vscode.CompletionItem(b, vscode.CompletionItemKind.Reference);
                item.detail = '内置命令列表';
                item.range = range;
                items.push(item);
            }
            for (const name of this.index?.getExternalCommandLists(uri) ?? []) {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
                item.detail = `[${name}] 命令列表（其它文件）`;
                item.range = range;
                items.push(item);
            }
            return items;
        }

        // ref / copy 资源
        if (/(?:ref|copy)\s+$/.test(prefix)) {
            for (const s of doc.sections) {
                if (s.kind === SectionKind.Resource) {
                    const item = new vscode.CompletionItem(s.name, vscode.CompletionItemKind.Reference);
                    item.detail = `[${s.name}] 资源`;
                    item.range = range;
                    items.push(item);
                }
            }
            for (const name of this.index?.getExternalResources(uri) ?? []) {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
                item.detail = `[${name}] 资源（其它文件）`;
                item.range = range;
                items.push(item);
            }
            return items;
        }

        // 枚举 / 格式
        // type 键按节区分：[Key*] → hold/toggle/cycle，[Resource*]/[Pool*] → 资源类型（XXMI CustomResourceTypeNames）
        if (/^type$/i.test(key.trim()) && section) {
            const values = section.kind === SectionKind.Interaction
                ? ['activate', 'hold', 'toggle', 'cycle']
                : ['Buffer', 'StructuredBuffer', 'AppendStructuredBuffer', 'ConsumeStructuredBuffer', 'ByteAddressBuffer', 'Texture1D', 'Texture2D', 'Texture3D', 'TextureCube', 'RWBuffer', 'RWStructuredBuffer', 'RWByteAddressBuffer', 'RWTexture1D', 'RWTexture2D', 'RWTexture3D'];
            for (const v of values) {
                const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
                item.range = range;
                items.push(item);
            }
            return items;
        }
        const enums = VALUE_ENUMS[key.trim().toLowerCase()];
        if (enums) {
            for (const e of enums) {
                const item = new vscode.CompletionItem(e, vscode.CompletionItemKind.EnumMember);
                item.range = range;
                items.push(item);
            }
            return items;
        }
        if (/^format$/i.test(key.trim())) {
            for (const f of DXGI_FORMATS) {
                const item = new vscode.CompletionItem(f, vscode.CompletionItemKind.EnumMember);
                item.range = range;
                items.push(item);
            }
            return items;
        }

        // 表达式元素：函数 / 运行时参数 / 变量
        for (const name of Object.keys(FUNCTION_DOCS)) {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
            item.detail = FUNCTION_DOCS[name].signature;
            item.documentation = new vscode.MarkdownString(FUNCTION_DOCS[name].doc);
            item.range = range;
            items.push(item);
        }
        for (const name of RUNTIME_PARAM_NAMES) {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
            item.documentation = new vscode.MarkdownString(RUNTIME_PARAMS[name]);
            item.range = range;
            items.push(item);
        }
        for (const v of collectVariables(doc)) {
            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
            item.range = range;
            items.push(item);
        }
        return items;
    }
}
