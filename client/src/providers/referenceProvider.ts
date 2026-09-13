import * as vscode from 'vscode';
import { parseCached } from '../parser/parser';
import { IniDocument } from '../parser/types';

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

function loc(uri: vscode.Uri, line: number, startCh: number, endCh: number): vscode.Location {
    return new vscode.Location(uri, new vscode.Range(line, startCh, line, endCh));
}

function collectVariableReferences(uri: vscode.Uri, doc: IniDocument, name: string): vscode.Location[] {
    const refs: vscode.Location[] = [];
    for (const s of doc.sections) {
        for (const l of s.lines) {
            if (l.type === 'variable-decl') {
                if (l.name === name) {
                    refs.push(loc(uri, l.line, l.nameRange.start.ch, l.nameRange.end.ch));
                }
                if (l.initValue && l.initRange) {
                    for (const m of l.initValue.matchAll(/\$[A-Za-z_][A-Za-z0-9_.]*/g)) {
                        if (m[0] === name) {
                            refs.push(loc(uri, l.line, l.initRange.start.ch + m.index, l.initRange.start.ch + m.index + m[0].length));
                        }
                    }
                }
            } else if (l.type === 'key-value') {
                if (l.keyKind === 'variable' && l.key === name) {
                    refs.push(loc(uri, l.line, l.keyRange.start.ch, l.keyRange.end.ch));
                }
                for (const m of l.value.matchAll(/\$[A-Za-z_][A-Za-z0-9_.]*/g)) {
                    if (m[0] === name) {
                        refs.push(loc(uri, l.line, l.valueRange.start.ch + m.index, l.valueRange.start.ch + m.index + m[0].length));
                    }
                }
            }
        }
    }
    return refs;
}

function collectSectionReferences(uri: vscode.Uri, doc: IniDocument, name: string): vscode.Location[] {
    const refs: vscode.Location[] = [];
    const s = doc.sections.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!s) {
        return refs;
    }
    refs.push(loc(uri, s.start, 0, s.name.length + 2)); // section 头自身
    for (const sec of doc.sections) {
        for (const l of sec.lines) {
            if (l.type !== 'key-value') {
                continue;
            }
            // key 中的池 / 资源引用（PoolFoo[...] / ResourceFoo，资源名可含 -）
            for (const m of l.key.matchAll(/\b(Resource[\w-]*|Pool[\w-]*)\b/g)) {
                if (m[1].toLowerCase() === name.toLowerCase()) {
                    refs.push(loc(uri, l.line, l.keyRange.start.ch + m.index, l.keyRange.start.ch + m.index + m[0].length));
                }
            }
            // value 中的池 / 资源引用
            for (const m of l.value.matchAll(/\b(Resource[\w-]*|Pool[\w-]*|\w+)\b/g)) {
                if (m[1].toLowerCase() === name.toLowerCase()) {
                    refs.push(loc(uri, l.line, l.valueRange.start.ch + m.index, l.valueRange.start.ch + m.index + m[0].length));
                }
            }
        }
    }
    return refs;
}

/**
 * 查找引用：
 * - 变量：声明 + 全部使用处；
 * - section 名：run / ref / copy / 值中出现处（含自身定义头）。
 */
export class IniReferenceProvider implements vscode.ReferenceProvider {
    provideReferences(document: vscode.TextDocument, position: vscode.Position): vscode.Location[] | undefined {
        const text = document.getText();
        const doc = parseCached(text);
        const rawLine = text.split(/\r?\n/)[position.line] ?? '';
        const word = wordAt(rawLine, position.character);
        if (!word) {
            return [];
        }
        if (word.startsWith('$')) {
            return collectVariableReferences(document.uri, doc, word);
        }
        return collectSectionReferences(document.uri, doc, word);
    }
}
