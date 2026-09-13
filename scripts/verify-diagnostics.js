// 诊断冒烟测试：验证 analyzer 各规则
const { analyze } = require('../client/dist/parser/analyzer');

const sample = `
[Constants]
global $foo = 1
global $foo = 2
global locked $bar = 1
$bar = 2
$x = $baz + 1

[KeyToggleUI]
Key = M
Key = N

[CommandListFoo]
if $foo == 0
    run = CommandListMissing
else
    run = CommandListFoo
endif
if $x > 0

[ResourceBad]
type = Bogus
pool_size = 0
format = R32_FLOAT

[PoolFifoPersist]
pool_size = 2
pool_index_type = fifo
pool_persist_variables = 1

[Constants2]
global $big = 0b11111111111111111111111111
$x = countbits($foo
y = 1 +
z = unknownfn(1)
$w = "unclosed

[ShaderRegex2.Pattern]
mul r\\d+\\n

[ShaderRegex3]
shader_model = ps_5_0

[ShaderRegex3.Pattern]
(?P<name>abc

[CommandListProxyA]
CommandListA = ref CommandListB

[CommandListProxyB]
CommandListB = ref CommandListA

[KeyBad]
Key = VK_UNKNOWNKEY
Key = no_modfiers VK_F10
`;

const diags = analyze(sample);
const codes = diags.map((d) => d.code);
const byCode = {};
for (const c of codes) byCode[c] = (byCode[c] || 0) + 1;

const failures = [];
function expect(code, min) {
    const got = byCode[code] || 0;
    const ok = got >= min;
    console.log(`${ok ? 'ok   ' : 'FAIL '} ${code}: ${got}`);
    if (!ok) failures.push(code);
}

console.log('--- diagnostics (' + diags.length + ' total) ---');
diags.forEach((d) => console.log(`  [${d.severity}] ${d.code}: ${d.message} @L${d.range.start.line + 1}`));

expect('duplicate-variable', 1);
expect('assign-to-locked', 1);
expect('undeclared-variable', 1);
expect('unknown-command-list', 1);
expect('unterminated-if', 1);
expect('invalid-enum', 1);
expect('invalid-pool-size', 1);
expect('fifo-persist', 1);
expect('expr-parens', 1);
expect('expr-missing-operand', 1);
expect('expr-unknown-function', 1);
expect('expr-string', 1);
expect('regex-syntax', 1);
expect('proxy-cycle', 1);
expect('invalid-vk', 1);
expect('invalid-key-binding', 1);
expect('binary-overflow', 1);
expect('bad-regex-subsection', 1);

// Key* 节重复 Key 应被白名单放行
const dupKey = diags.filter((d) => d.code === 'duplicate-key');
console.log(`${dupKey.length === 0 ? 'ok   ' : 'FAIL '} duplicate-key: ${dupKey.length} (expect 0, Key/Back whitelisted)`);
if (dupKey.length !== 0) failures.push('duplicate-key');

console.log(failures.length === 0 ? '\nALL PASSED' : `\n${failures.length} FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
