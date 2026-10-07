const C=window.LARACHEDEV_CONFIG||{};
const sb=window.supabase?.createClient(C.supabaseUrl,C.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:"pkce"}});

let session=null,selected=null,branch=C.branch||"main",role=null,currentFiles=[];

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const canEdit=()=>["owner","admin","editor"].includes(role);
const canAdmin=()=>["owner","admin"].includes(role);
const canManageSettings=()=>["owner","admin","editor"].includes(role);

function msg(id,text){const e=$("#"+id);if(e)e.textContent=text||""}
function setBusy(id,busy,label){const e=$("#"+id);if(!e)return;e.disabled=busy;if(label)e.textContent=busy?"جارٍ التنفيذ…":label}
function roleLabel(r){return({owner:"OWNER",admin:"ADMIN",editor:"EDITOR",viewer:"VIEWER"}[r]||String(r||"—")).toUpperCase()}

async function api(path,options={}){
  if(!session?.access_token)throw Error("انتهت جلسة الدخول.");
  const r=await fetch(C.supabaseUrl+"/rest/v1/"+path,{...options,headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",...(options.headers||{})}});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw Error(data?.message||data?.error||data?.hint||text||("HTTP "+r.status));
  return data;
}

async function gh(action,query={}){
  if(!session?.access_token)throw Error("انتهت جلسة الدخول.");
  const qs=new URLSearchParams(query);
  const url=C.githubManager+"?action="+encodeURIComponent(action)+(qs.toString()?"&"+qs:"");
  const r=await fetch(url,{headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+session.access_token}});
  const text=await r.text();let j=null;try{j=text?JSON.parse(text):null}catch{j={raw:text}}
  if(!r.ok)throw Error(j?.error||j?.message||text||("GitHub HTTP "+r.status));
  return j;
}

async function ghPost(action,body){
  if(!session?.access_token)throw Error("انتهت جلسة الدخول.");
  const r=await fetch(C.githubManager+"?action="+encodeURIComponent(action),{method:"POST",headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const text=await r.text();let j=null;try{j=text?JSON.parse(text):null}catch{j={raw:text}}
  if(!r.ok)throw Error(j?.error||j?.message||text||("GitHub HTTP "+r.status));
  return j;
}

async function refreshSession(){
  if(!sb)return false;
  const {data,error}=await sb.auth.refreshSession();
  if(error||!data.session){session=null;return false}
  session=data.session;return true;
}

function applyRoleUI(){
  const badge=$("#roleBadge");if(badge)badge.textContent=roleLabel(role);
  msg("overviewMsg","الدور الحالي: "+roleLabel(role)+" · "+(role==="viewer"?"قراءة فقط":role==="editor"?"قراءة + تعديل الملفات والإعدادات":role==="admin"?"إدارة كاملة":"صلاحيات المالك الكاملة"));
  const write=$("#saveFile"),del=$("#deleteFile"),dispatch=$("#dispatchWorkflow"),nf=$("#newFile"),saveSetting=$("#saveSetting"),cb=$("#createBranch"),db=$("#deleteBranch");
  if(write)write.disabled=!canEdit();if(nf)nf.disabled=!canEdit();if(saveSetting)saveSetting.disabled=!canManageSettings();
  if(del)del.disabled=!canAdmin();if(dispatch)dispatch.disabled=!canAdmin();if(cb)cb.disabled=!canAdmin();if(db)db.disabled=!canAdmin();
}

function initTabs(){
  const buttons=$$(".tabs button"),views=$$(".tab");
  buttons.forEach(x=>x.onclick=async()=>{
    buttons.forEach(y=>y.classList.remove("active"));x.classList.add("active");
    views.forEach(y=>y.hidden=y.id!=="tab-"+x.dataset.tab);
    try{
      if(x.dataset.tab==="files")await loadFiles();
      if(x.dataset.tab==="github")await loadGitHub();
      if(x.dataset.tab==="supabase")await loadSupabase();
      if(x.dataset.tab==="users")await loadUsers();
      if(x.dataset.tab==="audit")await loadAudit();
    }catch(e){msg("overviewMsg","❌ "+e.message)}
  });
}

async function start(){
  if(!sb)return showLogin("تعذر تحميل Supabase JS.");
  const {data}=await sb.auth.getSession();session=data.session;
  if(!session)return showLogin();
  try{
    const a=await api("admin_users?select=role,enabled&user_id=eq."+encodeURIComponent(session.user.id));
    if(!a[0]?.enabled)throw Error("المستخدم غير مفعّل في admin_users.");
    role=a[0].role;
    $("#loginView").hidden=true;$("#dashboardView").hidden=false;$("#logoutBtn").hidden=false;
    $("#supabaseStatus").textContent="READY";initTabs();applyRoleUI();
    await refreshOverview();
  }catch(e){await sb.auth.signOut({scope:"local"});session=null;role=null;showLogin(e.message)}
}

function showLogin(error=""){ $("#loginView").hidden=false;$("#dashboardView").hidden=true;$("#logoutBtn").hidden=true;if(error)msg("loginMsg","❌ "+error)}

async function githubLogin(){
  if(!sb)return msg("loginMsg","❌ Supabase Auth غير متاح.");
  const btn=$("#githubLoginBtn");
  if(btn)btn.disabled=true;
  msg("loginMsg","جارٍ فتح GitHub لتسجيل الدخول…");
  try{
    const redirectTo=window.location.origin+window.location.pathname.replace(/\\/+$/,"/")||window.location.origin+"/larachedev/admin/";
    const {data,error}=await sb.auth.signInWithOAuth({
      provider:"github",
      options:{
        redirectTo,
        skipBrowserRedirect:true
      }
    });
    if(error)throw error;
    if(!data?.url)throw Error("لم يُرجع Supabase رابط تسجيل GitHub.");
    window.location.assign(data.url);
  }catch(e){
    if(btn)btn.disabled=false;
    msg("loginMsg","❌ تعذر فتح GitHub: "+(e.message||"خطأ غير معروف"));
  }
}

async function consumeOAuthCallback(){
  if(!sb)throw Error("Supabase JS غير متاح.");

  // Support both PKCE (?code=...) and legacy/implicit (#access_token=...) callbacks.
  // Some already-open/cached browser sessions can still return the implicit hash.
  const p=new URLSearchParams(window.location.search);
  const error=p.get("error_description")||p.get("error");
  if(error){history.replaceState(null,"",window.location.pathname);throw Error(decodeURIComponent(error))}

  const code=p.get("code");
  if(code){
    const {data,error:exchangeError}=await sb.auth.exchangeCodeForSession(code);
    if(exchangeError)throw Error(exchangeError.message);
    if(!data.session)throw Error("تعذر إنشاء جلسة GitHub.");
    history.replaceState(null,"",window.location.pathname);
    return true;
  }

  const hash=window.location.hash.startsWith("#")?window.location.hash.slice(1):window.location.hash;
  if(!hash)return false;
  const h=new URLSearchParams(hash);
  const hashError=h.get("error_description")||h.get("error");
  if(hashError){history.replaceState(null,"",window.location.pathname);throw Error(decodeURIComponent(hashError))}

  const accessToken=h.get("access_token");
  const refreshToken=h.get("refresh_token");
  if(!accessToken||!refreshToken)return false;

  // Convert the returned tokens into the normal Supabase local session immediately,
  // then remove every OAuth token from the address bar/history.
  const {data,error:setError}=await sb.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
  history.replaceState(null,"",window.location.pathname);
  if(setError)throw Error(setError.message);
  if(!data.session)throw Error("تعذر إنشاء جلسة GitHub.");
  return true;
}

$("#loginForm").onsubmit=async e=>{
  e.preventDefault();msg("loginMsg","جارٍ تسجيل الدخول…");
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
    if(error)throw error;
    session=data.session;await start();
  }catch(e){msg("loginMsg",e.message||"فشل تسجيل الدخول.")}
};

$("#githubLoginBtn").onclick=githubLogin;
$("#logoutBtn").onclick=async()=>{
  try{if(sb)await sb.auth.signOut({scope:"local"})}finally{localStorage.removeItem("larachedev_session");session=null;role=null;location.reload()}
};
$("#refreshFrame").onclick=()=>{const f=$("#siteFrame");f.src=f.src};
$("#testGithubToken").onclick=testGithubHealth;
$("#quickHealth").onclick=testGithubHealth;
$("#refreshAll").onclick=refreshOverview;
$("#reloadGithub").onclick=loadGitHub;
$("#reloadSupabase").onclick=loadSupabase;
$("#reloadUsers").onclick=loadUsers;
$("#reloadAudit").onclick=loadAudit;

async function refreshOverview(){
  try{
    const [repo,runs,tree]=await Promise.all([gh("repo"),gh("runs"),gh("tree",{ref:branch})]);
    $("#filesState").textContent=(tree.tree||[]).filter(x=>x.type==="blob").length;
    $("#runsState").textContent=runs?.workflow_runs?.length??0;
    $("#healthPill").textContent=repo?.archived?"ARCHIVED":"GitHub OK";
    $("#healthPill").className="pill";
    msg("overviewMsg","الموقع متصل بـ GitHub · آخر فحص ناجح · الفرع الحالي: "+branch);
    await loadGitHub();
  }catch(e){$("#healthPill").textContent="ERROR";$("#healthPill").className="pill warning";msg("overviewMsg","❌ "+e.message)}
}

async function loadFiles(){
  try{
    const b=await gh("branches");
    $("#branchSelect").innerHTML=(b||[]).map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join("");
    if((b||[]).some(x=>x.name===branch))$("#branchSelect").value=branch;else{branch="main";$("#branchSelect").value="main"}
    const t=await gh("tree",{ref:branch});
    currentFiles=(t.tree||[]).filter(x=>x.type==="blob").sort((a,b)=>a.path.localeCompare(b.path));
    renderFiles();
  }catch(e){$("#tree").innerHTML='<div class="empty-state">❌ '+esc(e.message)+"</div>"}
}

function renderFiles(){
  const q=($("#fileSearch")?.value||"").trim().toLowerCase();
  const files=currentFiles.filter(x=>!q||x.path.toLowerCase().includes(q));
  $("#tree").innerHTML=files.length?files.map(x=>'<div class="file-item '+(selected?.path===x.path?"active":"")+'" data-path="'+esc(x.path)+'">'+esc(x.path)+'</div>').join(""):'<div class="empty-state">لا توجد ملفات مطابقة.</div>';
  $$(".file-item").forEach(x=>x.onclick=()=>openFile(x.dataset.path));
}
$("#fileSearch").oninput=renderFiles;

async function openFile(p){
  try{
    const f=await gh("file",{path:p,ref:branch});
    selected={path:p,sha:f.sha};$("#fileTitle").textContent=p;
    const raw=atob((f.content||"").replace(/\n/g,""));
    $("#editor").value=new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
    msg("fileMsg","تم تحميل الملف.");renderFiles();
  }catch(e){msg("fileMsg","❌ "+e.message)}
}

$("#reloadTree").onclick=loadFiles;
$("#branchSelect").onchange=e=>{branch=e.target.value;selected=null;$("#fileTitle").textContent="اختر ملفًا";$("#editor").value="";loadFiles()};

$("#createBranch").onclick=async()=>{
  if(!canAdmin())return msg("fileMsg","إنشاء الفروع متاح للـ admin و owner فقط.");
  const name=prompt("اسم الفرع الجديد:", "feature/"+new Date().toISOString().slice(0,10).replace(/-/g,""));
  if(!name)return;
  setBusy("createBranch",true,"+ فرع");
  try{await ghPost("branch-create",{name,from:branch});msg("fileMsg","تم إنشاء الفرع: "+name);branch=name;await loadFiles();await loadGitHub()}catch(e){msg("fileMsg","❌ "+e.message)}finally{setBusy("createBranch",false,"+ فرع")}
};

$("#deleteBranch").onclick=async()=>{
  if(!canAdmin())return msg("fileMsg","حذف الفروع متاح للـ admin و owner فقط.");
  if(branch==="main")return msg("fileMsg","لا يمكن حذف main.");
  if(!confirm("حذف الفرع "+branch+"؟"))return;
  setBusy("deleteBranch",true,"حذف الفرع");
  try{await ghPost("branch-delete",{name:branch});branch="main";selected=null;await loadFiles();await loadGitHub();msg("fileMsg","تم حذف الفرع.")}catch(e){msg("fileMsg","❌ "+e.message)}finally{setBusy("deleteBranch",false,"حذف الفرع")}
};

$("#saveFile").onclick=async()=>{
  if(!canEdit())return msg("fileMsg","ليس لديك صلاحية التعديل.");
  if(!selected)return msg("fileMsg","اختر ملفًا أو أنشئ ملفًا جديدًا.");
  const message=$("#commitMessage").value.trim()||"admin: update "+selected.path;
  setBusy("saveFile",true,"حفظ Commit");
  try{const j=await ghPost("write-file",{path:selected.path,content:$("#editor").value,branch,message});msg("fileMsg","تم الحفظ · Commit: "+(j.commit?.sha||j.sha||"OK"));selected.sha=j.content?.sha||selected.sha;await loadFiles();await loadGitHub()}catch(e){msg("fileMsg","❌ "+e.message)}finally{setBusy("saveFile",false,"حفظ Commit")}
};

$("#newFile").onclick=()=>{
  if(!canEdit())return msg("fileMsg","ليس لديك صلاحية إنشاء الملفات.");
  const p=prompt("مسار الملف الجديد:");if(!p)return;
  selected={path:p};$("#fileTitle").textContent=p;$("#editor").value="";$("#commitMessage").value="admin: create "+p;msg("fileMsg","ملف جديد جاهز. اضغط حفظ Commit.");renderFiles()
};

$("#deleteFile").onclick=async()=>{
  if(!canAdmin())return msg("fileMsg","حذف الملفات متاح للـ admin و owner فقط.");
  if(!selected?.sha)return msg("fileMsg","اختر ملفًا موجودًا أولًا.");
  if(!confirm("تأكيد حذف الملف؟\n"+selected.path))return;
  setBusy("deleteFile",true,"حذف");
  try{const j=await ghPost("delete-file",{path:selected.path,sha:selected.sha,branch,message:"admin: delete "+selected.path});msg("fileMsg","تم الحذف · Commit: "+(j.commit?.sha||j.sha||"OK"));selected=null;$("#fileTitle").textContent="اختر ملفًا";$("#editor").value="";await loadFiles();await loadGitHub()}catch(e){msg("fileMsg","❌ "+e.message)}finally{setBusy("deleteFile",false,"حذف")}
};

async function loadGitHub(){
  try{
    const [b,c,r,rel,wf]=await Promise.all([gh("branches"),gh("commits"),gh("runs"),gh("releases"),gh("workflows")]);
    $("#branchesCount").textContent=(b||[]).length;$("#commitsCount").textContent=(c||[]).length;$("#runsCount").textContent=r?.total_count??(r?.workflow_runs||[]).length;$("#releasesCount").textContent=(rel||[]).length;
    $("#commits").innerHTML=(c||[]).length?(c||[]).map(x=>'<p><b>'+esc((x.sha||"").slice(0,7))+'</b> '+esc((x.commit?.message||"").split("\n")[0])+"</p>").join(""):'<div class="empty-state">لا توجد Commits.</div>';
    renderRuns(r?.workflow_runs||[]);renderReleases(rel||[]);
    const workflows=Array.isArray(wf)?wf:(wf?.workflows||[]);
    $("#workflowSelect").innerHTML=workflows.length?workflows.map(x=>'<option value="'+esc(x.id||x.path)+'">'+esc(x.name||x.path)+'</option>').join(""):'<option value="">لا توجد Workflows</option>';
    applyRoleUI();
  }catch(e){msg("workflowMsg","❌ "+e.message)}
}

function renderRuns(runs){
  $("#runs").innerHTML=runs.length?runs.slice(0,20).map(x=>{
    const state=(x.status==="completed"?x.conclusion:x.status)||"unknown";
    const action=canAdmin()?'<button class="ghost run-rerun" data-run="'+esc(x.id)+'">إعادة المحاولة</button>':"";
    return '<p><b>'+esc(x.name||x.workflow_name||"Workflow")+'</b> · '+esc(state)+' · '+esc(x.created_at||"")+" "+action+"</p>"
  }).join(""):'<div class="empty-state">لا توجد Actions Runs.</div>';
  $$(".run-rerun").forEach(b=>b.onclick=async()=>{
    if(!confirm("إعادة تشغيل المهام الفاشلة لهذا Run؟"))return;
    try{await ghPost("rerun",{run_id:Number(b.dataset.run)});msg("workflowMsg","تم إرسال إعادة التشغيل.");setTimeout(loadGitHub,1200)}catch(e){msg("workflowMsg","❌ "+e.message)}
  });
}
function renderReleases(releases){$("#releases").innerHTML=releases.length?releases.slice(0,20).map(x=>'<p><b>'+esc(x.tag_name||x.name||"Release")+'</b> · '+esc(x.published_at||x.created_at||"")+(x.html_url?' · <a target="_blank" href="'+esc(x.html_url)+'">فتح</a>':"")+"</p>").join(""):'<div class="empty-state">لا توجد Releases.</div>'}

async function testGithubHealth(){
  if(!canAdmin())return msg("githubHealth","اختبار GitHub متاح للـ admin و owner فقط.");
  setBusy("testGithubToken",true,"اختبار GitHub Token");msg("githubHealth","جارٍ التحقق…");
  try{const h=await gh("health"),p=h.permissions||{};msg("githubHealth","✅ Token صالح · API "+h.github_status+" · user: "+(h.authenticated_user||"—")+" · push: "+(p.push?"نعم":"لا")+" · admin: "+(p.admin?"نعم":"لا"))}catch(e){msg("githubHealth","❌ "+e.message)}finally{setBusy("testGithubToken",false,"اختبار GitHub Token")}
}

async function loadSupabase(){
  try{
    const s=await api("site_settings?select=key,value,updated_at,updated_by&order=key");
    $("#settingsData").innerHTML=(s||[]).length?s.map(x=>'<div class="settings-row"><div><code>'+esc(x.key)+"</code><pre>"+esc(JSON.stringify(x.value,null,2))+"</pre></div><button class="ghost setting-pick" data-key=""+esc(x.key)+"" data-value='"+esc(JSON.stringify(x.value))+"'>تحرير</button></div>").join(""):'<div class="empty">لا توجد إعدادات.</div>';
    $$(".setting-pick").forEach(b=>b.onclick=()=>{$("#settingKey").value=b.dataset.key;$("#settingValue").value=JSON.stringify(JSON.parse(b.dataset.value),null,2)});
  }catch(e){$("#settingsData").textContent="❌ "+e.message}
}

$("#saveSetting").onclick=async()=>{
  if(!canManageSettings())return msg("settingMsg","ليس لديك صلاحية تعديل الإعدادات.");
  const key=$("#settingKey").value.trim(),raw=$("#settingValue").value.trim();
  if(!key||!raw)return msg("settingMsg","Key و JSON Value مطلوبان.");
  let value;try{value=JSON.parse(raw)}catch(e){return msg("settingMsg","JSON غير صالح: "+e.message)}
  setBusy("saveSetting",true,"حفظ الإعداد");
  try{
    await api("site_settings?on_conflict=key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({key,value,updated_by:session.user.id,updated_at:new Date().toISOString()})});
    await api("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({actor_id:session.user.id,action:"site_settings.update",resource:key,details:{role}})});
    msg("settingMsg","تم حفظ الإعداد.");await loadSupabase();await loadAudit();
  }catch(e){msg("settingMsg","❌ "+e.message)}finally{setBusy("saveSetting",false,"حفظ الإعداد")}
};

async function loadUsers(){
  if(!canAdmin()){return $("#usersData").innerHTML='<div class="empty">هذه الصفحة متاحة للـ admin و owner فقط.</div>'}
  try{
    const rows=await api("admin_users?select=user_id,role,enabled,created_at&order=created_at");
    $("#usersData").innerHTML=rows?.length?'<table class="data-table"><thead><tr><th>User ID</th><th>Role</th><th>Enabled</th><th>Created</th><th></th></tr></thead><tbody>'+rows.map(x=>'<tr><td><code>'+esc(x.user_id)+'</code></td><td><select class="user-role" data-id="'+esc(x.user_id)+'"><option>owner</option><option>admin</option><option>editor</option><option>viewer</option></select></td><td><input class="user-enabled" data-id="'+esc(x.user_id)+'" type="checkbox" '+(x.enabled?"checked":"")+'></td><td>'+esc(x.created_at||"")+'</td><td><button class="ghost user-save" data-id="'+esc(x.user_id)+'">حفظ</button></td></tr>').join("")+"</tbody></table>":'<div class="empty">لا يوجد مستخدمون.</div>';
    rows.forEach(x=>{const s=document.querySelector('.user-role[data-id="'+x.user_id+'"]');if(s)s.value=x.role});
    $$(".user-save").forEach(b=>b.onclick=()=>saveUser(b.dataset.id));
  }catch(e){$("#usersData").textContent="❌ "+e.message}
}

async function saveUser(id){
  if(id===session.user.id)return msg("usersMsg","لا يمكنك تغيير دور أو تعطيل حسابك الحالي من داخل اللوحة.");
  const roleValue=document.querySelector('.user-role[data-id="'+id+'"]').value;
  const enabled=document.querySelector('.user-enabled[data-id="'+id+'"]').checked;
  try{
    await api("admin_users?user_id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({role:roleValue,enabled})});
    await api("audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({actor_id:session.user.id,action:"admin_user.update",resource:id,details:{role:roleValue,enabled}})});
    msg("usersMsg","تم تحديث صلاحيات المستخدم.");await loadUsers();await loadAudit();
  }catch(e){msg("usersMsg","❌ "+e.message)}
}

async function loadAudit(){
  try{
    const a=await api("audit_logs?select=action,resource,details,created_at,actor_id&order=created_at.desc&limit=100");
    $("#auditData").innerHTML=(a||[]).length?'<table class="data-table"><thead><tr><th>Action</th><th>Resource</th><th>Actor</th><th>Time</th><th>Details</th></tr></thead><tbody>'+(a||[]).map(x=>'<tr><td><b>'+esc(x.action)+'</b></td><td>'+esc(x.resource||"")+'</td><td><code>'+esc((x.actor_id||"").slice(0,12))+'</code></td><td>'+esc(x.created_at||"")+'</td><td>'+esc(JSON.stringify(x.details||{}))+"</td></tr>").join("")+"</tbody></table>":'<div class="empty">لا توجد سجلات.</div>';
  }catch(e){$("#auditData").textContent="❌ "+e.message}
}

$("#dispatchWorkflow").onclick=async()=>{
  if(!canAdmin())return msg("workflowMsg","تشغيل Workflows متاح للـ admin و owner فقط.");
  const workflow=$("#workflowSelect").value;if(!workflow)return msg("workflowMsg","لا يوجد Workflow.");
  if(!confirm("تشغيل Workflow على "+branch+"؟"))return;
  setBusy("dispatchWorkflow",true,"تشغيل Workflow");
  try{await ghPost("dispatch",{workflow,ref:branch});msg("workflowMsg","تم إرسال Workflow.");setTimeout(loadGitHub,1200)}catch(e){msg("workflowMsg","❌ "+e.message)}finally{setBusy("dispatchWorkflow",false,"تشغيل Workflow")}
};

(async()=>{
  try{const oauth=await consumeOAuthCallback();if(oauth)msg("loginMsg","تم تسجيل الدخول عبر GitHub، جارٍ التحقق من الصلاحيات…")}catch(e){msg("loginMsg","❌ "+e.message)}
  await start();
})();
