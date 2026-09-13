// 解析器冒烟测试：验证 sample.ini 解析结果
const fs = require('fs');
const { parse } = require('../client/dist/parser/parser');

const text = fs.readFileSync('tests/fixtures/sample.ini', 'utf8');
const doc = parse(text);

const failures = [];
function check(name, cond, actual) {
    if (cond) {
        console.log(`ok   ${name}`);
    } else {
        failures.push(name);
        console.log(`FAIL ${name}  (got: ${JSON.stringify(actual)})`);
    }
}

check('sections count', doc.sections.length >= 20, doc.sections.length);

const byName = Object.fromEntries(doc.sections.map((s) => [s.name, s]));

check('[Constants] kind', byName['Constants'].kind === 'command-list', byName['Constants'].kind);
check('[Loader] kind', byName['Loader'].kind === 'config', byName['Loader'].kind);
check('[PoolFoo] kind', byName['PoolFoo'].kind === 'resource', byName['PoolFoo'].kind);
check('[KeyToggleExample] kind', byName['KeyToggleExample'].kind === 'interaction', byName['KeyToggleExample'].kind);
check('[ShaderRegex1.Pattern] regexSub', byName['ShaderRegex1.Pattern'].regexSub === 'pattern', byName['ShaderRegex1.Pattern'].regexSub);
check('[ShaderRegex1.Pattern.Replace] regexSub', byName['ShaderRegex1.Pattern.Replace'].regexSub === 'replace', byName['ShaderRegex1.Pattern.Replace'].regexSub);

const c2 = byName['Constants2'];
const menu = c2.lines.find((l) => l.type === 'variable-decl' && l.name === '$menu');
check('global $menu (no init)', menu && menu.initValue === null, menu && menu.initValue);
const bin = c2.lines.find((l) => l.type === 'variable-decl' && l.name === '$bin');
check('global $bin = 0b01010111', bin && bin.initValue === '0b01010111', bin && bin.initValue);
const locked = byName['Constants'].lines.find((l) => l.type === 'variable-decl' && l.name === '$locked_var');
check('global locked', locked && locked.locked === true && locked.initValue === '1.23', locked && { l: locked.locked, v: locked.initValue });

const clf = byName['CommandListFoo'];
const flows = clf.lines.filter((l) => l.type === 'flow');
check('if/else/endif flows', flows.length === 3 && flows.map((f) => f.keyword).join(',') === 'if,else,endif', flows.map((f) => f.keyword));
check('if condition', flows[0] && flows[0].condition === '$foo == 0 && cursor_showing', flows[0] && flows[0].condition);

const pat = byName['ShaderRegex1.Pattern'];
const regexLines = pat.lines.filter((l) => l.type === 'regex-content');
check('pattern regex lines (incl [xyzw] start)', regexLines.length === 3, regexLines.length);
check('pattern line starting with [', regexLines[2] && regexLines[2].text.startsWith('[xyzw]{2}'), regexLines[2] && regexLines[2].text);

const il = byName['InputLayoutExample'];
const el = il.lines.find((l) => l.type === 'key-value' && l.key.includes('ElementFormat'));
check('input-layout keyKind', el && el.keyKind === 'input-layout', el && el.keyKind);

const so = byName['ShaderOverride1'];
const hash = so.lines.find((l) => l.type === 'key-value' && l.key === 'Hash');
check('Hash value', hash && hash.value === '69732c4f23cb6c48', hash && hash.value);

const store = byName['StoreExample'];
const st = store.lines.find((l) => l.type === 'key-value' && l.key === 'store');
check('store value', st && st.value === '$out, ResourceFoo, 4', st && st.value);

console.log(failures.length === 0 ? '\nALL PASSED' : `\n${failures.length} FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
