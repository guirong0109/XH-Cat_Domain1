import flow from '../content/system-flow.txt?raw';

// Home page: how the system works, as the plain-text flow from the proposal. Scrolls sideways on narrow screens.
export default function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <h2 id="how-heading" className="m-0 text-xl font-bold">
        How FutureReady works
      </h2>
      <p className="m-0 text-sm text-slate-600">
        From your skills to a ranked role list. AI finds similar text (embeddings); the match score itself is a fixed formula you can check.
      </p>
      <pre
        tabIndex={0}
        aria-label="System flow diagram in text form"
        className="m-0 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800"
      >
        {flow}
      </pre>
    </section>
  );
}
