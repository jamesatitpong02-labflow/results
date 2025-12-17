const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ override: true });

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Minimal CORS for separated frontend (Netlify) and backend (Render)
app.use((req, res, next) => {
  const allowed = process.env.CORS_ORIGIN;
  const origin = req.headers.origin;
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : (origin && allowed.split(',').map(s => s.trim()).includes(origin) ? origin : allowed));
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

let client;
async function getCollection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  const dbName = process.env.DB_NAME || 'labflow';
  const colName = process.env.COLLECTION_NAME || 'health_results';
  return client.db(dbName).collection(colName);
}

app.get('/api/results', async (req, res) => {
  const cid = (req.query.cid || '').trim();
  const ln = (req.query.ln || '').trim();
  if (!cid || !ln) {
    res.status(400).json({ error: 'missing_params' });
    return;
  }
  try {
    const col = await getCollection();
    if (!col) {
      res.status(500).json({ error: 'missing_mongodb_uri' });
      return;
    }
    const cidDigits = cid.replace(/\D/g, '');
    const lnDigits = ln.replace(/\D/g, '');
    const cidNum = cidDigits && /^\d+$/.test(cidDigits) ? Number(cidDigits) : null;
    const lnNum = lnDigits && /^\d+$/.test(lnDigits) ? Number(lnDigits) : null;
    const or = [
      { idCard: cidDigits, ln: lnDigits },
      { idCard: cid, ln },
    ];
    if (cidNum !== null) or.push({ idCard: cidNum, ln });
    if (lnNum !== null) or.push({ idCard: cid, ln: lnNum });
    if (cidNum !== null && lnNum !== null) or.push({ idCard: cidNum, ln: lnNum });
    const cursor = col.find({ $or: or });
    const docs = await cursor.toArray();
    console.log('Query results', { cid, ln, matched: docs.length });
    res.json({ items: docs });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/_probe', async (req, res) => {
  const cid = (req.query.cid || '').trim();
  const ln = (req.query.ln || '').trim();
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      res.status(500).json({ error: 'missing_mongodb_uri' });
      return;
    }
    const dbName = process.env.DB_NAME || 'labflow';
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }
    const db = client.db(dbName);
    const cols = await db.listCollections().toArray();
    const cidDigits = cid.replace(/\D/g, '');
    const lnDigits = ln.replace(/\D/g, '');
    const cidNum = cidDigits && /^\d+$/.test(cidDigits) ? Number(cidDigits) : null;
    const lnNum = lnDigits && /^\d+$/.test(lnDigits) ? Number(lnDigits) : null;
    const or = [
      { idCard: cidDigits, ln: lnDigits },
      { idCard: cid, ln },
    ];
    if (cidNum !== null) or.push({ idCard: cidNum, ln });
    if (lnNum !== null) or.push({ idCard: cid, ln: lnNum });
    if (cidNum !== null && lnNum !== null) or.push({ idCard: cidNum, ln: lnNum });
    const results = [];
    for (const c of cols) {
      const collection = db.collection(c.name);
      const doc = await collection.findOne({ $or: or });
      if (doc) {
        results.push({ collection: c.name, matched: 1 });
      }
    }
    res.json({ collections_scanned: cols.length, matches: results });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/health-report', async (req, res) => {
  const cid = (req.query.cid || '').trim();
  const ln = (req.query.ln || '').trim();
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      res.status(500).json({ error: 'missing_mongodb_uri' });
      return;
    }
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }
    const db = client.db(process.env.DB_NAME || 'labflow');
    const cols = await db.listCollections().toArray();
    const hasPatients = cols.some(c => c.name === 'patients');
    const hasOrders = cols.some(c => c.name === 'orders');
    const hasResults = cols.some(c => c.name === 'results');
    const cidDigits = cid.replace(/\D/g, '');
    const lnDigits = ln.replace(/\D/g, '');
    const cidNum = cidDigits && /^\d+$/.test(cidDigits) ? Number(cidDigits) : null;
    const lnNum = lnDigits && /^\d+$/.test(lnDigits) ? Number(lnDigits) : null;
    const patientOr = [
      { idCard: cidDigits, ln: lnDigits },
      { idCard: cid, ln },
    ];
    if (cidNum !== null) patientOr.push({ idCard: cidNum, ln });
    if (lnNum !== null) patientOr.push({ idCard: cid, ln: lnNum });
    if (cidNum !== null && lnNum !== null) patientOr.push({ idCard: cidNum, ln: lnNum });
    let patient = null;
    if (hasPatients) {
      patient = await db.collection('patients').findOne({ $or: patientOr });
    }
    const orderIds = [];
    if (patient) {
      if (hasOrders) {
        const orderOr = [
          { patientId: patient._id },
          { patientId: String(patient._id) },
          { idCard: patient.idCard },
          { ln: patient.ln },
        ];
        const orders = await db.collection('orders').find({ $or: orderOr }).toArray();
        for (const o of orders) {
          if (o.orderId) orderIds.push(o.orderId);
          if (o._id) orderIds.push(String(o._id));
        }
      }
      for (const c of cols) {
        if (c.name === 'results') continue;
        const docs = await db.collection(c.name).find({ $or: patientOr }).limit(20).toArray();
        for (const d of docs) {
          if (d.orderId) orderIds.push(d.orderId);
          if (typeof d.order_id === 'string') orderIds.push(d.order_id);
          if (typeof d.orderID === 'string') orderIds.push(d.orderID);
        }
      }
    }
    const results = [];
    if (hasResults) {
      const rCol = db.collection('results');
      if (orderIds.length > 0) {
        const r1 = await rCol.find({ orderId: { $in: orderIds } }).toArray();
        results.push(...r1);
      }
      if (results.length === 0) {
        const rOr = [
          { idCard: cidDigits, ln: lnDigits },
          { idCard: cid, ln },
          { 'patient.idCard': cid, 'patient.ln': ln },
          { 'patient.idCard': cidDigits, 'patient.ln': lnDigits },
        ];
        if (cidNum !== null) rOr.push({ idCard: cidNum, ln });
        if (lnNum !== null) rOr.push({ idCard: cid, ln: lnNum });
        if (cidNum !== null && lnNum !== null) rOr.push({ idCard: cidNum, ln: lnNum });
        const r2 = await rCol.find({ $or: rOr }).toArray();
        results.push(...r2);
      }
    }
    res.json({ items: results, patient, orderIds });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/results/by-order', async (req, res) => {
  const orderId = (req.query.orderId || '').trim();
  try {
    const col = await getCollection();
    if (!col) {
      res.status(500).json({ error: 'missing_mongodb_uri' });
      return;
    }
    const or = [{ orderId }, { orderId: Number(orderId) }];
    const docs = await col.find({ $or: or }).toArray();
    res.json({ items: docs });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/patient-report', async (req, res) => {
  const cid = (req.query.cid || '').trim();
  const ln = (req.query.ln || '').trim();
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      res.status(500).json({ error: 'missing_mongodb_uri' });
      return;
    }
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }
    const db = client.db(process.env.DB_NAME || 'labflow');
    const cidDigits = cid.replace(/\D/g, '');
    const lnDigits = ln.replace(/\D/g, '');
    const cidNum = cidDigits && /^\d+$/.test(cidDigits) ? Number(cidDigits) : null;
    const lnNum = lnDigits && /^\d+$/.test(lnDigits) ? Number(lnDigits) : null;
    const lnFields = ['ln', 'LN', 'lnNo', 'ln_number', 'lnNumber'];
    const idCardCandidates = [cidDigits, cid].concat(cidNum !== null ? [cidNum] : []).filter(Boolean);
    const lnCandidates = [lnDigits, ln].concat(lnNum !== null ? [lnNum] : []).filter(Boolean);
    // Find patient by idCard (primary for left panel); allow LN match as secondary
    const patientOr = [{ idCard: cidDigits }, { idCard: cid }];
    if (cidNum !== null) patientOr.push({ idCard: cidNum });
    for (const lf of lnFields) {
      for (const lnv of lnCandidates) patientOr.push({ [lf]: lnv });
    }
    const patient = await db.collection('patients').findOne({ $or: patientOr });
    // Build visits by LN first (core requirement)
    const visitsOr = [];
    for (const lf of lnFields) {
      for (const lnv of lnCandidates) {
        visitsOr.push({ [lf]: lnv });
      }
    }
    let visits = await db.collection('visits').find({ $or: visitsOr }).limit(200).toArray();
    if (visits.length === 0 && patient) {
      const pidList = [patient._id, String(patient._id)];
      const pidFields = ['patientId', 'patient_id', 'patientID', 'patientObjectId'];
      const byPidOr = [];
      for (const pf of pidFields) byPidOr.push({ [pf]: { $in: pidList } });
      visits = await db.collection('visits').find({ $or: byPidOr }).limit(200).toArray();
    }
    const getTime = (d) => {
      const s = d.visitDate || d.date || d.visitedAt || d.createdAt;
      const t = s ? new Date(s).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    visits.sort((a, b) => getTime(b) - getTime(a));
    const ordersCol = db.collection('orders');
    const resultsCol = db.collection('results');
    const richVisits = [];
    for (const v of visits) {
      const vIds = [v._id, String(v._id)];
      const vNos = [v.visitNumber, v.visit_no, v.vn].filter(Boolean);
      const patientRefs = [v.patientId, v.patient_id, v.patientID, v.patientObjectId].filter(Boolean);
      const dateCandidates = [v.orderDate, v.visitDate, v.date, v.createdAt].filter(Boolean);
      // Orders: prioritize direct link by visitId/visit_id
      const primaryOrderOr = [{ visitId: { $in: vIds } }, { visit_id: { $in: vIds } }];
      let orders = await ordersCol.find({ $or: primaryOrderOr }).toArray();
      if (orders.length === 0) {
        // Fallbacks: visitNumber/patientId/date/LN
        const fallbackOrderOr = [];
        for (const no of vNos) {
          fallbackOrderOr.push({ visitNumber: no }, { visit_no: no }, { vn: no });
        }
        for (const p of patientRefs) {
          fallbackOrderOr.push({ patientId: p }, { patient_id: p }, { patientID: p });
        }
        for (const d of dateCandidates) {
          fallbackOrderOr.push({ orderDate: d }, { visitDate: d }, { date: d });
        }
        for (const lf of lnFields) {
          for (const lnv of lnCandidates) {
            fallbackOrderOr.push({ [lf]: lnv });
          }
        }
        if (fallbackOrderOr.length > 0) {
          orders = await ordersCol.find({ $or: fallbackOrderOr }).toArray();
        }
      }
      const richOrders = [];
      for (const o of orders) {
        const oIds = [o.orderId, String(o.orderId || ''), String(o._id), o._id].filter(Boolean);
        // Results: prioritize direct link by orderId variants
        const primaryResultsOr = [{ orderId: { $in: oIds } }, { order_id: { $in: oIds } }, { orderID: { $in: oIds } }];
        let r = await resultsCol.find({ $or: primaryResultsOr }).toArray();
        if (r.length === 0) {
          // Fallbacks: visit linkage, visitNumber/patientId/date, LN
          const fallbackResultsOr = [];
          if (vIds.length > 0) fallbackResultsOr.push({ visitId: { $in: vIds } }, { visit_id: { $in: vIds } });
          for (const no of vNos) fallbackResultsOr.push({ visitNumber: no }, { visit_no: no }, { vn: no });
          for (const p of patientRefs) fallbackResultsOr.push({ patientId: p }, { patient_id: p }, { patientID: p });
          for (const d of dateCandidates) fallbackResultsOr.push({ orderDate: d }, { visitDate: d }, { date: d });
          for (const lf of lnFields) for (const lnv of lnCandidates) fallbackResultsOr.push({ [lf]: lnv });
          if (fallbackResultsOr.length > 0) {
            r = await resultsCol.find({ $or: fallbackResultsOr }).toArray();
          }
        }
        richOrders.push({ ...o, results: r });
      }
      richVisits.push({ ...v, orders: richOrders });
    }
    // Direct results by LN (not attached to any order) for info
    const directOr = [];
    for (const lf of lnFields) {
      for (const lnv of lnCandidates) {
        directOr.push({ [lf]: lnv });
        directOr.push({ ['patient.' + lf]: lnv });
      }
    }
    const resultsDirect = await resultsCol.find({ $or: directOr }).limit(50).toArray();
    res.json({ patient, visits: richVisits, resultsDirect, ln: ln });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/ln-report', async (req, res) => {
  const ln = (req.query.ln || '').trim();
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      res.status(500).json({ error: 'missing_mongodb_uri' });
      return;
    }
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }
    const db = client.db(process.env.DB_NAME || 'labflow');
    const lnDigits = ln.replace(/\D/g, '');
    const lnNum = lnDigits && /^\d+$/.test(lnDigits) ? Number(lnDigits) : null;
    const lnFields = ['ln', 'LN', 'lnNo', 'ln_number', 'lnNumber'];
    const lnCandidates = [ln, lnDigits, lnNum].filter(v => v !== null && v !== undefined && String(v).length > 0);
    const visitsOr = [];
    for (const lf of lnFields) for (const v of lnCandidates) visitsOr.push({ [lf]: v });
    const ordersOr = [];
    for (const lf of lnFields) for (const v of lnCandidates) ordersOr.push({ [lf]: v });
    const resultsOr = [];
    for (const lf of lnFields) for (const v of lnCandidates) {
      resultsOr.push({ [lf]: v });
      resultsOr.push({ ['patient.' + lf]: v });
    }
    const visitsCol = db.collection('visits');
    const ordersCol = db.collection('orders');
    const resultsCol = db.collection('results');
    let visits = await visitsCol.find({ $or: visitsOr }).limit(200).toArray();
    if (visits.length === 0) {
      const patientsCol = db.collection('patients');
      const patientOr = [];
      for (const lf of lnFields) for (const v of lnCandidates) patientOr.push({ [lf]: v });
      const patient = await patientsCol.findOne({ $or: patientOr });
      if (patient) {
        const pidList = [patient._id, String(patient._id)];
        const pidFields = ['patientId', 'patient_id', 'patientID', 'patientObjectId'];
        const byPidOr = [];
        for (const pf of pidFields) byPidOr.push({ [pf]: { $in: pidList } });
        visits = await visitsCol.find({ $or: byPidOr }).limit(200).toArray();
      }
    }
    const visitIds = [];
    const visitNos = [];
    for (const v of visits) {
      if (v._id) visitIds.push(v._id, String(v._id));
      if (v.visitNumber) visitNos.push(v.visitNumber);
      if (v.visit_no) visitNos.push(v.visit_no);
      if (v.vn) visitNos.push(v.vn);
    }
    const extraOrderOr = [];
    if (visitIds.length > 0) extraOrderOr.push({ visitId: { $in: visitIds } }, { visit_id: { $in: visitIds } });
    if (visitNos.length > 0) extraOrderOr.push({ visitNumber: { $in: visitNos } }, { visit_no: { $in: visitNos } }, { vn: { $in: visitNos } });
    const orders = await ordersCol.find({ $or: ordersOr.concat(extraOrderOr) }).limit(500).toArray();
    const orderIds = [];
    for (const o of orders) {
      if (o.orderId) orderIds.push(o.orderId, String(o.orderId));
      if (o._id) orderIds.push(o._id, String(o._id));
    }
    const extraResultsOr = [];
    if (orderIds.length > 0) extraResultsOr.push({ orderId: { $in: orderIds } }, { order_id: { $in: orderIds } }, { orderID: { $in: orderIds } });
    if (visitIds.length > 0) extraResultsOr.push({ visitId: { $in: visitIds } }, { visit_id: { $in: visitIds } });
    if (visitNos.length > 0) extraResultsOr.push({ visitNumber: { $in: visitNos } }, { visit_no: { $in: visitNos } }, { vn: { $in: visitNos } });
    const results = await resultsCol.find({ $or: resultsOr.concat(extraResultsOr) }).limit(1000).toArray();
    res.json({
      ln,
      visits_count: visits.length,
      orders_count: orders.length,
      results_count: results.length,
      visits,
      orders,
      results,
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`Server running at ${url}`);
});
