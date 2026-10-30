export function ShortcutKeys({
  className = "",
  keys,
}: {
  className?: string;
  keys: readonly string[];
}) {
  return (
    <span className={`shortcut-keys ${className}`.trim()} aria-hidden="true">
      {keys.map((key, index) => (
        <span className="shortcut-keys__part" key={`${key}-${index}`}>
          {index > 0 && <span className="shortcut-keys__join">+</span>}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}
