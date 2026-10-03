export function CouponsTableLoadingRows() {
  return (
    <div className="grid gap-2.5 px-3 py-3 sm:gap-3 sm:px-7 sm:py-5">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-xl bg-(--canvas)" />
      ))}
    </div>
  );
}
