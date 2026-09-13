import * as vscode from 'vscode';
import { parseCached } from '../parser/parser';

/**
 * 折叠：
 * 1. 每个 section 从 header 折叠到 body 末尾；
 * 2. 命令列表内的 if ... endif 块折叠。
 */
export class IniFoldingRangeProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        const doc = parseCached(document.getText());
        const ranges: vscode.FoldingRange[] = [];

        for (const s of doc.sections) {
            const end = s.end - 1;
            if (end > s.start) {
                ranges.push(new vscode.FoldingRange(s.start, end, vscode.FoldingRangeKind.Region));
            }
        }

        for (const s of doc.sections) {
            const stack: number[] = [];
            for (const l of s.lines) {
                if (l.type !== 'flow') {
                    continue;
                }
                if (l.keyword === 'if') {
                    stack.push(l.line);
                } else if (l.keyword === 'endif' && stack.length > 0) {
                    const ifLine = stack.pop()!;
                    if (l.line > ifLine + 1) {
                        ranges.push(new vscode.FoldingRange(ifLine, l.line, vscode.FoldingRangeKind.Region));
                    }
                }
            }
        }
        return ranges;
    }
}
