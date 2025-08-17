// app.js
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== CONFIG DIRECTA AQUÍ ======
const FIREBASE_WEB_API_KEY = 'AIzaSyAe42aV5wu28NddRCxFL1dz5xps-04XxMk'; // tu apiKey web

// Pega aquí tu JSON de Service Account (Firebase Console > Config del proyecto > Cuentas de servicio)
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "union-user-live",
  "private_key_id": "REEMPLAZA_POR_TU_ID",
  "private_key": `-----BEGIN PRIVATE KEY-----
PEGA_TU_LLAVE_PRIVADA_AQUÍ
-----END PRIVATE KEY-----\n`,
  "client_email": "firebase-adminsdk-xxxxx@union-user-live.iam.gserviceaccount.com",
  "client_id": "REEMPLAZA_POR_TU_CLIENT_ID",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40union-user-live.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};
// =================================

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(SERVICE_ACCOUNT),
  });
}
const db = admin.firestore();

function makeSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function requireEmailPassword(req, res, next) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });
  next();
}

// Bloquea el 2º login si ya hay lock activo
app.post('/api/login', requireEmailPassword, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) Verificar credenciales contra Firebase Auth (REST)
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      return res.status(401).json({ error: 'Credenciales inválidas', detail: e });
    }
    const data = await resp.json();
    const uid = data.localId;

    // 2) Intentar tomar lock (transacción)
    const sessionId = makeSessionId();
    await db.runTransaction(async (tx) => {
      const ref = db.collection('userSessions').doc(uid);
      const snap = await tx.get(ref);

      if (snap.exists) {
        const cur = snap.data() || {};
        if (cur.active && cur.sessionId) {
          throw new Error('LOCK_HELD'); // ya hay uno conectado
        }
      }
      tx.set(ref, {
        sessionId,
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    // 3) Custom token con claim (opcional) sessionId
    const customToken = await admin.auth().createCustomToken(uid, { sessionId });

    return res.json({ customToken, sessionId });
  } catch (err) {
    if (err.message === 'LOCK_HELD') {
      return res.status(409).json({ error: 'Usuario en uso' });
    }
    console.error('api/login error:', err);
    return res.status(500).json({ error: 'Error de servidor' });
  }
});

// Libera lock si el sessionId coincide
app.post('/api/logout', async (req, res) => {
  try {
    const { uid, sessionId } = req.body || {};
    if (!uid || !sessionId) return res.status(400).json({ error: 'uid y sessionId requeridos' });

    const ref = db.collection('userSessions').doc(uid);
    const snap = await ref.get();
    const cur = snap.exists ? (snap.data() || {}) : {};
    if (cur.sessionId === sessionId) {
      await ref.set(
        { active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('api/logout error:', err);
    return res.status(500).json({ error: 'Error de servidor' });
  }
});

// Rutas HTML
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/comercial', (req, res) => res.sendFile(path.join(__dirname, 'public', 'comercial.html')));
app.get('/stock', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stock.html')));
app.get('/calculadora', (req, res) => res.sendFile(path.join(__dirname, 'public', 'calculadora.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
