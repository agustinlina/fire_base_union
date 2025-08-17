// CommonJS para simplicidad
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { beforeUserSignedIn } = require('firebase-functions/v2/identity');
const { HttpsError } = require('firebase-functions/v2/https');
const { randomUUID } = require('crypto');

initializeApp();
const db = getFirestore();

/**
 * Bloquea el 2º inicio de sesión del mismo uid.
 * Si el doc userSessions/{uid} está activo, aborta ANTES de emitir el ID token.
 * Al permitir, fija active=true y sessionId nuevo y lo añade como claim.
 *
 * Requiere: Authentication with Identity Platform (Blocking Functions).
 */
exports.preventConcurrentSignIn = beforeUserSignedIn(async (event) => {
  const uid = event.data.user.uid;
  const ref = db.collection('userSessions').doc(uid);
  const sessionId = randomUUID();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data() || {};
      if (d.active && d.sessionId) {
        throw new HttpsError('already-exists', 'Usuario en uso');
      }
    }
    tx.set(
      ref,
      { active: true, sessionId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });

  // Añadir sessionId como claim de sesión en el ID token emitido
  return { sessionClaims: { sessionId } };
});
