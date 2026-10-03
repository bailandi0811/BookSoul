// Inline PNG of the shared Lucide BookOpen brand mark in neutral paper and ink.
// Rasterized from the existing vector at 96px for crisp email rendering.
// Keep the bytes in compiled source so production needs no asset-copy config,
// file-system reads, public image host, or client build to send auth mail.
/*
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The MIT License (MIT) (for portions derived from Feather)

Copyright (c) 2013-2026 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export const AUTH_MAIL_LOGO_CID = 'booksoul-logo@booksoul.mail';
export const AUTH_MAIL_LOGO = Buffer.from(
  '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',
  'base64',
);
