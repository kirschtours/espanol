/* סנכרון ההתקדמות בין מכשירים: כניסה עם Google ושמירה ב-Firestore.
   ההתקדמות נשמרת תמיד גם במכשיר (localStorage), והענן מתמזג איתה בכל כניסה ובכל חזרה לאפליקציה.
   כללי ההרשאה ב-Firestore: כל משתמש קורא וכותב רק את users/{uid} שלו. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyCBUyZgkcYRoavLU5sbZghGcsdQKzd88e4',
  authDomain: 'espanol-fc687.firebaseapp.com',
  projectId: 'espanol-fc687',
  storageBucket: 'espanol-fc687.firebasestorage.app',
  messagingSenderId: '831572350161',
  appId: '1:831572350161:web:ad8e6f581e8130ec56e1f0'
});
const auth = getAuth(app), db = getFirestore(app), SP = window.SP;
auth.languageCode = 'he';

let user = null, ready = false, timer = null, last = '', justSignedIn = false;
const ref = () => doc(db, 'users', user.uid);
function status(state) { if (state !== last) { last = state; SP.account({ state }); } }

async function push() {
  clearTimeout(timer); timer = null;
  if (!user || !ready) return;
  try { await setDoc(ref(), { data: JSON.stringify(SP.get()), updated: serverTimestamp() }); status('ok'); }
  catch (e) { console.warn('sync push', e); status(navigator.onLine ? 'error' : 'offline'); }
}
async function syncNow() {
  if (!user) return;
  if (!navigator.onLine) return status('offline');
  status('syncing');
  try {
    const snap = await getDoc(ref());
    if (snap.exists()) { try { SP.merge(JSON.parse(snap.data().data)); } catch (e) { console.warn('bad remote data', e); } }
    ready = true;
    await push();
  } catch (e) { console.warn('sync pull', e); status(navigator.onLine ? 'error' : 'offline'); }
}

/* כל שמירה באפליקציה מעלה לענן אחרי שתי שניות של שקט */
window.SP_PUSH = () => { if (user && ready) { clearTimeout(timer); timer = setTimeout(push, 2000); } };

window.SP_SIGNIN = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { justSignedIn = true; await signInWithPopup(auth, provider); }
  catch (e) {
    justSignedIn = false;
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    if (e.code === 'auth/unauthorized-domain') return SP.toast('הכתובת הזאת לא מאושרת ב-Firebase (Authorized domains)');
    if (e.code === 'auth/operation-not-allowed') return SP.toast('הכניסה עם Google לא הופעלה ב-Firebase');
    console.warn('sign in', e); SP.toast('ההתחברות נכשלה, נסה שוב');
  }
};
window.SP_SIGNOUT = async () => { if (timer) await push(); await signOut(auth); };

onAuthStateChanged(auth, u => {
  user = u; ready = false; last = '';
  if (u) {
    SP.account({ user: { name: u.displayName, email: u.email }, state: 'syncing' });
    syncNow().then(() => { if (ready && justSignedIn) SP.toast('☁️ מחובר. ההתקדמות נשמרת בענן'); justSignedIn = false; });
  } else SP.account({ user: null, state: 'out' });
});

document.addEventListener('visibilitychange', () => {
  if (!user) return;
  if (document.visibilityState === 'hidden') { if (timer) push(); }
  else syncNow();
});
window.addEventListener('online', syncNow);
window.addEventListener('offline', () => user && status('offline'));
