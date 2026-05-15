// TODO: Replace with Imago Toolkit WASM rendering when @iqg/indigo-ketcher
// is wired up. For now, display SMILES string + description as text.
export function MoleculeRenderer({
  smiles,
  description,
  className,
}: {
  smiles: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className ?? "my-2 rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800"}>
      <p className="font-mono text-xs text-gray-700 dark:text-gray-300">
        SMILES : <span className="font-semibold">{smiles}</span>
      </p>
      {description && (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{description}</p>
      )}
    </div>
  );
}
