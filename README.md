# Notz

Capture rapide de notes : texte ou dictée, vocaux, photos et rappels datés, synchronisés entre iPhone et Mac.

- App : https://rpelam.github.io/notz/
- Données : Supabase (tables `notz_*`, stockage privé `notz`), accès réservé au compte propriétaire.
- Rappels : une tâche planifiée vérifie chaque minute les rappels échus et envoie une notification (fonction `notz-push`).

## Installer
- **iPhone** : ouvrir l'adresse dans Safari, Partager → « Sur l'écran d'accueil », puis ouvrir Notz depuis l'icône et activer les notifications dans Réglages (roue dentée).
- **Mac** : dans Safari, menu Fichier → « Ajouter au Dock ».

## Fichiers
- `index.html`, `styles.css`, `app.js` : l'application
- `sw.js` : fonctionnement hors ligne et réception des notifications
- `vendor/supabase.js` : client Supabase 2.45.4
