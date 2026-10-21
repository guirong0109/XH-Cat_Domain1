import { useState } from 'react';
import PreviewBanner from '../components/PreviewBanner.jsx';

const DRAFT_NOTE = 'UI text: our draft translation, to be checked by a fluent speaker.';

const COPY = {
  en: {
    button: 'EN',
    badge: 'For diploma and foundation students in Malaysia',
    title: 'See where you fit in Malaysia’s AI-era job market',
    body:
      'Tell us your skills. We show which jobs are rising, how much AI will change them, your best-fit roles and a step-by-step plan to get there. Built on official MASCO and OpenDOSM data.',
    primary: 'Try as Aina (sample student)',
    secondary: 'Start my own profile',
    note: null,
  },
  ms: {
    button: 'BM',
    lang: 'ms',
    badge: 'Untuk pelajar diploma dan asasi di Malaysia',
    title: 'Lihat tempat anda dalam pasaran kerja era AI Malaysia',
    body:
      'Beritahu kami kemahiran anda. Kami tunjukkan kerja yang meningkat, sejauh mana AI akan mengubahnya, dan pelan langkah demi langkah.',
    primary: 'Cuba sebagai Aina',
    secondary: 'Mula profil saya',
    note: DRAFT_NOTE,
  },
  zh: {
    button: '中文',
    lang: 'zh',
    badge: '中文界面 · 同一页面',
    title: '看看你在马来西亚 AI 时代就业市场中的位置',
    body: '告诉我们你的技能。我们会显示哪些工作在增长、AI 会如何改变它们，以及一步一步的学习计划。',
    primary: null,
    secondary: null,
    note: DRAFT_NOTE,
  },
};

const SOURCES = [
  { code: 'EN', tone: 'bg-slate-50', text: 'eMASCO English pages (as today).' },
  { code: 'BM', tone: 'bg-teal-50', text: 'eMASCO official Malay pages. Same source, same date. Badge: “Sumber rasmi”.' },
  {
    code: '中文',
    tone: 'bg-orange-50',
    text: 'No official Chinese source. Role tasks would be machine-translated and marked “机器翻译 · Machine translated”.',
  },
];

export default function PreviewLang() {
  const [lang, setLang] = useState('ms');
  const copy = COPY[lang];

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-8 sm:px-6">
      <PreviewBanner>Translations here are drafts.</PreviewBanner>
      <div role="group" aria-label="Language" className="flex self-start overflow-hidden rounded-[10px] border border-slate-300 text-sm">
        {Object.entries(COPY).map(([code, item]) => (
          <button
            key={code}
            type="button"
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
            className={`min-h-11 min-w-14 cursor-pointer border-0 px-3 ${
              lang === code ? 'bg-[#0F766E] font-bold text-white' : 'bg-white text-[#0F172A]'
            }`}
          >
            {item.button}
          </button>
        ))}
      </div>

      <section lang={copy.lang} className="flex max-w-[640px] flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <span className="self-start rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-800">{copy.badge}</span>
        <h1 className="m-0 text-[28px] leading-tight font-extrabold sm:text-[34px]">{copy.title}</h1>
        <p className="m-0 text-[15px] text-slate-700">{copy.body}</p>
        {copy.primary && (
          <div className="flex flex-wrap gap-2.5" aria-hidden="true">
            <span className="flex min-h-11 items-center rounded-[10px] border-2 border-dashed border-slate-400 bg-slate-100 px-4 text-sm font-bold text-slate-600">{copy.primary} (preview)</span>
            <span className="flex min-h-11 items-center rounded-[10px] border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-sm text-slate-600">{copy.secondary} (preview)</span>
          </div>
        )}
        {copy.note && (
          <div lang="en" className="text-xs text-slate-600">
            {copy.note}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="m-0 text-base font-bold">Where role text comes from in each language</h2>
        <div className="grid gap-3 text-[13px] text-slate-700 sm:grid-cols-3">
          {SOURCES.map((item) => (
            <div key={item.code} className={`rounded-[10px] p-3 ${item.tone}`}>
              <strong>{item.code}</strong>
              <br />
              {item.text}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
