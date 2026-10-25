import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reminderEmoji,reminderEmojiTokens} from '../src/reminder-emojis.mjs';
import {validateNotoWebp,validateNotoPoster} from '../src/noto-emojis.mjs';
import {eventKinds} from '../src/calendar-events.mjs';
test('every reminder category uses an existing Noto emoji with validated offline animation and reduced-motion poster',async()=>{
 assert.equal(reminderEmoji('birthday').fallback,'🎂');assert.equal(reminderEmoji('bill').fallback,'⚡');
 for(const kind of eventKinds)assert.ok(reminderEmojiTokens[kind.id]);
 for(const codepoint of new Set(Object.values(reminderEmojiTokens))){const name=`noto_${codepoint}`;const animation=new Uint8Array(await readFile(`public/reminder-emojis/${name}.webp`)),poster=new Uint8Array(await readFile(`public/reminder-emojis/${name}.svg`));validateNotoWebp(animation);validateNotoPoster(poster);}
 const license=await readFile('public/reminder-emojis/LICENSE.txt','utf8');assert.match(license,/Google/);assert.match(license,/CC BY 4.0/);
});
