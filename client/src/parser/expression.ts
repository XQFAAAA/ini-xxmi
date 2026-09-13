/**
 * 表达式分析器：对 INI 值 / 条件中的表达式做词法与基础语法校验。
 * 覆盖 XXMI 表达式语法：数字（十/十六/二进制）、字符串、$var、$\namespace 变量、
 * 函数调用、运算符（含位/移位/比较/逻辑）、括号、逗号。
 * 纯 TS、不依赖 vscode，供诊断与后续补全复用。
 */

export type ExprTokenType =
    | 'number'
    | 'string'
    | 'variable'
    | 'namespaced-var'
    | 'identifier'
    | 'operator'
    | 'lparen'
    | 'rparen'
    | 'comma';

export interface ExprToken {
    type: ExprTokenType;
    text: string;
    /** 相对表达式文本的偏移 */
    start: number;
    end: number;
}

export interface ExprIssue {
    offset: number;
    length: number;
    message: string;
    severity: 'error' | 'warning';
    code: string;
}

const THREE_CHAR_OPS = ['===', '!=='];

const TWO_CHAR_OPS = ['->', '<<', '>>', '==', '!=', '>=', '<=', '&&', '||', '**', '//'];

/** 可作为前缀的运算符（行首或 '(' ',' 后合法） */
const PREFIX_OPS = new Set(['-', '+', '!', '~', '@', '#', '>', '<']);

const SINGLE_CHAR = '+-*/%&|^~!@#<>=.';

export function tokenizeExpression(text: string): ExprToken[] {
    const tokens: ExprToken[] = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];

        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        // 字符串（含转义）
        if (ch === '"') {
            let j = i + 1;
            while (j < text.length) {
                if (text[j] === '\\') {
                    j += 2;
                    continue;
                }
                if (text[j] === '"') {
                    j++;
                    break;
                }
                j++;
            }
            tokens.push({ type: 'string', text: text.slice(i, j), start: i, end: j });
            i = j;
            continue;
        }

        // 数字
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
            let j = i;
            if (/^0[bB]/.test(text.slice(i))) {
                j = i + 2;
                while (/[01]/.test(text[j] ?? '')) {
                    j++;
                }
            } else if (/^0[xX]/.test(text.slice(i))) {
                j = i + 2;
                while (/[0-9a-fA-F]/.test(text[j] ?? '')) {
                    j++;
                }
            } else {
                while (/[0-9]/.test(text[j] ?? '')) {
                    j++;
                }
                if (text[j] === '.') {
                    j++;
                    while (/[0-9]/.test(text[j] ?? '')) {
                        j++;
                    }
                }
                if (/[eE]/.test(text[j] ?? '')) {
                    j++;
                    if (/[+-]/.test(text[j] ?? '')) {
                        j++;
                    }
                    while (/[0-9]/.test(text[j] ?? '')) {
                        j++;
                    }
                }
            }
            tokens.push({ type: 'number', text: text.slice(i, j), start: i, end: j });
            i = j;
            continue;
        }

        // 命名空间变量 $\Namespace\path\var
        if (ch === '$' && text[i + 1] === '\\') {
            let j = i + 1;
            while (j < text.length && !/[\s,]/.test(text[j]) && text[j] !== ')' && text[j] !== '(') {
                j++;
            }
            tokens.push({ type: 'namespaced-var', text: text.slice(i, j), start: i, end: j });
            i = j;
            continue;
        }

        // 变量 $name
        if (ch === '$') {
            let j = i + 1;
            while (/[A-Za-z0-9_.]/.test(text[j] ?? '')) {
                j++;
            }
            tokens.push({ type: 'variable', text: text.slice(i, j), start: i, end: j });
            i = j;
            continue;
        }

        // 标识符
        if (/[A-Za-z_]/.test(ch)) {
            let j = i;
            while (/[A-Za-z0-9_.]/.test(text[j] ?? '')) {
                j++;
            }
            tokens.push({ type: 'identifier', text: text.slice(i, j), start: i, end: j });
            i = j;
            continue;
        }

        // 三字符运算符（=== / !==，须在双字符之前匹配）
        const three = text.slice(i, i + 3);
        if (THREE_CHAR_OPS.includes(three)) {
            tokens.push({ type: 'operator', text: three, start: i, end: i + 3 });
            i += 3;
            continue;
        }

        // 双字符运算符
        const two = text.slice(i, i + 2);
        if (TWO_CHAR_OPS.includes(two)) {
            tokens.push({ type: 'operator', text: two, start: i, end: i + 2 });
            i += 2;
            continue;
        }

        if (ch === '(') {
            tokens.push({ type: 'lparen', text: ch, start: i, end: i + 1 });
            i++;
            continue;
        }
        if (ch === ')') {
            tokens.push({ type: 'rparen', text: ch, start: i, end: i + 1 });
            i++;
            continue;
        }
        if (ch === ',') {
            tokens.push({ type: 'comma', text: ch, start: i, end: i + 1 });
            i++;
            continue;
        }
        if (SINGLE_CHAR.includes(ch)) {
            tokens.push({ type: 'operator', text: ch, start: i, end: i + 1 });
            i++;
            continue;
        }

        // 未知字符（如池索引 [ ]）：作为 identifier 跳过
        tokens.push({ type: 'identifier', text: ch, start: i, end: i + 1 });
        i++;
    }
    return tokens;
}

