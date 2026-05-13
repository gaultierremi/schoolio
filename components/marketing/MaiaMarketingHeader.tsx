import Link from "next/link";

export default function MaiaMarketingHeader() {
  return (
    <nav
      className="sticky top-0 z-40 border-b border1"
      style={{ background: "rgb(var(--surface) / 0.92)", backdropFilter: "blur(10px)" }}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl accent-bg text-white font-bold">
            M
          </div>
          <span className="serif text-xl font-semibold ink">Maïa</span>
        </Link>

        <div className="hidden items-center gap-7 text-sm md:flex">
          <a href="#produit" className="ink2 hover:ink">Le produit</a>
          <a href="#comment" className="ink2 hover:ink">Comment ça marche</a>
          <a href="#programme" className="ink2 hover:ink">Programme</a>
          <a href="#securite" className="ink2 hover:ink">Sécurité</a>
          <a href="#pilote" className="ink2 hover:ink">Pilote école</a>
          <a href="#faq" className="ink2 hover:ink">FAQ</a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm ink2 hover:ink md:inline"
          >
            Connexion
          </Link>
          <a
            href="#pilote"
            className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Demander une démo
          </a>
        </div>
      </div>
    </nav>
  );
}
