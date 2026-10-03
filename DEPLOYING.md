# Free GitHub Pages sign-in setup

GitHub Pages only hosts static files; it cannot run `server.py` or the local SQLite database. Northgate can use Firebase Authentication for free-tier email/password sign-up and sign-in while the site remains on GitHub Pages. This setup covers authentication only.

## Configure Firebase Authentication

1. Create a Firebase project and keep it on the no-cost Spark plan. Do not enable billing or upgrade the project. Check Firebase's current limits before relying on the service; free-tier quotas and availability can change.
2. In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**.
3. In **Project settings → General**, register a Web app if one is not already registered. Copy its web app config values into `firebase-config.js`, replacing all `YOUR_...` placeholders. The Firebase web config is public client configuration, not a password or service-account secret; never put a service-account key or other private credential in this file.
4. In **Authentication → Settings → Authorized domains**, add the GitHub Pages hostname, such as `yourname.github.io`. If you use a custom domain, add that hostname too.
5. Push the site to GitHub and enable GitHub Pages for the repository in **Settings → Pages**. Open the published HTTPS site and test creating an account, signing out, and signing in again.

The Firebase project values are not included here because each project has its own config. Until you replace the placeholders, the site shows a setup message instead of pretending sign-in succeeded. Existing accounts in the local SQLite database are not copied to Firebase; create new hosted accounts.

## What remains local-only

Firebase Authentication stores and checks account credentials. It does not host the Northgate Python API. Profile edits, saved addresses, order history, checkout order creation, and admin order management still call `/api/...` endpoints and will not work from GitHub Pages until a separate backend is deployed and connected. The cart itself is stored in the browser.

The existing `render.yaml` provisions paid Render resources. Do not use that Blueprint if you need to avoid charges. No Firebase database or paid service is required for the authentication-only setup described above.
