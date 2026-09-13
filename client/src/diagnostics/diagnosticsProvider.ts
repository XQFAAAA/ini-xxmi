import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { analyze, IniDiagnostic, Severity } from '../parser/analyzer';
import { parseCached } from '../parser/parser';
import { Rng, SectionKind } from '../parser/types';
import { WorkspaceIndex } from '../index/workspaceIndex';

function toVscodeRange(r: Rng): vscode.Range {
    return new vscode.Range(r.start.line, r.start.ch, r.end.line, r.end.ch);
}

function toSeverity(s: Severity): vscode.DiagnosticSeverity {
    switch (s) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'warning':
            return vscode.DiagnosticSeverity.Warning;
        default:
            return vscode.DiagnosticSeverity.Information;
    }
}

/**
 * 诊断收集：监听文档打开/修改/关闭，将分析结果推送到 Problems 面板。
 */
export class IniDiagnosticsProvider {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly debounce = new Map<string, NodeJS.Timeout>();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly index: WorkspaceIndex,
    ) {
        this.collection = vscode.languages.createDiagnosticCollection('ini-xxmi');
        this.context.subscriptions.push(this.collection);
    }

    register(): void {
        this.context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((d) => this.onDocument(d)),
            vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e.document)),
            vscode.workspace.onDidCloseTextDocument((d) => {
                const key = d.uri.toString();
                const t = this.debounce.get(key);
                if (t) {
                    clearTimeout(t);
                    this.debounce.delete(key);
                }
                this.collection.delete(d.uri);
            }),
        );
        vscode.workspace.textDocuments.forEach((d) => this.onDocument(d));
    }

    private isTarget(d: vscode.TextDocument): boolean {
        return d.languageId === 'ini-xxmi' && !d.isClosed;
    }

    private onDocument(d: vscode.TextDocument): void {
        if (!this.isTarget(d)) {
            return;
        }
        this.update(d);
    }

    private onChange(d: vscode.TextDocument): void {
        if (!this.isTarget(d)) {
            return;
        }
        const key = d.uri.toString();
        const t = this.debounce.get(key);
        if (t) {
            clearTimeout(t);
        }
        this.debounce.set(key, setTimeout(() => {
            this.debounce.delete(key);
            this.update(d);
        }, 300));
    }

    private update(d: vscode.TextDocument): void {
        const config = vscode.workspace.getConfiguration('iniXxmi');
        if (!config.get('diagnostics.enabled', true)) {
            this.collection.delete(d.uri);
            return;
        }
        const max = config.get('diagnostics.maxProblems', 500);
        let findings: IniDiagnostic[];
        try {
            findings = analyze(d.getText(), {
                checkUnknownReferences: config.get('diagnostics.checkUnknownReferences', true),
                checkUndeclaredVariables: config.get('diagnostics.checkUndeclaredVariables', true),
                checkRegexSyntax: config.get('diagnostics.checkRegexSyntax', true),
                checkExpressionSyntax: config.get('diagnostics.checkExpressionSyntax', true),
                externalSections: this.index.getExternalSections(d.uri),
                externalVariables: this.index.getExternalVariables(d.uri),
            });
        } catch {
            // 单个文件分析失败不应抛出到事件监听器；清空该文件诊断
            this.collection.delete(d.uri);
            return;
        }
        const diags: vscode.Diagnostic[] = findings.slice(0, max).map((p: IniDiagnostic) => {
            const dg = new vscode.Diagnostic(toVscodeRange(p.range), p.message, toSeverity(p.severity));
            dg.code = p.code;
            dg.source = 'ini-xxmi';
            return dg;
        });

        // [Resource*] 节 filename 指向磁盘文件的存在性
        if (config.get('diagnostics.checkFileExists', true)) {
            const doc = parseCached(d.getText());
            for (const s of doc.sections) {
                if (s.kind !== SectionKind.Resource || /^pool/i.test(s.name)) {
                    continue;
                }
                for (const l of s.lines) {
                    if (l.type !== 'key-value' || !/^filename$/i.test(l.key)) {
                        continue;
                    }
                    const rel = l.value.trim().replace(/["']/g, '');
                    if (!rel) {
                        continue;
                    }
                    const abs = path.resolve(path.dirname(d.uri.fsPath), rel);
                    if (!fs.existsSync(abs)) {
                        const dg = new vscode.Diagnostic(toVscodeRange(l.valueRange), `找不到文件 "${rel}"`, vscode.DiagnosticSeverity.Warning);
                        dg.code = 'filename-not-found';
                        dg.source = 'ini-xxmi';
                        diags.push(dg);
                    }
                }
            }
        }

        this.collection.set(d.uri, diags);
    }
}
