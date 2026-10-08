import{createClient}from"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL="https://tdvohzsmxlwupiuompdd.supabase.co";
const SUPABASE_KEY=atob("c2JfcHVibGlzaGFibGVfdGJIQThXQW5PSWF1Y2RCbVlIWVNTZ18tb0NBbzVzYQ==".replace(" ",""));
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
let verificationInProgress=false;

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
  window.history.replaceState({},document.title,window.location.pathname);
}

async function verifyAdmin(session){
  if(!session?.user)return false;
  if(verificationInProgress)return false;
  verificationInProgress=true;
  try{
    show("جاري التحقق من الحساب وصلاحيات الإدارة…");

    const{data:user,error:userError}=await supabase.auth.getUser();
    if(userError||!user){
      console.error("getUser:",userError);
      show("تعذر تأكيد هوية الحساب بعد تسجيل الدخول.","error");
      return false;
    }

    const{data:isAdmin,error:isAdminError}=await supabase.rpc("is_admin");
    if(isAdminError){
      console.error("is_admin RPC:",isAdminError);
      await supabase.auth.signOut({scope:"local"});
      show("تعذر التحقق من صلاحية الإدارة. حدث خطأ في خدمة الصلاحيات.","error");
      return false;
    }

    if(isAdmin!==true){
      let identityText="";
      try{
        const{data,error}=await supabase.auth.getUserIdentities();
        if(!error){
          const github=(data?.identities||[]).find(x=>x.provider==="github");
          const username=github?.identity_data?.user_name||github?.identity_data?.preferred_username;
          if(username)identityText=" حساب GitHub المكتشف: "+username+".";
        }
      }catch(error){
        console.warn("identity diagnostics:",error);
      }
      console.warn("Authenticated user is not an admin:",{
        id:user.id,
        email:user.email,
        identities:user.identities
      });
      await supabase.auth.signOut({scope:"local"});
      show("تم تسجيل الدخول، لكن هذا الحساب لا يملك صلاحية الإدارة."+identityText+" استخدم حساب GitHub المصرح به.","error");
      return false;
    }

    cleanAuthUrl();
    window.location.replace("./dashboard.html");
    return true;
  }finally{
    verificationInProgress=false;
  }
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
    await supabase.auth.signOut({scope:"local"});
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