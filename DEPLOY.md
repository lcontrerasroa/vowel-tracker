# Déploiement sur GitHub Pages

## Prérequis

- Node.js installé sur ta machine (version 18+). Si ce n'est pas le cas : https://nodejs.org
- Un compte GitHub

## Étapes

### 1. Crée ton repo GitHub

Crée un nouveau repo sur GitHub (par exemple `vowel-space-tracker`).

### 2. Vérifie le nom du repo dans la config

Ouvre `vite.config.js` et vérifie que la ligne `base` correspond au nom exact de ton repo :

```js
base: '/vowel-space-tracker/',  // ← doit correspondre au nom de ton repo
```

Si ton repo s'appelle `mon-super-projet`, mets `/mon-super-projet/`.

### 3. Pousse le code

Dans le dossier du projet, ouvre un terminal :

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/TON-USERNAME/vowel-space-tracker.git
git push -u origin main
```

### 4. Active GitHub Pages

Dans ton repo sur GitHub :

1. Va dans **Settings** → **Pages**
2. Sous **Source**, sélectionne **GitHub Actions**

C'est tout. Le fichier `.github/workflows/deploy.yml` s'occupe du reste automatiquement.

### 5. Attends ~2 minutes

GitHub va :
- Installer les dépendances (`npm install`)
- Compiler le JSX en JS standard (`npm run build`)
- Déployer le dossier `dist/` sur Pages

Tu peux suivre la progression dans l'onglet **Actions** de ton repo.

### 6. Accède à ton app

Ton app sera en ligne à :

```
https://TON-USERNAME.github.io/vowel-space-tracker/
```

## Mises à jour

Chaque `git push` sur la branche `main` déclenche automatiquement un nouveau build et déploiement. Tu modifies le code, tu push, et ~2 minutes plus tard c'est en ligne.

## Tester localement avant de déployer

Si tu veux voir le résultat sur ta machine avant de push :

```bash
npm install        # une seule fois, installe les dépendances
npm run dev        # lance un serveur local sur http://localhost:5173
```

Le serveur local se met à jour en temps réel quand tu modifies le code.
