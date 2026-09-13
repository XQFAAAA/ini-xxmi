import { parseCached } from './parser';
import { analyzeExpression } from './expression';
import { FUNCTION_NAMES } from '../data/functions';
import { REPEATABLE_COMMANDS } from '../data/commands';
import { IniDocument, IniFlow, IniLine, IniSection, KeyKind, Rng, SectionKind } from './types';

export type Severity = 'error' | 'warning' | 'info';

export interface IniDiagnostic {
    range: Rng;
    message: string;
    severity: Severity;
    /** 诊断 code，如 `ini-xxmi:duplicate-key` */
    code: string;
}

export interface AnalyzeOptions {
    /** 检查 run / ref / copy 引用的目标是否存在（本文件内） */
    checkUnknownReferences?: boolean;
    /** 检查使用未声明变量 */
    checkUndeclaredVariables?: boolean;
    /** 对 ShaderRegex .Pattern 内容做 PCRE2 基础语法校验 */
    checkRegexSyntax?: boolean;
    /** 对值 / 条件中的表达式做基础语法校验（括号/运算符/字符串/函数） */
    checkExpressionSyntax?: boolean;
    /** 其它文件定义的 section 名（小写），用于跨文件引用判定 */
    externalSections?: Set<string>;
    /** 其它文件定义的变量名，用于跨文件变量判定 */
    externalVariables?: Set<string>;
}

/** PCRE2 常见合法字母转义（p/P/x/X/u/U/c/C 后跟内容，单独豁免） */
const PCRE2_ESCAPES = new Set(
    ['b', 'B', 'd', 'D', 's', 'S', 'w', 'W', 'n', 'r', 't', 'f', 'v', 'a',
     'A', 'Z', 'z', 'G', 'Q', 'E', 'e', 'K', 'R', 'C', 'X', 'N',
     'h', 'H', 'g', 'l', 'L'].map((c) => c.charCodeAt(0)),
);

function checkPcre2(text: string, range: Rng, diags: IniDiagnostic[]): void {
    let parens = 0;
    let inClass = false;
    let i = 0;
    const warn = (offset: number, len: number, message: string): void => {
        diags.push({ range: subRange(range, offset, len), message, severity: severity('warning'), code: 'regex-syntax' });
    };
    while (i < text.length) {
        const ch = text.charCodeAt(i);
        if (ch === 92 /* \ */) {
            const next = text.charCodeAt(i + 1);
            if (Number.isNaN(next)) {
                warn(i, 1, '行尾的反斜杠（未完成转义）');
                break;
            }
            const isLetter = (next >= 65 && next <= 90) || (next >= 97 && next <= 122);
            const isDigit = next >= 48 && next <= 57;
            if (isLetter && !PCRE2_ESCAPES.has(next) && ![112, 80, 120, 88, 117, 85, 99, 67].includes(next) /* p P x X u U c C */) {
                warn(i, 2, `未知转义序列 \\${String.fromCharCode(next)}`);
            }
            i += 2;
            continue;
        }
        if (!inClass && ch === 91 /* [ */) {
            inClass = true;
        } else if (inClass && ch === 93 /* ] */) {
            inClass = false;
        } else if (!inClass && ch === 40 /* ( */) {
            parens++;
        } else if (!inClass && ch === 41 /* ) */) {
            parens--;
            if (parens < 0) {
                warn(i, 1, `多余的 ')'`);
                break;
            }
        }
        i++;
    }
    if (parens > 0) {
        warn(0, 1, `括号未闭合：缺少 ${parens} 个 ')'`);
    }
    if (inClass) {
        warn(0, 1, `字符类未闭合：缺少 ']'`);
    }
}

const BOOL_VALUES = ['0', '1', 'true', 'false'];

