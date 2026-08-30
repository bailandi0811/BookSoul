import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendEmailDto } from './send-email.dto';

describe('SendEmailDto', () => {
  it('accepts a confirmed, bounded plain-text draft and trims headers', async () => {
    const dto = plainToInstance(SendEmailDto, {
      to: '  reader@example.com ',
      subject: '  阅读笔记 ',
      text: '正文',
      confirmed: true,
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      to: 'reader@example.com',
      subject: '阅读笔记',
    });
  });

  it.each([
    [{ to: 'not-an-email' }, 'to'],
    [{ subject: '   ' }, 'subject'],
    [{ text: '   ' }, 'text'],
    [{ confirmed: false }, 'confirmed'],
  ])('rejects an unsafe draft override', async (override, property) => {
    const dto = plainToInstance(SendEmailDto, {
      to: 'reader@example.com',
      subject: '阅读笔记',
      text: '正文',
      confirmed: true,
      ...override,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === property)).toBe(true);
  });
});
