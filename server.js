require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 30022;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

function createSession() {
  const token = require('crypto').randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }
  next();
}

async function syncToLegacyServer(uid, username = '') {
  const baseUrl = process.env.LEGACY_API_URL;
  const apiKey = process.env.LEGACY_API_KEY;
  if (!baseUrl || !apiKey) {
    return { synced: false, skipped: true };
  }
  try {
    const url = new URL('/api/add_uid', baseUrl.replace(/\/$/, ''));
    url.searchParams.set('uid', uid);
    url.searchParams.set('username', username || '');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
    const body = await res.json().catch(() => ({}));
    return { synced: Boolean(res.ok && body.success), message: body.message };
  } catch (err) {
    return { synced: false, message: err.message };
  }
}

// --- Público: cliente envia pedido ---
app.get('/api/plans', (req, res) => {
  res.json({ success: true, data: db.getPlans() });
});

app.post('/api/request', (req, res) => {
  try {
    const { uid, plan } = req.body;
    const request = db.createRequest(uid, plan);
    res.json({
      success: true,
      message: 'Pedido enviado! Aguarde a ativação.',
      data: request
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Admin ---
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Senha incorreta' });
  }
  res.json({ success: true, token: createSession() });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({ success: true, data: db.getStats() });
});

app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const { status = '' } = req.query;
  res.json({ success: true, data: db.listRequests({ status }) });
});

app.get('/api/admin/activations', requireAdmin, (req, res) => {
  res.json({ success: true, data: db.listActivations() });
});

app.post('/api/admin/requests/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { request, activation } = db.approveRequest(req.params.id);
    const legacy = await syncToLegacyServer(request.uid, request.plan_label);
    res.json({
      success: true,
      message: legacy.synced
        ? 'Ativado no painel e no servidor antigo'
        : legacy.skipped
          ? 'Pedido aprovado'
          : 'Aprovado aqui, mas falhou no servidor antigo',
      data: { request, activation },
      legacy_sync: legacy
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/requests/:id/reject', requireAdmin, (req, res) => {
  try {
    const request = db.rejectRequest(req.params.id);
    res.json({ success: true, message: 'Pedido recusado', data: request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
  db.deleteRequest(req.params.id);
  res.json({ success: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});
