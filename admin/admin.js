const C=window.LARACHEDEV_CONFIG||{};
let session=JSON.parse(localStorage.getItem("larachedev_session")||"null");
let selected=null,branch=C.branch||"main",role=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const canEdit=()=>["owner","admin","editor"].includes(role);
const canAdmin=()=>["owner","admin"].includes(role);

async function api(path,options={}){
  if(!session?.access_token) throw Error("انتهت جلسة الدخول.");
  const r=await fetch(C.supabaseUrl+"/rest/v1/"+path,{
    ...options,
    headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",...(options.headers||{})}
  });
  const text=await r.text();
  let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok) throw Error(data?.message||data?.error||data?.hint||text||("HTTP "+r.status));
  return data;
}

async function gh(action,query={}){
  if(!session?.access_token) throw Error("انتهت جلسة الدخول.");
  const url=C.githubManager+"?action="+encodeURIComponent(action)+"&"+new URLSearchParams(query);
  const r=await fetch(url,{headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+session.access_token}});
  const text=await r.text(); let j=null; try{j=text?JSON.parse(text):null}catch{j={raw:text}};
  if(!r.ok) throw Error(j?.error||j?.message||text||("GitHub HTTP "+r.status));
  return j;
}

async function ghPost(action,body){
  if(!session?.access_token) throw Error("انتهت جلسة الدخول.");
  const r=await fetch(C.githubManager+"?action="+encodeURIComponent(action),{
    method:"POST",
    headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const text=await r.text(); let j=null; try{j=text?JSON.parse(text):null}catch{j={raw:text}};
  if(!r.ok) throw Error(j?.error||j?.message||text||("GitHub HTTP "+r.status));
  return j;
}

function msg(id,text){const e=$("#"+id);if(e)e.textContent=text||""}
function setBusy(id,busy,label){const e=$("#"+id);if(!e)return;e.disabled=busy;if(label)e.textContent=busy?"جارٍ التنفيذ…":label}
function applyRoleUI(){
  msg("overviewMsg","الدور الحالي: "+role+" · "+(role==="viewer"?"قراءة فقط":role==="editor"?"قراءة + تعديل الملفات":role==="admin"?"إدارة كاملة":"صلاحيات المالك الكاملة"));
  const write=$("#saveFile"), del=$("#deleteFile"), dispatch=$("#dispatchWorkflow"), nf=$("#newFile");
  if(write)write.disabled=!canEdit();
  if(nf)nf.disabled=!canEdit();
  if(del)del.disabled=!canAdmin();
  if(dispatch)dispatch.disabled=!canAdmin();
  if(role==="viewer"){
    msg("fileMsg","وضع القراءة فقط: لا يمكنك إنشاء أو تعديل أو حذف الملفات.");
  }
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
      if(x.dataset.tab==="audit")await loadAudit();
    }catch(e){msg("overviewMsg",e.message)}
  });
}

async function start(){
  if(!session?.access_token)return showLogin();
  try{
    const a=await api("admin_users?select=role,enabled&user_id=eq."+encodeURIComponent(session.user.id));
    if(!a[0]?.enabled)throw Error("المستخدم غير مفعّل في admin_users.");
    role=a[0].role;
    $("#loginView").hidden=true;$("#dashboardView").hidden=false;$("#logoutBtn").hidden=false;
    $("#githubStatus").textContent="متصل";
    $("#supabaseStatus").textContent="متصل";
    initTabs();applyRoleUI();
    await loadGitHub();
  }catch(e){
    localStorage.removeItem("larachedev_session");session=null;role=null;showLogin();msg("loginMsg",e.message);
  }
}

function showLogin(){
  $("#loginView").hidden=false;$("#dashboardView").hidden=true;$("#logoutBtn").hidden=true;
}

function githubLogin(){
  const redirectTo=window.location.origin+window.location.pathname;
  const url=C.supabaseUrl+"/auth/v1/authorize?provider=github&redirect_to="+encodeURIComponent(redirectTo);
  window.location.assign(url);
}

