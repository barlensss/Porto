const $ = id => document.getElementById(id);
let mode = 'login', me = null, selectedAccount = null, accounts = [];
const authView = $('authView'), appView = $('appView');
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  mode = btn.dataset.mode;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  $('authSubmit').innerHTML = mode === 'login' ? 'Masuk ke workspace <span>↗</span>' : 'Buat akun sekarang <span>↗</span>';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('authMessage').textContent = '';
}));
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('authMessage'); msg.textContent = 'Memproses...'; msg.className = 'message';
  try {
    const res = await fetch('/api/' + (mode === 'login' ? 'login' : 'register'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:$('email').value, password:$('password').value})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
    me = data.user; await showApp();
  } catch(err) { msg.textContent = err.message; }
});
async function api(url, options={}) {
  const res = await fetch(url, { ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})} });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal.');
  return data;
}
async function boot() {
  try { const data = await api('/api/me'); if(data.user){me=data.user; await showApp();} } catch {}
}
async function showApp() {
  authView.classList.add('hidden'); appView.classList.remove('hidden');
  $('sideEmail').textContent = me.email; $('sideRole').textContent = me.role.toUpperCase();
  $('sideAvatar').textContent = me.email[0].toUpperCase(); $('topAvatar').textContent = me.email[0].toUpperCase();
  $('welcomeName').textContent = me.email.split('@')[0];
  $('rolePill').textContent = me.role.toUpperCase(); $('roleStat').textContent = me.role;
  $('accountsNav').classList.toggle('hidden', me.role !== 'CEO');
  $('modNav').classList.toggle('hidden', !['CEO','Moderator'].includes(me.role));
  await renderModerator();
  goPage('overview');
}
function goPage(name) {
  if(name === 'accounts' && me.role !== 'CEO') name = 'overview';
  if(name === 'moderator' && !['CEO','Moderator'].includes(me.role)) name = 'overview';
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  $(name+'Page').classList.remove('hidden');
  document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.page===name));
  const titles={overview:'Your dashboard',accounts:'Account directory',moderator:'Moderator tools'};
  $('pageTitle').textContent=titles[name]; $('pageCrumb').textContent=name.toUpperCase();
  if(name==='accounts') loadAccounts();
  if(name==='moderator') renderModerator();
}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>goPage(b.dataset.goto)));
$('exploreBtn').addEventListener('click',()=>goPage(me.role==='CEO'?'accounts':'moderator'));
$('logoutBtn').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});}finally{location.reload();}});
async function loadAccounts() {
  const grid=$('accountGrid'); grid.innerHTML='<p class="muted">Memuat akun...</p>';
  try {
    const data=await api('/api/users'); accounts=data.users;
    $('accountCount').textContent=accounts.length;
    drawAccounts($('searchInput').value);
  } catch(e) {grid.innerHTML='<div class="notice">'+escapeHtml(e.message)+'</div>';}
}
function drawAccounts(filter='') {
  const grid=$('accountGrid'), q=filter.toLowerCase();
  const list=accounts.filter(a=>a.email.toLowerCase().includes(q));
  grid.innerHTML='';
  if(!list.length){grid.innerHTML='<p class="muted">Tidak ada akun yang cocok.</p>';return;}
  list.forEach(a=>{
    const card=document.createElement('button'); card.className='account-card glass';
    const tag=a.role==='CEO'?'ceo':a.role==='Moderator'?'mod':'';
    card.innerHTML=`<div class="account-top"><div class="avatar">${escapeHtml(a.email[0].toUpperCase())}</div><span class="muted">↗</span></div><div class="account-email">${escapeHtml(a.email)}</div><div class="account-date">Joined ${new Date(a.createdAt).toLocaleDateString('id-ID')}</div><span class="role-tag ${tag}">${escapeHtml(a.role.toUpperCase())}</span>`;
    card.addEventListener('click',()=>openAccount(a));grid.appendChild(card);
  });
}
$('searchInput').addEventListener('input',e=>drawAccounts(e.target.value));
function openAccount(a) {
  selectedAccount=a; $('modalEmail').textContent=a.email;$('modalAvatar').textContent=a.email[0].toUpperCase();
  $('modalId').textContent=a.id;$('modalRole').textContent=a.role;
  $('modalCreated').textContent=new Date(a.createdAt).toLocaleString('id-ID');
  $('roleSelect').value=a.role;$('roleControls').classList.toggle('hidden',me.role!=='CEO');
  $('modalMessage').textContent='';$('modalMessage').className='message';
  $('userModal').classList.remove('hidden');
}
function closeModal(){$('userModal').classList.add('hidden');}
$('modalClose').addEventListener('click',closeModal);$('modalBackdrop').addEventListener('click',closeModal);
$('saveRoleBtn').addEventListener('click',async()=>{
  if(!selectedAccount)return;
  const msg=$('modalMessage');msg.textContent='Menyimpan...';msg.className='message';
  try{
    await api('/api/users/'+encodeURIComponent(selectedAccount.id)+'/role',{method:'PATCH',body:JSON.stringify({role:$('roleSelect').value})});
    msg.textContent='Role berhasil diperbarui.';msg.className='message ok';
    await loadAccounts();
    const updated=accounts.find(a=>a.id===selectedAccount.id);
    if(updated){selectedAccount=updated;$('modalRole').textContent=updated.role;}
    if(selectedAccount.id===me.id){me.role=updated.role;await showApp();openAccount(updated);}
  }catch(e){msg.textContent=e.message;}
});
async function renderModerator(){
  const el=$('moderatorContent');
  if(!['CEO','Moderator'].includes(me.role)){el.innerHTML='<h4>Restricted area</h4><p class="muted">Role Moderator atau CEO diperlukan untuk membuka halaman ini.</p>';return;}
  try{
    const data=await api('/api/moderator/overview');
    el.innerHTML=`<span class="eyebrow">ACCESS GRANTED</span><h4 style="margin-top:14px">Control room is online.</h4><p class="muted">Kamu masuk sebagai ${escapeHtml(data.role)}. Endpoint ini juga memeriksa role di backend, bukan cuma menyembunyikan tombol.</p><div class="mod-grid"><div class="mod-item"><small>TOTAL ACCOUNTS</small><b>${data.totalAccounts}</b></div><div class="mod-item"><small>ACCESS LEVEL</small><b>${escapeHtml(data.role)}</b></div></div>${data.role==='CEO'?'<p class="muted" style="margin-top:22px">CEO dapat membuka Account directory dan mengubah role Member, Moderator, atau CEO.</p>':'<p class="muted" style="margin-top:22px">Moderator dapat membuka ringkasan tools. Pengaturan role hanya tersedia untuk CEO.</p>'}`;
  }catch(e){el.innerHTML='<p class="muted">'+escapeHtml(e.message)+'</p>';}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
boot();
