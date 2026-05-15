// TODO: Replace with d3-geo + TopoJSON interactive map when react-simple-maps
// is wired up. For now, display a hint text (the user sees the original PNG
// via the image_url branch).
export function GeoMap({ topojsonPath, className }: { topojsonPath: string; className?: string }) {
  return (
    <div className={className ?? "my-2 rounded-md bg-blue-50 p-3 text-xs dark:bg-blue-950"}>
      <p className="text-blue-700 dark:text-blue-300">
        Carte vectorielle : <code className="font-mono">{topojsonPath}</code>
        <br />
        <span className="text-gray-500">(rendu SVG interactif en PR future)</span>
      </p>
    </div>
  );
}