/** 有把握的枚举 key → 允许值（值比较大小写不敏感） */
const ENUM_VALUES: Record<string, readonly string[]> = {
    pool_index_type: ['ring', 'fifo', 'static', 'spatial'],
    pool_lazy_initialization: BOOL_VALUES,
    pool_persist_variables: BOOL_VALUES,
    pool_element_type_switch_reset: BOOL_VALUES,
    pool_allocate_slot_on_missing: BOOL_VALUES,
    log_level: ['disabled', 'warning', 'info', 'debug'],
    marking_mode: ['skip', 'mono', 'original', 'pink'],
    transition_type: ['linear', 'cosine'],
    release_transition_type: ['linear', 'cosine'],
    shader_hash: ['3dmigoto', 'embedded', 'bytecode'],
    texture_hash: ['0', '1'],
    depth_filter: ['none', 'depth_active', 'depth_inactive'],
    get_resolution_from: ['swap_chain', 'depth_stencil'],
    handling: ['skip', 'abort'],
    smart: BOOL_VALUES,
    wrap: BOOL_VALUES,
    match_type: ['Texture2D', 'Texture2DArray', 'Texture2DMS', 'TextureCube', 'Texture3D', 'Buffer'],
    color_space: ['default', 'srgb', 'linear'],
};

// XXMI 支持的全部资源类型（CommandList.h CustomResourceTypeNames）
const RESOURCE_TYPES = [
    'buffer', 'structuredbuffer', 'appendstructuredbuffer', 'consumestructuredbuffer', 'byteaddressbuffer',
    'texture1d', 'texture2d', 'texture3d', 'texturecube',
    'rwbuffer', 'rwstructuredbuffer', 'rwbyteaddressbuffer', 'rwtexture1d', 'rwtexture2d', 'rwtexture3d',
];
const KEY_TYPES = ['activate', 'hold', 'toggle', 'cycle'];

/** 变量引用扫描：普通 $var 与命名空间 $\Namespace\var */
const VAR_SCAN = /\$[A-Za-z_][A-Za-z0-9_.]*|\$\\[^,\s()]+/g;
const SHADER_MODELS = [
    'vs_5_0', 'ps_5_0', 'hs_5_0', 'ds_5_0', 'gs_5_0', 'cs_5_0',
    'vs_4_1', 'ps_4_1', 'vs_4_0', 'ps_4_0', 'gs_4_0',
    'vs_3_0', 'ps_3_0',
];

function subRange(base: Rng, offset: number, len: number): Rng {
    return {
        start: { line: base.start.line, ch: base.start.ch + offset },
        end: { line: base.end.line, ch: base.start.ch + offset + len },
    };
}

function severity(s: Severity): Severity {
    return s;
}

function checkExpression(text: string, range: Rng | null, diags: IniDiagnostic[]): void {
    if (!text || !range) {
        return;
    }
    // 二进制字面量超过 24 位（float32 精度限制）
    for (const m of text.matchAll(/\b0[bB][01]{25,}\b/g)) {
        diags.push({
            range: subRange(range, m.index, m[0].length),
            message: `二进制字面量 ${m[0]} 超过 24 位，超出 float32 可精确表示范围`,
            severity: severity('warning'),
            code: 'binary-overflow',
        });
    }
}

