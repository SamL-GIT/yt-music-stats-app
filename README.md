# YT Music Stats - Dashboard 🎵

[Français](#français) | [English](#english)

Une application Electron qui génère des statistiques à partir de votre historique YouTube Music. / An Electron application that generates statistics from your YouTube Music history.

![Aperçu du Dashboard / Dashboard Preview](./screenshots/app-1.png)
![Aperçu du Dashboard / Dashboard Preview](./screenshots/app-2.png)
![Aperçu du Dashboard / Dashboard Preview](./screenshots/app-3.png)

---

## Français

### Utilisation

Cette application peut être téléchargée sous deux formes depuis la section `Releases` :
- **Portable (.exe)** : Se lance directement sans installation.
- **Installeur (.exe)** : Installe le programme.

### 🛠️ Instructions : Comment Obtenir son fichier de données ? (Google Takeout)

Pour que ce Dashboard fonctionne, vous devez lui fournir l'historique de YouTube / Youtube Music.

1. Rendez-vous sur [Google Takeout](https://takeout.google.com/settings/takeout).
2. Cliquez sur **"Tout désélectionner"** dans la liste des données.
3. Descendez tout en bas jusqu'à trouver l'encart **"YouTube et YouTube Music"** et cochez la case.
4. Cliquez sur le bouton "formats multiples" et vérifiez que l'historique est configuré au format `HTML` ou `JSON`

> ⚠️ **Avertissement sur le format HTML :**
> L'export des données Google Takeout vous propose de télécharger l'historique sous format `.html` et `JSON`, L'historique du format `.html` remonte plus loin que le format `JSON` et est donc préférable , mais le parsing du format `.html` est plus long et l'application supporte uniquement les export pour les comptes dont la langue est configurée sur `Français`

5. Cliquez sur "toute les Youtube sont  Incluses" et décochez tout, **SAUF** "historique".
6. Cliquez sur "Étape suivante", choisissez "Exporter en une seule fois", créez l'export, et patientez pendant la génération. 
7. Vous recevrez un mail avec un lien de téléchargement de l'archive.
8. Extrayez le fichier History (`watch-history.json` ou `watch-history.html`) et glissez-déposez-le dans **YT Music Stats** !

### Compilation

#### Prérequis
- `Node.js`
- `Git`.

#### Étapes de compilation manuelle
1. Cloner ce répertoire : `git clone https://github.com/SamL-GIT/yt-music-stats-app.git`.
2. Installer les dépendances : `npm install`.
3. Lancer en local le mode développement : `npm start`.
4. Pour compiler l'application :
   - **Windows** (génère `.exe` portable et installeur) : `npm run dist:win`
   - **Linux** (génère `.AppImage`, *doit être exécuté depuis un environnement Linux/WSL*) : `npm run dist:linux`
5. Les fichiers compilés se trouveront dans le dossier `dist/`.

---

## English

### Usage

This application can be downloaded in two formats from the `Releases` section:
- **Portable (.exe)**: Runs directly without installation.
- **Installer (.exe)**: Installs the program.

### 🛠️ Instructions: How to get your data file? (Google Takeout)

For this Dashboard to work, you must provide your YouTube / YouTube Music history.

1. Go to [Google Takeout](https://takeout.google.com/settings/takeout).
2. Click on **"Deselect all"** in the data list.
3. Scroll down until you find the **"YouTube and YouTube Music"** section and check the box.
4. Click on the "Multiple formats" button and verify that the history is set to `HTML` or `JSON` format.

> ⚠️ **Warning about the HTML format:**
> Google Takeout allows you to download your history in both `.html` and `JSON` formats. The `.html` format goes further back in time than the `JSON` format and is therefore preferable. However, parsing the `.html` format takes longer, and the application currently only supports HTML exports for accounts where the language is set to `French`.

5. Click on "All YouTube data included" and uncheck everything, **EXCEPT** "history".
6. Click on "Next step", choose "Export once", create the export, and wait for it to be generated.
7. You will receive an email with a link to download the archive.
8. Extract the History file (`watch-history.json` or `watch-history.html`) and drag and drop it into **YT Music Stats**!

### Build from source

#### Prerequisites
- `Node.js`
- `Git`

#### Manual build steps
1. Clone this repository: `git clone https://github.com/SamL-GIT/yt-music-stats-app.git`
2. Install dependencies: `npm install`
3. Run locally in development mode: `npm start`
4. To build the application:
   - **Windows** (generates portable `.exe` and installer): `npm run dist:win`
   - **Linux** (generates `.AppImage`, *must be run from a Linux/WSL environment*): `npm run dist:linux`
5. The compiled files will be located in the `dist/` folder.