/**
 * 基础语法校验。isKnownFunction 用于识别函数名（可选）。
 * 检查：括号配对、字符串闭合、运算符前后缺少操作数、未知函数调用。
 */
export function analyzeExpression(text: string, isKnownFunction?: (name: string) => boolean): ExprIssue[] {
    const issues: ExprIssue[] = [];
    const tokens = tokenizeExpression(text);

    // 括号配对
    let parens = 0;
    for (const t of tokens) {
        if (t.type === 'lparen') {
            parens++;
        } else if (t.type === 'rparen') {
            parens--;
            if (parens < 0) {
                issues.push({ offset: t.start, length: 1, message: `多余的 ')'`, severity: 'error', code: 'expr-parens' });
            }
        }
    }
    if (parens > 0) {
        issues.push({ offset: 0, length: 1, message: `括号未闭合：缺少 ${parens} 个 ')'`, severity: 'error', code: 'expr-parens' });
    }

    // 字符串未闭合
    for (const t of tokens) {
        if (t.type === 'string' && !t.text.endsWith('"')) {
            issues.push({ offset: t.start, length: t.text.length, message: '字符串未闭合', severity: 'error', code: 'expr-string' });
        }
    }

    // 运算符上下文
    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k];
        if (t.type !== 'operator') {
            continue;
        }
        const prev = k > 0 ? tokens[k - 1] : undefined;
        const next = k + 1 < tokens.length ? tokens[k + 1] : undefined;

        // 末尾运算符
        if (!next) {
            issues.push({ offset: t.start, length: t.text.length, message: `表达式以运算符 "${t.text}" 结尾，缺少操作数`, severity: 'error', code: 'expr-missing-operand' });
            continue;
        }
        // '(' / ',' / 行首后出现非前缀二元运算符
        const afterOpen = !prev || prev.type === 'lparen' || prev.type === 'comma' || prev.type === 'operator';
        if (afterOpen && !PREFIX_OPS.has(t.text)) {
            issues.push({ offset: t.start, length: t.text.length, message: `运算符 "${t.text}" 前缺少操作数`, severity: 'error', code: 'expr-missing-operand' });
            continue;
        }
        // 前缀运算符后紧接非前缀运算符（如 - * 2）
        if (PREFIX_OPS.has(t.text) && next.type === 'operator' && !PREFIX_OPS.has(next.text)) {
            issues.push({ offset: next.start, length: next.text.length, message: `运算符 "${next.text}" 前缺少操作数`, severity: 'error', code: 'expr-missing-operand' });
        }
    }

    // 未知函数调用：identifier 紧跟 '('
    if (isKnownFunction) {
        for (let k = 0; k + 1 < tokens.length; k++) {
            const t = tokens[k];
            if (t.type === 'identifier' && tokens[k + 1].type === 'lparen' && !isKnownFunction(t.text)) {
                issues.push({ offset: t.start, length: t.text.length, message: `未知函数 "${t.text}"`, severity: 'warning', code: 'expr-unknown-function' });
            }
        }
    }

    return issues;
}
