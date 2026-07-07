const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'store.json');

const PLANS = {
  diario: { label: 'Diário', days: 1 },
  semanal: { label: 'Semanal', days: 7 },
  mensal: { label: 'Mensal', days: 30 }
};

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function load() {
  if (!fs.existsSync(dbFile)) {
    return { requests: [], activations: [] };
  }
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function save(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

function getPlans() {
  return PLANS;
}

function createRequest(uid, plan) {
  if (!PLANS[plan]) {
    throw new Error('Plano inválido');
  }
  const trimmed = String(uid).trim();
  if (!trimmed) {
    throw new Error('ID é obrigatório');
  }

  const data = load();
  const pending = data.requests.find(
    (r) => r.uid === trimmed && r.status === 'pending'
  );
  if (pending) {
    throw new Error('Já existe um pedido pendente para este ID');
  }

  const request = {
    id: uuidv4(),
    uid: trimmed,
    plan,
    plan_label: PLANS[plan].label,
    status: 'pending',
    created_at: now(),
    processed_at: null
  };
  data.requests.unshift(request);
  save(data);
  return request;
}

function listRequests({ status = '' } = {}) {
  const data = load();
  let rows = data.requests;
  if (status) {
    rows = rows.filter((r) => r.status === status);
  }
  return rows;
}

function getRequest(id) {
  return load().requests.find((r) => r.id === id) || null;
}

function approveRequest(id) {
  const data = load();
  const request = data.requests.find((r) => r.id === id);
  if (!request) throw new Error('Pedido não encontrado');
  if (request.status !== 'pending') throw new Error('Pedido já foi processado');

  const plan = PLANS[request.plan];
  const expiresAt = addDays(plan.days);

  request.status = 'approved';
  request.processed_at = now();
  request.expires_at = expiresAt;

  const activation = {
    uid: request.uid,
    plan: request.plan,
    plan_label: request.plan_label,
    approved_at: now(),
    expires_at: expiresAt,
    request_id: request.id
  };

  const existing = data.activations.findIndex((a) => a.uid === request.uid);
  if (existing >= 0) data.activations[existing] = activation;
  else data.activations.push(activation);

  save(data);
  return { request, activation };
}

function rejectRequest(id) {
  const data = load();
  const request = data.requests.find((r) => r.id === id);
  if (!request) throw new Error('Pedido não encontrado');
  if (request.status !== 'pending') throw new Error('Pedido já foi processado');
  request.status = 'rejected';
  request.processed_at = now();
  save(data);
  return request;
}

function deleteRequest(id) {
  const data = load();
  data.requests = data.requests.filter((r) => r.id !== id);
  save(data);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function getStats() {
  const data = load();
  const pending = data.requests.filter((r) => r.status === 'pending').length;
  const approved = data.requests.filter((r) => r.status === 'approved').length;
  const rejected = data.requests.filter((r) => r.status === 'rejected').length;
  const total = data.requests.length;
  return { pending, approved, rejected, total };
}

function listActivations() {
  return load().activations.sort((a, b) => b.approved_at.localeCompare(a.approved_at));
}

module.exports = {
  getPlans,
  createRequest,
  listRequests,
  getRequest,
  approveRequest,
  rejectRequest,
  deleteRequest,
  getStats,
  listActivations,
  PLANS
};
