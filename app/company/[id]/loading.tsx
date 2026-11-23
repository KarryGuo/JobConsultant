export default function CompanyLoading() {
  return (
    <div
      role="status"
      aria-label="正在加载企业档案"
      className="mx-auto max-w-4xl animate-pulse pb-28 pt-8 md:pb-12 md:pt-10"
    >
      <div className="h-3 w-24 bg-line" />

      <div className="mt-8 border-b border-line pb-7">
        <div className="h-3 w-32 bg-line" />
        <div className="mt-5 h-12 w-3/4 bg-line" />
        <div className="mt-5 h-3 w-1/2 bg-line" />
      </div>

      <div className="mt-9 border-l-2 border-line pl-5">
        <div className="h-3 w-24 bg-line" />
        <div className="mt-4 h-8 w-5/6 bg-line" />
        <div className="mt-2 h-8 w-3/5 bg-line" />
      </div>

      <div className="mt-12 border-t-2 border-line pt-6">
        <div className="h-6 w-40 bg-line" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-4 w-full bg-line" />
          ))}
        </div>
      </div>
    </div>
  );
}
