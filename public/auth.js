import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js'

const firebaseConfig = { /* igual al de arriba */ }
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

function allowRender(){ document.documentElement.classList.remove('auth-pending') }
function isAuthPage(){ const p = location.pathname; return p.endsWith('/login.html') || p.endsWith('/register.html') }

function mountHeader(user){
  const header = document.getElementById('auth-header')
  if (!header) return
  header.innerHTML = `
    <div class="d-flex justify-content-between align-items-center p-2 bg-dark text-light">
      <span>Hola, <b>${user.email}</b></span>
      <button id="logout" class="btn btn-sm btn-danger">Cerrar sesión</button>
    </div>`
  document.getElementById('logout')?.addEventListener('click', doLogout)
}

async function doLogout(){
  try {
    const user = auth.currentUser
    const sid = localStorage.getItem('sessionId') || ''
    if (user && sid) {
      const ref = doc(db, 'userSessions', user.uid)
      const snap = await getDoc(ref)
      const data = snap.data() || {}
      if (data.sessionId === sid) {
        await setDoc(ref, { active:false, updatedAt: serverTimestamp() }, { merge:true })
      }
    }
  } finally {
    localStorage.removeItem('sessionId')
    try { await signOut(auth) } catch {}
    window.location.replace('./login.html')
  }
}

// Defensivo: si (raro) el lock cambia a otro sessionId, cierro esta pestaña.
let unsub = null
function watchLock(user){
  if (unsub) unsub()
  const mySid = localStorage.getItem('sessionId') || ''
  const ref = doc(db, 'userSessions', user.uid)
  unsub = onSnapshot(ref, (snap)=>{
    if (!snap.exists()) return
    const d = snap.data() || {}
    if (d.active && d.sessionId && d.sessionId !== mySid) {
      doLogout()
    }
  })
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (isAuthPage()) { window.location.replace('./'); return }
    mountHeader(user)
    watchLock(user)
    allowRender()
  } else {
    if (!isAuthPage()) { window.location.replace('./login.html'); return }
    allowRender()
  }
})
