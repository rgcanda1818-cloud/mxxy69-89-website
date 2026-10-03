const config = window.NORTHGATE_FIREBASE_CONFIG || {};
const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const isConfigured = requiredConfigKeys.every((key) => (
  typeof config[key] === 'string'
  && config[key].trim() !== ''
  && !config[key].includes('YOUR_')
));

let auth = null;
let currentUser = null;
let sdkError = null;
let createUserWithEmailAndPassword;
let onAuthStateChanged;
let signInWithEmailAndPassword;
let signOut;
let updateProfile;

const ready = (async () => {
  if (!isConfigured) return null;

  try {
    const [appSdk, authSdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js'),
    ]);
    createUserWithEmailAndPassword = authSdk.createUserWithEmailAndPassword;
    onAuthStateChanged = authSdk.onAuthStateChanged;
    signInWithEmailAndPassword = authSdk.signInWithEmailAndPassword;
    signOut = authSdk.signOut;
    updateProfile = authSdk.updateProfile;
    auth = authSdk.getAuth(appSdk.initializeApp(config));

    return await new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        currentUser = user;
        resolve(user);
      }, (error) => {
        sdkError = error;
        console.error('Firebase Authentication could not restore the sign-in state.', error);
        resolve(null);
      });
    });
  } catch (error) {
    sdkError = error;
    console.error('Firebase Authentication could not load.', error);
    return null;
  }
})();

async function ensureReady() {
  await ready;
  if (!isConfigured) throw new Error('Firebase is not configured yet. Follow the free setup steps in DEPLOYING.md.');
  if (sdkError) throw new Error('Firebase Authentication could not load. Check the Firebase setup and refresh the page.');
}

window.northgateFirebaseAuth = {
  isConfigured,
  ready,
  get currentUser() {
    return currentUser;
  },
  async createAccount(email, password, displayName) {
    await ensureReady();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    return credential.user;
  },
  async signIn(email, password) {
    await ensureReady();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  },
  async signOut() {
    await ensureReady();
    await signOut(auth);
  },
};
