// public/auth.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

// ---------- CONFIG ----------
const firebaseConfig = {
  apiKey: 'AIzaSyAe42aV5wu28NddRCxFL1dz5xps-04XxMk',
  authDomain: 'union-user-live.firebaseapp.com',
  projectId: 'union-user-live',
  storageBucket: 'union-user-live.appspot.com',
  messagingSenderId: '279782141524',
  appId: '1:279782141524:web:f7579e44b2848d990e87c1'
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

let unsubSessionDoc = null

function allowRender () {
  document.documentElement.classList.remove('auth-pending')
}
function isAuthPage () {
  const p = location.pathname
  return p.endsWith('/login.html') || p.endsWith('/register.html')
}

function mountHeader (user) {
  const header = document.getElementById('auth-header')
  if (!header) return
  header.innerHTML = `
    <div id="header_auth" class="p-3 d-flex justify-content-between align-items-center p-2" style="gap:12px;">
      <span class="small m-0">Hola, <b>${user.email}</b></span>
      <button class="d-flex gap-2 p-1" id="logout" class="btn"><img width="26px" src="./media/exit.svg">Cerrar sesión</button>
    </div>
  `
  document.getElementById('logout')?.addEventListener('click', async () => {
    await safeReleaseAndSignOut()
  })
}

async function safeReleaseAndSignOut () {
  try {
    const user = auth.currentUser
    const mySessionId = localStorage.getItem('sessionId') || ''
    if (user && mySessionId) {
      const ref = doc(db, 'userSessions', user.uid)
      const snap = await getDoc(ref)
      const data = snap.data() || {}
      // Solo libero si sigo siendo yo el dueño del lock
      if (data.sessionId === mySessionId) {
        await setDoc(ref, { active: false, updatedAt: serverTimestamp() }, { merge: true })
      }
    }
  } catch {}
  try { await signOut(auth) } catch {}
  localStorage.removeItem('sessionId')
  window.location.replace('./login.html')
}

// Observación defensiva: si (por un bug) otra sesión tomara el lock, me cierro.
// En el flujo normal NO debería ocurrir porque el segundo login queda bloqueado.
function watchLock (user) {
  const mySessionId = localStorage.getItem('sessionId') || ''
  const ref = doc(db, 'userSessions', user.uid)

  if (unsubSessionDoc) unsubSessionDoc()
  unsubSessionDoc = onSnapshot(ref, async (snap) => {
    if (!snap.exists()) return
    const data = snap.data() || {}
    const serverSessionId = data.sessionId || ''
    const active = !!data.active

    if (active && serverSessionId && serverSessionId !== mySessionId) {
      // Otro tiene el lock → me voy
      await safeReleaseAndSignOut()
    }
  })
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (isAuthPage()) {
      window.location.replace('./')
      return
    }
    mountHeader(user)
    watchLock(user)
    allowRender()
  } else {
    if (!isAuthPage()) {
      window.location.replace('./login.html')
      return
    }
    allowRender()
  }
})
