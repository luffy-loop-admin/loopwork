export default function SearchBox({ defaultValue = '', size = 'lg' }: { defaultValue?: string; size?: 'lg' | 'md' }) {
  return (
    <form action="/search" method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
      <label htmlFor="q" className="sr-only">Website</label>
      <input
        id="q"
        name="q"
        defaultValue={defaultValue}
        placeholder="example.com"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={`input ${size === 'lg' ? 'min-h-[52px] text-base' : ''}`}
      />
      <button type="submit" className={`btn btn-primary ${size === 'lg' ? 'min-h-[52px] px-6 text-base' : ''}`}>Search</button>
    </form>
  );
}
