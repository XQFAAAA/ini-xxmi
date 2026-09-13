// 格式化冒烟测试：验证 formatText 的缩进 / 去尾空格 / 等号对齐
const { formatText } = require('../client/dist/parser/format');

const failures = [];
function check(name, actual, expected) {
    const ok = actual === expected;
    console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
    if (!ok) {
        failures.push(name);
        console.log('--- expected ---');
        console.log(JSON.stringify(expected));
        console.log('--- actual ---');
        console.log(JSON.stringify(actual));
    }
}

// 场景 1：flow 缩进 + 去尾空格 + key=value 统一空格
const messy = `[CommandListFoo]
if $foo == 0   
$bar = 1    
else
$bar = 2
endif

[Constants]  
global $x = 1
x=3
`;
const expected1 = `[CommandListFoo]
if $foo == 0
    $bar = 1
else
    $bar = 2
endif

[Constants]
global $x = 1
x = 3
`;
check('flow indent + trim + key spacing', formatText(messy), expected1);

// 场景 2：嵌套 if
const nested = `[CommandListFoo]
if $a == 1
if $b == 2
$x = 1
endif
endif
`;
const expected2 = `[CommandListFoo]
if $a == 1
    if $b == 2
        $x = 1
    endif
endif
`;
check('nested if indent', formatText(nested), expected2);

// 场景 3：等号对齐（alignEquals）
const alignIn = `[Foo]
a=1
long_key=2

[Bar]
zz=9
`;
const expected3 = `[Foo]
a        = 1
long_key = 2

[Bar]
zz = 9
`;
check('align equals', formatText(alignIn, { alignEquals: true }), expected3);

// 场景 4：regex 子节内容不动
const regexIn = `[ShaderRegex1]
shader_model = ps_5_0

[ShaderRegex1.Pattern]
mul r\\d+\\.xyzw, r\\d+\\.yyyy\n

[ShaderRegex1.Pattern.Replace]
\\n
`;
const regexOut = formatText(regexIn);
check('regex sub-section content preserved', regexOut, regexIn);

console.log(failures.length === 0 ? '\nALL PASSED' : `\n${failures.length} FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
