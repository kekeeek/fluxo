# Site Fluxo (GitHub Pages)

Site vitrine **et** application web complète pour Fluxo. Aucun backend : l'appli web parle directement à l'API gofile depuis le navigateur, et garde jeton/historique/paramètres dans le stockage local du navigateur.

## Fichiers

- `index.html` — page d'accueil (présentation, téléchargement, FAQ, lien vers l'appli web)
- `app.html` / `app.js` / `app.css` — l'application web complète : upload (glisser-déposer), connexion par jeton gofile, dossiers, gestionnaire de fichiers, historique avec recherche/tri, QR code, renommer/supprimer, formulaire de contact
- `qrcode.lib.js` — bibliothèque QR code embarquée (licence MIT, aucun appel réseau externe)
- `404.html` — le système de liens courts : GitHub Pages sert ce fichier pour toute URL sans correspondance (ex : `tonsite.com/r/AbC123`), qui redirige immédiatement vers le vrai fichier gofile

## Structure du projet (déploiement Cloudflare Workers)

Cloudflare a unifié Workers et Pages : connecter un dépôt Git via "Workers & Pages → Workers → Create Worker" crée maintenant un **Worker** avec assets statiques, pas un projet Pages classique. La structure du dépôt reflète ça :

- `public/` — tout le site statique (`index.html`, `app.html`, `app.css`, `app.js`, `style.css`, `qrcode.lib.js`, icônes, `404.html`)
- `src/index.js` — le script du Worker : sert les fichiers statiques depuis `public/`, et pour `/r/<code>` va chercher le fichier chez gofile côté serveur et le renvoie sous le domaine Fluxo
- `wrangler.toml` — la config qui dit à Cloudflare où trouver tout ça

## Redéployer après une modification

1. Sur GitHub (`kekeeek/fluxo`) → **Add file → Upload files** → glisse les fichiers modifiés en respectant les dossiers (`public/...`, `src/index.js`, ou `wrangler.toml` à la racine)
2. Commit changes
3. Cloudflare redéploie automatiquement le Worker à chaque push

## Ajouter ton jeton gofile (recommandé)

Pour éviter de créer un nouveau compte invité gofile à chaque visite :
1. **dash.cloudflare.com** → ton Worker `fluxo` → **Settings → Variables**
2. Ajoute une variable : nom `GOFILE_TOKEN`, valeur = ton jeton gofile, coche "Encrypt"
3. Sauvegarde — le Worker redéploie automatiquement avec la nouvelle variable

## Brancher les liens dans l'appli Fluxo

Une fois le Worker en ligne à son adresse (`https://fluxo.tonsous-domaine.workers.dev` ou un domaine personnalisé attaché) :
1. Ouvre l'appli Fluxo (PC ou web) → **Paramètres → Lien public**
2. Colle cette adresse
3. Les liens copiés/affichés utiliseront ce domaine au lieu du lien gofile brut

## Différence avec l'appli de bureau

La connexion ne peut pas se faire de la même façon que dans l'appli Electron : gofile bloque l'affichage de sa page de connexion dans un site tiers (protection anti-clickjacking). Sur le web, la connexion se fait donc en collant son jeton API gofile (récupérable sur `gofile.io/myProfile`) dans les paramètres. Tout le reste (upload, dossiers, historique, privé/public, QR code, contact) fonctionne à l'identique.

## Activer l'envoi silencieux du formulaire de contact

Par défaut, le formulaire de contact ouvre le client mail du visiteur (fonctionne sans rien configurer). Pour un envoi silencieux :
1. Crée un compte gratuit sur [emailjs.com](https://www.emailjs.com).
2. Configure un service d'envoi et un template avec un champ destinataire réglé sur `adkip0@outlook.fr`.
3. Dans `app.js`, remplace les trois valeurs `YOUR_EMAILJS_...` par ton `serviceId`, `templateId` et `publicKey` EmailJS.

## Déployer sur GitHub Pages

1. Crée un dépôt GitHub public nommé `fluxo` sous ton compte `kekeeek`.
2. Mets tous les fichiers de ce dossier à la racine du dépôt (ou dans un dossier `docs/` si tu préfères cette option).
3. Dans les paramètres du dépôt → **Pages**, choisis la branche et le dossier à publier.
4. Ton site sera accessible à **`https://kekeeek.github.io/fluxo/`**, et l'appli web à **`https://kekeeek.github.io/fluxo/app.html`**.
5. *(Optionnel)* Pour un vrai domaine comme `fluxo.com` : achète le nom de domaine chez un registrar, ajoute un fichier `CNAME` à la racine contenant `fluxo.com`, et configure les enregistrements DNS chez ton registrar pour pointer vers GitHub Pages (voir la doc GitHub "Managing a custom domain for your GitHub Pages site").

## Brancher les liens dans l'appli Fluxo

Une fois le site en ligne :
1. Ouvre l'appli Fluxo → **Paramètres** → section **Lien public**.
2. Colle `https://kekeeek.github.io/fluxo` (ou ton domaine perso si tu en configures un).
3. À partir de là, les liens copiés/affichés dans l'appli auront la forme `https://fluxo.com/r/AbC123` au lieu du lien gofile brut — et rediront automatiquement vers le vrai fichier.

## Mettre à jour les liens de téléchargement

Dans `index.html`, remplace `TON-PSEUDO/fluxo` par le nom réel de ton dépôt GitHub une fois que tu auras publié les fichiers `.exe` dans une [release GitHub](https://docs.github.com/fr/repositories/releasing-projects-on-github).

## Limite honnête

Ce mécanisme suppose que le code gofile à la fin du lien (`gofile.io/d/AbC123` → `AbC123`) reste un identifiant stable et unique — ce qui est le cas selon la doc actuelle de gofile, mais leur API est en beta et peut changer. Si un jour les liens gofile changent de format, il faudra ajuster la logique d'extraction dans `404.html` et dans `src/renderer.js` (fonction `extractGofileCode`) côté appli.