/** 值是否像表达式（含 $ / 数字 / 括号 / 字符串之一）；路径、枚举、glob 等跳过 */
function isExpressionLike(value: string): boolean {
    return /[$0-9("]/.test(value);
}

function addExpressionDiagnostics(text: string, range: Rng | null, diags: IniDiagnostic[]): void {
    if (!text || !range) {
        return;
    }
    checkExpression(text, range, diags);
    if (!isExpressionLike(text)) {
        return;
    }
    const issues = analyzeExpression(text, (name) => FUNCTION_NAMES.includes(name));
    for (const is of issues) {
        diags.push({
            range: subRange(range, is.offset, is.length),
            message: is.message,
            severity: is.severity,
            code: is.code,
        });
    }
}

function checkEnum(key: string, value: string, section: IniSection, range: Rng, diags: IniDiagnostic[]): void {
    const allowed = ENUM_VALUES[key.toLowerCase()];
    if (!allowed) {
        return;
    }
    const v = value.toLowerCase();
    if (!allowed.includes(v)) {
        diags.push({
            range,
            message: `无效值 "${value}"：应为 ${allowed.join(' / ')}`,
            severity: severity('warning'),
            code: 'invalid-enum',
        });
    }
}

function checkTypeEnum(key: string, value: string, section: IniSection, range: Rng, diags: IniDiagnostic[]): void {
    if (key.toLowerCase() !== 'type') {
        return;
    }
    const isKey = section.kind === SectionKind.Interaction;
    const allowed = isKey ? KEY_TYPES : RESOURCE_TYPES;
    const v = value.toLowerCase();
    if (!allowed.includes(v)) {
        diags.push({
            range,
            message: `无效的 type "${value}"${isKey ? '（Key 节应为 hold / toggle / cycle）' : '（Resource 节应为 Buffer / StructuredBuffer / RWBuffer / Texture2D / RWTexture2D / Texture3D / TextureCube 等）'}`,
            severity: severity('warning'),
            code: 'invalid-enum',
        });
    }
}

function checkShaderModels(value: string, range: Rng, diags: IniDiagnostic[]): void {
    const models = value.split(/\s+/).filter(Boolean);
    for (const m of models) {
        if (!SHADER_MODELS.includes(m.toLowerCase())) {
            diags.push({
                range,
                message: `未知 shader_model "${m}"`,
                severity: severity('warning'),
                code: 'invalid-enum',
            });
        }
    }
}

/**
 * 对一份 INI 文本做静态分析，产出诊断。
 * 纯 TS、不依赖 vscode，便于单元测试与未来提取为 LSP server。
 */
export function analyze(text: string, options: AnalyzeOptions = {}): IniDiagnostic[] {
    const doc = parseCached(text);
    const diags: IniDiagnostic[] = [];
    const o: Required<AnalyzeOptions> = {
        checkUnknownReferences: options.checkUnknownReferences ?? true,
        checkUndeclaredVariables: options.checkUndeclaredVariables ?? true,
        checkRegexSyntax: options.checkRegexSyntax ?? true,
        checkExpressionSyntax: options.checkExpressionSyntax ?? true,
        externalSections: options.externalSections ?? new Set<string>(),
        externalVariables: options.externalVariables ?? new Set<string>(),
    };

    const sectionNameLower = new Set(doc.sections.map((s) => s.name.toLowerCase()));
    // 池节声明的变量名（$PoolFoo 由 [PoolFoo] 节声明，不是 variable-decl）
    const poolVars = new Set<string>();
    for (const name of sectionNameLower) {
        if (/^pool\w*$/.test(name)) {
            poolVars.add('$' + name);
        }
    }

    checkProxyCycles(doc, diags);

    // ---- 全局变量表 ----
    const globals = new Map<string, { range: Rng; locked: boolean }>();
    for (const s of doc.sections) {
        for (const l of s.lines) {
            if (l.type === 'variable-decl' && l.scope === 'global') {
                if (globals.has(l.name)) {
                    diags.push({
                        range: l.nameRange,
                        message: `重复声明全局变量 ${l.name}`,
                        severity: severity('error'),
                        code: 'duplicate-variable',
                    });
                } else {
                    globals.set(l.name, { range: l.nameRange, locked: l.locked });
                }
            }
        }
    }

    for (const s of doc.sections) {
        checkRegexSubSection(s, sectionNameLower, diags);

        // ShaderRegex .Pattern 内容的 PCRE2 基础语法校验
        if (o.checkRegexSyntax && s.regexSub === 'pattern') {
            for (const l of s.lines) {
                if (l.type === 'regex-content') {
                    checkPcre2(l.text, l.range, diags);
                }
            }
        }

        // 顶层 key 计数（if/else 分支内的 key 重复是合法的条件执行模式，不参与重复检测）
        const topLevelKeys = new Set<string>();
        const keyCount = new Map<string, number>();
        {
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
                if (l.type === 'key-value' && depth === 0) {
                    topLevelKeys.add(l.key);
                    keyCount.set(l.key, (keyCount.get(l.key) ?? 0) + 1);
                }
            }
        }
        const isInclude = /^include$/i.test(s.name);
        const isKeySection = /^key/i.test(s.name);

        // 节内 local 变量表（local 仅在声明它的命令列表节内可见）
        const locals = new Map<string, { range: Rng; locked: boolean }>();
        for (const l of s.lines) {
            if (l.type === 'variable-decl' && l.scope === 'local') {
                if (!locals.has(l.name)) {
                    locals.set(l.name, { range: l.nameRange, locked: l.locked });
                }
            }
        }

        for (const l of s.lines) {
            if (l.type !== 'key-value') {
                continue;
            }
            // 重复 key（白名单：Include 全部允许；Key* 节的 Key/Back 允许；CheckTextureOverride 等命令可重复；仅统计顶层）
            if (!isInclude
                && !(isKeySection && /^(key|back)$/i.test(l.key))
                && !/^checktextureoverride$/i.test(l.key)
                && !REPEATABLE_COMMANDS.has(l.key.toLowerCase())
                && topLevelKeys.has(l.key)
                && (keyCount.get(l.key) ?? 0) > 1) {
                diags.push({
                    range: l.keyRange,
                    message: `重复的键 "${l.key}"`,
                    severity: severity('warning'),
                    code: 'duplicate-key',
                });
            }
            // 枚举值
            checkEnum(l.key, l.value, s, l.valueRange, diags);
            checkTypeEnum(l.key, l.value, s, l.valueRange, diags);
            if (/^shader_model$/i.test(l.key)) {
                checkShaderModels(l.value, l.valueRange, diags);
            }
            checkPoolRules(l, s, diags);
            checkStoreCommand(l, diags);
            // 表达式
            if (o.checkExpressionSyntax) {
                addExpressionDiagnostics(l.value, l.valueRange, diags);
            }
            // 变量赋值 / 使用
            if (l.keyKind === KeyKind.Variable) {
                const g = globals.get(l.key);
                if (g?.locked) {
                    diags.push({
                        range: l.keyRange,
                        message: `locked 变量 ${l.key} 不能被赋值`,
                        severity: severity('warning'),
                        code: 'assign-to-locked',
                    });
                }
            }
            if (o.checkUndeclaredVariables) {
                for (const m of l.value.matchAll(VAR_SCAN)) {
                    checkUndeclared(m[0], subRange(l.valueRange, m.index, m[0].length), globals, locals, poolVars, s, o.externalVariables, diags);
                }
            }
            if (o.checkUnknownReferences) {
                checkReferences(l, s, sectionNameLower, o.externalSections, diags);
            }
        }

        for (const l of s.lines) {
            if (l.type !== 'variable-decl') {
                continue;
            }
            if (o.checkUndeclaredVariables && l.initValue && l.initRange) {
                for (const m of l.initValue.matchAll(VAR_SCAN)) {
                    checkUndeclared(m[0], subRange(l.initRange, m.index, m[0].length), globals, locals, poolVars, s, o.externalVariables, diags);
                }
            }
            if (o.checkExpressionSyntax && l.initValue && l.initRange) {
                addExpressionDiagnostics(l.initValue, l.initRange, diags);
            }
        }

        checkFlow(s, diags);

        // Key 节键位绑定校验
        if (s.kind === SectionKind.Interaction) {
            checkKeyBinding(s, diags);
        }

        // if / elif 条件的表达式检查
        if (o.checkExpressionSyntax) {
            for (const l of s.lines) {
                if (l.type === 'flow' && (l.keyword === 'if' || l.keyword === 'elif') && l.condition && l.conditionRange) {
                    addExpressionDiagnostics(l.condition, l.conditionRange, diags);
                }
            }
        }
    }

    return diags;
}

const VALID_MODIFIERS = new Set(['no_modifiers', 'no_ctrl', 'no_alt', 'no_shift', 'no_win', 'ctrl', 'alt', 'shift', 'win']);
const VALID_MOUSE = new Set(['rbutton', 'lbutton', 'mbutton', 'xbutton1', 'xbutton2']);
const VALID_VK_NAMED = new Set([
    'LBUTTON', 'RBUTTON', 'MBUTTON', 'XBUTTON1', 'XBUTTON2',
    'DECIMAL', 'DIVIDE', 'MULTIPLY', 'SUBTRACT', 'ADD', 'SNAPSHOT', 'RETURN', 'INSERT', 'HOME',
    'PAGEUP', 'PAGEDOWN', 'DELETE', 'END', 'ESCAPE', 'TAB', 'SPACE', 'BACK', 'CAPITAL', 'NUMLOCK',
    'SCROLL', 'PAUSE', 'APPS', 'LSHIFT', 'RSHIFT', 'LCONTROL', 'RCONTROL', 'LMENU', 'RMENU',
    'LWIN', 'RWIN', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'SHIFT', 'CONTROL', 'MENU', 'CLEAR', 'SELECT',
    'PRINT', 'EXECUTE', 'HELP', 'PRIOR', 'NEXT', 'CONVERT', 'NONCONVERT', 'ACCEPT', 'MODECHANGE',
]);

function isValidVkName(name: string): boolean {
    return VALID_VK_NAMED.has(name) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(name) || /^NUMPAD[0-9]$/.test(name) || /^OEM_[A-Z0-9]+$/.test(name);
}

function checkKeyBinding(s: IniSection, diags: IniDiagnostic[]): void {
    for (const l of s.lines) {
        if (l.type !== 'key-value' || !/^key$/i.test(l.key)) {
            continue;
        }
        const tokens = l.value.split(/\s+/).filter(Boolean);
        for (const t of tokens) {
            const lower = t.toLowerCase();
            if (VALID_MODIFIERS.has(lower) || VALID_MOUSE.has(lower)) {
                continue;
            }
            if (/^xb\d?_[a-z0-9_]+$/i.test(t)) {
                continue; // 手柄键
            }
            if (/^[a-z0-9]$/i.test(t)) {
                continue; // 单字符键
            }
            const m = /^no_vk_(.+)$/i.exec(t) ?? /^vk_(.+)$/i.exec(t);
            if (m && isValidVkName(m[1].toUpperCase())) {
                continue;
            }
            if (/^(no_)?vk_/i.test(t)) {
                diags.push({
                    range: l.valueRange,
                    message: `未知虚拟键 "${t}"`,
                    severity: severity('warning'),
                    code: 'invalid-vk',
                });
                continue;
            }
            diags.push({
                range: l.valueRange,
                message: `无法识别的键位 token "${t}"`,
                severity: severity('warning'),
                code: 'invalid-key-binding',
            });
        }
    }
}

function checkProxyCycles(doc: IniDocument, diags: IniDiagnostic[]): void {
    // 收集代理命令列表赋值：CommandListX = ref CommandListY
    const edges = new Map<string, { from: string; target: string; range: Rng }>();
    for (const s of doc.sections) {
        for (const l of s.lines) {
            if (l.type !== 'key-value') {
                continue;
            }
            if (/^CommandList\w+$/i.test(l.key.trim()) && /^ref\s+CommandList\w+$/i.test(l.value.trim())) {
                const target = l.value.trim().replace(/^ref\s+/i, '');
                edges.set(l.key.trim().toLowerCase(), { from: l.key.trim(), target, range: l.valueRange });
            }
        }
    }
    if (edges.size === 0) {
        return;
    }
    // 检测环
    for (const startLower of edges.keys()) {
        const seen = new Set<string>([startLower]);
        const cycle: string[] = [edges.get(startLower)!.from];
        let cur = edges.get(startLower)!.target.toLowerCase();
        while (edges.has(cur)) {
            if (seen.has(cur)) {
                cycle.push(edges.get(cur)!.from);
                diags.push({
                    range: edges.get(startLower)!.range,
                    message: `代理命令列表存在循环引用：${cycle.join(' → ')}（该赋值会被忽略）`,
                    severity: severity('error'),
                    code: 'proxy-cycle',
                });
                break;
            }
            seen.add(cur);
            cycle.push(edges.get(cur)!.from);
            cur = edges.get(cur)!.target.toLowerCase();
        }
    }
}

function checkRegexSubSection(s: IniSection, sectionNameLower: Set<string>, diags: IniDiagnostic[]): void {
    if (!s.regexSub) {
        return;
    }
    const base = s.name.replace(/\.(pattern(?:\.replace)?|insertdeclarations)$/i, '');
    if (!sectionNameLower.has(base.toLowerCase())) {
        diags.push({
            range: s.nameRange,
            message: `未找到 ShaderRegex 主节 [${base}]`,
            severity: severity('error'),
            code: 'bad-regex-subsection',
        });
    }
    if (/\.pattern\.replace$/i.test(s.name)) {
        const pat = s.name.replace(/\.replace$/i, '');
        if (!sectionNameLower.has(pat.toLowerCase())) {
            diags.push({
                range: s.nameRange,
                message: `未找到正则模式子节 [${pat}]`,
                severity: severity('error'),
                code: 'bad-regex-subsection',
            });
        }
    }
}

function checkStoreCommand(l: IniLine & { type: 'key-value' }, diags: IniDiagnostic[]): void {
    if (!/^store$/i.test(l.key)) {
        return;
    }
    const args = l.value.split(',').map((a) => a.trim()).filter((a) => a !== '');
    if (args.length < 3) {
        diags.push({
            range: l.valueRange,
            message: `store 需要 3 个参数：$out（输出变量）, 资源目标, 偏移表达式（当前 ${args.length} 个）`,
            severity: severity('warning'),
            code: 'store-args',
        });
    }
}

function checkPoolRules(l: IniLine & { type: 'key-value' }, s: IniSection, diags: IniDiagnostic[]): void {
    if (s.kind !== SectionKind.Resource) {
        return;
    }
    const key = l.key.toLowerCase();
    if (key === 'pool_size') {
        const n = Number(l.value.trim());
        if (l.value.trim() === '' || Number.isNaN(n) || n < 1) {
            diags.push({
                range: l.valueRange,
                message: `pool_size 必须是 >= 1 的整数，当前为 "${l.value}"`,
                severity: severity('error'),
                code: 'invalid-pool-size',
            });
        }
    }
    if (key === 'pool_persist_variables' && /^(1|true)$/i.test(l.value.trim())) {
        // 该节中查找 pool_index_type
        for (const other of s.lines) {
            if (other.type === 'key-value' && other.key.toLowerCase() === 'pool_index_type'
                && other.value.trim().toLowerCase() === 'fifo') {
                diags.push({
                    range: l.valueRange,
                    message: 'pool_persist_variables 不支持 fifo 索引类型（仅 ring 支持）',
                    severity: severity('warning'),
                    code: 'fifo-persist',
                });
                break;
            }
        }
    }
}

function checkFlow(s: IniSection, diags: IniDiagnostic[]): void {
    const stack: IniFlow[] = [];
    for (const l of s.lines) {
        if (l.type !== 'flow') {
            continue;
        }
        if (l.keyword === 'if') {
            stack.push(l);
        } else if (l.keyword === 'elif' || l.keyword === 'else') {
            if (stack.length === 0) {
                diags.push({
                    range: { start: { line: l.line, ch: 0 }, end: { line: l.line, ch: 4 } },
                    message: `多余的 ${l.keyword}（没有对应的 if）`,
                    severity: severity('warning'),
                    code: 'unexpected-else',
                });
            }
        } else if (l.keyword === 'endif') {
            if (stack.length === 0) {
                diags.push({
                    range: { start: { line: l.line, ch: 0 }, end: { line: l.line, ch: 5 } },
                    message: '多余的 endif（没有对应的 if）',
                    severity: severity('warning'),
                    code: 'unexpected-endif',
                });
            } else {
                stack.pop();
            }
        }
    }
    for (const pending of stack) {
        diags.push({
            range: { start: { line: pending.line, ch: 0 }, end: { line: pending.line, ch: 2 } },
            message: `if 缺少对应的 endif`,
            severity: severity('warning'),
            code: 'unterminated-if',
        });
    }
}

function checkUndeclared(
    name: string,
    range: Rng,
    globals: Map<string, { range: Rng; locked: boolean }>,
    locals: Map<string, { range: Rng; locked: boolean }>,
    poolVars: Set<string>,
    s: IniSection,
    externalVariables: Set<string>,
    diags: IniDiagnostic[],
): void {
    if (name.includes('\\')) {
        return; // 命名空间变量可跨 namespace 文件声明，不做未声明检查
    }
    // $PoolFoo 由 [PoolFoo] 节声明（池变量），不是 variable-decl
    if (/^\$Pool\w*$/i.test(name) && poolVars.has(name.toLowerCase())) {
        return;
    }
    if (globals.has(name) || locals.has(name) || externalVariables.has(name)) {
        return;
    }
    diags.push({
        range,
        message: `未声明的变量 ${name}`,
        severity: severity('warning'),
        code: 'undeclared-variable',
    });
}

function checkReferences(
    l: IniLine & { type: 'key-value' },
    s: IniSection,
    sectionNameLower: Set<string>,
    externalSections: Set<string>,
    diags: IniDiagnostic[],
): void {
    // run = X
    if (/^run$/i.test(l.key.trim())) {
        const target = l.value.trim();
        // 命名空间目标（含 \，如 CommandList\NS\Name）可跨文件定义，不做本文件检查
        if (target.includes('\\')) {
            return;
        }
        if (target && !sectionNameLower.has(target.toLowerCase()) && !externalSections.has(target.toLowerCase()) && !/^builtin/i.test(target)) {
            diags.push({
                range: l.valueRange,
                message: `未找到命令列表 "${target}"（本节内无对应 [${target}] 定义）`,
                severity: severity('warning'),
                code: 'unknown-command-list',
            });
        }
        return;
    }
    // = ref X / = copy X 以及值中的 Resource*/Pool* 引用（资源名可含 -，如 ResourceFoo-6_t_x）
    const refMatch = /^\s*(ref|copy)\s+(.+)$/i.exec(l.value);
    if (refMatch) {
        const target = refMatch[2].trim();
        const m = /^(Resource[\w-]*|Pool[\w-]*)/.exec(target);
        if (m && !sectionNameLower.has(m[1].toLowerCase()) && !externalSections.has(m[1].toLowerCase())) {
            diags.push({
                range: l.valueRange,
                message: `未找到资源 "${m[1]}"（本节内无对应 [${m[1]}] 定义）`,
                severity: severity('warning'),
                code: 'unknown-resource',
            });
        }
        return;
    }
    // 值中的 Resource*/Pool* 引用（无 ref/copy 前缀，如 slot = ResourceFoo）
    for (const m of l.value.matchAll(/\b(Resource[\w-]*|Pool[\w-]*)\b/g)) {
        if (!sectionNameLower.has(m[1].toLowerCase()) && !externalSections.has(m[1].toLowerCase())) {
            diags.push({
                range: subRange(l.valueRange, m.index, m[0].length),
                message: `未找到资源 "${m[1]}"`,
                severity: severity('warning'),
                code: 'unknown-resource',
            });
        }
    }
}
