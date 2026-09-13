/**
 * 轻量位置/范围模型。
 * 不依赖 vscode 模块，保持纯 TS 以便单元测试与未来提取为 LSP server。
 */
export interface Pos {
    line: number;
    ch: number;
}

export interface Rng {
    start: Pos;
    end: Pos;
}

export const enum SectionKind {
    CommandList = 'command-list',
    Resource = 'resource',
    Config = 'config',
    Interaction = 'interaction',
    Other = 'other',
}

/** ShaderRegex 子节类型 */
export type RegexSub = 'pattern' | 'replace' | 'insert';

export interface IniSection {
    /** section 名（含子节后缀，如 `ShaderRegex1.Pattern`） */
    name: string;
    /** `[Name]` 整行范围 */
    headerRange: Rng;
    /** 名字范围（不含方括号） */
    nameRange: Rng;
    kind: SectionKind;
    regexSub: RegexSub | undefined;
    /** header 所在行号 */
    start: number;
    /** 下一个 section 起始行号，或行总数（不含） */
    end: number;
    lines: IniLine[];
}

export const enum KeyKind {
    Plain = 'plain',
    Slot = 'slot',
    Resource = 'resource',
    Pool = 'pool',
    Variable = 'variable',
    Phase = 'phase',
    InputLayout = 'input-layout',
    CommandList = 'command-list',
}

export type IniLine =
    | IniKeyValue
    | IniVariableDecl
    | IniFlow
    | IniRegexContent
    | IniComment
    | IniBlank
    | IniBare;

export interface IniKeyValue {
    type: 'key-value';
    line: number;
    key: string;
    keyRange: Rng;
    value: string;
    valueRange: Rng;
    keyKind: KeyKind;
}

export interface IniVariableDecl {
    type: 'variable-decl';
    line: number;
    scope: 'global' | 'local';
    locked: boolean;
    persist: boolean;
    name: string;
    nameRange: Rng;
    /** 初始化表达式文本，无初值时为 null */
    initValue: string | null;
    initRange: Rng | null;
}

export interface IniFlow {
    type: 'flow';
    line: number;
    keyword: 'if' | 'elif' | 'else' | 'endif';
    condition: string | null;
    conditionRange: Rng | null;
}

export interface IniRegexContent {
    type: 'regex-content';
    line: number;
    text: string;
    range: Rng;
}

export interface IniComment {
    type: 'comment';
    line: number;
    text: string;
    range: Rng;
}

export interface IniBlank {
    type: 'blank';
    line: number;
}

export interface IniBare {
    type: 'bare';
    line: number;
    text: string;
    range: Rng;
}

export interface IniDocument {
    text: string;
    lineCount: number;
    sections: IniSection[];
    /** `namespace = X`（任意位置）声明的命名空间 */
    namespace: string | null;
}
