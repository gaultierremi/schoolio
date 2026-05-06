/* Page promo Schoolio - non-listée */
export default function PubPage() {
  return (
    <iframe
      src="/promo-standalone.html"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
      title="Schoolio Promo"
    />
  );
}
