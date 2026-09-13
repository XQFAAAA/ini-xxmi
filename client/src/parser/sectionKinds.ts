import { SectionKind, RegexSub } from './types';

// 与 syntaxes/xxmi-ini.tmLanguage.json 的 section 分类保持一致
// （对应 IniHandler.cpp 的 CommandListSections / RegularSections）
const COMMAND_LIST = /^(?:textureoverride|shaderoverride|customshader|commandlist|shaderregex|builtincommandlist|builtincustomshader|constants|present|clear(?:rendertargetview|depthstencilview|unorderedaccessviewuint|unorderedaccessviewfloat))/i;
const RESOURCE = /^(?:pool|resource)/i;
const CONFIG = /^(?:loader|include|hunting|system|device|rendering|logging)/i;
const INTERACTION = /^(?:key|preset)/i;
const OTHER = /^(?:profile|stereo|convergencemap)/i;

export function classifySection(name: string): SectionKind {
    if (COMMAND_LIST.test(name)) {
        return SectionKind.CommandList;
    }
    if (RESOURCE.test(name)) {
        return SectionKind.Resource;
    }
    if (CONFIG.test(name)) {
        return SectionKind.Config;
    }
    if (INTERACTION.test(name)) {
        return SectionKind.Interaction;
    }
    return SectionKind.Other;
}

const REGEX_SUB = /^shaderregex\w+\.(pattern(?:\.replace)?|insertdeclarations)$/i;

export function regexSubSection(name: string): RegexSub | undefined {
    const m = REGEX_SUB.exec(name);
    if (!m) {
        return undefined;
    }
    const sub = m[1].toLowerCase();
    if (sub === 'pattern') {
        return 'pattern';
    }
    if (sub === 'pattern.replace') {
        return 'replace';
    }
    return 'insert';
}
