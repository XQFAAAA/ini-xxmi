/** 表达式函数：签名与说明（docs/ini-language-extensions/expressions/functions.md） */
export interface FunctionDoc {
    signature: string;
    doc: string;
}

export const FUNCTION_DOCS: Record<string, FunctionDoc> = {
    countbits: { signature: 'countbits(x)', doc: '统计输入值的置位位数（bitwise count）' },
    sin: { signature: 'sin(x)', doc: '正弦' },
    cos: { signature: 'cos(x)', doc: '余弦' },
    tan: { signature: 'tan(x)', doc: '正切' },
    asin: { signature: 'asin(x)', doc: '反正弦' },
    acos: { signature: 'acos(x)', doc: '反余弦' },
    atan: { signature: 'atan(x)', doc: '反正切' },
    abs: { signature: 'abs(x)', doc: '绝对值' },
    sign: { signature: 'sign(x)', doc: '符号（-1 / 0 / 1）' },
    ceil: { signature: 'ceil(x)', doc: '向上取整' },
    floor: { signature: 'floor(x)', doc: '向下取整' },
    trunc: { signature: 'trunc(x)', doc: '截断小数部分' },
    round: { signature: 'round(x)', doc: '四舍五入到最近整数' },
    frac: { signature: 'frac(x)', doc: '返回小数部分' },
    sqrt: { signature: 'sqrt(x)', doc: '平方根' },
    rsqrt: { signature: 'rsqrt(x)', doc: '平方根倒数' },
    exp: { signature: 'exp(x)', doc: 'e 的 x 次幂' },
    exp2: { signature: 'exp2(x)', doc: '2 的 x 次幂' },
    log: { signature: 'log(x)', doc: '自然对数' },
    log2: { signature: 'log2(x)', doc: '以 2 为底的对数' },
    saturate: { signature: 'saturate(x)', doc: '钳制到 [0, 1]' },
    random: { signature: 'random($max)', doc: '确定性伪随机值，范围为 [0, $max)（$max 为负时 ($max, 0]）' },
};

export const FUNCTION_NAMES = Object.keys(FUNCTION_DOCS);

/** 运行时参数（docs/ini-language-extensions/parameters/README.md 与 CommandList.h ParamOverrideTypeNames） */
export const RUNTIME_PARAMS: Record<string, string> = {
    FRAME_NUMBER: '当前帧号（以 Present 调用为帧边界）',
    DRAW_NUMBER: '当前帧内的绘制调用序号（每帧从 1 开始）',
    DISPATCH_NUMBER: '当前帧内的计算调度序号（每帧从 1 开始）',
    TIME: '游戏启动以来经过的秒数（微秒精度）',
    FRAME_TIME: '上一帧与当前帧之间的秒数（微秒精度）',
    FPS: '指数移动平均计算的帧率',
    // 内置 ini 参数
    rt_width: '当前渲染目标宽度',
    rt_height: '当前渲染目标高度',
    res_width: '游戏分辨率宽度',
    res_height: '游戏分辨率高度',
    window_width: '窗口宽度',
    window_height: '窗口高度',
    vertex_count: '当前绘制调用顶点数',
    index_count: '当前绘制调用索引数',
    instance_count: '当前绘制调用实例数',
    first_vertex: '当前绘制调用起始顶点',
    first_index: '当前绘制调用起始索引',
    first_instance: '当前绘制调用起始实例',
    thread_group_count_x: '计算调度线程组数 X',
    thread_group_count_y: '计算调度线程组数 Y',
    thread_group_count_z: '计算调度线程组数 Z',
    indirect_offset: '间接绘制/调度偏移',
    draw_type: '绘制类型（Draw / DrawIndexed / ...）',
    cursor_showing: '光标是否显示',
    cursor_screen_x: '光标屏幕坐标 X',
    cursor_screen_y: '光标屏幕坐标 Y',
    cursor_window_x: '光标窗口坐标 X',
    cursor_window_y: '光标窗口坐标 Y',
    cursor_x: '光标坐标 X',
    cursor_y: '光标坐标 Y',
    cursor_hotspot_x: '光标热点 X',
    cursor_hotspot_y: '光标热点 Y',
    time: '游戏启动以来的秒数（同 TIME）',
    scissor_left: '剪裁区域左边界',
    scissor_top: '剪裁区域上边界',
    scissor_right: '剪裁区域右边界',
    scissor_bottom: '剪裁区域下边界',
    hunting: '着色器狩猎状态',
    frame_analysis: '帧分析状态',
    effective_dpi: '有效 DPI',
    sli: 'SLI 状态',
    stereo_active: '立体 3D 是否激活',
    stereo_available: '立体 3D 是否可用',
    frame_number: '当前帧号（同 FRAME_NUMBER）',
    draw_number: '当前绘制调用序号（同 DRAW_NUMBER）',
    dispatch_number: '当前调度序号（同 DISPATCH_NUMBER）',
    frame_time: '上一帧耗时（同 FRAME_TIME）',
    fps: '帧率（同 FPS）',
};

export const RUNTIME_PARAM_NAMES = Object.keys(RUNTIME_PARAMS);
