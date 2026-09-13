import {
    IniDocument,
    IniLine,
    IniSection,
    KeyKind,
    Pos,
    Rng,
} from './types';
import { classifySection, regexSubSection } from './sectionKinds';

const SECTION_HEAD = /^\s*\[([^\]]*)\]\s*(;.*)?$/;
const VAR_DECL = /^\s*(global|local)(\s+locked)?(\s+persist)?\s+(\$[A-Za-z_][A-Za-z0-9_.]*|\$\\[^,\s=]+)(.*)$/;
const FLOW = /^\s*(if|elif|else(?:\s+if)?|endif)\b(.*)$/i;

function rng(line: number, startCh: number, endCh: number): Rng {
    return { start: { line, ch: startCh }, end: { line, ch: endCh } };
}

function classifyKey(key: string): KeyKind {
    const t = key.trim();
    if (/^(?:(?:vs|ps|hs|ds|gs|cs)-(?:t|u|o|c|s)[a-z]?\d+|vb\d+|ib\d*|o[0-7Dd]|u\d+)$/i.test(t)) {
        return KeyKind.Slot;
    }
    if (/^(?:(?:vs|ps|hs|ds|gs|cs)-[a-z]\d*|vb\d+)/i.test(t) && /->\s*Element(?:Format|Offset)/i.test(t)) {
        return KeyKind.InputLayout;
    }
    if (/^post\s+|^pre\s+/i.test(t)) {
        return KeyKind.Phase;
    }
    if (t.startsWith('$')) {
        return KeyKind.Variable;
    }
    if (/^Pool\w+\[[^\]]*\]/.test(t)) {
        return KeyKind.Pool;
    }
    if (/^Resource\w+$/.test(t)) {
        return KeyKind.Resource;
    }
    if (/^CommandList\w+$/.test(t)) {
        return KeyKind.CommandList;
    }
    return KeyKind.Plain;
}

/**
 * 手写 INI 解析器：逐行解析 XXMI / 3DMigoto INI。
 * 纯 TS，不依赖 vscode API。
 */
export function parse(text: string): IniDocument {
    const rawLines = text.split(/\r?\n/);
    const sections: IniSection[] = [];
    let current: IniSection | undefined;
    let namespace: string | null = null;

    const addLine = (l: IniLine) => {
        if (current) {
            current.lines.push(l);
        }
    };

    for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        const trimmed = raw.trim();

        if (trimmed === '') {
            addLine({ type: 'blank', line: i });
            continue;
        }

        // --- namespace = X（任意位置）---
        const nsMatch = /^\s*namespace\s*=\s*(\S.*)$/i.exec(raw);
        if (nsMatch) {
            namespace = nsMatch[1].trim();
        }

        // --- section header ---
        const sm = SECTION_HEAD.exec(raw);
        if (sm) {
            if (current) {
                current.end = i;
            }
            const name = sm[1].trim();
            const open = raw.indexOf('[');
            const close = raw.indexOf(']', open);
            const nameStart = open + 1;
            current = {
                name,
                kind: classifySection(name),
                regexSub: regexSubSection(name),
                start: i,
                end: rawLines.length,
                headerRange: rng(i, 0, raw.length),
                nameRange: rng(i, nameStart, close),
                lines: [],
            };
            sections.push(current);
            continue;
        }

        if (!current) {
            // 文件开头、未进入任何 section 的行
            addLine({ type: 'bare', line: i, text: trimmed, range: rng(i, 0, raw.length) });
            continue;
        }

        // --- ShaderRegex 子节内的原始内容行 ---
        if (current.regexSub) {
            if (trimmed.startsWith(';')) {
                addLine({ type: 'comment', line: i, text: trimmed, range: rng(i, 0, raw.length) });
            } else {
                addLine({ type: 'regex-content', line: i, text: trimmed, range: rng(i, 0, raw.length) });
            }
            continue;
        }

        if (trimmed.startsWith(';')) {
            addLine({ type: 'comment', line: i, text: trimmed, range: rng(i, 0, raw.length) });
            continue;
        }

        // --- flow control: if / elif / else if / else / endif ---
        const fm = FLOW.exec(raw);
        if (fm && /^(if|elif|else(?:\s+if)?|endif)$/i.test(fm[1])) {
            const kwRaw = fm[1].toLowerCase();
            const keyword = (kwRaw === 'else if' ? 'elif' : kwRaw) as 'if' | 'elif' | 'else' | 'endif';
            if ((keyword === 'if' || keyword === 'elif') && fm[2].trim() !== '') {
                const condStart = raw.indexOf(fm[2].trim(), 2);
                addLine({
                    type: 'flow',
                    line: i,
                    keyword,
                    condition: fm[2].trim(),
                    conditionRange: rng(i, condStart >= 0 ? condStart : raw.length, raw.length),
                });
            } else {
                addLine({ type: 'flow', line: i, keyword, condition: null, conditionRange: null });
            }
            continue;
        }

        // --- variable declaration: global/local [locked] [persist] $var [= expr] ---
        const vm = VAR_DECL.exec(raw);
        if (vm) {
            const scope = vm[1].toLowerCase() as 'global' | 'local';
            const locked = Boolean(vm[2]);
            const persist = Boolean(vm[3]);
            const name = vm[4];
            const nameStart = raw.indexOf(name);
            const rest = vm[5];
            const restTrim = rest.trim();
            let initValue: string | null = null;
            let initRange: Rng | null = null;
            if (restTrim.startsWith('=')) {
                initValue = restTrim.slice(1).trim();
                const eqPos = raw.indexOf('=', nameStart + name.length);
                const initStart = eqPos >= 0 ? eqPos + 1 : raw.length;
                initRange = rng(i, initStart, raw.length);
            }
            addLine({
                type: 'variable-decl',
                line: i,
                scope,
                locked,
                persist,
                name,
                nameRange: rng(i, nameStart, nameStart + name.length),
                initValue,
                initRange,
            });
            continue;
        }

        // --- key = value ---
        const eq = raw.indexOf('=');
        if (eq > 0) {
            const keyRaw = raw.slice(0, eq);
            const key = keyRaw.trim();
            const keyStart = keyRaw.length - keyRaw.trimStart().length;
            const valueRaw = raw.slice(eq + 1);
            const value = valueRaw.trim();
            const valueStart = eq + 1 + (valueRaw.length - valueRaw.trimStart().length);
            if (key !== '' && !key.startsWith('[')) {
                addLine({
                    type: 'key-value',
                    line: i,
                    key,
                    keyRange: rng(i, keyStart, keyStart + key.length),
                    value,
                    valueRange: rng(i, valueStart, raw.length),
                    keyKind: classifyKey(key),
                });
                continue;
            }
        }

        // --- bare line ---
        addLine({ type: 'bare', line: i, text: trimmed, range: rng(i, 0, raw.length) });
    }

    return { text, lineCount: rawLines.length, sections, namespace };
}

export function positionAt(text: string, offset: number): Pos {
    const before = text.slice(0, offset);
    const lines = before.split(/\r?\n/);
    return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

// ---- 解析缓存（跨 provider 共享同一文本的解析结果，避免重复全量解析） ----
let cachedText: string | undefined;
let cachedDoc: IniDocument | undefined;

export function parseCached(text: string): IniDocument {
    if (text !== cachedText || !cachedDoc) {
        cachedText = text;
        cachedDoc = parse(text);
    }
    return cachedDoc;
}
