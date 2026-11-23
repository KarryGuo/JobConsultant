export default function CompaniesLoading() {
  return (
    <div
      role="status"
      aria-label="正在加载企业档案索引"
      className="mx-auto max-w-4xl animate-pulse pb-16 pt-12"
    >
      <div className="h-3 w-24 bg-line" />

      <div className="mt-7 border-b-2 border-line pb-6">
        <div className="h-3 w-28 bg-line" />
        <div className="mt-4 h-10 w-48 bg-line" />
        <div className="mt-4 h-4 w-2/3 bg-line" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-8 w-20 bg-line" />
        ))}
      </div>

      <div className="mt-10 space-y-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="border-t border-line py-4">
            <div className="h-3 w-20 bg-line" />
            <div className="mt-3 h-5 w-1/2 bg-line" />
            <div className="mt-2 h-3 w-1/3 bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
