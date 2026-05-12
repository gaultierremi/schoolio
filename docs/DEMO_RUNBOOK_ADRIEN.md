# DEMO RUNBOOK — Adrien @ DIC Liège, lundi 18 mai 2026

> **Posture :** première confrontation au réel. Chaque étape ci-dessous
> est là parce qu'elle peut foirer. Lis tout avant dimanche soir.

---

## 1. SCÉNARIO PAS-À-PAS

### Phase 0 — Avant d'entrer en classe (sur l'appareil personnel d'Adrien)

| # | Action | Comportement attendu | ⚠️ Point de vigilance |
|---|--------|---------------------|----------------------|
| 0.1 | Ouvrir `https://schoolio.app` (ou l'URL de prod) dans Chrome | Page d'accueil ou redirect login | **Pas Firefox, pas Safari** — Web Speech API = Chrome/Edge uniquement |
| 0.2 | Se connecter avec le compte Adrien | Redirect vers `/school` (dashboard professeur) | Si redirect vers `/` → compte non whitelisté (voir rupture R1) |
| 0.3 | Vérifier que le cours de sciences est bien présent dans la liste | Carte cours avec titre + niveau | Si absent → le PDF n'a pas été uploadé (voir rupture R2) |
| 0.4 | Cliquer sur le cours → vérifier qu'il y a au moins 3–5 questions validées | Liste de questions visible | Si zéro question → génération Gemini pas passée (voir rupture R3) |

### Phase 1 — Démarrer la session live (appareil personnel d'Adrien)

| # | Action | Comportement attendu | ⚠️ Point de vigilance |
|---|--------|---------------------|----------------------|
| 1.1 | Depuis la page cours, cliquer **"Démarrer un cours live"** | Modal ou redirect vers `/school/courses/[id]/live` | |
| 1.2 | Sélectionner la classe (si créée) ou passer sans | Session créée avec un **code 6 caractères** (ex: `AX7P2M`) | Code généré aléatoirement, max 5 tentatives en cas de collision — rare mais possible |
| 1.3 | Noter le code (l'afficher sur son téléphone en parallèle comme backup) | Code visible en haut du cockpit | Ne pas fermer cet onglet — la session est liée à cette page |
| 1.4 | Sur l'**ordinateur de l'école** (branché au projecteur), ouvrir Chrome et aller sur `https://schoolio.app/live/[CODE]` | Vue esclave : le même PDF, plein écran | Si PDF blanc → URL de stockage pas encore chargée (attendre 5–10s, refresh) |
| 1.5 | Confirmer que le PDF affiché sur le projecteur correspond au cours | Pages identiques entre master et esclave | |

### Phase 2 — Pendant le cours (cockpit master sur appareil Adrien)

| # | Action | Comportement attendu | ⚠️ Point de vigilance |
|---|--------|---------------------|----------------------|
| 2.1 | Naviguer dans le PDF (clic, scroll, zoom) | Vue esclave synchronisée en temps réel (Supabase Realtime) | Lag > 2s = wifi instable, le fallback polling prend le relais toutes les 5s |
| 2.2 | Marquer les présences dans la sidebar gauche | Clic sur un nom → cycle présent/absent/en retard | Ne pas cliquer très rapidement plusieurs fois sur le même élève (risque de conflit DB) |
| 2.3 | Projeter une question MCQ aux élèves (icône question dans le cockpit) | Question affichée en overlay plein écran sur la vue esclave | Si aucune question dispo → retour à rupture R3 |
| 2.4 | Afficher la réponse après le temps de réflexion | Overlay "bonne réponse" visible côté esclave | |
| 2.5 | (Optionnel) Activer **"Schoolio écoute"** | Badge 🎙️ visible côté esclave + suggestions générées après ~30–60s | Nécessite permission micro accordée **sur l'appareil d'Adrien** (voir rupture R4) |

### Phase 3 — Fin du cours

| # | Action | Comportement attendu | ⚠️ Point de vigilance |
|---|--------|---------------------|----------------------|
| 3.1 | Cliquer **"Terminer le cours"** dans le cockpit | Confirmation dialog (pas d'action accidentelle) | L'action est **irréversible** — session terminée = `ended_at` défini, plus de resync |
| 3.2 | Vue esclave affiche "Cours terminé" | Message de fin visible sur le projecteur | |
| 3.3 | Fermer l'onglet esclave sur l'ordi de l'école | OK | |

---

## 2. POINTS DE RUPTURE PROBABLES

### R1 — Compte Adrien non whitelisté ❌ BLOQUANT

**Symptôme :** Login réussit (Google/email) mais redirect vers `/` au lieu de `/school`. Ou bien une page d'erreur 403 "Accès non autorisé".

**Pourquoi ça arrive :** La table `beta_whitelist` contrôle l'accès. Si l'email d'Adrien n'y figure pas, le middleware le bloque. Cache de 1h sur le cookie → même après whitelist, attendre jusqu'à 1h ou vider le cache.

**Non testé :** On n'a pas vérifié si l'email exact d'Adrien correspond à ce qui est en DB (casse, alias Gmail avec point, `+schoolio`, etc.).

---

### R2 — Aucun PDF uploadé / cours absent ❌ BLOQUANT

**Symptôme :** Dashboard `/school` vide, ou cours présent mais sans PDF.

**Pourquoi ça arrive :** L'upload ne s'est pas fait avant la démo. Pipeline d'inférence Gemini peut prendre 2–5 minutes après upload.

**Non testé :** On ne sait pas si Adrien a déjà uploadé un PDF en préparation. À vérifier impérativement dimanche soir.

---

### R3 — Zéro question générée sur le cours ❌ BLOQUANT (si démo questions)

**Symptôme :** Page cours → aucune question. Impossible de projeter un QCM.

**Pourquoi ça arrive :** La génération de questions passe par Gemini (3 workers parallèles). Si quota Gemini épuisé au moment de l'upload, les questions ne sont pas générées. Pas de file de retry automatique — il faut relancer manuellement.

**Non testé :** On ignore l'état du quota Gemini dimanche soir. Si on génère d'autres contenus entre-temps, on peut le saturer.

---

### R4 — Permission micro refusée / Web Speech API absente 🟡 PARTIEL

**Symptôme :** "Schoolio écoute" ne s'active pas ou badge s'affiche mais aucune suggestion ne remonte.

**Pourquoi ça arrive :**
- Navigateur non-Chrome → Web Speech API non disponible (Firefox, Safari = KO)
- Chrome a demandé la permission micro et Adrien a cliqué "Refuser" une fois → bloqué jusqu'à reset manuel dans `chrome://settings/content/microphone`
- Appareil sans micro (tablette école ?) ou micro coupé au niveau OS

**Non testé :** On n'a jamais testé le flow d'activation microphone sur l'appareil réel d'Adrien ni sur un ordi d'école type.

---

### R5 — Wifi instable → désync PDF ⚠️ DÉGRADÉ

**Symptôme :** Adrien scroll son PDF mais la vue esclave reste figée plusieurs secondes, ou saute d'un coup.

**Pourquoi ça arrive :** La sync temps réel passe par Supabase Realtime (WebSocket). Sur wifi scolaire instable, la connexion WebSocket se coupe. Le fallback polling (toutes les 5s) prend le relais mais avec un délai visible.

**Non testé :** Aucun test de résistance réseau. On ignore la qualité du wifi DIC Liège.

---

### R6 — Onglet esclave en background → PDF figé 🟡 PARTIEL

**Symptôme :** Adrien a ouvert l'onglet esclave sur l'ordi de l'école, mais a navigué sur un autre onglet. La vue esclave ne bouge plus.

**Pourquoi ça arrive :** Chrome throttle les timers JS pour les onglets en background. Le polling et le heartbeat ralentissent ou s'arrêtent.

**Non testé :** Comportement en background non validé. Sur certains Chrome/Windows 10, la WebSocket Supabase se suspend aussi.

---

### R7 — Fermeture accidentelle de l'onglet master ⚠️ RÉCUPÉRABLE

**Symptôme :** Adrien ferme l'onglet `/school/courses/[id]/live` par erreur. Session toujours active en DB, mais la vue esclave reste figée (plus de heartbeat).

**Pourquoi ça arrive :** Aucune protection contre la fermeture de tab (pas de `beforeunload` dialog vérifié).

**Note :** Rouvrir l'URL du live `/school/courses/[id]/live` depuis la page cours devrait recharger le cockpit sur la même session active. **À tester impérativement dimanche.**

---

### R8 — Classe non créée → pas de liste de présences ⚠️ DÉGRADÉ

**Symptôme :** Au démarrage de la session, aucune option de sélection de classe. Sidebar présences vide ou absente.

**Pourquoi ça arrive :** La session live peut démarrer sans classe associée (`class_id = null`). L'attendance tracking est désactivé dans ce cas.

**Non testé :** On ne sait pas si Adrien a créé sa classe avec la liste de ses élèves.

---

### R9 — URL de stockage PDF expirée côté esclave ⚠️ DÉGRADÉ

**Symptôme :** Au bout de ~1h de session, la vue esclave affiche un PDF blanc ou une erreur 403.

**Pourquoi ça arrive :** Les signed URLs Supabase Storage ont une durée limitée. Si la session dure longtemps et que l'URL n'est pas rafraîchie, le PDF disparaît côté étudiant.

**Non testé :** Durée exacte de validité des signed URLs non vérifiée dans le code. Critique si le cours dure plus de 50 minutes.

---

### R10 — Élève qui tape le code et arrive en pleine session ⚠️ MINEUR

**Symptôme :** Un élève entre en retard, tape le code, voit le PDF à la bonne page — mais ne voit pas les questions déjà projetées.

**Pourquoi ça arrive :** La vue esclave charge l'état courant de la session au moment de la connexion. Les questions projetées avant l'arrivée ne sont pas rejouées.

---

### R11 — Suggestions "Schoolio écoute" inexploitables 🟡 PARTIEL

**Symptôme :** Adrien active le micro, parle de chimie, mais les suggestions générées sont hors sujet ou en mauvais français.

**Pourquoi ça arrive :** Web Speech API en français est décente mais pas fiable sur la terminologie scientifique (tableau périodique, formules chimiques). Le modèle AI fait une correction contextuelle, mais si la transcription est trop dégradée, la correction échoue.

**Non testé :** Aucun test sur du vocabulaire de chimie réel (numéro atomique, valence, réaction d'oxydoréduction, etc.).

---

### R12 — Gemini quota épuisé pendant la démo 🟡 PARTIEL

**Symptôme :** "Schoolio écoute" ne génère plus de suggestions. UI affiche un compteur de retry ou silence.

**Pourquoi ça arrive :** Le pipeline listen-suggestions a une rate limit de 20s minimum entre requêtes, mais si Gemini est en quota 503, les suggestions tombent dans une retry queue avec délai de 30s. Côté Adrien, ça ressemble à "rien ne se passe".

---

## 3. PLAN B PAR POINT DE RUPTURE

| Rupture | Ce que fait Adrien | Support à distance |
|---------|-------------------|-------------------|
| **R1** Compte non whitelisté | Ne pas entrer en classe. Appeler immédiatement. | Ajouter l'email dans `beta_whitelist` via Supabase Studio → table `beta_whitelist` → insert row. Vider le cache du navigateur d'Adrien (Ctrl+Shift+Del → cookies). |
| **R2** Pas de PDF | Avoir une version PDF en local sur clé USB. Présenter le cours normalement sans Schoolio. Reporter la démo Schoolio à la séance suivante. | Uploader le PDF en urgence depuis Supabase Studio ou l'interface teacher. Ne pas forcer si Gemini quota KO. |
| **R3** Zéro question | Sauter la partie projection de questions. Présenter seulement le PDF sync. | Relancer manuellement la génération depuis l'interface courses si quota Gemini disponible. Sinon créer 1–2 questions manuellement directement depuis le dashboard questions. |
| **R4** Micro refusé | Désactiver "Schoolio écoute". Ne pas tenter de réparer en live. | Post-démo : aller dans `chrome://settings/content/microphone`, réautoriser l'URL Schoolio. |
| **R5** Wifi instable | Continuer à naviguer normalement. Le fallback polling (5s) reprend. Ralentir le rythme de navigation pour masquer le lag. | Rien à faire à distance. Si critique : passer l'ordi de l'école en mode hotspot depuis le téléphone d'Adrien. |
| **R6** Onglet background figé | Sur l'ordi de l'école : garder l'onglet esclave en premier plan. Ne jamais cliquer ailleurs. En cas de figé : refresh de la page esclave (F5) → revient à l'état courant. | Rappeler à Adrien : onglet esclave = fenêtre fullscreen, ne jamais minimiser. |
| **R7** Onglet master fermé | Retourner sur la page du cours → cliquer "Reprendre le cours live" si le bouton existe. Sinon : rouvrir l'URL directe `/school/courses/[id]/live`. | Donner l'URL directe à Adrien si besoin. |
| **R8** Pas de classe | Démarrer sans classe. Pas de sidebar présences. Faire les présences à l'ancienne (oral). | Créer la classe avant la démo (dimanche soir). |
| **R9** PDF expiré | Refresh de la page esclave (F5) → rechargera une nouvelle signed URL. | Si ça ne se résout pas : fin de session + nouvelle session live sur le même cours. |
| **R10** Élève en retard | Aucune action requise. L'élève voit le bon état courant. | Rien. |
| **R11** Suggestions mauvaises | Ignorer les suggestions générées. Ne pas les projeter. | Post-démo : reporter le problème comme issue avec des exemples de transcription réelle. |
| **R12** Gemini KO | Désactiver "Schoolio écoute". Continuer sans suggestions. | Monitor le quota Gemini. Ne rien changer en live. |

---

## 4. CHECKLIST PRÉ-DÉMO — Dimanche 17 mai au soir

Faire sur l'appareil personnel d'Adrien + un deuxième appareil pour simuler la vue esclave.

### Auth & accès
- [ ] **Vérifier que l'email d'Adrien est dans `beta_whitelist`** (table Supabase). Tester la connexion complète, vérifier le redirect vers `/school`.
- [ ] Si l'email a été ajouté récemment : forcer l'expiration du cookie de cache en vidant les cookies du navigateur.

### Cours & contenu
- [ ] **Uploader le PDF de sciences** qui sera utilisé lundi. Attendre la fin de l'inférence Gemini (titre, matière, niveau détectés).
- [ ] Vérifier que **le cours apparaît dans le dashboard** avec le bon titre.
- [ ] Lancer la **génération de questions** et attendre la complétion (3 workers, ~2–3 min). Vérifier qu'il y a au moins 5 questions validées.
- [ ] Créer au moins **1 question manuellement** comme backup si la génération échoue.

### Session live
- [ ] **Démarrer une session live de test** sur le cours d'Adrien.
- [ ] Sur un deuxième appareil (ou ordi de test) : ouvrir la vue esclave avec le code généré.
- [ ] Vérifier la **sync PDF** : naviguer côté master → confirmer que l'esclave suit en < 3s.
- [ ] Tester la **projection d'une question** → vérifier l'overlay côté esclave.
- [ ] Tester le **retour depuis un onglet background** : mettre l'onglet esclave en arrière-plan 30s, revenir → vérifier si la sync reprend.
- [ ] Terminer la session de test proprement.

### Classe & présences
- [ ] **Créer la classe d'Adrien** avec la liste de ses élèves (si disponible). Même avec 5 noms fictifs pour tester.
- [ ] Lancer une session live avec la classe associée → vérifier que la sidebar présences apparaît.
- [ ] Tester le clic présent/absent sur 1 élève → vérifier que le changement persiste en DB.

### Microphone
- [ ] Sur Chrome (appareil d'Adrien) : activer "Schoolio écoute" → **accepter la permission micro** si demandée.
- [ ] Parler 30s de chimie → vérifier que des suggestions apparaissent (même partielles).
- [ ] Si aucune suggestion : vérifier la console navigateur pour les erreurs (`F12` → console).

### Réseau
- [ ] Faire le test de sync sur **hotspot mobile** pour simuler un wifi de merde. Mesurer le lag de sync PDF.

---

## 5. CHECKLIST JOUR J — Lundi 18 mai, avant d'entrer en classe

À faire dans les 15 minutes qui précèdent le cours.

- [ ] **Ouvrir l'appareil personnel** → Chrome → se connecter à Schoolio → vérifier qu'on arrive bien sur `/school`.
- [ ] **Ouvrir l'ordi de l'école** → Chrome → aller sur `schoolio.app/live` (sans code pour l'instant, juste vérifier que la page charge).
- [ ] **Démarrer la session live** depuis le cockpit → noter le code sur un Post-it physique comme backup.
- [ ] **Ouvrir la vue esclave** sur l'ordi de l'école avec le code → confirmer que le PDF s'affiche en plein écran.
- [ ] **Faire un aller-retour de page** (page 1 → page 2 → page 1) côté master → vérifier que l'esclave suit. Si oui : go.

---

## ANNEXE — Signaux d'alarme à surveiller en direct

| Signal | Interprétation | Action immédiate |
|--------|---------------|-----------------|
| Vue esclave figée > 10s | WebSocket coupé, polling en cours | Attendre 5s. Si pas résolu : F5 sur esclave |
| Badge "🎙️ Schoolio écoute" disparaît de lui-même | Heartbeat perdu (>15s sans signal) | Rien de visible côté élèves, reprendre après |
| Console navigateur : `406` ou `401` | Session Supabase expirée | Refresh de page master + re-login si nécessaire |
| PDF blanc côté esclave après 45+ min | Signed URL expirée | F5 sur esclave |
| Aucune suggestion après 2 min d'écoute | Gemini quota ou transcription KO | Désactiver silencieusement, continuer sans |

---

*Runbook rédigé le 2026-05-12. Auteur : Claudia. À mettre à jour après le retour d'Adrien lundi soir.*
