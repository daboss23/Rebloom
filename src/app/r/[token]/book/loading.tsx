/** While the times are worked out: the page's shape, with the light moving through it. */
export default function Loading() {
  return (
    <div className="pb-4 pt-8" role="status" aria-live="polite">
      <span className="sr-only">Finding open times</span>
      <div aria-hidden className="animate-pulse">
        <div className="h-11 w-28 rounded-full bg-white/60" />
        <div className="mt-6 h-3 w-40 rounded-full bg-[#9fc9dd]/50" />
        <div className="mt-5 h-10 w-4/5 rounded-[12px] bg-white/70" />
        <div className="mt-3 h-10 w-3/5 rounded-[12px] bg-white/70" />
        <div className="mt-10 flex gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[96px] w-[70px] rounded-[16px] bg-white/60" />
          ))}
        </div>
      </div>
      <p className="t-caption mt-8 text-center">Finding open times</p>
    </div>
  );
}
