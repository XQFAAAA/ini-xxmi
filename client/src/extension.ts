import * as vscode from 'vscode';
import { IniDocumentSymbolProvider } from './providers/documentSymbolProvider';
import { IniFoldingRangeProvider } from './providers/foldingRangeProvider';
import { IniDiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { IniCompletionItemProvider } from './providers/completionProvider';
import { IniHoverProvider } from './providers/hoverProvider';
import { IniDefinitionProvider } from './providers/definitionProvider';
import { IniReferenceProvider } from './providers/referenceProvider';
import { IniFormattingProvider } from './providers/formattingProvider';
import { WorkspaceIndex } from './index/workspaceIndex';

/**
 * ini-xxmi — XXMI INI language support.
 *
 * M1: TextMate grammar（syntaxes/xxmi-ini.tmLanguage.json）提供基础高亮。
 * M2: 手写 TS 解析器（parser/）+ Outline / 折叠。
 * M3: 诊断（diagnostics/），结果推送到 Problems 面板。
 * M4: 智能补全（completionProvider）+ 悬停提示（hoverProvider）。
 * M5: 跳转定义 / 查找引用 + 格式化。
 * M6+: 表达式分析 / store / 代理命令列表 / 跨文件索引等解析规则完善。
 */

/** 各分类 → TextMate 作用域（与 package.json configurationDefaults 保持一致） */
const COLOR_CATEGORIES: Record<string, string[]> = {
    key: ['support.type.property-name.ini-xxmi'],
    iniParam: ['variable.other.ini-param.ini-xxmi'],
    parameter: ['constant.other.runtime-parameter.ini-xxmi'],
};

const COLOR_DEFAULTS: Record<string, string> = {
    key: '#e06c75',
    iniParam: '#CE9178',
    parameter: '#3FB950',
};

/**
 * 已取消颜色管理类别的遗留作用域（如 section、enum 枚举值、合并前的细分枚举作用域）。
 * 应用颜色设置时会从用户 settings.json 中移除这些规则，使这些 token 回退到主题默认。
 */
const RETIRED_SCOPES = [
    'entity.name.section.ini-xxmi',
    'entity.name.section.command-list.ini-xxmi',
    'entity.name.section.resource.ini-xxmi',
    'entity.name.section.config.ini-xxmi',
    'entity.name.section.interaction.ini-xxmi',
    'entity.name.section.regex-pattern.ini-xxmi',
    'entity.name.section.regex-replace.ini-xxmi',
    'entity.name.section.regex-insert.ini-xxmi',
    // enum 类别（枚举值统一作用域）及合并前的细分枚举作用域
    'constant.language.enum-value.ini-xxmi',
    'constant.language.dxgi-format.ini-xxmi',
    'constant.language.virtual-key.ini-xxmi',
    'constant.language.controller-key.ini-xxmi',
    'constant.language.key.ini-xxmi',
];

/**
 * 读取 iniXxmi.color.* 设置并写入用户级 editor.tokenColorCustomizations.textMateRules。
 * 对插件管理的作用域强制覆盖为当前配置颜色，其余用户规则原样保留；
 * 同时清理已取消管理类别（RETIRED_SCOPES）在用户设置中的遗留规则。
 * 通过 inspect() 读取用户级（而非含 defaults 的有效值）判断是否需要写入，避免重复写 settings.json。
 */
async function applyColorSettings(target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<number> {
    const ini = vscode.workspace.getConfiguration('iniXxmi');

    // 插件管理的作用域 → 当前配置颜色（未设置时用默认值）
    const managed = new Map<string, string>();
    for (const [cat, scopes] of Object.entries(COLOR_CATEGORIES)) {
        const fg = ini.get<string>(`color.${cat}`, COLOR_DEFAULTS[cat]);
        for (const scope of scopes) {
            managed.set(scope, fg);
        }
    }

    const editorCfg = vscode.workspace.getConfiguration('editor');
    const inspected = editorCfg.inspect<Record<string, unknown>>('tokenColorCustomizations');
    const userVal = (inspected?.globalValue ?? {}) as Record<string, unknown>;
    const userRules = Array.isArray(userVal.textMateRules)
        ? (userVal.textMateRules as Array<{ scope?: string | string[]; settings?: { foreground?: string } }>)
        : [];

    const scopeList = (r: { scope?: string | string[] }): string[] =>
        Array.isArray(r.scope) ? r.scope : r.scope ? [r.scope] : [];

    // 用户设置中是否残留已取消类别的规则
    const hasStale = userRules.some((r) => scopeList(r).some((s) => RETIRED_SCOPES.includes(s)));

    // 用户级是否已按当前配置强制生效（是则跳过写入）
    const upToDate = !hasStale && Array.from(managed.entries()).every(([scope, fg]) => {
        const rule = userRules.find((r) => scopeList(r).includes(scope));
        return rule !== undefined && rule.settings?.foreground === fg;
    });
    if (upToDate) {
        return managed.size;
    }

    // 保留与插件无关的用户规则；移除已取消类别的遗留规则；
    // 对插件管理的作用域强制覆盖为当前配置颜色
    const kept = userRules.filter((r) => scopeList(r).every((s) => !RETIRED_SCOPES.includes(s)));
    const rules = [
        ...kept,
        ...Array.from(managed.entries()).map(([scope, foreground]) => ({ scope, settings: { foreground } })),
    ];
    const merged = { ...userVal, textMateRules: rules };
    await editorCfg.update('tokenColorCustomizations', merged, target);
    return rules.length;
}

export function activate(context: vscode.ExtensionContext): void {
    const index = new WorkspaceIndex();
    void index.initialize();
    context.subscriptions.push(index);

    // 诊断初始化（含对已打开文档的同步首扫）若抛错不应阻断后续功能注册（大纲/补全/悬停/折叠等）
    try {
        const diagnostics = new IniDiagnosticsProvider(context, index);
        diagnostics.register();
    } catch {
        // 忽略：诊断不可用时其余功能照常提供
    }

    // 颜色设置：激活即应用（强制生效，无需手动运行命令）+ 命令手动重应用 + 设置变更自动同步
    void applyColorSettings().catch(() => undefined);
    context.subscriptions.push(
        vscode.commands.registerCommand('ini-xxmi.applyColors', async () => {
            try {
                const n = await applyColorSettings();
                const msg = `已写入 ${n} 条 XXMI INI 颜色规则到用户 settings.json（editor.tokenColorCustomizations），可直接在此编辑自定义。`;
                void vscode.window.showInformationMessage(msg);
            } catch (e) {
                void vscode.window.showErrorMessage(`应用颜色设置失败：${e instanceof Error ? e.message : String(e)}`);
            }
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('iniXxmi.color')) {
                void applyColorSettings().catch(() => undefined);
            }
        }),
    );

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider('ini-xxmi', new IniDocumentSymbolProvider()),
        vscode.languages.registerFoldingRangeProvider('ini-xxmi', new IniFoldingRangeProvider()),
        vscode.languages.registerCompletionItemProvider('ini-xxmi', new IniCompletionItemProvider(index), '[', '=', '$'),
        vscode.languages.registerHoverProvider('ini-xxmi', new IniHoverProvider()),
        vscode.languages.registerDefinitionProvider('ini-xxmi', new IniDefinitionProvider(index)),
        vscode.languages.registerReferenceProvider('ini-xxmi', new IniReferenceProvider()),
        vscode.languages.registerDocumentFormattingEditProvider('ini-xxmi', new IniFormattingProvider()),
    );
}

export function deactivate(): void {}
