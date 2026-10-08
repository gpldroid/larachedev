import{createClient}from"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL="https://tdvohzsmxlwupiuompdd.supabase.co";
const SUPABASE_KEY=atob("c2JfcHVibGlzaGFibGVfdGJIQThXQW5PSWF1Y2RCbVlIWVNTZ18tb0NBbzVzYQ==");
const REDIRECT_URL="https://gpldroid.github.io/larachedev/admin/";

const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{
    flowType:"pkce",
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true
  }
});

const form=document.querySelector("#login-form");
const emailButton=document.querySelector("#email-button");
const githubButton=document.querySelector("#github-button");
const statusBox=document.querySelector("#status");

function show(message,type="info"){
  if(!statusBox)return;
  statusBox.textContent=message||"";
  statusBox.className="status "+type;
  statusBox.hidden=!message;
}
function setBusy(value){
  if(emailButton)emailButton.disabled=value;
  if(githubButton)githubButton.disabled=value;
}
function cleanAuthUrl(){
  const clean=window.location.pathname+window.location.search;
  window.history.replaceState({},document.title,clean);
}
async function verifyAdmin(session){
  if(!session?.user)return false;
  show("جاري التحقق من صلاحيات الإدارة…");
  const{data,isAdminError}=await (async()=>{
    const r=await supabase.rpc("is_admin");
    return{data:r.data,isAdminError:r.error};
  })();
  if(isAdminError){
    console.error("is_admin RPC:",isAdminError);
    await supabase.auth.signOut();
    show("تعذر التحقق من صلاحية الإدارة. تحقق من دالة is_admin في Supabase.","error");
    return false;
  }
  if(data!==true){
    await supabase.auth.signOut();
    show("تم تسجيل الدخول، لكن هذا الحساب لا يملك صلاحية الإدارة.","error");
    return false;
  }
  cleanAuthUrl();
  window.location.replace("./dashboard.html");
  return true;
}

async function handleInitialSession(){
  const hash=window.location.hash;
  if(hash.includes("error=")||hash.includes("error_description=")){
    const p=new URLSearchParams(hash.replace(/^#/,""));
    cleanAuthUrl();
    show(p.get("error_description")||p.get("error")||"فشل تسجيل الدخول عبر GitHub.","error");
    return;
  }
  const{data,error}=await supabase.auth.getSession();
  if(error){
    console.error("getSession:",error);
    show("تعذر استعادة جلسة تسجيل الدخول. أعد تحميل الصفحة.","error");
    return;
  }
  if(data.session)await verifyAdmin(data.session);
}

supabase.auth.onAuthStateChange(async(event,session)=>{
  console.log("[auth]",event);
  if(event==="SIGNED_IN"&&session){
    setBusy(true);
    await verifyAdmin(session);
    setBusy(false);
  }
});

form?.addEventListener("submit",async event=>{
  event.preventDefault();
  const email=new FormData(form).get("email")?.toString().trim();
  const password=new FormData(form).get("password")?.toString()||"";
  if(!email||!password){show("أدخل البريد الإلكتروني وكلمة المرور.","error");return;}
  setBusy(true);
  show("جاري تسجيل الدخول بالبريد الإلكتروني…");
  const{data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error){
    console.error("email login:",error);
    show(error.message==="Email not confirmed"?"يجب تأكيد البريد الإلكتروني أولًا.":"بيانات الدخول غير صحيحة أو تعذر تسجيل الدخول.","error");
    setBusy(false);
    return;
  }
  await verifyAdmin(data.session);
  setBusy(false);
});

githubButton?.addEventListener("click",async event=>{
  event.preventDefault();
  setBusy(true);
  show("جاري الاتصال بـ GitHub…");
  try{
    const{data,error}=await supabase.auth.signInWithOAuth({
      provider:"github",
      options:{
        redirectTo:REDIRECT_URL,
        scopes:"read:user user:email"
      }
    });
    if(error){
      console.error("GitHub OAuth:",error);
      show("تعذر بدء تسجيل الدخول عبر GitHub: "+error.message,"error");
      setBusy(false);
      return;
    }
    if(!data?.url){
      show("لم يُرجع Supabase رابط GitHub. تحقق من تفعيل GitHub Provider.","error");
      setBusy(false);
      return;
    }
    window.location.assign(data.url);
  }catch(error){
    console.error("GitHub OAuth exception:",error);
    show("حدث خطأ أثناء الاتصال بـ GitHub.","error");
    setBusy(false);
  }
});

handleInitialSession();