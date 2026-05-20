# Docs pilotes

Documents à partager avec les 3 écoles pilotes Maïa (rentrée 2026).

## `Maia-Pilote-Test-Guide.xlsx`

Template Excel à donner à chaque testeur (prof ou élève référent). 4 onglets :

- **Lisez-moi** : consignes générales, contact, nouveautés Sprint 5-6
- **Public** : 9 URLs accessibles sans connexion
- **Élève** : 19 URLs du parcours élève
- **Prof** : 24 URLs du parcours prof

Chaque ligne a 3 cellules vides (Réponse / Notes / Remarques) avec hauteur ~75px pour permettre la prise de notes manuscrite ou tapée.

## Workflow recommandé

1. Dupliquer le template pour chaque testeur avec son nom :
   ```bash
   cp Maia-Pilote-Test-Guide.xlsx "Maia-Pilote-Test-Guide-École1-Marie.xlsx"
   ```
2. Envoyer le fichier au testeur (ou partage via Drive)
3. Récupérer les fichiers remplis + agréger les feedbacks dans `pilotes@maia.app`

## Régénérer le template

Si tu modifies la liste d'URLs ou la copy, régénère :
```bash
python3 docs/pilotes/gen-pilote-xlsx.py docs/pilotes/Maia-Pilote-Test-Guide.xlsx
```

Le script source se trouve dans le repo (à committer la prochaine fois que tu touches au contenu).
