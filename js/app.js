/* ============================================================
   HMTTL Receipt / Strip-Down / Inspection — live app logic
   Reads/writes Supabase directly from the browser using the
   anon key in config.js. See README.md for one-time setup.
   ============================================================ */

const ICONS = {
  cylinder:'<path d="M4 9h9v6H4z" stroke="currentColor" stroke-width="1.6"/><path d="M13 11h4M20 8v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6.5" cy="12" r="1.1" fill="currentColor"/>',
  pump:'<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  valve:'<rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  hose:'<path d="M4 8c4 0 4 8 8 8s4-8 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  default:'<rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 9h6v6H9z" stroke="currentColor" stroke-width="1.6"/>'
};
const SEVERITIES=['Critical','Major','Minor','Monitor'];
const ROOT_CAUSES=['Wear','Contamination','Misuse','Manufacturing defect','Unknown'];
const ACTIONS=['Required repair','Recommended repair','Monitor','No action'];
const STAGES=[{key:'receipt',label:'Receipt'},{key:'stripdown',label:'Strip-Down'},{key:'inspection',label:'Inspection'},{key:'report',label:'Report'}];
const STAGE_STATUS={receipt:'Received', stripdown:'Stripped', inspection:'Inspected', report:'Reported'};
const STATUS_RANK={Received:0, Stripped:1, Inspected:2, Reported:3};

let sb=null;
let state={
  nav:'dashboard',
  equipmentTypes:[],
  jobs:[],
  currentJob:null,
  reportView:'customer',
  draftFault:{component:'', faultType:'', severity:'Major', rootCause:'Wear', action:'Recommended repair', notes:'', photoFile:null, photoPreview:null}
};

/* ===================== Boot ===================== */
function needsSetup(){
  return !window.SUPABASE_URL || SUPABASE_URL.indexOf('PASTE_YOUR')!==-1 ||
         !window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf('PASTE_YOUR')!==-1;
}
async function boot(){
  if(needsSetup()){
    document.getElementById('app').innerHTML=setupScreen();
    return;
  }
  sb=window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setLoading(true);
  const {data:types, error}=await sb.from('equipment_types').select('*').eq('active',true).order('name');
  if(error){
    document.getElementById('app').innerHTML=connectionErrorScreen(error.message);
    setLoading(false);
    return;
  }
  state.equipmentTypes=types.map(t=>({key:t.key, name:t.name, intakeFields:t.intake_fields, checklist:t.checklist, faultTypes:t.fault_taxonomy, icon:ICONS[t.key]||ICONS.default}));
  await refreshJobsList();
  setLoading(false);
  render();
}

function setupScreen(){
  return `<div class="card" style="padding:28px 30px; max-width:640px; margin:40px auto;">
    <h1 class="page-title disp" style="font-size:22px;">Connect Supabase to go live</h1>
    <p style="font-size:13.5px; color:var(--steel-600); line-height:1.6;">
      This copy isn't connected to a database yet. Open <span class="mono">js/config.js</span>,
      paste in your Supabase Project URL and anon public key, then reload this page.
      Full setup steps are in <span class="mono">README.md</span>.
    </p>
  </div>`;
}
function connectionErrorScreen(msg){
  return `<div class="card" style="padding:28px 30px; max-width:640px; margin:40px auto;">
    <h1 class="page-title disp" style="font-size:22px;">Couldn't reach Supabase</h1>
    <p style="font-size:13.5px; color:var(--steel-600); line-height:1.6;">${esc(msg)}</p>
    <p style="font-size:13.5px; color:var(--steel-600); line-height:1.6;">
      Check the URL/key in <span class="mono">js/config.js</span> are correct, and that
      <span class="mono">sql/schema.sql</span> has been run in the Supabase SQL Editor.
    </p>
  </div>`;
}

