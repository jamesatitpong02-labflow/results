function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { cid: p.get('cid') || '', ln: p.get('ln') || '', api: p.get('api') || '' };
}
function pick(o, keys) {
  for (const k of keys) {
    const v = o && o[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}
function thaiGender(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return '';
  if (['m', 'male', 'ชาย'].includes(s)) return 'ชาย';
  if (['f', 'female', 'หญิง'].includes(s)) return 'หญิง';
  return v;
}
function thaiDate(d) {
  if (!d) return '';
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return String(d);
  const th = dd.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${th} พ.ศ.`;
}
function calcAge(d) {
  if (!d) return '';
  const bd = new Date(d);
  if (Number.isNaN(bd.getTime())) return '';
  const now = new Date();
  let a = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) a--;
  return String(a);
}
function joinAddress(p) {
  const addr = pick(p, ['address', 'addr', 'homeAddress', 'addressLine']);
  const parts = [
    addr,
    pick(p, ['street', 'road']),
    pick(p, ['moo']),
    pick(p, ['soi']),
    pick(p, ['subdistrict', 'tambon']),
    pick(p, ['district', 'amphoe']),
    pick(p, ['province']),
    pick(p, ['zip', 'zipcode', 'postcode']),
  ].filter(Boolean);
  return parts.join(' ');
}
async function load() {
  const status = document.getElementById('status');
  const leftCol = document.getElementById('patientCol');
  const rightCol = document.getElementById('resultsCol');
  const box = document.getElementById('results');
  const { cid, ln, api } = getParams();
  const apiBaseStored = (localStorage.getItem('apiBase') || '').trim();
  const isNetlify = /\.netlify\.app$/i.test(window.location.host);
  let baseCandidate = api || apiBaseStored;
  if (!baseCandidate && isNetlify) baseCandidate = 'https://results-30z0.onrender.com';
  const apiBase = (baseCandidate || '').replace(/\/$/, '');
  if (baseCandidate && baseCandidate !== apiBaseStored) {
    try { localStorage.setItem('apiBase', apiBase); } catch {}
  }
  if (!cid || !ln) {
    status.innerHTML = '<div class="status-container"><div class="status-text">กรุณากรอกข้อมูลให้ครบ</div></div>';
    return;
  }
  status.innerHTML = `
    <div class="status-container">
      <div class="loader"></div>
      <div class="status-text">กำลังดึงข้อมูล...</div>
    </div>
  `;
  try {
    const base = apiBase ? apiBase : '';
    const endpoint = `${base ? base : ''}/api/patient-report?cid=${encodeURIComponent(cid)}&ln=${encodeURIComponent(ln)}`;
    const r = await fetch(endpoint);
    if (!r.ok) {
      status.innerHTML = `
        <div class="status-container">
          <div class="status-error">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            เกิดข้อผิดพลาดในการดึงข้อมูล
          </div>
        </div>
      `;
      return;
    }
    const data = await r.json();
    const patient = data.patient || null;
    const visits = Array.isArray(data.visits) ? data.visits : [];
    const resultsDirect = Array.isArray(data.resultsDirect) ? data.resultsDirect : [];
    if (!patient && visits.length === 0) {
      status.innerHTML = `
        <div class="status-container">
          <div class="status-text">ไม่พบข้อมูล</div>
          <div style="margin-top: 1.5rem">
            <a href="index.html" class="btn primary">กลับหน้าหลัก</a>
          </div>
        </div>
      `;
      return;
    }
    status.innerHTML = '';
    if (leftCol) leftCol.innerHTML = '';
    if (rightCol) rightCol.innerHTML = '';
    if (!leftCol && !rightCol && box) box.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'result-card';

    // Patient Header (Avatar + Name)
    const pHeader = document.createElement('div');
    pHeader.className = 'patient-header';
    
    const title = pick(patient, ['title', 'prefix']);
    const first = pick(patient, ['firstName', 'fname', 'name']);
    const last = pick(patient, ['lastName', 'lname', 'surname']);
    const fullName = [title, [first, last].filter(Boolean).join(' ')].filter(Boolean).join(' ');
    
    // Initials
    const initials = ((first ? first[0] : '') + (last ? last[0] : '')).toUpperCase() || 'P';
    const avatar = document.createElement('div');
    avatar.className = 'patient-avatar';
    avatar.textContent = initials;
    pHeader.appendChild(avatar);

    const pInfo = document.createElement('div');
    pInfo.className = 'patient-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'patient-name';
    nameEl.textContent = fullName || 'ผู้ป่วย';
    pInfo.appendChild(nameEl);

    const badges = document.createElement('div');
    badges.className = 'patient-badges';
    const lnVal = pick(patient, ['ln', 'LN', 'lnNo']);
    if (lnVal) {
      const b = document.createElement('span');
      b.className = 'pill';
      b.textContent = `LN: ${lnVal}`;
      badges.appendChild(b);
    }
    const pid = pick(patient, ['idCard', 'cid', 'id']);
    if (pid) {
      const b = document.createElement('span');
      b.className = 'pill';
      b.textContent = `ID: ${pid}`;
      badges.appendChild(b);
    }
    pInfo.appendChild(badges);
    pHeader.appendChild(pInfo);
    header.appendChild(pHeader);

    // Patient Details
    const dList = document.createElement('div');
    dList.className = 'detail-list';

    const gender = thaiGender(pick(patient, ['gender', 'sex']));
    const birth = pick(patient, ['birthDate', 'dob', 'dateOfBirth']);
    const age = pick(patient, ['age']) || calcAge(birth);
    const phone = pick(patient, ['phone', 'tel', 'mobile', 'telephone']);
    const address = joinAddress(patient);

    const details = [
      {
        label: 'เพศ / อายุ',
        value: [gender, age ? `${age} ปี` : ''].filter(Boolean).join(' • '),
        icon: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>'
      },
      {
        label: 'วันเกิด',
        value: thaiDate(birth),
        icon: '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>'
      },
      {
        label: 'เบอร์โทรศัพท์',
        value: phone,
        icon: '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>'
      },
      {
        label: 'ที่อยู่',
        value: address,
        icon: '<path d="M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>'
      }
    ];

    for (const d of details) {
      if (!d.value || d.value.trim() === '') continue;
      const item = document.createElement('div');
      item.className = 'detail-item';
      
      const iconBox = document.createElement('div');
      iconBox.className = 'detail-icon';
      iconBox.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${d.icon}</svg>`;
      
      const content = document.createElement('div');
      content.className = 'detail-content';
      
      const label = document.createElement('div');
      label.className = 'detail-label';
      label.textContent = d.label;
      
      const val = document.createElement('div');
      val.className = 'detail-value';
      val.textContent = d.value;
      
      content.appendChild(label);
      content.appendChild(val);
      item.appendChild(iconBox);
      item.appendChild(content);
      dList.appendChild(item);
    }
    header.appendChild(dList);
    if (leftCol) leftCol.appendChild(header);
    else if (box) box.appendChild(header);
    const rightWrap = document.createElement('div');
    rightWrap.className = 'result-card';
    const rightTitle = document.createElement('div');
    rightTitle.className = 'section-title';
    rightTitle.textContent = 'ผลการตรวจ';
    const visitList = document.createElement('div');
    visitList.className = 'visit-list';
    rightWrap.appendChild(rightTitle);
    rightWrap.appendChild(visitList);
    if (rightCol) rightCol.appendChild(rightWrap);
    else if (box) box.appendChild(rightWrap);
    for (const visit of visits) {
      const dateStr = visit.visitDate || visit.date || visit.visitedAt || visit.createdAt || '';
      const timeStr = visit.visitTime || '';
      let dText = '';
      let tText = '';
      if (dateStr) {
        const d = timeStr ? new Date(`${dateStr}T${timeStr}:00`) : new Date(dateStr);
        if (!isNaN(d.getTime())) {
            dText = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
            if (timeStr) tText = timeStr.substring(0, 5);
        } else {
            dText = dateStr;
        }
      }
      const vNo = pick(visit, ['visitNo', 'visitNumber', 'visitId', '_id']);
      
      const item = document.createElement('div');
      item.className = 'visit-item-new';
      
      const iconBox = document.createElement('div');
      iconBox.className = 'visit-icon-box';
      // Calendar icon
      iconBox.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>`;
      
      const info = document.createElement('div');
      info.className = 'visit-info';
      
      const title = document.createElement('h3');
      title.textContent = dText || 'ไม่ระบุวันที่';
      
      const meta = document.createElement('div');
      meta.className = 'visit-meta';
      
      if (tText) {
         const tSpan = document.createElement('span');
         tSpan.textContent = `เวลา: ${tText} น.`;
         meta.appendChild(tSpan);
      }
      
      if (vNo) {
        const vSpan = document.createElement('span');
        vSpan.className = 'pill';
        vSpan.style.fontSize = '0.8rem';
        vSpan.style.padding = '0.15rem 0.5rem';
        vSpan.textContent = `#${vNo}`;
        meta.appendChild(vSpan);
      }
      
      info.appendChild(title);
      info.appendChild(meta);
      
      const arrow = document.createElement('div');
      arrow.className = 'visit-arrow';
      arrow.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
      
      item.appendChild(iconBox);
      item.appendChild(info);
      item.appendChild(arrow);
      
      item.addEventListener('click', () => openVisitPopup(visit));
      visitList.appendChild(item);
    }
    if (visits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'ไม่พบรายการตรวจ';
      visitList.appendChild(empty);
    }
    if (resultsDirect.length > 0) {
      const info = document.createElement('div');
      info.className = 'result-card';
      const t = document.createElement('div');
      t.textContent = `ผลตรวจที่พบโดยตรง (${resultsDirect.length})`;
      info.appendChild(t);
      if (rightCol) rightCol.appendChild(info);
      else if (box) box.appendChild(info);
    }
  } catch {
    status.textContent = 'เกิดข้อผิดพลาดในการดึงข้อมูล';
  }
}
window.addEventListener('DOMContentLoaded', load);



