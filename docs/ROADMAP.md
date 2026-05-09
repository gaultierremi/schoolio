# Schoolio — Roadmap

## Vision produit

Schoolio doit permettre aux élèves de travailler seuls à la maison, puis donner au professeur une vision claire de qui comprend, qui bloque, et quels problèmes reviennent avant d’entrer en classe.

## Sprint 1 — Bêta Adrien-ready (~1-2 semaines)

### Bloc A — UX devoir élève (en cours)

- [ ] Feedback "Voir résultat / J'ai pas compris" sur mauvaise réponse
- [ ] Lien retour PDF vers page du concept
- [ ] Notation A-B-C-D côté prof
- [ ] Dashboard prof dynamique "qui a fait quoi"

### Bloc B — Banque de questions cohérente

- [ ] Filtrage strict des questions par classe + matière
- [ ] Extraction questions du PDF prof + tag origine prof/IA
- [ ] Devoir mixte 85% nouveau / 15% rappels chapitres précédents

## Sprint 2 — Différenciation (~3-4 semaines)

### Bloc C — Système remédiation cross-prof

- [ ] Fiche élève cachée partagée entre profs
- [ ] Notes cross-matière (un prof de français peut ajouter une observation utile au prof de maths)
- [ ] Analyse IA des observations récurrentes

### Bloc D — Mode papier + OCR

- [ ] Upload photo de résolution manuscrite
- [ ] OCR via Gemini Vision ou Claude Vision
- [ ] Validation transcrit par l'élève avant envoi prof

### Bloc Misc

- [ ] Vidéo YouTube optionnelle dans devoir
- [ ] Banque de questions concours médecine (import 12 PDFs ARES)

## Sprint 3 — Mode cours live (~4 semaines, V2 bêta)

### Bloc E — Cours live + présences

- [ ] Mode cours live : split-screen 20% présences / 80% PDF
- [ ] Fenêtre esclave projetée sur l'ordi de classe (code 6 caractères)
- [ ] Présences propagées entre périodes
- [ ] Compte à rebours du temps de cours
- [ ] Marque "où on s'est arrêté" dans le PDF
- [ ] Version PDF élève masquée auto (réponses blanchies)
- [ ] Détection auto de la classe à l'arrivée du prof

## Long terme

### Intégration SmartSchool (priorité haute mais en attente)

- [ ] OAuth2 SSO "Se connecter avec SmartSchool"
- [ ] Import classes + élèves en 1 clic (groupinfo scope)
- [ ] Push notifications devoirs (sendnotif scope)
- [ ] Push notes vers Skore (Exerciseresults scope)
- [ ] Logo Schoolio 156x156 PNG pour OAuth consent screen
- [ ] Demande OAuth credentials à SmartSchool (formulaire)

### Architecture multi-tenant B2B2C

- [ ] Table organizations (établissements scolaires)
- [ ] Colonne organization_id sur user_profiles, courses, classes, assignments
- [ ] UI admin école (vue tous les profs, stats agrégées)
- [ ] Facturation par établissement
- [ ] À planifier AVANT d'avoir trop de data legacy

### Différenciation IA

- [ ] Variantes d'exercices générées par IA (anti-triche, entraînement)
- [ ] Détection auto de chapitres dans PDF
- [ ] Extraction résolutions détaillées par étapes
- [ ] Génération PDF rapport d'inspection (norme belge)

## Dette technique

- [ ] Refacto app/school/organization/page.tsx (1370 lignes)
- [ ] Refacto app/school/import/page.tsx (999 lignes)
- [ ] Migrer admin whitelist hardcodée vers table DB
- [ ] Tracking cache Gemini dans activity_events (TODO existant)
- [ ] Tests E2E Playwright sur flows critiques
