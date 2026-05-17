import Link from "next/link";

export default function MaiaFooter() {
  return (
    <footer className="border-t border1 py-12" style={{ background: "rgb(var(--surface))" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl accent-bg text-white text-xs font-bold">
                M
              </div>
              <span className="serif text-lg font-semibold ink">Maïa</span>
            </Link>
            <p className="ink2 mt-3 text-sm leading-relaxed">
              Plateforme d&apos;apprentissage augmentée pour le secondaire. Belgique ·
              France.
            </p>
          </div>

          {/* Produit */}
          <div>
            <p className="ink3 text-xs uppercase tracking-wide font-semibold mb-3">
              Produit
            </p>
            <ul className="space-y-2 text-sm ink2">
              <li>
                <a href="#produit" className="hover:ink">
                  Pour les élèves
                </a>
              </li>
              <li>
                <a href="#produit" className="hover:ink">
                  Pour les profs
                </a>
              </li>
              <li>
                <a href="#produit" className="hover:ink">
                  Pour les écoles
                </a>
              </li>
              <li>
                <a href="#programme" className="hover:ink">
                  Programme couvert
                </a>
              </li>
            </ul>
          </div>

          {/* Confiance */}
          <div>
            <p className="ink3 text-xs uppercase tracking-wide font-semibold mb-3">
              Confiance
            </p>
            <ul className="space-y-2 text-sm ink2">
              <li>
                <a href="#securite" className="hover:ink">
                  Sécurité &amp; RGPD
                </a>
              </li>
              <li>
                <button type="button" className="hover:ink text-left">
                  Politique de confidentialité
                </button>
              </li>
              <li>
                <button type="button" className="hover:ink text-left">
                  Conditions générales
                </button>
              </li>
              <li>
                <button type="button" className="hover:ink text-left">
                  DPA &amp; DPIA
                </button>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="ink3 text-xs uppercase tracking-wide font-semibold mb-3">
              Contact
            </p>
            <ul className="space-y-2 text-sm ink2">
              <li>
                <a href="mailto:hello@schoolio.app" className="hover:ink">
                  hello@schoolio.app
                </a>
              </li>
              <li>
                <a href="#pilote" className="hover:ink">
                  Postuler école pilote
                </a>
              </li>
              <li>
                <a
                  href="https://linkedin.com"
                  className="hover:ink"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <button type="button" className="hover:ink text-left">
                  Status
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="divider mt-10" />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs ink3">
          <p>© 2026 Maïa · Bruxelles, Belgique · TVA BE 0XXX.XXX.XXX</p>
          <div className="flex items-center gap-4">
            <button type="button" className="hover:ink2">
              Mentions légales
            </button>
            <button type="button" className="hover:ink2">
              Cookies
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
