import type { AuthContext } from '../auth/auth-context';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import type { UploadedBookFile } from './books.types';

describe('BooksController identity boundary', () => {
  const auth: AuthContext = {
    kind: 'user',
    userId: 'user-a',
    email: 'a@example.com',
    name: 'A',
  };
  let booksService: {
    createFromUpload: jest.Mock;
    list: jest.Mock;
    getById: jest.Mock;
    retry: jest.Mock;
    delete: jest.Mock;
  };
  let controller: BooksController;

  beforeEach(() => {
    booksService = {
      createFromUpload: jest.fn().mockResolvedValue({ id: 'book-a' }),
      list: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue({ id: 'book-a' }),
      retry: jest.fn().mockResolvedValue({ id: 'book-a' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BooksController(booksService as unknown as BooksService);
  });

  it('always derives upload ownership from the authenticated user', async () => {
    const buffer = Buffer.from('content');
    const file: UploadedBookFile = {
      originalname: 'book.txt',
      mimetype: 'text/plain',
      size: buffer.length,
      buffer,
    };

    await controller.upload(file, auth);

    expect(booksService.createFromUpload).toHaveBeenCalledWith('user-a', file);
  });

  it('uses the authenticated user for reads and deletion', async () => {
    await controller.list(auth);
    await controller.getById('book-a', auth);
    await controller.retry('book-a', auth);
    await controller.delete('book-a', auth);

    expect(booksService.list).toHaveBeenCalledWith('user-a');
    expect(booksService.getById).toHaveBeenCalledWith('user-a', 'book-a');
    expect(booksService.retry).toHaveBeenCalledWith('user-a', 'book-a');
    expect(booksService.delete).toHaveBeenCalledWith('user-a', 'book-a');
  });
});
