/** 完整 DXGI_FORMAT 枚举（含 DXGI_FORMAT_ 前缀与去前缀两种形式，d3dx.ini 两者均可使用） */
const DXGI_FORMAT_NAMES: string[] = [
    'UNKNOWN',
    'R32G32B32A32_TYPELESS', 'R32G32B32A32_FLOAT', 'R32G32B32A32_UINT', 'R32G32B32A32_SINT',
    'R32G32B32_TYPELESS', 'R32G32B32_FLOAT', 'R32G32B32_UINT', 'R32G32B32_SINT',
    'R16G16B16A16_TYPELESS', 'R16G16B16A16_FLOAT', 'R16G16B16A16_UNORM', 'R16G16B16A16_UINT', 'R16G16B16A16_SNORM', 'R16G16B16A16_SINT',
    'R32G32_TYPELESS', 'R32G32_FLOAT', 'R32G32_UINT', 'R32G32_SINT',
    'R32G8X24_TYPELESS', 'D32_FLOAT_S8X24_UINT', 'R32_FLOAT_X8X24_TYPELESS', 'X32_TYPELESS_G8X24_UINT',
    'R10G10B10A2_TYPELESS', 'R10G10B10A2_UNORM', 'R10G10B10A2_UINT', 'R11G11B10_FLOAT',
    'R8G8B8A8_TYPELESS', 'R8G8B8A8_UNORM', 'R8G8B8A8_UNORM_SRGB', 'R8G8B8A8_UINT', 'R8G8B8A8_SNORM', 'R8G8B8A8_SINT',
    'R16G16_TYPELESS', 'R16G16_FLOAT', 'R16G16_UNORM', 'R16G16_UINT', 'R16G16_SNORM', 'R16G16_SINT',
    'R32_TYPELESS', 'D32_FLOAT', 'R32_FLOAT', 'R32_UINT', 'R32_SINT',
    'R24G8_TYPELESS', 'D24_UNORM_S8_UINT', 'R24_UNORM_X8_TYPELESS', 'X24_TYPELESS_G8_UINT',
    'R8G8_TYPELESS', 'R8G8_UNORM', 'R8G8_UINT', 'R8G8_SNORM', 'R8G8_SINT',
    'R16_TYPELESS', 'R16_FLOAT', 'D16_UNORM', 'R16_UNORM', 'R16_UINT', 'R16_SNORM', 'R16_SINT',
    'R8_TYPELESS', 'R8_UNORM', 'R8_UINT', 'R8_SNORM', 'R8_SINT',
    'A8_UNORM', 'R1_UNORM', 'R9G9B9E5_SHAREDEXP', 'R8G8_B8G8_UNORM', 'G8R8_G8B8_UNORM',
    'BC1_TYPELESS', 'BC1_UNORM', 'BC1_UNORM_SRGB',
    'BC2_TYPELESS', 'BC2_UNORM', 'BC2_UNORM_SRGB',
    'BC3_TYPELESS', 'BC3_UNORM', 'BC3_UNORM_SRGB',
    'BC4_TYPELESS', 'BC4_UNORM', 'BC4_SNORM',
    'BC5_TYPELESS', 'BC5_UNORM', 'BC5_SNORM',
    'B5G6R5_UNORM', 'B5G5R5A1_UNORM', 'B8G8R8A8_UNORM', 'B8G8R8X8_UNORM',
    'R10G10B10_XR_BIAS_A2_UNORM', 'B8G8R8A8_TYPELESS', 'B8G8R8A8_UNORM_SRGB', 'B8G8R8X8_TYPELESS', 'B8G8R8X8_UNORM_SRGB',
    'BC6H_TYPELESS', 'BC6H_UF16', 'BC6H_SF16',
    'BC7_TYPELESS', 'BC7_UNORM', 'BC7_UNORM_SRGB',
    'AYUV', 'Y410', 'Y416', 'NV12', 'P010', 'P016', '420_OPAQUE', 'YUY2', 'Y210', 'Y216', 'NV11', 'AI44', 'IA44', 'P8', 'A8P8', 'B4G4R4A4_UNORM',
    'P208', 'V208', 'V408',
    'SAMPLER_FEEDBACK_MIN_MIP_OPAQUE', 'SAMPLER_FEEDBACK_MIP_REGION_USED_OPAQUE',
    'FORCE_UINT',
];

