const form = document.getElementById('searchForm');
const cidEl = document.getElementById('cid');
const lnEl = document.getElementById('ln');
const statusEl = document.getElementById('homeStatus');
const submitBtn = document.getElementById('submitBtn');
const cidRow = document.getElementById('cidRow');
const lnRow = document.getElementById('lnRow');
const cidHelper = document.getElementById('cidHelper');
const lnHelper = document.getElementById('lnHelper');
function digitsOnly(s) { return s.replace(/\D/g, ''); }
function validate() {
  const cidDigits = digitsOnly(cidEl.value);
  const lnDigits = digitsOnly(lnEl.value);
  const cidOk = cidDigits.length > 0;
  const lnOk = lnDigits.length > 0;
  cidRow.classList.toggle('ok', cidOk);
  cidRow.classList.toggle('error', !cidOk && cidDigits.length > 0);
  lnRow.classList.toggle('ok', lnOk);
  lnRow.classList.toggle('error', !lnOk && lnDigits.length > 0);
  if (cidHelper) cidHelper.textContent = cidOk ? 'รูปแบบถูกต้อง' : 'กรอกตัวเลข';
  if (lnHelper) lnHelper.textContent = lnOk ? 'รูปแบบถูกต้อง' : 'กรอกตัวเลข';
  const ok = cidOk && lnOk;
  submitBtn.disabled = !ok;
}
cidEl.addEventListener('input', () => {
  const val = cidEl.value;
  cidEl.value = digitsOnly(val);
  validate();
});
cidEl.addEventListener('blur', () => {
  cidEl.value = digitsOnly(cidEl.value);
  validate();
});
lnEl.addEventListener('input', () => {
  lnEl.value = digitsOnly(lnEl.value);
  validate();
});
validate();
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const cid = digitsOnly(cidEl.value.trim());
  const ln = digitsOnly(lnEl.value.trim());
  if (!cid || !ln) return;
  const q = new URLSearchParams();
  q.set('cid', cid);
  q.set('ln', ln);
  const url = `result.html?${q.toString()}`;
  window.location.href = url;
});
