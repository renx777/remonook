import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
test('checked-in Android widget palettes match the source tokens',()=>{
 execFileSync(process.execPath,['scripts/gen-widget-palettes.mjs','--check']);
});