async function consumeGithubCallback(){
  const hash=window.location.hash.replace(/^#/,"");
  if(!hash)return false;
  const p=new URLSearchParams(hash);
  const access_token=p.get("access_token");
  const refresh_token=p.get("refresh_token");
  const error=p.get("error_description")||p.get("error");
  if(error)throw Error(decodeURIComponent(error));
  if(!access_token)return false;
  const r=await fetch(C.supabaseUrl+"/auth/v1/user",{
    headers:{apikey:C.supabasePublishableKey,Authorization:"Bearer "+access_token}
  });
  const u=await r.json();
  if(!r.ok)throw Error(u?.message||u?.error_description||"تعذر الحصول على حساب GitHub عبر Supabase.");
  session={access_token,refresh_token,user:u};
  localStorage.setItem("larachedev_session",JSON.stringify(session));
  history.replaceState(null,"",window.location.pathname+window.location.search);
  return true;
}

$("#loginForm").onsubmit=async e=>{
  e.preventDefault();msg("loginMsg","جارٍ تسجيل الدخول…");
  try{
    const r=await fetch(C.supabaseUrl+"/auth/v1/token?grant_type=password",{
      method:"POST",headers:{apikey:C.supabasePublishableKey,"Content-Type":"application/json"},
      body:JSON.stringify({email:$("#email").value.trim(),password:$("#password").value})
    });
    const j=await r.json();
    if(!r.ok)throw Error(j.error_description||j.msg||j.error||"فشل تسجيل الدخول.");
    session=j;localStorage.setItem("larachedev_session",JSON.stringify(j));await (async()=>{
  try{
    const fromGithub=await consumeGithubCallback();
    if(fromGithub)msg("loginMsg","تم تسجيل الدخول عبر GitHub، جارٍ التحقق من صلاحية الإدارة…");
  }catch(e){msg("loginMsg","❌ "+e.message)}
  await start();
})();
  }catch(e){msg("loginMsg",e.message)}
};

$("#logoutBtn").onclick=()=>{localStorage.removeItem("larachedev_session");location.reload()};
$("#githubLoginBtn").onclick=githubLogin;
$("#refreshFrame").onclick=()=>{const f=$("#siteFrame");f.src=f.src};
$("#testGithubToken").onclick=testGithubHealth;

async function loadFiles(){
  try{
    const b=await gh("branches");
    $("#branchSelect").innerHTML=(b||[]).map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join("");
    $("#branchSelect").value=branch;
    const t=await gh("tree",{ref:branch});
    const files=(t.tree||[]).filter(x=>x.type==="blob").sort((a,b)=>a.path.localeCompare(b.path));
    $("#tree").innerHTML=files.length?files.map(x=>'<div class="file-item" data-path="'+esc(x.path)+'">'+esc(x.path)+'</div>').join(""):'<div class="empty-state">لا توجد ملفات.</div>';
    $$(".file-item").forEach(x=>x.onclick=()=>openFile(x.dataset.path));
  }catch(e){$("#tree").textContent=e.message}
}

async function openFile(p){
  try{
    const f=await gh("file",{path:p,ref:branch});
    selected={path:p,sha:f.sha};
    $("#fileTitle").textContent=p;
    const raw=atob((f.content||"").replace(/\n/g,""));
    $("#editor").value=new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
    msg("fileMsg","تم تحميل الملف.");
  }catch(e){msg("fileMsg",e.message)}
}

async function loadGitHub(){
  try{
    const [b,c,r,rel,wf]=await Promise.all([gh("branches"),gh("commits"),gh("runs"),gh("releases"),gh("workflows")]);
    $("#branchesCount").textContent=(b||[]).length;
    $("#commitsCount").textContent=(c||[]).length;
    $("#runsCount").textContent=r?.total_count??(r?.workflow_runs||[]).length;
    $("#releasesCount").textContent=(rel||[]).length;
    $("#commits").innerHTML=(c||[]).length?(c||[]).map(x=>'<p><b>'+esc((x.sha||"").slice(0,7))+'</b> '+esc((x.commit?.message||"").split("\n")[0])+'</p>').join(""):'<div class="empty-state">لا توجد Commits.</div>';
    renderRuns(r?.workflow_runs||r||[]);
    renderReleases(rel||[]);
    const workflows=Array.isArray(wf)?wf:(wf?.workflows||[]);
    $("#workflowSelect").innerHTML=workflows.length?workflows.map(x=>'<option value="'+esc(x.id||x.path)+'">'+esc(x.name||x.path)+'</option>').join(""):'<option value="">لا توجد Workflows</option>';
    applyRoleUI();
  }catch(e){$("#commits").textContent=e.message;msg("workflowMsg",e.message)}
}

function renderRuns(runs){
  $("#runs").innerHTML=runs.length?runs.slice(0,20).map(x=>{
    const state=(x.status==="completed"?x.conclusion:x.status)||"unknown";
    return '<p><b>'+esc(x.name||x.workflow_name||"Workflow")+'</b> — '+esc(state)+' — '+esc(x.created_at||"")+'</p>';
  }).join(""):'<div class="empty-state">لا توجد Actions Runs.</div>';
}
function renderReleases(releases){
  $("#releases").innerHTML=releases.length?releases.slice(0,20).map(x=>'<p><b>'+esc(x.tag_name||x.name||"Release")+'</b> — '+esc(x.published_at||x.created_at||"")+(x.html_url?' — <a target="_blank" href="'+esc(x.html_url)+'">فتح</a>':"")+'</p>').join(""):'<div class="empty-state">لا توجد Releases.</div>';
}

async function testGithubHealth(){
  if(!canAdmin()){msg("githubHealth","اختبار GitHub متاح للـ admin و owner فقط.");return}
  setBusy("testGithubToken",true,"اختبار اتصال GitHub");
  msg("githubHealth","جارٍ التحقق من GITHUB_TOKEN وصلاحيات GitHub…");
  try{
    const h=await gh("health");
    const p=h.permissions||{};
    msg("githubHealth","✅ GITHUB_TOKEN صالح · GitHub API: "+h.github_status+" · المستخدم: "+(h.authenticated_user||"—")+" · push: "+(p.push?"نعم":"لا")+" · admin: "+(p.admin?"نعم":"لا"));
  }catch(e){msg("githubHealth","❌ فشل الاختبار: "+e.message)}
  finally{setBusy("testGithubToken",false,"اختبار اتصال GitHub")}
}

async function loadSupabase(){
  try{
    const s=await api("site_settings?select=key,value,updated_at&order=key");
    $("#settingsData").innerHTML=(s||[]).length?s.map(x=>'<p><b>'+esc(x.key)+'</b>: '+esc(JSON.stringify(x.value))+' <small>'+esc(x.updated_at||"")+'</small></p>').join(""):'<div class="empty-state">لا توجد إعدادات.</div>';
  }catch(e){$("#settingsData").textContent=e.message}
}

async function loadAudit(){
  try{
    const a=await api("audit_logs?select=action,resource,details,created_at,actor_id&order=created_at.desc&limit=100");
    $("#auditData").innerHTML=(a||[]).length?a.map(x=>'<p><b>'+esc(x.action)+'</b> — '+esc(x.resource||"")+' — '+esc(x.created_at||"")+'</p>').join(""):'<div class="empty-state">لا توجد سجلات.</div>';
  }catch(e){$("#auditData").textContent=e.message}
}

$("#reloadTree").onclick=loadFiles;
$("#branchSelect").onchange=e=>{branch=e.target.value;selected=null;$("#fileTitle").textContent="اختر ملفًا";$("#editor").value="";loadFiles()};

$("#saveFile").onclick=async()=>{
  if(!canEdit()){msg("fileMsg","ليس لديك صلاحية التعديل.");return}
  if(!selected){msg("fileMsg","اختر ملفًا أو أنشئ ملفًا جديدًا.");return}
  const message=$("#commitMessage").value.trim()||"admin: update "+selected.path;
  setBusy("saveFile",true,"حفظ Commit");
  try{
    const j=await ghPost("write-file",{path:selected.path,content:$("#editor").value,branch,message});
    msg("fileMsg","تم الحفظ وإنشاء Commit: "+(j.commit?.sha||j.sha||"OK"));
    selected.sha=j.content?.sha||selected.sha;
    await loadFiles();await loadGitHub();
  }catch(e){msg("fileMsg",e.message)}
  finally{setBusy("saveFile",false,"حفظ Commit")}
};

$("#newFile").onclick=()=>{
  if(!canEdit()){msg("fileMsg","ليس لديك صلاحية إنشاء الملفات.");return}
  const p=prompt("مسار الملف الجديد:");
  if(!p)return;
  selected={path:p};$("#fileTitle").textContent=p;$("#editor").value="";$("#commitMessage").value="admin: create "+p;msg("fileMsg","ملف جديد جاهز. اضغط حفظ Commit.");
};

$("#deleteFile").onclick=async()=>{
  if(!canAdmin()){msg("fileMsg","حذف الملفات متاح للـ admin و owner فقط.");return}
  if(!selected?.sha){msg("fileMsg","اختر ملفًا موجودًا أولًا.");return}
  if(!confirm("تأكيد حذف الملف؟\n"+selected.path))return;
  setBusy("deleteFile",true,"حذف");
  try{
    const j=await ghPost("delete-file",{path:selected.path,sha:selected.sha,branch,message:"admin: delete "+selected.path});
    msg("fileMsg","تم حذف الملف وإنشاء Commit: "+(j.commit?.sha||j.sha||"OK"));
    selected=null;$("#fileTitle").textContent="اختر ملفًا";$("#editor").value="";await loadFiles();await loadGitHub();
  }catch(e){msg("fileMsg",e.message)}
  finally{setBusy("deleteFile",false,"حذف")}
};

$("#dispatchWorkflow").onclick=async()=>{
  if(!canAdmin()){msg("workflowMsg","تشغيل Workflows متاح للـ admin و owner فقط.");return}
  const workflow=$("#workflowSelect").value;
  if(!workflow){msg("workflowMsg","لا يوجد Workflow قابل للتشغيل.");return}
  if(!confirm("تشغيل Workflow على الفرع "+branch+"؟"))return;
  setBusy("dispatchWorkflow",true,"تشغيل Workflow");
  try{
    const j=await ghPost("dispatch",{workflow,ref:branch});
    msg("workflowMsg","تم إرسال طلب تشغيل Workflow.");
    setTimeout(loadGitHub,1500);
  }catch(e){msg("workflowMsg",e.message)}
  finally{setBusy("dispatchWorkflow",false,"تشغيل Workflow")}
};

window.addEventListener("beforeunload",()=>{});
start();