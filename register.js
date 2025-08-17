// register.js (modular, v12)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'
import { getAuth, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js'

const firebaseConfig = {
  apiKey: 'AIzaSyAe42aV5wu28NddRCxFL1dz5xps-04XxMk',
  authDomain: 'union-user-live.firebaseapp.com',
  projectId: 'union-user-live',
  storageBucket: 'union-user-live.appspot.com', // opcional para Auth
  messagingSenderId: '279782141524',
  appId: '1:279782141524:web:f7579e44b2848d990e87c1'
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

const form = document.getElementById('login-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const msg = document.getElementById('msg')

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  msg.style.display = 'none'
  try {
    const email = emailInput.value.trim()
    const password = passwordInput.value
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    alert(`Usuario creado: ${cred.user.email}`)
    // acá puedes redirigir si quieres
    // location.href = '/index.html'
  } catch (error) {
    msg.textContent = error.message
    msg.style.display = 'block'
  }
})
