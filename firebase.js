import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBmTdYQcLAJxhrWpqRaFFWqy4uSlRVVLIE",
    authDomain: "futuregen-ba172.firebaseapp.com",
    projectId: "futuregen-ba172",
    databaseURL: "https://futuregen-ba172-default-rtdb.firebaseio.com",
    storageBucket: "futuregen-ba172.firebasestorage.app",
    messagingSenderId: "607353543902",
    appId: "1:607353543902:web:40267390fa4bf2053db64f",
    measurementId: "G-Y49MRHCFRT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics not loaded");
}

// Initialize Authentication & Realtime Database
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// Setup Bridge for main.js (Faking Firestore Methods to use Realtime Database)
window.fbApp = app;  // ✅ Export app instance
window.fsDb = rtdb; 

window.fsDoc = (db, ...pathSegments) => {
  const sanitized = pathSegments.map(s => typeof s === 'string' ? s.replace(/[.#$\[\]]/g, '_') : s);
  return sanitized.join('/');
};

window.fsSetDoc = (path, data, options) => {
  if (options && options.merge) {
    return update(ref(rtdb, path), data);
  }
  return set(ref(rtdb, path), data);
};

window.fsGetDoc = async (path) => {
  const snapshot = await get(ref(rtdb, path));
  return {
    exists: () => snapshot.exists(),
    data: () => snapshot.val()
  };
};

window.fsUpdateDoc = (path, data) => {
  return update(ref(rtdb, path), data);
};

window.fsCollection = () => {};
window.fsQuery = () => {};
window.fsWhere = () => {};
window.fsGetDocs = async () => ({ docs: [], forEach: () => {} });

window.fbAuth = auth;
window.fbCreateUser = createUserWithEmailAndPassword;
window.fbSignIn = signInWithEmailAndPassword;
window.fbSignOut = signOut;
window.fbOnAuthStateChanged = onAuthStateChanged;
window.fbUpdateProfile = updateProfile;

console.log("✅ Firebase initialized from firebase.js (using RTDB adapter for users)");