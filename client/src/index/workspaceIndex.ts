import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseCached } from '../parser/parser';
import { IniDocument, SectionKind } from '../parser/types';

interface FileIndex {
    doc: IniDocument;
    namespace: string | null;
    sectionNames: Set<string>;
    commandListNames: Set<string>;
    resourceNames: Set<string>;
    variableNames: Set<string>;
}

/**
 * Workspace 符号表：扫描 workspace 内所有 ini 文件，
 * 提供跨文件的 section / 变量查询，供诊断消误报、跳转与补全使用。
 */
export class WorkspaceIndex implements vscode.Disposable {
    private readonly files = new Map<string, FileIndex>();
    private readonly disposables: vscode.Disposable[] = [];
    private ready: Promise<void> | undefined;

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((d) => {
                if (this.isTargetUri(d.uri)) {
                    this.indexDocument(d);
                }
            }),
            vscode.workspace.onDidOpenTextDocument((d) => {
                if (this.isTargetUri(d.uri)) {
                    this.indexDocument(d);
                }
            }),
            vscode.workspace.onDidCloseTextDocument((d) => this.files.delete(d.uri.toString())),
            vscode.workspace.onDidCreateFiles((e) => e.files.forEach((u) => this.indexUri(u))),
            vscode.workspace.onDidDeleteFiles((e) => e.files.forEach((u) => this.files.delete(u.toString()))),
            vscode.workspace.onDidRenameFiles((e) => e.files.forEach((f) => {
                this.files.delete(f.oldUri.toString());
                this.indexUri(f.newUri);
            })),
        );
    }

    async initialize(): Promise<void> {
        if (!this.ready) {
            this.ready = this.doInitialize();
        }
        return this.ready;
    }

    private async doInitialize(): Promise<void> {
        vscode.workspace.textDocuments.forEach((d) => {
            if (this.isTargetUri(d.uri)) {
                this.indexDocument(d);
            }
        });
        try {
            const files = await vscode.workspace.findFiles('**/*.ini', '**/{node_modules,.git,dist,out}/**', 10000);
            await Promise.all(files.map((u) => this.indexUri(u)));
        } catch {
            // 无 workspace 时忽略
        }
        this.refreshOpenDocuments();
    }

    /** 按磁盘目录递归扫描 .ini 进入索引（懒加载，按根目录缓存） */
    private readonly scannedRoots = new Map<string, Promise<void>>();
    ensureScanned(rootPath: string): Promise<void> {
        let p = this.scannedRoots.get(rootPath);
        if (!p) {
            p = this.doScanRoot(rootPath);
            this.scannedRoots.set(rootPath, p);
        }
        return p;
    }

    private async doScanRoot(rootPath: string): Promise<void> {
        const iniFiles: string[] = [];
        const walk = (dir: string): void => {
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }
            for (const e of entries) {
                if (e.name.startsWith('.')) {
                    continue;
                }
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    walk(full);
                } else if (e.name.toLowerCase().endsWith('.ini')) {
                    iniFiles.push(full);
                }
            }
        };
        walk(rootPath);
        await Promise.all(iniFiles.map((f) => this.indexUri(vscode.Uri.file(f))));
    }

    /** 确保所有已打开（含 workspace 外）的 .ini 文档已进入索引 */
    private refreshOpenDocuments(): void {
        for (const d of vscode.workspace.textDocuments) {
            if (this.isTargetUri(d.uri)) {
                this.indexDocument(d);
            }
        }
    }

    private isTargetUri(uri: vscode.Uri): boolean {
        return uri.path.toLowerCase().endsWith('.ini');
    }

    private indexUri(uri: vscode.Uri): Promise<void> {
        return Promise.resolve(vscode.workspace.fs.readFile(uri)).then(
            (data): void => {
                this.indexText(uri, Buffer.from(data).toString('utf8'));
            },
            (): void => {
                // 读取失败（如文件被删除）忽略
            },
        );
    }

    private indexText(uri: vscode.Uri, text: string): void {
        const doc = parseCached(text);
        const namespace = doc.namespace;
        const sectionNames = new Set<string>();
        const commandListNames = new Set<string>();
        const resourceNames = new Set<string>();
        const variableNames = new Set<string>();
        for (const s of doc.sections) {
            sectionNames.add(s.name.toLowerCase());
            if (s.kind === SectionKind.CommandList || s.regexSub) {
                commandListNames.add(s.name);
            }
            if (s.kind === SectionKind.Resource) {
                resourceNames.add(s.name);
            }
            for (const l of s.lines) {
                if (l.type === 'variable-decl') {
                    variableNames.add(l.name);
                } else if (l.type === 'key-value' && l.key.startsWith('$')) {
                    variableNames.add(l.key.trim());
                }
            }
        }
        this.files.set(uri.toString(), { doc, namespace, sectionNames, commandListNames, resourceNames, variableNames });
    }

    private indexDocument(d: vscode.TextDocument): void {
        this.indexText(d.uri, d.getText());
    }

    /** 其它文件定义的 section 名（小写） */
    getExternalSections(excludeUri: vscode.Uri): Set<string> {
        this.refreshOpenDocuments();
        const out = new Set<string>();
        const ex = excludeUri.toString();
        for (const [uri, f] of this.files) {
            if (uri !== ex) {
                f.sectionNames.forEach((n) => out.add(n));
            }
        }
        return out;
    }

    /** 其它文件定义的变量名 */
    getExternalVariables(excludeUri: vscode.Uri): Set<string> {
        this.refreshOpenDocuments();
        const out = new Set<string>();
        const ex = excludeUri.toString();
        for (const [uri, f] of this.files) {
            if (uri !== ex) {
                f.variableNames.forEach((n) => out.add(n));
            }
        }
        return out;
    }

    /** 其它文件定义的命令列表名 */
    getExternalCommandLists(excludeUri: vscode.Uri): string[] {
        const out: string[] = [];
        const ex = excludeUri.toString();
        for (const [uri, f] of this.files) {
            if (uri !== ex) {
                f.commandListNames.forEach((n) => out.push(n));
            }
        }
        return out;
    }

    /** 其它文件定义的资源 / 池名 */
    getExternalResources(excludeUri: vscode.Uri): string[] {
        const out: string[] = [];
        const ex = excludeUri.toString();
        for (const [uri, f] of this.files) {
            if (uri !== ex) {
                f.resourceNames.forEach((n) => out.push(n));
            }
        }
        return out;
    }

    /**
     * 按命名空间段筛选文件：优先匹配 `namespace` 键值包含该段的文件；
     * 无命中时回退到文件路径包含该段的（如 `AA\BB\WWMIv1.ini`）。
     */
    private nsTargets(seg: string): [string, FileIndex][] {
        const segNorm = seg.replace(/\\/g, '/');
        const nsHit: [string, FileIndex][] = [];
        const pathHit: [string, FileIndex][] = [];
        for (const [uri, f] of this.files) {
            const nsNorm = (f.namespace ?? '').replace(/\\/g, '/');
            const fsNorm = vscode.Uri.parse(uri).fsPath.replace(/\\/g, '/');
            if (nsNorm.includes(segNorm)) {
                nsHit.push([uri, f]);
            } else if (fsNorm.includes(segNorm)) {
                pathHit.push([uri, f]);
            }
        }
        return nsHit.length > 0 ? nsHit : pathHit;
    }

    /** 跨文件查找 section 定义位置；ns 非空时优先按命名空间、回退按路径匹配文件 */
    findSectionLocations(name: string, ns?: string): vscode.Location[] {
        this.refreshOpenDocuments();
        const lower = name.toLowerCase();
        const out: vscode.Location[] = [];
        const files = ns ? this.nsTargets(ns) : [...this.files];
        for (const [uri, f] of files) {
            const s = f.doc.sections.find((x) => x.name.toLowerCase() === lower);
            if (s) {
                out.push(new vscode.Location(vscode.Uri.parse(uri), new vscode.Range(s.start, 0, s.start, 0)));
            }
        }
        return out;
    }

    /** 单个文件中变量 `name` 的声明位置（优先 variable-decl，其次 key-value 赋值目标） */
    private varDeclsIn(uri: string, f: FileIndex, name: string): vscode.Location[] {
        const vd: vscode.Location[] = [];
        const kv: vscode.Location[] = [];
        for (const s of f.doc.sections) {
            for (const l of s.lines) {
                if (l.type === 'variable-decl' && l.name === name) {
                    vd.push(new vscode.Location(vscode.Uri.parse(uri), new vscode.Range(l.line, l.nameRange.start.ch, l.line, l.nameRange.end.ch)));
                } else if (l.type === 'key-value' && l.key.trim() === name) {
                    kv.push(new vscode.Location(vscode.Uri.parse(uri), new vscode.Range(l.line, l.keyRange.start.ch, l.line, l.keyRange.end.ch)));
                }
            }
        }
        return vd.length > 0 ? vd : kv;
    }

    /**
     * 命名空间变量 `$\AA\BB\CC\var` 的跨文件查找：
     * 目标文件按命名空间段筛选（namespace 键值优先，路径回退），
     * 先找同名 `$\AA\BB\CC\var` 声明，再找裸名 `$var` 声明。
     */
    findNamespacedVariable(name: string, seg: string, bareName: string): vscode.Location[] {
        this.refreshOpenDocuments();
        // 归一化：裸名统一带 $ 前缀（解析器变量名始终带 $，兼容调用方传与不传）
        if (!bareName.startsWith('$')) {
            bareName = '$' + bareName;
        }
        const targets = this.nsTargets(seg);
        for (const [uri, f] of targets) {
            const hits = this.varDeclsIn(uri, f, name);
            if (hits.length > 0) {
                return hits;
            }
        }
        for (const [uri, f] of targets) {
            const hits = this.varDeclsIn(uri, f, bareName);
            if (hits.length > 0) {
                return hits;
            }
        }
        return [];
    }

    /** 普通变量跨文件查找：仅匹配命名空间（namespace 键值）相同的文件 */
    findVariableInNamespace(name: string, currentNamespace: string | null): vscode.Location[] {
        this.refreshOpenDocuments();
        const out: vscode.Location[] = [];
        for (const [uri, f] of this.files) {
            if ((f.namespace ?? null) !== currentNamespace) {
                continue;
            }
            out.push(...this.varDeclsIn(uri, f, name));
        }
        return out;
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.files.clear();
    }
}
