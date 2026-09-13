/** 命令列表中的命令说明（悬停 / 高亮）。依据 XXMI CommandList.cpp 的命令解析。 */
export const COMMAND_DOCS: Record<string, string> = {
    checktextureoverride: '检查指定槽位的 [TextureOverride] 是否生效并执行其命令（hunting / 组合覆盖用）。值可为 `ib`、`ps-t0`、`vs-cb3` 等槽位。',
    store: '从 GPU 资源读取一个 32 位浮点值到变量（GPU→CPU 回读，代价高）。`store = $out, ResourceFoo, $offset`',
    handling: '着色器处理方式：skip（不绘制）/ original（回退原着色器）/ pink / mono',
    preset: '激活指定预设节',
    exclude_preset: '排除指定预设节，使其不生效。',
    reset_per_frame_limits: '重置每帧限制（`reset_per_frame_limits = 1`）。',
    clear: '清除渲染目标 / 深度模板 / UAV / 自定义资源视图。空格分隔：`clear = 目标 值...`，值最多 4 个（默认按 float 解析，0x 开头按 UINT），另可追加 `int`（UAV 按整型清除）/ `depth` / `stencil`（仅深度模板目标 od）。如 `clear = o0 0 0 0 0`、`clear = u0 0 int`、`clear = od 1.0 0 depth stencil`。',
    analyse_options: '设置帧分析选项（空格分隔多个，见 FrameAnalysisOptionNames，如 `analyse_options = dump_rt dump_depth buf`）。',
    dump: '导出帧分析数据。`dump = `（可带过滤目标，如 `dump = rt` / `dump = cb12`）。',
    special: '特殊命令：`upscaling_switch_bb` / `draw_3dmigoto_overlay`。',
    draw: '绘制当前顶点缓冲。`draw = 顶点数, 起始顶点`；特殊值：`draw = from_caller`（重放宿主本次绘制调用）、`draw = auto`（顶点数取自当前 ib 大小）。',
    drawauto: '自动绘制（drawauto）。',
    drawindexed: '索引绘制。`drawindexed = 索引数, 起始索引, 顶点偏移`；特殊值：`drawindexed = auto`（索引数取自当前 ib）。',
    drawinstanced: '实例化绘制。`drawinstanced = 顶点数, 实例数, 起始顶点, 起始实例`',
    drawindexedinstanced: '索引实例化绘制。`drawindexedinstanced = 索引数, 实例数, 起始索引, 顶点偏移, 起始实例`；特殊值：`drawindexedinstanced = auto`。',
    dispatch: '计算着色器调度。`dispatch = x, y, z`',
    drawindexedinstancedindirect: '间接索引实例化绘制（参数由 GPU 缓冲提供）。',
    drawinstancedindirect: '间接实例化绘制（参数由 GPU 缓冲提供）。',
    dispatchindirect: '间接计算调度（参数由 GPU 缓冲提供）。',
    commandlist1: '代理/复制另一个命令列表：`commandlistN = 源命令列表名`（N 为 1-9 或任意后缀，key 须以 commandlist 开头且指向本文件中空的显式命令列表节）；`= null` 清空；源名前可加 copy 选项前缀（如 `no_view_cache` / `from_caller`）。',
};

/** 可重复出现的命令 key（不参与重复键告警） */
export const REPEATABLE_COMMANDS: ReadonlySet<string> = new Set(
    Object.keys(COMMAND_DOCS).map((c) => c.toLowerCase()),
);
