import { BookCover } from "@/components/BookCover";
import { BookSoulMark } from "@/components/BookSoulMark";
import { ArrowRight, FileText, LockKeyhole, Quote, ShieldCheck, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";

const promiseItems = [
  {
    icon: LockKeyhole,
    title: "私有",
    copy: "你的小说、书签和对话只属于当前账号。",
  },
  {
    icon: Quote,
    title: "引用",
    copy: "回答可以回到原文位置，线索清晰可查。",
  },
  {
    icon: ShieldCheck,
    title: "防剧透",
    copy: "助手只谈你读到的地方，边界由检索控制。",
  },
];

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="landing-page text-foreground">
      <nav className="landing-nav" aria-label="首页导航">
        <div className="landing-brand">
          <BookSoulMark active />
          <span className="landing-brand-name">BookSoul</span>
          <span className="landing-brand-caption">私人小说阅读助手</span>
        </div>
        <button
          type="button"
          className="landing-nav-action tap-spring"
          onClick={onEnter}
        >
          进入书房
          <ArrowRight size={16} strokeWidth={1.6} />
        </button>
      </nav>

      <section className="landing-hero" aria-labelledby="landing-title">
        <motion.div
          className="landing-copy"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="landing-kicker">属于你的小说书房</p>
          <h1 id="landing-title" className="font-display">
            BookSoul
            <span>私人小说阅读助手</span>
          </h1>
          <p className="landing-lead">
            把小说放进一间会记得进度的书房。每本书都有独立助手，只围绕你已经读到的地方回答。
          </p>
          <div className="landing-actions">
            <button
              type="button"
              className="landing-primary tap-spring"
              onClick={onEnter}
            >
              开始阅读
              <ArrowRight size={18} strokeWidth={1.6} />
            </button>
            <a className="landing-secondary tap-spring" href="#landing-promises">
              了解流程
            </a>
          </div>
          <p className="landing-note">
            上传 EPUB / TXT，书签、对话、引用和书内记忆都会留在当前账号与当前书籍中。
          </p>
        </motion.div>

        <motion.div
          className="landing-stage"
          aria-label="BookSoul 阅读书房预览"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.46, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="landing-book-row" aria-hidden="true">
            <div className="landing-book landing-book-left">
              <BookCover bookId="landing-mountain" title="山与潮汐" />
            </div>
            <div className="landing-book landing-book-main">
              <BookCover bookId="landing-night" title="长夜与春" bookmarked />
            </div>
            <div className="landing-book landing-book-right">
              <BookCover bookId="landing-mist" title="雾中行" />
            </div>
          </div>

          <button
            type="button"
            className="landing-read-card landing-paper-note tap-spring"
            aria-label="继续阅读《长夜与春》"
            onClick={onEnter}
          >
            <p>继续阅读</p>
            <div className="landing-read-card-body">
              <div className="landing-mini-cover">
                <BookCover bookId="landing-night" title="长夜与春" compact />
              </div>
              <div>
                <h2 className="font-reading">长夜与春</h2>
                <span>第 12 节 空山有灯</span>
              </div>
              <ArrowRight size={18} strokeWidth={1.5} />
            </div>
            <div className="landing-progress" aria-hidden="true">
              <span />
            </div>
          </button>

          <section className="landing-scope-card landing-paper-note" aria-label="防剧透范围示例">
            <FileText size={28} strokeWidth={1.35} />
            <div>
              <h2>助手只看已读范围</h2>
              <p>只谈你读到的地方</p>
            </div>
          </section>

          <section className="landing-upload-card landing-paper-note" aria-label="上传小说示例">
            <UploadCloud size={26} strokeWidth={1.4} />
            <div>
              <h2>上传小说，建立私人书库</h2>
              <p>支持 EPUB / TXT</p>
            </div>
          </section>
        </motion.div>
      </section>

      <section
        id="landing-promises"
        className="landing-promises"
        aria-label="BookSoul 承诺"
      >
        {promiseItems.map(({ icon: Icon, title, copy }) => (
          <article key={title}>
            <Icon size={31} strokeWidth={1.35} />
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
