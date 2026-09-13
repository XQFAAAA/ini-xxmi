/** Section 补全模板 */
export interface SectionTemplate {
    label: string;
    detail: string;
    /** 插入的 body（多行以 \n 连接），最后光标停在 $0 */
    body: string[];
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
    { label: 'TextureOverride', detail: '纹理/渲染目标覆盖（命令列表）', body: ['[TextureOverride]', 'Hash = $0'] },
    { label: 'ShaderOverride', detail: '着色器覆盖（命令列表）', body: ['[ShaderOverride]', 'Hash = $0'] },
    { label: 'CustomShader', detail: '自定义着色器（命令列表）', body: ['[CustomShader]', 'run = $0'] },
    { label: 'CommandList', detail: '命令列表', body: ['[CommandList]', '$0'] },
    { label: 'ShaderRegex', detail: '正则着色器修补（命令列表）', body: ['[ShaderRegex]', 'shader_model = ps_5_0', '$0'] },
    { label: 'Resource', detail: '自定义资源', body: ['[Resource]', 'type = Buffer', 'filename = $0'] },
    { label: 'Pool', detail: '索引池（资源/变量）', body: ['[Pool]', 'pool_size = 4', 'pool_index_type = ring', '$0'] },
    { label: 'Key', detail: '键位绑定', body: ['[Key]', 'Key = no_modifiers VK_F10', '$0'] },
    { label: 'Preset', detail: '预设覆盖', body: ['[Preset]', '$0'] },
    { label: 'Constants', detail: '全局变量声明（命令列表）', body: ['[Constants]', 'global $var = $0'] },
    { label: 'Present', detail: '每帧开始/结束执行的命令（命令列表）', body: ['[Present]', '$0'] },
    { label: 'ClearRenderTargetView', detail: '渲染目标被清除时执行的命令列表', body: ['[ClearRenderTargetView]', 'clear = o0 0 0 0 0', '$0'] },
    { label: 'ClearDepthStencilView', detail: '深度模板被清除时执行的命令列表', body: ['[ClearDepthStencilView]', 'clear = od 1.0 0 depth stencil', '$0'] },
];

/**
 * Section 类型悬停文档（简洁版）。
 * 依据 XXMI IniHandler.cpp 的 CommandListSections / RegularSections 白名单。
 * 先精确匹配，再前缀匹配。
 */
const SECTION_DOCS: Array<{ exact?: string; prefix?: string; doc: string }> = [
    { exact: 'constants', doc: '全局变量声明区（加载时执行一次，用 `global $var = ...` 声明）' },
    { exact: 'present', doc: '每帧开始执行一次（常用于每帧状态重置）' },
    { exact: 'include', doc: '包含其它 INI 文件' },
    { exact: 'hunting', doc: '着色器狩猎模式（0 / 1 / 2）' },
    { exact: 'logging', doc: '日志配置' },
    { exact: 'system', doc: '系统配置' },
    { exact: 'device', doc: '设备配置' },
    { exact: 'rendering', doc: '渲染配置' },
    { exact: 'loader', doc: '加载器配置' },
    { exact: 'profile', doc: '配置节（可合并）' },
    { exact: 'stereo', doc: '立体 3D 设置' },
    { exact: 'convergencemap', doc: '聚散度映射' },
    { prefix: 'textureoverride', doc: '纹理/渲染目标覆盖（hash 或 match_* 匹配绘制调用）' },
    { prefix: 'commandlist', doc: '命令列表（可被 `run =` 调用，支持 if/else/endif）' },
    { prefix: 'shaderoverride', doc: '着色器覆盖' },
    { prefix: 'customshader', doc: '自定义着色器' },
    { prefix: 'shaderregex', doc: '正则着色器修补（子节 .Pattern / .Replace / .InsertDeclarations）' },
    { prefix: 'builtincommandlist', doc: '内置命令列表' },
    { prefix: 'builtincustomshader', doc: '内置自定义着色器' },
    { prefix: 'clearrendertargetview', doc: '清除渲染目标' },
    { prefix: 'cleardepthstencilview', doc: '清除深度模板' },
    { prefix: 'clearunorderedaccessviewuint', doc: '清除 UAV（UINT）' },
    { prefix: 'clearunorderedaccessviewfloat', doc: '清除 UAV（FLOAT）' },
    { prefix: 'pool', doc: '索引池（pool_size 容量 + pool_index_type 索引策略）' },
    { prefix: 'resource', doc: '自定义资源（Buffer/纹理，可被 ref/copy 引用）' },
    { prefix: 'key', doc: '键位绑定（hold / toggle / cycle）' },
    { prefix: 'preset', doc: '预设覆盖' },
];

/** 返回某 section 的悬停文档；未知类型返回 undefined */
export function sectionDocs(name: string): string | undefined {
    const n = name.toLowerCase();
    for (const e of SECTION_DOCS) {
        if (e.exact ? n === e.exact : e.prefix !== undefined && n.startsWith(e.prefix)) {
            return e.doc;
        }
    }
    return undefined;
}
