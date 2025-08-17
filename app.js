// app.js (añadido)
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Firebase Admin init ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      // IMPORTANTE: reemplazar \n en la private key
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

// Helpers
function makeSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Middleware: verifica cuerpo
function requireEmailPassword(req, res, next) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password requeridos' });
  }
  next();
}

// POST /api/login  -> verifica password y toma lock atómico
app.post('/api/login', requireEmailPassword, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) Verificar credenciales con la API REST de Firebase Auth
    const key = process.env.FIREBASE_WEB_API_KEY;
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      return res.status(401).json({ error: 'Credenciales inválidas', detail: e });
    }
    const data = await resp.json();
    const uid = data.localId;

    // 2) Intentar tomar lock en transacción
    const sessionId = makeSessionId();
    await db.runTransaction(async (tx) => {
      const ref = db.collection('userSessions').doc(uid);
      const snap = await tx.get(ref);

      if (snap.exists) {
        const cur = snap.data() || {};
        const active = !!cur.active;
        const serverSessionId = cur.sessionId || '';
        if (active && serverSessionId) {
          // YA hay alguien conectado -> denegar
          throw new Error('LOCK_HELD');
        }
      }
      // Tomar el lock para esta sesión
      tx.set(ref, {
        sessionId,
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    // 3) Crear custom token con claim (opcional) sessionId
    const customToken = await admin.auth().createCustomToken(uid, { sessionId });

    // 4) Devolver token y sessionId (el front hará signInWithCustomToken)
    return res.json({ customToken, sessionId });
  } catch (err) {
    if (err.message === 'LOCK_HELD') {
      return res.status(409).json({ error: 'Usuario en uso' });
    }
    console.error('api/login error:', err);
    return res.status(500).json({ error: 'Error de servidor' });
  }
});

// POST /api/logout  -> libera lock (solo si sessionId coincide)
app.post('/api/logout', async (req, res) => {
  try {
    const { uid, sessionId } = req.body || {};
    if (!uid || !sessionId) {
      return res.status(400).json({ error: 'uid y sessionId requeridos' });
    }
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

// ...tus rutas a HTML sin extensión...
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// etc...

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
