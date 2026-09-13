import * as vscode from 'vscode';
import { formatText } from '../parser/format';

/**
 * 文档格式化：flow 缩进 + 行尾空格清理 + 可选等号对齐。
 * 配置：iniXxmi.format.*
 */
export class IniFormattingProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const config = vscode.workspace.getConfiguration('iniXxmi');
        const newText = formatText(document.getText(), {
            indentFlowControl: config.get('format.indentFlowControl', true),
            alignEquals: config.get('format.alignEquals', false),
            trimTrailing: config.get('format.trimTrailingWhitespace', true),
            indentSize: config.get('format.indentSize', 4),
        });
        if (newText === document.getText()) {
            return [];
        }
        const full = new vscode.Range(0, 0, document.lineCount, 0);
        return [vscode.TextEdit.replace(full, newText)];
    }
}
