import {getNotoEmoji} from './noto-emojis.mjs';
export const reminderEmojiTokens={birthday:'1f382',exam:'1f4da',bill:'26a1',appointment:'1f514',anniversary:'2764_fe0f',renewal:'23f3',subscription:'1f4b8',target:'26a1',task:'26a1',travel:'2708_fe0f',other:'1f514'};
export const reminderEmoji = kind=>getNotoEmoji(`:noto_${reminderEmojiTokens[kind]||reminderEmojiTokens.other}:`);
