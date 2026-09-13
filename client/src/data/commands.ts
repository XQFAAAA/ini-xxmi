/** 命令列表中的命令说明（悬停 / 高亮）。依据 XXMI CommandList.cpp 的命令解析。 */
export const COMMAND_DOCS: Record<string, string> = {
    checktextureoverride: '检查指定槽位（如 `ps-t0`、`vs-cb3`）的 [TextureOverride] 并执行其命令。',
    store: '从 GPU 资源回读 32 位浮点值到变量：`store = $out, ResourceFoo, $offset`（GPU→CPU，代价高）。',
    handling: '着色器处理方式：skip（不绘制）/ original（回退原着色器）/ pink / mono。',
    preset: '激活指定预设节。',
    exclude_preset: '排除指定预设节，使其不生效。',
    reset_per_frame_limits: '重置每帧限制：`reset_per_frame_limits = 1`。',
    clear: '清除渲染目标/深度模板/UAV/资源视图：`clear = 目标 值...`（值最多 4 个，0x 按 UINT；可追加 int/depth/stencil）。',
    analyse_options: '设置帧分析选项（空格分隔多个，如 `dump_rt dump_depth buf`）。',
    dump: '导出帧分析数据（可带过滤目标，如 `dump = rt`）。',
    special: '特殊命令：`upscaling_switch_bb` / `draw_3dmigoto_overlay`。',
    draw: '绘制当前顶点缓冲：`draw = 顶点数, 起始顶点`；`from_caller` 重放宿主调用，`auto` 取自当前 vb。',
    drawauto: '自动绘制（drawauto）。',
    drawindexed: '索引绘制：`drawindexed = 索引数, 起始索引, 顶点偏移`；`auto` 取自当前 ib。',
    drawinstanced: '实例化绘制：`drawinstanced = 顶点数, 实例数, 起始顶点, 起始实例`。',
    drawindexedinstanced: '索引实例化绘制：`drawindexedinstanced = 索引数, 实例数, 起始索引, 顶点偏移, 起始实例`。',
    dispatch: '计算着色器调度：`dispatch = x, y, z`。',
    drawindexedinstancedindirect: '间接索引实例化绘制（参数由 GPU 缓冲提供）。',
    drawinstancedindirect: '间接实例化绘制（参数由 GPU 缓冲提供）。',
    dispatchindirect: '间接计算调度（参数由 GPU 缓冲提供）。',
    commandlist: '复制/代理另一个命令列表：`commandlistN = 源命令列表名`（N 为任意后缀，目标须为本文件空命令列表节）；`= null` 清空；源名前可加 copy 选项（如 no_view_cache / from_caller）。',
};

/** 以任意后缀命名的命令 key 前缀（如 commandlist1 / commandlist2 / commandlistFoo） */
export const COMMAND_KEY_PREFIXES: ReadonlyArray<string> = ['commandlist'];

/** 查询命令文档；`commandlistN` 等前缀命令回退到通用文档 */
export function commandDoc(key: string): string | undefined {
    const k = key.toLowerCase();
    if (COMMAND_DOCS[k]) {
        return COMMAND_DOCS[k];
    }
    for (const p of COMMAND_KEY_PREFIXES) {
        if (k.startsWith(p)) {
            return COMMAND_DOCS[p];
        }
    }
    return undefined;
}

/** 可重复出现的命令 key（重复键告警豁免；含 commandlistN 前缀） */
export function isRepeatableCommand(key: string): boolean {
    return commandDoc(key) !== undefined;
}