/* ===================== Small helpers ===================== */
function esc(s){return (s??'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function icon(name){
  const map={
    plus:'<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    camera:'<rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="13.5" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 7l1.5-2.5h5L16 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    check:'<path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${map[name]||''}</svg>`;
}
function setLoading(on){
  let bar=document.getElementById('loadingBar');
  if(!bar){ bar=document.createElement('div'); bar.id='loadingBar'; bar.className='loading-bar'; document.body.prepend(bar); }
  bar.className='loading-bar'+(on?' on':'');
}
let toastTimer=null;
function toast(msg,isErr){
  let el=document.getElementById('toastEl');
  if(!el){ el=document.createElement('div'); el.id='toastEl'; el.className='toast'; document.body.appendChild(el); }
  el.textContent=msg; el.className='toast show'+(isErr?' err':'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ el.className='toast'; }, 2000);
}
function typeOf(job){ return state.equipmentTypes.find(t=>t.key===job.typeKey || t.key===job.equipment_type_key); }
function equipLabel(job){
  const t=state.equipmentTypes.find(e=>e.key===job.equipment_type_key);
  if(!t) return job.equipment_type_key||'—';
  const serial=job.equipment_details && job.equipment_details.serial;
  return t.name+(serial?' · '+serial:'');
}

/* ===================== Root render ===================== */
function render(){
  renderNav();
  const app=document.getElementById('app');
  if(state.nav==='dashboard') app.innerHTML=renderDashboard();
  else if(state.nav==='settings') app.innerHTML=renderSettings();
  else if(state.nav==='newjob') app.innerHTML=renderTypeSelect();
  else if(state.nav==='job') app.innerHTML=renderJobShell();
}
function renderNav(){
  const tabs=document.getElementById('navTabs');
  const items=[['dashboard','Dashboard'],['newjob','New Job'],['settings','Settings']];
  tabs.innerHTML=items.map(([k,l])=>`<button class="${state.nav===k?'active':''}" onclick="goNav('${k}')">${l}</button>`).join('');
}
function goNav(k){ state.nav=k; render(); }

/* ===================== Dashboard ===================== */
function renderDashboard(){
  return `
    <div class="page-head">
      <div><h1 class="page-title disp">Job Dashboard</h1><p class="page-sub">Live jobs from Supabase</p></div>
      <button class="btn btn-primary" onclick="goNav('newjob')">${icon('plus')} New Job</button>
    </div>
    <div class="job-list-head"><div>WO No.</div><div>Customer</div><div>Equipment</div><div>Status</div><div></div></div>
    <div class="job-list">
      ${state.jobs.length===0?`<div class="card empty-state">No jobs yet — select <strong>New Job</strong> to create the first one.</div>`:
      state.jobs.map(j=>`
        <div class="job-row card">
          <div class="wo">${esc(j.wo_number)||'—'}</div>
          <div class="cust">${esc(j.customer_name)||'<span style=\"color:var(--steel-400)\">Not set</span>'}</div>
          <div class="equip">${equipLabel(j)}</div>
          <div><span class="status-badge st-${j.status}">${j.status}</span></div>
          <div style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="openJob('${j.id}')">Open</button></div>
        </div>`).join('')}
    </div>
  `;
}
async function refreshJobsList(){
  const {data,error}=await sb.from('jobs').select('*').order('created_at',{ascending:false}).limit(100);
  if(!error) state.jobs=data;
}
async function openJob(id){
  setLoading(true);
  await loadJobDetail(id);
  setLoading(false);
  state.nav='job';
  render();
}

/* ===================== Equipment type select ===================== */
function renderTypeSelect(){
  return `
    <div class="page-head">
      <div><h1 class="page-title disp">New Job — Select Equipment Type</h1><p class="page-sub">Loaded live from the equipment_types table</p></div>
    </div>
    <div class="type-grid">
      ${state.equipmentTypes.map(t=>`
        <div class="type-tile" onclick="startJob('${t.key}')">
          <div class="ic"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${t.icon}</svg></div>
          <div class="nm">${t.name}</div>
          <div class="sub">${t.checklist.length} checklist items</div>
        </div>`).join('')}
    </div>
    <div class="demo-note">To add a new equipment type, insert a row into <span class="mono">equipment_types</span> in Supabase — it appears here immediately, no code change.</div>
  `;
}
async function startJob(typeKey){
  setLoading(true);
  const {data,error}=await sb.from('jobs').insert({equipment_type_key:typeKey, equipment_details:{}, status:'Received'}).select().single();
  if(error){ setLoading(false); toast('Could not create job: '+error.message, true); return; }
  await loadJobDetail(data.id);
  state.currentJob.stage='receipt';
  await refreshJobsList();
  setLoading(false);
  state.nav='job';
  render();
}

/* ===================== Load a job's full detail ===================== */
function stageForStatus(s){ return {Received:'receipt', Stripped:'stripdown', Inspected:'inspection', Reported:'report'}[s]||'receipt'; }
async function loadJobDetail(id){
  const [{data:job},{data:photos},{data:steps},{data:faults}]=await Promise.all([
    sb.from('jobs').select('*').eq('id',id).single(),
    sb.from('receipt_photos').select('*').eq('job_id',id).order('taken_at'),
    sb.from('stripdown_steps').select('*').eq('job_id',id),
    sb.from('fault_findings').select('*').eq('job_id',id).order('created_at')
  ]);
  const t=state.equipmentTypes.find(e=>e.key===job.equipment_type_key);
  const stripdown={};
  (t?t.checklist:[]).forEach(c=>{
    const row=(steps||[]).find(s=>s.component===c);
    stripdown[c]=row?{id:row.id, complete:row.complete, measurement:row.measurement||'', notes:row.notes||'', photo:row.photo_url||null}
                    :{id:null, complete:false, measurement:'', notes:'', photo:null};
  });
  state.currentJob={
    id:job.id, woNumber:job.wo_number||'', customer:job.customer_name||'', site:job.site||'',
    receivedBy:job.received_by||'', receivedAt:job.received_at||new Date().toISOString().slice(0,10),
    priority:job.priority||'Standard', customerFault:job.customer_reported_fault||'',
    typeKey:job.equipment_type_key, intake:job.equipment_details||{},
    photos:(photos||[]).map(p=>({id:p.id, dataUrl:p.photo_url, caption:p.caption})),
    stripdown,
    faults:(faults||[]).map(f=>({id:f.id, component:f.component, faultType:f.fault_type, severity:f.severity, rootCause:f.root_cause, action:f.recommended_action, notes:f.notes, photo:f.photo_url, internalCode:f.internal_repair_code})),
    status:job.status, stage:stageForStatus(job.status)
  };
}

/* ===================== Job shell (stepper + stage content) ===================== */
function renderJobShell(){
  const job=state.currentJob;
  const t=state.equipmentTypes.find(e=>e.key===job.typeKey);
  const curIdx=STAGES.findIndex(s=>s.key===job.stage);
  const stepper=STAGES.map((s,i)=>{
    let cls='stage-node';
    if(i<curIdx) cls+=' done'; else if(i===curIdx) cls+=' current';
    return `<div class="${cls}" onclick="gotoStage('${s.key}')">
              <div class="stage-line"></div>
              <div class="dot">${i<curIdx?'&#10003;':i+1}</div>
              <div class="lbl">${s.label}</div>
            </div>`;
  }).join('');
  let body='';
  if(job.stage==='receipt') body=renderReceipt(job,t);
  else if(job.stage==='stripdown') body=renderStripdown(job,t);
  else if(job.stage==='inspection') body=renderInspection(job,t);
  else if(job.stage==='report') body=renderReport(job,t);
  return `
    <div class="job-meta-bar">
      <div><span class="wo-big">${esc(job.woNumber)||'WO — not set'}</span><span class="eq-tag">${t?t.name:job.typeKey}</span></div>
      <button class="btn btn-ghost btn-sm" onclick="closeJob()">Back to Dashboard</button>
    </div>
    <div class="stage-strip">${stepper}</div>
    ${body}
  `;
}
async function gotoStage(key){
  state.currentJob.stage=key;
  const target=STAGE_STATUS[key];
  if(target && STATUS_RANK[target]>STATUS_RANK[state.currentJob.status]){
    state.currentJob.status=target;
    await sb.from('jobs').update({status:target}).eq('id',state.currentJob.id);
    refreshJobsList();
  }
  render();
}
function closeJob(){ state.currentJob=null; state.nav='dashboard'; refreshJobsList().then(render); }

/* ===================== Stage 1: Receipt ===================== */
function renderReceipt(job,t){
  return `
    <div class="card" style="padding:22px 24px;">
      <div class="section-label">Job &amp; Customer</div>
      <div class="field-grid">
        <div class="field mono-in"><label>Infusion Job No.</label><input value="${esc(job.woNumber)}" onchange="updateJobField('woNumber',this.value)" placeholder="WO-XXXXX"></div>
        <div class="field"><label>Received By</label><input value="${esc(job.receivedBy)}" onchange="updateJobField('receivedBy',this.value)" placeholder="Staff name"></div>
        <div class="field"><label>Customer</label><input value="${esc(job.customer)}" onchange="updateJobField('customer',this.value)" placeholder="Customer name"></div>
        <div class="field"><label>Site</label><input value="${esc(job.site)}" onchange="updateJobField('site',this.value)" placeholder="Site / location"></div>
        <div class="field"><label>Date Received</label><input type="date" value="${job.receivedAt}" onchange="updateJobField('receivedAt',this.value)"></div>
        <div class="field"><label>Priority</label>
          <div class="radio-row">
            ${['Standard','Urgent'].map(p=>`<div class="radio-chip ${job.priority===p?'sel':''}" onclick="setPriority('${p}')">${p}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="section-label">Equipment Details — ${t?t.name:job.typeKey}</div>
      <div class="field-grid">
        ${(t?t.intakeFields:[]).map(f=>`
          <div class="field mono-in"><label>${f.label}</label>
            <input type="${f.type}" value="${esc(job.intake[f.key])}" onchange="updateIntakeField('${f.key}',this.value)">
          </div>`).join('')}
      </div>
      <div class="section-label">Customer-Reported Fault</div>
      <div class="field full">
        <textarea onchange="updateJobField('customerFault',this.value)" placeholder="What the customer says is wrong, in their words...">${esc(job.customerFault)}</textarea>
      </div>
      <div class="section-label">As-Received Photos <span style="color:var(--steel-600); font-weight:400; text-transform:none; letter-spacing:0; font-size:12px;">— minimum 4 (front / back / both ends / data plate)</span></div>
      <div class="photo-strip">
        ${job.photos.map((p,i)=>`
          <div class="photo-thumb"><img src="${p.dataUrl}"><button class="rm" onclick="removeReceiptPhoto(${i})">&times;</button><div class="cap">${esc(p.caption)}</div></div>`).join('')}
        <label class="add-photo-btn">${icon('camera')}<span>Add Photo</span>
          <input type="file" accept="image/*" style="display:none" onchange="addReceiptPhoto(event)">
        </label>
      </div>
    </div>
    <div class="foot-actions"><div></div>
      <button class="btn btn-primary" onclick="gotoStage('stripdown')">Next: Strip-Down &#8594;</button>
    </div>
  `;
}
async function updateJobField(field,value){
  state.currentJob[field]=value;
  const map={woNumber:'wo_number', customer:'customer_name', site:'site', receivedBy:'received_by', receivedAt:'received_at', priority:'priority', customerFault:'customer_reported_fault'};
  const col=map[field]; if(!col) return;
  const {error}=await sb.from('jobs').update({[col]:value}).eq('id',state.currentJob.id);
  if(error) toast('Save failed: '+error.message, true); else toast('Saved');
}
async function setPriority(p){ state.currentJob.priority=p; render(); await sb.from('jobs').update({priority:p}).eq('id',state.currentJob.id); }
async function updateIntakeField(key,value){
  state.currentJob.intake[key]=value;
  const {error}=await sb.from('jobs').update({equipment_details:state.currentJob.intake}).eq('id',state.currentJob.id);
  if(error) toast('Save failed: '+error.message, true);
}
async function addReceiptPhoto(evt){
  const file=evt.target.files[0]; if(!file) return;
  setLoading(true);
  const path=`${state.currentJob.id}/receipt/${Date.now()}-${file.name}`;
  const {error:upErr}=await sb.storage.from(PHOTO_BUCKET).upload(path,file);
  if(upErr){ setLoading(false); toast('Upload failed: '+upErr.message, true); return; }
  const {data:pub}=sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  const {data,error}=await sb.from('receipt_photos').insert({job_id:state.currentJob.id, photo_url:pub.publicUrl, caption:'As received'}).select().single();
  setLoading(false);
  if(error){ toast('Save failed: '+error.message, true); return; }
  state.currentJob.photos.push({id:data.id, dataUrl:pub.publicUrl, caption:data.caption});
  render();
}
async function removeReceiptPhoto(idx){
  const p=state.currentJob.photos[idx];
  state.currentJob.photos.splice(idx,1); render();
  if(p && p.id) await sb.from('receipt_photos').delete().eq('id',p.id);
}

/* ===================== Stage 2: Strip-down ===================== */
function renderStripdown(job,t){
  const list=t?t.checklist:[];
  const doneCount=list.filter(c=>job.stripdown[c] && job.stripdown[c].complete).length;
  return `
    <div class="card" style="padding:22px 24px 8px;">
      <div class="section-label" style="margin-top:0;">Strip-Down Checklist <span style="color:var(--steel-600); font-weight:400; text-transform:none; letter-spacing:0; font-size:12px;">— ${doneCount} of ${list.length} complete</span></div>
      ${list.map(comp=>{
        const c=job.stripdown[comp];
        return `
        <div class="card component-card">
          <div class="component-head">
            <div class="cname">${comp}</div>
            <div class="complete-toggle ${c.complete?'on':''}" onclick="toggleComplete('${comp}')">
              <div class="box">${c.complete?icon('check'):''}</div> Complete
            </div>
          </div>
          <div class="component-body">
            <div class="photo-strip">
              ${c.photo?`<div class="photo-thumb"><img src="${c.photo}"></div>`:`
              <label class="add-photo-btn">${icon('camera')}<span>Photo</span>
                <input type="file" accept="image/*" style="display:none" onchange="addStripdownPhoto(event,'${comp}')">
              </label>`}
            </div>
            <div class="field meas-input"><label>Measurement / Note</label>
              <input class="mono" value="${esc(c.measurement)}" onchange="saveMeasurement('${comp}',this.value)" placeholder="e.g. Bore 80.12mm">
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="foot-actions">
      <button class="btn btn-ghost" onclick="gotoStage('receipt')">&#8592; Back</button>
      <button class="btn btn-primary" onclick="gotoStage('inspection')">Next: Inspection &#8594;</button>
    </div>
  `;
}
async function upsertStripdown(component,patch){
  const cur=state.currentJob.stripdown[component];
  const payload={
    job_id:state.currentJob.id, component,
    complete: patch.complete!==undefined?patch.complete:cur.complete,
    measurement: patch.measurement!==undefined?patch.measurement:cur.measurement,
    notes: patch.notes!==undefined?patch.notes:cur.notes,
    photo_url: patch.photo_url!==undefined?patch.photo_url:cur.photo
  };
  const {data,error}=await sb.from('stripdown_steps').upsert(payload,{onConflict:'job_id,component'}).select().single();
  if(error){ toast('Save failed: '+error.message, true); return; }
  cur.id=data.id;
}
async function toggleComplete(comp){
  const c=state.currentJob.stripdown[comp];
  c.complete=!c.complete; render();
  await upsertStripdown(comp,{complete:c.complete});
}
async function saveMeasurement(comp,value){
  state.currentJob.stripdown[comp].measurement=value;
  await upsertStripdown(comp,{measurement:value});
}
async function addStripdownPhoto(evt,comp){
  const file=evt.target.files[0]; if(!file) return;
  setLoading(true);
  const path=`${state.currentJob.id}/stripdown/${comp.replace(/\W+/g,'_')}-${Date.now()}-${file.name}`;
  const {error:upErr}=await sb.storage.from(PHOTO_BUCKET).upload(path,file);
  if(upErr){ setLoading(false); toast('Upload failed: '+upErr.message, true); return; }
  const {data:pub}=sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  state.currentJob.stripdown[comp].photo=pub.publicUrl;
  setLoading(false);
  render();
  await upsertStripdown(comp,{photo_url:pub.publicUrl});
}

/* ===================== Stage 3: Inspection ===================== */
function renderInspection(job,t){
  const d=state.draftFault;
  return `
    <div class="card fault-form">
      <div class="section-label" style="margin-top:0;">Add Fault</div>
      <div class="field-grid">
        <div class="field"><label>Component</label>
          <select onchange="state.draftFault.component=this.value">
            <option value="">Select...</option>
            ${(t?t.checklist:[]).map(c=>`<option value="${c}" ${d.component===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Fault Type</label>
          <select onchange="state.draftFault.faultType=this.value">
            <option value="">Select...</option>
            ${(t?t.faultTypes:[]).map(f=>`<option value="${f}" ${d.faultType===f?'selected':''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Severity</label>
          <select onchange="state.draftFault.severity=this.value">${SEVERITIES.map(s=>`<option ${d.severity===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Root Cause</label>
          <select onchange="state.draftFault.rootCause=this.value">${ROOT_CAUSES.map(s=>`<option ${d.rootCause===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Recommended Action</label>
          <select onchange="state.draftFault.action=this.value">${ACTIONS.map(s=>`<option ${d.action===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Photo</label>
          ${d.photoPreview?
            `<div class="photo-thumb"><img src="${d.photoPreview}"><button class="rm" onclick="clearDraftPhoto()">&times;</button></div>`:
            `<label class="add-photo-btn" style="width:auto; height:auto; padding:9px 14px; flex-direction:row;">${icon('camera')}<span style="margin-left:6px;">Attach</span>
              <input type="file" accept="image/*" style="display:none" onchange="setDraftPhoto(event)"></label>`}
        </div>
        <div class="field full"><label>Notes</label>
          <textarea oninput="state.draftFault.notes=this.value" placeholder="Optional detail...">${esc(d.notes)}</textarea>
        </div>
      </div>
      <div style="margin-top:14px;"><button class="btn btn-primary" onclick="addFault()">${icon('plus')} Add Fault to Job</button></div>
    </div>
    <div class="section-label">Logged Faults <span style="color:var(--steel-600); font-weight:400; text-transform:none; letter-spacing:0; font-size:12px;">— ${job.faults.length} recorded</span></div>
    ${job.faults.length===0?`<div class="card empty-state">No faults logged yet. Components with no fault default to "No action required" in the report.</div>`:
      job.faults.map((f,i)=>`
        <div class="card fault-card sev-${f.severity}">
          <div>
            <div class="ftitle">${f.faultType} <span style="font-weight:400; color:var(--steel-600);">— ${f.component}</span></div>
            <div class="fmeta">
              <span class="chip chip-${f.severity}">${f.severity}</span>
              <span class="chip action-chip">${f.action}</span>
              Root cause: ${f.rootCause}${f.notes?' · '+esc(f.notes):''}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            ${f.photo?`<div class="photo-thumb" style="width:52px;height:52px;"><img src="${f.photo}"></div>`:''}
            <button class="btn btn-danger btn-sm" onclick="removeFault('${f.id}',${i})">Remove</button>
          </div>
        </div>`).join('')}
    <div class="foot-actions">
      <button class="btn btn-ghost" onclick="gotoStage('stripdown')">&#8592; Back</button>
      <button class="btn btn-primary" onclick="gotoStage('report')">Next: Report &#8594;</button>
    </div>
  `;
}
function setDraftPhoto(evt){
  const file=evt.target.files[0]; if(!file) return;
  state.draftFault.photoFile=file;
  state.draftFault.photoPreview=URL.createObjectURL(file);
  render();
}
function clearDraftPhoto(){ state.draftFault.photoFile=null; state.draftFault.photoPreview=null; render(); }
function genCode(typeKey,comp,i){
  const pfx=(typeKey||'GEN').slice(0,3).toUpperCase();
  const cpx=comp.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase();
  return `${pfx}-${cpx}-${String(i+1).padStart(2,'0')}`;
}
async function addFault(){
  const d=state.draftFault;
  if(!d.component||!d.faultType){ toast('Select a component and fault type first', true); return; }
  setLoading(true);
  let photo_url=null;
  if(d.photoFile){
    const path=`${state.currentJob.id}/faults/${Date.now()}-${d.photoFile.name}`;
    const {error:upErr}=await sb.storage.from(PHOTO_BUCKET).upload(path,d.photoFile);
    if(!upErr){ const {data:pub}=sb.storage.from(PHOTO_BUCKET).getPublicUrl(path); photo_url=pub.publicUrl; }
  }
  const code=genCode(state.currentJob.typeKey,d.component,state.currentJob.faults.length);
  const {data,error}=await sb.from('fault_findings').insert({
    job_id:state.currentJob.id, component:d.component, fault_type:d.faultType, severity:d.severity,
    root_cause:d.rootCause, recommended_action:d.action, notes:d.notes, photo_url, internal_repair_code:code
  }).select().single();
  setLoading(false);
  if(error){ toast('Save failed: '+error.message, true); return; }
  state.currentJob.faults.push({id:data.id, component:data.component, faultType:data.fault_type, severity:data.severity, rootCause:data.root_cause, action:data.recommended_action, notes:data.notes, photo:data.photo_url, internalCode:data.internal_repair_code});
  state.draftFault={component:'', faultType:'', severity:'Major', rootCause:'Wear', action:'Recommended repair', notes:'', photoFile:null, photoPreview:null};
  render();
}
async function removeFault(id,idx){
  state.currentJob.faults.splice(idx,1); render();
  if(id) await sb.from('fault_findings').delete().eq('id',id);
}

/* ===================== Stage 4: Report ===================== */
function renderReport(job,t){
  const isInternal=state.reportView==='internal';
  return `
    <div class="report-toggle">
      <button class="${!isInternal?'active':''}" onclick="state.reportView='customer'; render();">Customer Report</button>
      <button class="${isInternal?'active':''}" onclick="state.reportView='internal'; render();">Internal / Quoting</button>
    </div>
    <div class="card report-doc">
      <div class="report-head">
        <div>
          <div class="rt1">${isInternal?'Internal Inspection Report':'Inspection Report'}</div>
          <div class="rt2">HMTTL &middot; Hydraulink &amp; Metal Technologies Tauranga Ltd</div>
        </div>
        <div style="text-align:right; font-family:'IBM Plex Mono'; font-size:12px;">${esc(job.woNumber)||'WO — not set'}</div>
      </div>
      <div class="report-body">
        <div class="report-grid">
          <div class="g"><div class="k">Customer</div><div class="v">${esc(job.customer)||'—'}</div></div>
          <div class="g"><div class="k">Site</div><div class="v">${esc(job.site)||'—'}</div></div>
          <div class="g"><div class="k">Equipment</div><div class="v">${t?t.name:job.typeKey}</div></div>
          <div class="g"><div class="k">Date Received</div><div class="v">${job.receivedAt}</div></div>
          <div class="g"><div class="k">Received By</div><div class="v">${esc(job.receivedBy)||'—'}</div></div>
          <div class="g"><div class="k">Priority</div><div class="v">${job.priority}</div></div>
        </div>
        <div class="section-label" style="margin-top:0;">Findings</div>
        ${job.faults.length===0?`<div class="empty-state">No faults logged — nothing to report yet.</div>`:`
        <table class="fault-table">
          <thead><tr><th></th><th>Component</th><th>Fault</th><th>Severity</th><th>Action</th>${isInternal?'<th>Internal Ref</th>':''}</tr></thead>
          <tbody>
            ${job.faults.map(f=>`
              <tr>
                <td>${f.photo?`<img class="thumb" src="${f.photo}">`:''}</td>
                <td>${f.component}</td>
                <td>${f.faultType}${f.notes?`<div style="color:var(--steel-600); font-size:12px; margin-top:2px;">${esc(f.notes)}</div>`:''}</td>
                <td><span class="chip chip-${f.severity}">${f.severity}</span></td>
                <td><span class="chip action-chip">${f.action}</span></td>
                ${isInternal?`<td><span class="internal-code">${esc(f.internalCode)}</span></td>`:''}
              </tr>`).join('')}
          </tbody>
        </table>`}
        <div class="report-narrative">
          <div class="k">Summary</div>
          ${job.customerFault?`<div><strong>Reported fault:</strong> ${esc(job.customerFault)}</div>`:''}
          <div style="margin-top:6px;">${narrativeFor(job)}</div>
        </div>
        ${!isInternal?`<div class="no-price-note">${icon('check')} Customer report — no pricing or internal repair codes included</div>`:
          `<div class="demo-note">Internal reference codes are indicative — link to the standard-times bench card for final quoting. Not sent to the customer.</div>`}
      </div>
    </div>
    <div class="foot-actions">
      <button class="btn btn-ghost" onclick="gotoStage('inspection')">&#8592; Back</button>
      <button class="btn btn-primary" onclick="finalizeReport()">Print / Save as PDF</button>
    </div>
  `;
}
function narrativeFor(job){
  if(job.faults.length===0) return 'Strip-down and inspection completed with no faults identified requiring action.';
  const req=job.faults.filter(f=>f.action==='Required repair').length;
  const rec=job.faults.filter(f=>f.action==='Recommended repair').length;
  return `Strip-down and inspection identified ${job.faults.length} finding${job.faults.length>1?'s':''} across the unit`+
    (req?`, ${req} requiring repair before return to service`:'')+
    (rec?`${req?' and':','} ${rec} recommended for repair`:'')+
    '. Full detail against each component is set out above.';
}
async function finalizeReport(){
  if(state.currentJob.status!=='Reported'){
    state.currentJob.status='Reported';
    await sb.from('jobs').update({status:'Reported'}).eq('id',state.currentJob.id);
    refreshJobsList();
  }
  window.print();
}

/* ===================== Settings ===================== */
function renderSettings(){
  return `
    <div class="page-head">
      <div><h1 class="page-title disp">Settings — Equipment Templates</h1><p class="page-sub">Live from the equipment_types table</p></div>
      <button class="btn btn-ghost" onclick="reloadTypes()">Refresh</button>
    </div>
    ${state.equipmentTypes.map(t=>`
      <div class="card tmpl-card">
        <h3>${t.name}</h3>
        <div class="tmpl-cols">
          <div><div class="k">Intake Fields</div><ul>${t.intakeFields.map(f=>`<li>${f.label}</li>`).join('')}</ul></div>
          <div><div class="k">Strip-Down Checklist</div><ul>${t.checklist.map(c=>`<li>${c}</li>`).join('')}</ul></div>
          <div><div class="k">Fault Taxonomy</div><ul>${t.faultTypes.map(f=>`<li>${f}</li>`).join('')}</ul></div>
        </div>
      </div>`).join('')}
    <div class="demo-note">Editing templates from this screen isn't wired up yet — for now, add or edit rows directly in the <span class="mono">equipment_types</span> table in Supabase, then hit Refresh. Happy to build an in-app editor here next if that's worth it.</div>
  `;
}
async function reloadTypes(){
  setLoading(true);
  const {data,error}=await sb.from('equipment_types').select('*').eq('active',true).order('name');
  setLoading(false);
  if(error){ toast('Could not reload: '+error.message, true); return; }
  state.equipmentTypes=data.map(t=>({key:t.key, name:t.name, intakeFields:t.intake_fields, checklist:t.checklist, faultTypes:t.fault_taxonomy, icon:ICONS[t.key]||ICONS.default}));
  render();
}

/* ===================== Init ===================== */
boot();
