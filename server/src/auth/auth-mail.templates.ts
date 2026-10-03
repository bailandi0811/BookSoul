import type { Attachment } from 'nodemailer/lib/mailer';
import type { OtpPurpose } from './auth-challenge.types';
import {
  buildMailLayout,
  escapeMailHtml as escapeHtml,
} from '../mail/mail-template';

export interface AuthMailContent {
  subject: string;
  text: string;
  html: string;
  attachments: Attachment[];
}

function message(
  subject: string,
  text: string,
  title: string,
  preview: string,
  content: string,
): AuthMailContent {
  return {
    subject,
    text,
    ...buildMailLayout({
      title,
      preview,
      content,
      category: '账号安全',
      footer: '这是一封自动发送的账号安全邮件，请勿直接回复。',
    }),
  };
}

export function buildOtpMail(
  code: string,
  purpose: OtpPurpose,
): AuthMailContent {
  const registration = purpose === 'REGISTRATION';
  const operation = registration ? '注册' : '邮箱验证';
  return message(
    '书魂邮箱验证码',
    `您的${operation}验证码是：${code}\n10 分钟内有效，请勿向他人提供。若非本人操作，请忽略此邮件。`,
    registration ? '欢迎来到 AI 藏书室' : '验证你的邮箱',
    `${operation}验证码 10 分钟内有效，请返回书魂完成验证。`,
    `<p style="margin:0;color:#666661;font-size:15px;line-height:26px;">${registration ? '欢迎来到书魂。请在注册页面输入以下验证码，完成邮箱验证。' : '请在书魂账号设置页面输入以下验证码，完成邮箱验证。'}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:24px 0;background-color:#f5f5f2;border:1px solid #d8d8cf;border-radius:12px;">
            <tr><td align="center" style="padding:20px 8px;">
              <p style="margin:0 0 10px;color:#666661;font-size:12px;line-height:20px;">${operation}验证码</p>
              <p style="margin:0;color:#242424;font-family:Consolas,'Courier New',monospace;font-size:34px;font-weight:700;line-height:44px;letter-spacing:5px;">${escapeHtml(code)}</p>
              <p style="margin:10px 0 0;color:#666661;font-size:12px;line-height:20px;">10 分钟内有效 · 仅可使用一次</p>
            </td></tr>
          </table>
          <p style="margin:0;color:#666661;font-size:13px;line-height:23px;">请勿向任何人提供验证码。若非本人操作，请忽略此邮件。</p>`,
  );
}

export function buildResetMail(url: string): AuthMailContent {
  const link = escapeHtml(url);
  return message(
    '书魂密码重置',
    `请打开以下链接设置新密码：\n${url}\n链接 30 分钟内有效，仅可使用一次。若非本人操作，请忽略此邮件。`,
    '重置你的密码',
    '书魂密码重置链接 30 分钟内有效，且只能使用一次。',
    `<p style="margin:0;color:#666661;font-size:15px;line-height:26px;">我们收到了你的密码重置申请。点击下方按钮，为书魂账号设置新密码。</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 16px;">
            <tr><td align="center" bgcolor="#242424" style="background-color:#242424;border-radius:10px;">
              <a href="${link}" style="display:inline-block;padding:14px 28px;border:1px solid #242424;border-radius:10px;background-color:#242424;color:#fbfbf8;font-size:15px;font-weight:600;line-height:24px;text-decoration:none;">设置新密码</a>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;color:#666661;font-size:13px;line-height:23px;">链接 <strong style="color:#242424;">30 分钟</strong> 内有效，且只能使用一次。</p>
          <p style="margin:0 0 8px;padding-top:20px;border-top:1px solid #d8d8cf;color:#666661;font-size:12px;line-height:22px;">按钮无法打开？复制下面的链接到浏览器：</p>
          <p style="margin:0 0 24px;font-size:12px;line-height:22px;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;"><a href="${link}" style="color:#242424;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;">${link}</a></p>
          <p style="margin:0;color:#666661;font-size:13px;line-height:23px;">若非本人操作，请忽略此邮件。你的密码只有在提交新密码后才会改变。</p>`,
  );
}

export function buildPasswordChangedMail(): AuthMailContent {
  return message(
    '书魂密码已修改',
    '您的书魂账号密码已修改，之前的登录凭证已失效。如非本人操作，请立即通过找回密码保护账号。',
    '密码已修改',
    '你的书魂账号密码已更新，请使用新密码重新登录。',
    `<p style="margin:0;color:#666661;font-size:15px;line-height:26px;">你的书魂账号密码已成功修改。请使用新密码重新登录，继续你的阅读。</p>
          <p style="margin:24px 0;padding:16px;background-color:#f5f5f2;border:1px solid #d8d8cf;border-radius:12px;color:#242424;font-size:14px;line-height:24px;">为保护账号安全，之前的登录凭证已失效。</p>
          <p style="margin:0;color:#666661;font-size:13px;line-height:23px;">若非本人操作，请立即通过书魂登录页的“忘记密码”保护账号。</p>`,
  );
}
