import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseCached } from '../parser/parser';
import { IniDocument, IniLine, IniSection } from '../parser/types';
import { WorkspaceIndex } from '../index/workspaceIndex';

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

/** 在当前文件按作用域查找变量声明（local → global） */
function findVarDeclByScope(doc: IniDocument, name: string, scope: 'local' | 'global'): IniLine & { type: 'variable-decl' } | undefined {
    for (const s of doc.sections) {
        const found = s.lines.find((l) => l.type === 'variable-decl' && l.name === name && l.scope === scope);
        if (found) {
            return found as IniLine & { type: 'variable-decl' };
        }
    }
    return undefined;
}

/**
 * 变量定义查找顺序（3dmigoto 作用域语义）：
 * 1. 当前文件 local $a；
 * 2. 当前文件 global $a；
 * 3. 相同命名空间的跨文件 local / global（由调用方通过 index 处理）。
 */
function variableDefinition(uri: vscode.Uri, doc: IniDocument, name: string): vscode.Location | undefined {
    const found = findVarDeclByScope(doc, name, 'local') ?? findVarDeclByScope(doc, name, 'global');
    if (found) {
        return new vscode.Location(uri, new vscode.Range(found.nameRange.start.line, found.nameRange.start.ch, found.nameRange.end.line, found.nameRange.end.ch));
    }
    return undefined;
}

function sectionLocation(uri: vscode.Uri, doc: IniDocument, name: string): vscode.Location | undefined {
    const s = doc.sections.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!s) {
        return undefined;
    }
    return new vscode.Location(uri, new vscode.Range(s.start, 0, s.start, 0));
}

/**
 * 从当前文档路径向上推导 XXMI 根目录（同时含 Mods / Core 子目录），
 * 找不到返回 null。
 */