export const DXGI_FORMATS: string[] = DXGI_FORMAT_NAMES.flatMap((n) => [`DXGI_FORMAT_${n}`, n]);

/** 值补全枚举（按 key 名，依据 XXMI 各 EnumName_t 表：CommandList.h / Override.h / globals.h） */
export const VALUE_ENUMS: Record<string, string[]> = {
    pool_index_type: ['ring', 'fifo', 'static', 'spatial'], // PoolIndexTypeNames
    pool_lazy_initialization: ['0', '1'],
    pool_persist_variables: ['0', '1'],
    pool_element_type_switch_reset: ['0', '1'],
    pool_allocate_slot_on_missing: ['0', '1'],
    log_level: ['disabled', 'warning', 'info', 'debug'], // LogVerbosityNames
    marking_mode: ['skip', 'mono', 'original', 'pink'], // MarkingModeNames
    transition_type: ['linear', 'cosine'], // TransitionTypeNames
    release_transition_type: ['linear', 'cosine'],
    shader_hash: ['3dmigoto', 'embedded', 'bytecode'], // ShaderHashNames
    texture_hash: ['0', '1'],
    depth_filter: ['none', 'depth_active', 'depth_inactive'], // DepthBufferFilterNames
    get_resolution_from: ['swap_chain', 'depth_stencil'], // GetResolutionFromNames
    handling: ['skip', 'abort'],
    type: ['Buffer', 'StructuredBuffer', 'AppendStructuredBuffer', 'ConsumeStructuredBuffer', 'ByteAddressBuffer', 'Texture1D', 'Texture2D', 'Texture3D', 'TextureCube', 'RWBuffer', 'RWStructuredBuffer', 'RWByteAddressBuffer', 'RWTexture1D', 'RWTexture2D', 'RWTexture3D'], // CustomResourceTypeNames
    shader_model: ['vs_5_0', 'ps_5_0', 'hs_5_0', 'ds_5_0', 'gs_5_0', 'cs_5_0', 'vs_4_1', 'ps_4_1', 'vs_4_0', 'ps_4_0', 'vs_3_0', 'ps_3_0'],
    color_space: ['sRGB', 'Linear', 'default'], // CustomColorSpaceNames
    bind_flags: ['vertex_buffer', 'index_buffer', 'constant_buffer', 'shader_resource', 'stream_output', 'render_target', 'depth_stencil', 'unordered_access', 'decoder', 'video_encoder'], // CustomResourceBindFlagNames (CommandList.h)
    misc_flags: ['generate_mips', 'shared', 'texturecube', 'drawindirect_args', 'buffer_allow_raw_views', 'buffer_structured', 'resource_clamp', 'shared_keyedmutex', 'gdi_compatible', 'shared_nthandle', 'restricted_content', 'restrict_shared_resource', 'restrict_shared_resource_driver', 'guarded', 'tile_pool', 'tiled', 'hw_protected'], // ResourceMiscFlagNames (ResourceHash.h)
    marking_actions: ['abort', 'hlsl', 'asm', 'assembly', 'regex', 'ShaderRegex', 'clipboard'], // Hunting.cpp [Hunting] marking_actions
    analyse_options: ['dump_rt', 'dump_depth', 'dump_tex', 'dump_cb', 'dump_vb', 'dump_ib', 'jps', 'jpg', 'jpeg', 'dds', 'jps_dds', 'jpg_dds', 'jpeg_dds', 'buf', 'txt', 'desc', 'clear_rt', 'persist', 'mono', 'filename_reg', 'filename_handle', 'hold', 'dump_on_unmap', 'dump_on_update', 'deferred_ctx_immediate', 'deferred_ctx_accurate', 'share_dupes', 'symlink'], // FrameAnalysisOptionNames（log 已弃用，不提供补全）
    flags: ['skip_validation', 'skip_optimization', 'pack_matrix_row_major', 'pack_matrix_column_major', 'partial_precision', 'force_vs_software_no_opt', 'force_ps_software_no_opt', 'no_preshader', 'avoid_flow_control', 'prefer_flow_control', 'enable_strictness', 'enable_backwards_compatibility', 'ieee_strictness', 'optimization_level0', 'optimization_level1', 'optimization_level2', 'optimization_level3', 'warnings_are_errors', 'resources_may_alias', 'enable_unbounded_descriptor_tables', 'all_resources_bound'], // D3DCompile 着色器编译标志
};
