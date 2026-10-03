import type { Attachment } from 'nodemailer/lib/mailer';
import { AUTH_MAIL_LOGO, AUTH_MAIL_LOGO_CID } from '../auth/auth-mail-logo';

export function escapeMailHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export function buildMailLayout({
  title,
  preview,
  content,
  category,
  footer,
}: {
  title: string;
  preview: string;
  content: string;
  category: string;
  footer: string;
}): { html: string; attachments: Attachment[] } {
  // Inline styles, tables, a plain-text alternative and the embedded brand
  // image keep mail readable without scripts, remote fonts or image requests.
  return {
    html: `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeMailHtml(title)} · AI 藏书室</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f2;color:#242424;">
<div aria-hidden="true" style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeMailHtml(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f5f5f2;font-family:'Microsoft YaHei','PingFang SC','Segoe UI',Arial,sans-serif;">
<tr><td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td style="padding:0 4px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="48" valign="middle"><img src="cid:${AUTH_MAIL_LOGO_CID}" width="44" height="44" alt="书魂 Logo" style="display:block;width:44px;height:44px;border:0;"></td>
<td valign="middle" style="padding-left:12px;"><p style="margin:0;color:#242424;font-family:'Songti SC',SimSun,Georgia,serif;font-size:24px;line-height:32px;">BookSoul</p><p style="margin:3px 0 0;color:#666661;font-size:12px;line-height:20px;">AI 藏书室</p></td>
</tr></table></td></tr>
<tr><td style="padding:28px 24px;background-color:#fbfbf8;border:1px solid #d8d8cf;border-top:3px solid #82704e;border-radius:12px;word-break:break-word;overflow-wrap:anywhere;">
<p style="margin:0 0 14px;color:#242424;font-size:12px;line-height:20px;">${escapeMailHtml(category)}</p>
<h1 style="margin:0 0 22px;color:#242424;font-family:'Songti SC',SimSun,Georgia,serif;font-size:26px;font-weight:600;line-height:38px;">${escapeMailHtml(title)}</h1>
${content}
</td></tr>
<tr><td style="padding:20px 4px 0;"><p style="margin:0;color:#666661;font-size:12px;line-height:22px;">${escapeMailHtml(footer)}</p><p style="margin:8px 0 0;color:#666661;font-size:12px;line-height:22px;">BookSoul · AI 藏书室</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
    attachments: [
      {
        filename: 'booksoul-logo.png',
        content: AUTH_MAIL_LOGO,
        contentType: 'image/png',
        contentDisposition: 'inline',
        cid: AUTH_MAIL_LOGO_CID,
      },
    ],
  };
}

export function buildReadingMail(
  subject: string,
  text: string,
): { html: string; attachments: Attachment[] } {
  return buildMailLayout({
    title: subject,
    preview: '来自 BookSoul AI 藏书室的阅读笔记。',
    category: '阅读笔记',
    content: `<div style="color:#242424;font-size:16px;line-height:30px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;">${escapeMailHtml(text)}</div>`,
    footer: '这封阅读笔记经用户确认后发送，请勿直接回复。',
  });
}