function deriveModRoot(filePath: string): string | null {
    let dir = path.dirname(filePath);
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'Mods')) && fs.existsSync(path.join(dir, 'Core'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return null;
}

/**
 * 跳转到定义：
 * - $var → 变量声明行；
 * - run = X / ref·copy X / 值中的 Resource·Pool → 对应 section 头；
 * - include / include_recursive 的文件路径 → 目标文件。
 */
export class IniDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private readonly index?: WorkspaceIndex) {}

    async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Location | vscode.Location[] | undefined> {
        const text = document.getText();
        const doc = parseCached(text);
        const rawLine = text.split(/\r?\n/)[position.line] ?? '';
        const word = wordAt(rawLine, position.character);
        const cur = doc.sections.find((s) => position.line >= s.start && position.line < s.end);

        if (word.startsWith('$')) {
            // 当前行 key 是否为命名空间变量 $\NS\var（如 $\WWMIv1\required_wwmi_version = $x）
            const lineEq = rawLine.indexOf('=');
            const lineKey = lineEq > 0 ? rawLine.slice(0, lineEq).trim() : '';
            const curLine = cur?.lines.find((l): l is IniLine & { type: 'key-value' } => l.type === 'key-value' && l.line === position.line);
            const inKeyRange = curLine ? posIn(curLine.keyRange, position) : false;

            if (/^\$\\[^=]+$/.test(lineKey) && inKeyRange) {
                // 光标在命名空间变量 key 上：跳命名空间侧（先 namespace → 路径，未命中回退本文件裸名声明）
                const seg = lineKey.slice(2, lineKey.lastIndexOf('\\'));
                const bare = '$' + lineKey.slice(lineKey.lastIndexOf('\\') + 1);
                const ext = await this.nsVariable(document, lineKey, seg, bare);
                if (ext && ext.length > 0) {
                    return ext;
                }
                return variableDefinition(document.uri, doc, bare);
            }

            const vd = variableDefinition(document.uri, doc, word);
            if (vd) {
                return vd;
            }
            if (word.includes('\\')) {
                // 命名空间变量 $\AA\BB\CC\var：在命名空间/路径含 AA\BB\CC 的文件中找同名或裸名声明
                const seg = word.slice(2, word.lastIndexOf('\\'));
                const bare = '$' + word.slice(word.lastIndexOf('\\') + 1);
                const ext = await this.nsVariable(document, word, seg, bare);
                if (ext && ext.length > 0) {
                    return ext;
                }
                return variableDefinition(document.uri, doc, bare);
            }
            // 普通变量：跨文件仅匹配相同命名空间（namespace 键值）
            const ext = this.index?.findVariableInNamespace(word, doc.namespace);
            if (ext && ext.length > 0) {
                return ext;
            }
            // 池 / 资源变量：$PoolFoo / $ResourceFoo（元素访问 $PoolFoo[...]）→ 其定义节
            const poolVar = /^\$(Pool\w+)/i.exec(word)?.[1];
            if (poolVar) {
                const loc = sectionLocation(document.uri, doc, poolVar);
                if (loc) {
                    return loc;
                }
                const poolExt = this.index?.findSectionLocations(poolVar);
                if (poolExt && poolExt.length > 0) {
                    return poolExt;
                }
                return undefined;
            }
            return undefined;
        }

        const section = doc.sections.find((s) => posIn(s.headerRange, position));
        if (section) {
            return undefined;
        }

        if (!cur) {
            return undefined;
        }

        for (const l of cur.lines) {
            if (l.type !== 'key-value') {
                continue;
            }

            const k = l.key.trim();
            const inKey = posIn(l.keyRange, position);
            const inValue = posIn(l.valueRange, position);

            // ---- 带命名空间的行：整行（key 或 value）一律按命名空间查找，不跳本文件同名 ----
            // 命名空间变量  $\NS\var
            const nsVar = /^\$\\[^=]+$/.exec(k);
            // 命名空间资源 / 命令列表键  Type\NS\Name（Type 可为 Resource / CommandList / CustomShader 等）
            const nsKey = /^(\w+)\\(.+?)\\([^\\]+)$/i.exec(k);
            if (nsVar && inKey) {
                // 光标在命名空间变量 key 上：跳命名空间侧（未命中回退本文件裸名声明）
                const seg = k.slice(2, k.lastIndexOf('\\'));
                const bare = '$' + k.slice(k.lastIndexOf('\\') + 1);
                const ext = await this.nsVariable(document, k, seg, bare);
                if (ext && ext.length > 0) {
                    return ext;
                }
                return variableDefinition(document.uri, doc, bare);
            }
            if (nsKey && inKey) {
                // Resource\NS\Name 等类型键（光标在 key 上）：跳命名空间侧；
                // 光标在 value 上则由下方 ref/copy 分支跳本文件资源节
                return this.nsSection(document, nsKey![1] + nsKey![3], nsKey![2]);
            }

            // 光标在 key 上：普通 key（不带命名空间）
            if (inKey) {
                // 池元素访问 PoolFoo[...] / 资源 / 命令列表键 → 跳其定义节（资源名可含 -）
                const poolKey = /^(Pool\w+)\[/i.exec(k);
                const refKey = poolKey ? poolKey[1] : /^(Resource[\w-]*|CommandList\w+)$/i.exec(k)?.[1];
                if (refKey) {
                    const loc = sectionLocation(document.uri, doc, refKey);
                    if (loc) {
                        return loc;
                    }
                    const ext = this.index?.findSectionLocations(refKey);
                    if (ext && ext.length > 0) {
                        return ext;
                    }
                    return undefined;
                }
                continue;
            }

            if (!inValue) {
                continue;
            }

            if (/^run$/i.test(l.key)) {
                // 命名空间命令列表  run = Type\NS\Name（Type 可为 CommandList / CustomShader 等），
                // 目标节 = Type + Name，在 NS 命名空间侧查找
                const nsrun = /^(\w+)\\(.+?)\\([^\\]+)$/i.exec(l.value.trim());
                if (nsrun) {
                    return this.nsSection(document, nsrun[1] + nsrun[3], nsrun[2]);
                }
                return this.sectionCrossFile(document.uri, doc, l.value.trim());
            }
            const ref = /^(?:ref|copy)\s+(Resource[\w-]*|Pool[\w-]*)/i.exec(l.value.trim());
            if (ref) {
                const loc = sectionLocation(document.uri, doc, ref[1]);
                if (loc) {
                    return loc;
                }
                const ext = this.index?.findSectionLocations(ref[1]);
                if (ext && ext.length > 0) {
                    return ext;
                }
                return undefined;
            }
            for (const m of l.value.matchAll(/\b(Resource[\w-]*|Pool[\w-]*)\b/g)) {
                const loc = sectionLocation(document.uri, doc, m[1]);
                if (loc) {
                    return loc;
                }
                const ext = this.index?.findSectionLocations(m[1]);
                if (ext && ext.length > 0) {
                    return ext;
                }
            }
        }

        // include 文件跳转
        for (const l of cur.lines) {
            if (l.type === 'key-value' && /^include(?:$|_recursive$)/i.test(l.key) && posIn(l.valueRange, position)) {
                return this.includeLocation(document, l.value.trim());
            }
        }
        return undefined;
    }

    /** 本文件查找 section，未命中时跨文件（可选命名空间过滤） */
    private sectionCrossFile(uri: vscode.Uri, doc: IniDocument, sectionName: string, ns?: string): vscode.Location | vscode.Location[] | undefined {
        const loc = sectionLocation(uri, doc, sectionName);
        if (loc) {
            return loc;
        }
        const ext = this.index?.findSectionLocations(sectionName, ns);
        if (ext && ext.length > 0) {
            return ext;
        }
        return undefined;
    }

    /** 磁盘扫描兜底：从当前文档推导 XXMI 根并扫描 .ini 入索引 */
    private async ensureScanned(document: vscode.TextDocument): Promise<void> {
        if (!this.index) {
            return;
        }
        const root = deriveModRoot(document.uri.fsPath);
        if (root) {
            await this.index.ensureScanned(root);
        }
    }

    /** 命名空间 section：先查 index，未命中则扫描根后重查 */
    private async nsSection(document: vscode.TextDocument, sectionName: string, ns: string): Promise<vscode.Location[] | undefined> {
        let hit = this.index?.findSectionLocations(sectionName, ns);
        if (hit && hit.length > 0) {
            return hit;
        }
        await this.ensureScanned(document);
        hit = this.index?.findSectionLocations(sectionName, ns);
        return hit && hit.length > 0 ? hit : undefined;
    }

    /** 命名空间变量：先查 index，未命中则扫描根后重查 */
    private async nsVariable(document: vscode.TextDocument, name: string, seg: string, bare: string): Promise<vscode.Location[] | undefined> {
        let hit = this.index?.findNamespacedVariable(name, seg, bare);
        if (hit && hit.length > 0) {
            return hit;
        }
        await this.ensureScanned(document);
        hit = this.index?.findNamespacedVariable(name, seg, bare);
        return hit && hit.length > 0 ? hit : undefined;
    }

    private includeLocation(document: vscode.TextDocument, target: string): vscode.Location | undefined {
        const raw = target.replace(/["']/g, '');
        if (!raw || raw.includes('*')) {
            return undefined;
        }
        const abs = path.isAbsolute(raw)
            ? raw
            : path.join(path.dirname(document.uri.fsPath), raw);
        return new vscode.Location(vscode.Uri.file(abs), new vscode.Position(0, 0));
    }
}
