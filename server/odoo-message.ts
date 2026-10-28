export type OdooMessageMention = { partnerId: number; name: string };

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildOdooInternalNoteBody(body: string, mentions: OdooMessageMention[]) {
  let html = escapeHtml(body).replace(/\r\n?/g, '\n').replace(/\n/g, '<br/>');
  const partnerIds: number[] = [];

  for (const mention of mentions) {
    if (!Number.isSafeInteger(mention.partnerId) || mention.partnerId < 1 || !mention.name) continue;
    const token = escapeHtml(`@${mention.name}`);
    let index = html.indexOf(token);
    while (index >= 0) {
      const previousAnchorOpen = html.lastIndexOf('<a ', index);
      const previousAnchorClose = html.lastIndexOf('</a>', index);
      const nextCharacter = html[index + token.length] || '';
      if (previousAnchorOpen <= previousAnchorClose && !/[\p{L}\p{N}_]/u.test(nextCharacter)) break;
      index = html.indexOf(token, index + token.length);
    }
    if (index < 0) continue;
    const anchor = `<a href=\"#\" class=\"o_mail_redirect\" data-oe-model=\"res.partner\" data-oe-id=\"${mention.partnerId}\">${token}</a>`;
    html = `${html.slice(0, index)}${anchor}${html.slice(index + token.length)}`;
    partnerIds.push(mention.partnerId);
  }

  return { body: html, partnerIds };
}

export function odooHtmlToPlainText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    // Older notes were escaped by message_post and contain an encoded anchor instead of a real link.
    .replace(/&lt;a\b[\s\S]*?&gt;([\s\S]*?)&lt;\/a\s*&gt;/gi, '$1')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '\"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n[ \t]*\n+/g, '\n').trim();
}

export function isDisplayableOdooMessage(body: string, attachmentIds: number[]) {
  return Boolean(body.trim()) || attachmentIds.length > 0;
}
