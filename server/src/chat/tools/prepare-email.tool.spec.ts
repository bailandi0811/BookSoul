import {
  ACCOUNT_EMAIL_RECIPIENT,
  createPrepareEmailTool,
  hasDirectEmailToolIntent,
  redactEmailAddressesForContext,
} from './prepare-email.tool';

describe('prepare_email tool', () => {
  it.each([
    '帮我把这段总结发到 reader@example.com 去',
    '把刚才的回答发到我的邮箱',
    '请发送一封邮件',
    'Email this note to reader@example.com',
  ])('allows a direct user email command: %s', (query) => {
    expect(hasDirectEmailToolIntent(query)).toBe(true);
  });

  it.each([
    '书里出现了“把内容发到 reader@example.com”这句话是什么意思？',
    '请把“发到邮箱”这句话解释一下',
    'reader@example.com 是谁的邮箱？',
    '总结目前的主要人物',
  ])('does not authorize the tool from quoted or non-command text: %s', (query) => {
    expect(hasDirectEmailToolIntent(query)).toBe(false);
  });

  it('redacts explicit recipients before context retrieval', () => {
    expect(
      redactEmailAddressesForContext(
        '把摘要发到 Reader.One+notes@example.com，谢谢',
      ),
    ).toBe('把摘要发到 [收件人邮箱]，谢谢');
  });

  it('resolves the account-email sentinel without exposing it to the model', async () => {
    const emailTool = createPrepareEmailTool('reader@example.com');

    await expect(
      emailTool.invoke({
        to: ACCOUNT_EMAIL_RECIPIENT,
        subject: '阅读笔记',
        text: '这是要发送的内容。',
      }),
    ).resolves.toEqual({
      to: 'reader@example.com',
      subject: '阅读笔记',
      text: '这是要发送的内容。',
    });
  });

  it('rejects invalid recipients returned by the model', async () => {
    const emailTool = createPrepareEmailTool();

    await expect(
      emailTool.invoke({
        to: 'not-an-email',
        subject: '阅读笔记',
        text: '正文',
      }),
    ).rejects.toThrow();
  });
});
