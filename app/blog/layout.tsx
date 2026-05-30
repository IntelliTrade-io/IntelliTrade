export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex justify-center px-4 sm:px-6 xl:px-0">
      <div className="w-full max-w-5xl">
        <main className="mb-auto">{children}</main>
      </div>
    </div>
  );
}
