import type { ReactNode } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BookCover } from "@/components/BookCover";

export function AuthShell({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="auth-page text-foreground">
      <AppHeader account={false} action={action} />
      <div className="auth-layout">
        <div className="auth-scene">
          <h1 className="font-display">AI 藏书室</h1>
          <p>
            一册书，一个私人助手。
            <br />
            收好你的书签，继续未完的对话。
          </p>
          <div className="auth-books" aria-hidden="true">
            <BookCover bookId="brand-stories" title="故事" variant={1} />
            <BookCover bookId="brand-bookmarks" title="书签" variant={3} />
            <BookCover
              bookId="brand-echoes"
              title="回声"
              variant={0}
              bookmarked
            />
          </div>
          <div className="auth-quote font-reading">把书放下，故事继续。</div>
          <div className="auth-promise">
            <span>
              <LockKeyhole size={13} />
              只属于你的书房
            </span>
            <span>
              <ShieldCheck size={13} />
              跟随书签，安心讨论
            </span>
          </div>
        </div>
        <section className="auth-panel">{children}</section>
      </div>
      <footer className="auth-footer">
        <ShieldCheck size={12} />
        你的书籍、对话与书签，保存在私人账号中。
      </footer>
    </main>
  );
}
