import { parseCached } from './parser';
import { IniSection } from './types';

export interface FormatOptions {
    /** 命令列表内 if/else/endif 块内容缩进（if/else/endif 本身顶格） */
    indentFlowControl?: boolean;
    /** 节内顶层键值 `=` 对齐 */
    alignEquals?: boolean;
    /** 移除行尾空白 */
    trimTrailing?: boolean;
    /** 每级缩进空格数 */
    indentSize?: number;
}

type LineKind =
    | 'section'
    | 'kv'
    | 'var'
    | 'flow'
    | 'regex'
    | 'comment'
    | 'blank'
    | 'bare';

/**
 * 纯函数格式化器（不依赖 vscode，便于测试）。
 * 规则：
 * - section 头、if/else/endif 顶格；
 * - flow 块内内容按嵌套深度缩进；
 * - 键值统一为 `key = value`；
 * - 可选等号对齐（仅节内顶层）；
 * - ShaderRegex 子节、注释、空白行内容保持不动（仅可选去尾空格）。
 */
export function formatText(text: string, opts: FormatOptions = {}): string {
    const o: Required<FormatOptions> = {
        indentFlowControl: opts.indentFlowControl ?? true,
        alignEquals: opts.alignEquals ?? false,
        trimTrailing: opts.trimTrailing ?? true,
        indentSize: opts.indentSize ?? 4,
    };

    const lines = text.split(/\r?\n/);
    const doc = parseCached(text);
    const kind = new Map<number, LineKind>();
    const flowKw = new Map<number, 'if' | 'elif' | 'else' | 'endif'>();

    for (const s of doc.sections) {
        kind.set(s.start, 'section');
        for (const l of s.lines) {
            switch (l.type) {
                case 'key-value':
                    kind.set(l.line, 'kv');
                    break;
                case 'variable-decl':
                    kind.set(l.line, 'var');
                    break;
                case 'flow':
                    kind.set(l.line, 'flow');
                    flowKw.set(l.line, l.keyword);
                    break;
                case 'regex-content':
                    kind.set(l.line, 'regex');
                    break;
                case 'comment':
                    kind.set(l.line, 'comment');
                    break;
                case 'blank':
                    kind.set(l.line, 'blank');
                    break;
                default:
                    kind.set(l.line, 'bare');
            }
        }
    }

    // 顶层键值等号对齐宽度（按节）
    const alignWidth = new Map<IniSection, number>();
    if (o.alignEquals) {
        for (const s of doc.sections) {
            let w = 0;
            let depth = 0;
            for (const l of s.lines) {
                if (l.type === 'flow') {
                    if (l.keyword === 'if') {
                        depth++;
                    } else if (l.keyword === 'endif') {
                        depth--;
                    }
                    continue;
                }
                if (l.type === 'key-value' && depth === 0 && !/^(?:post|pre)\s/i.test(l.key)) {
                    w = Math.max(w, l.key.length);
                }
            }
            alignWidth.set(s, w);
        }
    }

    const trimEnd = (s: string): string => (o.trimTrailing ? s.replace(/[ \t]+$/, '') : s);
    const out: string[] = [];
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const k = kind.get(i);

        if (k === 'section') {
            depth = 0; // 节边界重置 flow 深度
            out.push(trimEnd(raw.replace(/^\s+/, '')));
            continue;
        }

        if (k === 'flow') {
            const kw = flowKw.get(i);
            const indent = (d: number): string => (o.indentFlowControl ? ' '.repeat(d * o.indentSize) : '');
            const body = trimEnd(raw.replace(/^\s+/, ''));
            if (kw === 'if') {
                out.push(indent(depth) + body); // 进入前的外层深度
                depth++;
            } else if (kw === 'endif') {
                depth = Math.max(0, depth - 1);
                out.push(indent(depth) + body); // 与所属 if 同层
            } else {
                out.push(indent(Math.max(0, depth - 1)) + body); // else 与所属 if 同层
            }
            continue;
        }

        if (k === 'regex' || k === 'comment' || k === 'blank' || k === 'bare' || k === undefined) {
            out.push(trimEnd(raw));
            continue;
        }

        if (k === 'kv') {
            const eq = raw.indexOf('=');
            if (eq < 0) {
                out.push(trimEnd(raw));
                continue;
            }
            const keyRaw = raw.slice(0, eq).trim();
            const valueRaw = raw.slice(eq + 1).trim();
            const section = doc.sections.find((s) => i >= s.start && i < s.end);
            let key = keyRaw;
            if (o.alignEquals && depth === 0 && section && alignWidth.has(section) && !/^(?:post|pre)\s/i.test(keyRaw)) {
                key = keyRaw.padEnd(alignWidth.get(section)!);
            }
            const indent = o.indentFlowControl ? ' '.repeat(depth * o.indentSize) : '';
            out.push(indent + key + ' = ' + valueRaw);
            continue;
        }

        if (k === 'var') {
            const indent = o.indentFlowControl ? ' '.repeat(depth * o.indentSize) : '';
            out.push(indent + trimEnd(raw.replace(/^\s+/, '')));
            continue;
        }

        out.push(trimEnd(raw));
    }

    return out.join('\n');
}
