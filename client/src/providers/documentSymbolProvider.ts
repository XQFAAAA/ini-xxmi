import * as vscode from 'vscode';
import { parseCached } from '../parser/parser';
import { Rng, SectionKind } from '../parser/types';

function toVscodeRange(r: Rng): vscode.Range {
    return new vscode.Range(r.start.line, r.start.ch, r.end.line, r.end.ch);
}

function sectionDetail(section: { kind: SectionKind; regexSub?: string }): string {
    if (section.regexSub) {
        return `ShaderRegex ${section.regexSub} sub-section`;
    }
    return `section · ${section.kind}`;
}

/**
 * 节类型 → 符号种类：大纲中以不同图标区分各类节。
 * 大纲文本颜色无法按符号自定义，但图标颜色由主题的 symbolIcon.*Foreground
 * 决定，因此不同 SymbolKind 会显示不同图标颜色（可在 workbench.colorCustomizations
 * 中调整，如 symbolIcon.moduleForeground）。
 */
function sectionSymbolKind(kind: SectionKind): vscode.SymbolKind {
    switch (kind) {
        case SectionKind.CommandList:
            return vscode.SymbolKind.Module;
        case SectionKind.Resource:
            return vscode.SymbolKind.Field;
        case SectionKind.Config:
            return vscode.SymbolKind.Constant;
        case SectionKind.Interaction:
            return vscode.SymbolKind.Key;
        default:
            return vscode.SymbolKind.Namespace;
    }
}

/**
 * Outline：以 section 为顶级符号，key-value 与变量声明为子符号。
 */
export class IniDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const doc = parseCached(document.getText());
        const symbols: vscode.DocumentSymbol[] = [];

        for (const s of doc.sections) {
            const children: vscode.DocumentSymbol[] = [];
            for (const l of s.lines) {
                if (l.type === 'key-value') {
                    // range 需覆盖整个 key=value 行（selectionRange=key 必须包含在 range 内）
                    const kvRange = new vscode.Range(
                        l.keyRange.start.line, l.keyRange.start.ch,
                        l.valueRange.end.line, l.valueRange.end.ch,
                    );
                    children.push(new vscode.DocumentSymbol(
                        l.key,
                        l.value,
                        vscode.SymbolKind.Property,
                        kvRange,
                        toVscodeRange(l.keyRange),
                    ));
                } else if (l.type === 'variable-decl') {
                    const detail = `${l.scope}${l.locked ? ' · locked' : ''}${l.persist ? ' · persist' : ''}`;
                    children.push(new vscode.DocumentSymbol(
                        l.name,
                        detail,
                        vscode.SymbolKind.Variable,
                        toVscodeRange(l.nameRange),
                        toVscodeRange(l.nameRange),
                    ));
                }
            }
            const sectionRange = new vscode.Range(
                s.headerRange.start.line, 0,
                Math.max(s.end - 1, s.headerRange.start.line), Number.MAX_SAFE_INTEGER,
            );
            const symbol = new vscode.DocumentSymbol(
                s.name,
                sectionDetail(s),
                sectionSymbolKind(s.kind),
                sectionRange,
                toVscodeRange(s.headerRange),
            );
            symbol.children = children;
            symbols.push(symbol);
        }
        return symbols;
    }
}