function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function openVisitPopup(v) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  
  const content = document.createElement('div');
  content.className = 'popup-content';
  
  // --- Header ---
  const header = document.createElement('div');
  header.className = 'popup-header';
  
  const titleBox = document.createElement('div');
  titleBox.className = 'popup-title';
  
  const dateStr = v.visitDate || v.date || v.visitedAt || v.createdAt || '';
  const timeStr = v.visitTime || '';
  let dText = '';
  if (dateStr) {
    const d = timeStr ? new Date(`${dateStr}T${timeStr}:00`) : new Date(dateStr);
    dText = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  
  const h2 = document.createElement('h2');
  h2.textContent = dText || 'รายละเอียดการตรวจ';
  titleBox.appendChild(h2);
  
  const vNo = pick(v, ['visitNo', 'visitNumber', 'visitId', '_id']);
  if (vNo || timeStr) {
    const sub = document.createElement('div');
    sub.className = 'popup-subtitle';
    if (vNo) {
      sub.innerHTML += `<span class="pill">VN: ${vNo}</span>`;
    }
    if (timeStr) {
      sub.innerHTML += `<span>เวลา ${timeStr.substring(0, 5)} น.</span>`;
    }
    titleBox.appendChild(sub);
  }
  
  const btnClose = document.createElement('button');
  btnClose.className = 'popup-close';
  btnClose.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  btnClose.onclick = () => { 
    overlay.style.opacity = '0';
    setTimeout(() => document.body.removeChild(overlay), 200);
  };
  
  header.appendChild(titleBox);
  header.appendChild(btnClose);
  content.appendChild(header);
  
  // --- Body ---
  const body = document.createElement('div');
  body.className = 'popup-body';
  
  const orders = Array.isArray(v.orders) ? v.orders : [];
  let hasContent = false;
  
  for (const order of orders) {
    // 1. Order List Section
    const labs = Array.isArray(order.labOrders) ? order.labOrders : [];
    if (labs.length > 0 || order.totalAmount != null) {
      hasContent = true;
      const section = document.createElement('div');
      section.className = 'popup-section';
      
      const head = document.createElement('div');
      head.className = 'section-head';
      head.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg> รายการตรวจ`;
      section.appendChild(head);
      
      const card = document.createElement('div');
      card.className = 'order-card';
      
      for (const it of labs) {
        const name = it.name || it.testName || it.item || it.title || it.code || '';
        const priceRaw = it.price ?? it.amount ?? it.total ?? it.unitPrice ?? it.cost ?? null;
        const price = priceRaw != null ? new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(priceRaw)) : '';
        
        if (name) {
          const row = document.createElement('div');
          row.className = 'order-item';
          row.innerHTML = `<div class="order-name">${name}</div><div class="order-price">${price}</div>`;
          card.appendChild(row);
        }
      }
      
      if (order.totalAmount != null) {
        const totalRow = document.createElement('div');
        totalRow.className = 'order-total';
        totalRow.innerHTML = `<div>ยอดรวม</div><div>${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(order.totalAmount))}</div>`;
        card.appendChild(totalRow);
      }
      
      section.appendChild(card);
      body.appendChild(section);
    }
    
    // 2. Attachments Section
    const results = Array.isArray(order.results) ? order.results : [];
    const allAtts = [];
    for (const doc of results) {
      if (Array.isArray(doc.attachedFiles)) {
        allAtts.push(...doc.attachedFiles);
      }
    }
    
    if (allAtts.length > 0) {
      hasContent = true;
      const section = document.createElement('div');
      section.className = 'popup-section';
      
      const head = document.createElement('div');
      head.className = 'section-head';
      head.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> ผลการตรวจ (รูปภาพ/ไฟล์)`;
      section.appendChild(head);
      
      const grid = document.createElement('div');
      grid.className = 'attach-grid';
      
      for (const a of allAtts) {
        let src = '';
        let mime = 'image/png';
        let fileName = 'Attached File';
        let fileSize = null;
        
        // Extract data
        if (typeof a === 'string') {
          src = a.startsWith('data:') ? a : `data:${mime};base64,${a}`;
        } else if (typeof a === 'object') {
          const data = a.fileData || a.data || a.base64 || a.content || '';
          mime = a.fileType || a.contentType || a.mime || mime;
          fileName = a.fileName || a.name || fileName;
          fileSize = a.fileSize;
          const url = a.url || a.href;
          if (url) src = url;
          else if (data) src = data.startsWith('data:') ? data : `data:${mime};base64,${data}`;
        }
        
        if (src) {
          const item = document.createElement('div');
          item.className = 'attach-item';
          item.innerHTML = `
            <a href="${src}" data-lightbox="visit-gallery" data-title="${fileName}">
              <img class="attach-thumb" src="${src}" alt="${fileName}">
            </a>
            <div class="attach-meta">
              <div class="attach-info">
                <div class="attach-name">${fileName}</div>
                <div class="attach-size">${fileSize ? formatBytes(fileSize) : mime}</div>
              </div>
              <button class="btn-download" title="ดาวน์โหลด">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
            </div>
          `;
          item.onclick = (e) => {
            if (e.target.closest('.btn-download')) return;
            if (e.target.tagName !== 'IMG') {
              const img = item.querySelector('img');
              if (img) img.click();
            }
          };

          const btnDl = item.querySelector('.btn-download');
          if (btnDl) {
            btnDl.onclick = (e) => {
              e.stopPropagation();
              const a = document.createElement('a');
              a.href = src;
              a.download = fileName || 'download';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            };
          }

          grid.appendChild(item);
        }
      }
      section.appendChild(grid);
      body.appendChild(section);
    }
  }
  
  if (!hasContent) {
    body.innerHTML = '<div class="muted" style="text-align:center; padding: 2rem;">ไม่พบรายละเอียดการตรวจ</div>';
  }
  
  content.appendChild(body);
  overlay.appendChild(content);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => document.body.removeChild(overlay), 200);
    }
  });
  
  document.body.appendChild(overlay);
}
