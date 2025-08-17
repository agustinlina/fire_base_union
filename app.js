// app.js
// Servidor Express que sirve archivos HTML sin mostrar extensión
// Para ejecutar:
// 1. npm init -y
// 2. npm install express
// 3. node app.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rutas para servir HTML específicos sin extensión en la URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/comercial', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'comercial.html'));
});

app.get('/stock', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stock.html'));
});

app.get('/calculadora', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calculadora.html'));
});

// ✅ NUEVO: login.html y alias /login
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Ruta de comprobación de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto http://localhost:${PORT}`);
});
