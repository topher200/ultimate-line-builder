export function ScreenStub({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">{title}</h1>
      <p className="max-w-xl text-lg text-slate-400">{blurb}</p>
      <span className="rounded-full bg-slate-700 px-4 py-1 text-sm uppercase tracking-wide text-slate-300">
        Not built yet
      </span>
    </div>
  );
}
