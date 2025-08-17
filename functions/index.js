// CommonJS para simplicidad
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { beforeUserSignedIn } = require('firebase-functions/v2/identity')
const { HttpsError } = require('firebase-functions/v2/https')
const { randomUUID } = require('crypto')

initializeApp()
const db = getFirestore()

exports.preventConcurrentSignIn = beforeUserSignedIn(async event => {
  const uid = event.data.user.uid
  const ref = db.collection('userSessions').doc(uid)
  const sessionId = randomUUID()

  // Transacción: si ya hay lock activo → abortar este sign-in
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (snap.exists) {
      const d = snap.data() || {}
      if (d.active && d.sessionId) {
        throw new HttpsError('already-exists', 'Usuario en uso')
      }
    }
    tx.set(
      ref,
      { active: true, sessionId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
  })

  // Incluimos el sessionId en el ID token como claim de sesión
  return { sessionClaims: { sessionId } }
})
