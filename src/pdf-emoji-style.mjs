/** Respect explicit text presentation; digits, copyright and trademarks stay text. */
export function wantsColorEmoji(text){
 if(text.includes('\uFE0E'))return false;
 return /\p{Emoji_Presentation}/u.test(text)||text.includes('\u20E3')||text.includes('\uFE0F')&&/\p{Emoji}/u.test(text);
}
