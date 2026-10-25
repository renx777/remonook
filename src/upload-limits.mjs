export const MAX_UPLOAD_BYTES=2*1024*1024;
export const MAX_ATTACHMENT_BYTES=20*1024*1024;
export const attachmentBytes=assets=>[...assets.values()].reduce((sum,blob)=>sum+blob.size,0);
export function checkUploadFile(file){if(file.size>MAX_UPLOAD_BYTES)throw Error('File too large. Choose a file up to 2 MB. Use an online embed for larger media.');}
export function checkAttachmentBudget(assets){if(attachmentBytes(assets)>MAX_ATTACHMENT_BYTES)throw Error('Attachment storage is full (20 MB). Remove unused attachments in Settings, or use online embeds.');}
export function checkNewAssets(assets,added){for(const blob of added.values())checkUploadFile(blob);const next=new Map(assets);for(const [path,blob] of added)next.set(path,blob);checkAttachmentBudget(next);}
