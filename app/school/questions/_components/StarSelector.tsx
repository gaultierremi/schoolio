export function StarSelector({
  value,
  onChange,
}: {
  value: 1 | 2 | 3 | null;
  onChange: (v: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3] as const).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-xl leading-none transition ${
            value !== null && star <= value
              ? "text-yellow-400 hover:text-yellow-300"
              : "text-gray-600 hover:text-gray-400"
          }`}
          aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
