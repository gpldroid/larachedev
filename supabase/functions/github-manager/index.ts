import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const OWNER = Deno.env.get("GITHUB_OWNER") || "gpldroid";
const REPO = Deno.env.get("GITHUB_REPO") || "larachedev";
const cors = {
  "Access-Control-Allow-Origin": "https://gpldroid.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"content-type":"application/json"}});
const gh=async(path:string,init:RequestInit={})=>{
  const h=new Headers(init.headers);
  h.set("Accept","application/vnd.github+json");
  h.set("X-GitHub-Api-Version","2022-11-28");
  if(GITHUB_TOKEN) h.set("Authorization","Bearer "+GITHUB_TOKEN);
  return fetch("https://api.github.com"+path,{...init,headers:h});
};
const clean=(p:string)=>{
  let value=String(p||"").trim();
  while(value.startsWith("/")) value=value.slice(1);
  if(!value||value.includes(String.fromCharCode(0))) return "";
  const parts=value.split("/");
  if(parts.some(part=>!part||part==="."||part==="..")) return "";
  return parts.join("/");
};
const apiPath=(p:string)=>p.split("/").map(encodeURIComponent).join("/");
const safeRepoSegment=(value:string)=>/^[A-Za-z0-9_.-]+$/.test(value)&&value!=="."&&value!=="..";
const b64=(s:string)=>btoa(unescape(encodeURIComponent(s)));

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const auth=req.headers.get("Authorization");
  if(!auth?.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
  const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await sb.auth.getUser();
  if(!user) return json({error:"Invalid session"},401);
  const {data:admin}=await sb.from("admin_users").select("role,enabled").eq("user_id",user.id).maybeSingle();
  if(!admin?.enabled) return json({error:"Admin access required"},403);

  const role=String(admin.role||"viewer");
  const canEdit=["owner","admin","editor"].includes(role);
  const canAdmin=["owner","admin"].includes(role);
  const u=new URL(req.url);
  const action=u.searchParams.get("action")||"repo";
  const ref=u.searchParams.get("ref")||"main";
  const path=clean(u.searchParams.get("path")||"");
  const requestedOwner=String(u.searchParams.get("owner")||OWNER).trim();
  const requestedRepo=String(u.searchParams.get("repo")||REPO).trim();
  if(!safeRepoSegment(requestedOwner)||!safeRepoSegment(requestedRepo))
    return json({error:"Invalid repository owner/name"},400);
  const {data:connection,error:connectionError}=await sb.from("repository_connections")
    .select("owner,repository,connection_status").eq("provider","github")
    .eq("owner",requestedOwner).eq("repository",requestedRepo).maybeSingle();
  if(connectionError) return json({error:"Unable to verify repository registration"},500);
  if(!connection||connection.connection_status==="disabled")
    return json({error:"Repository is not registered or is disabled. An owner/admin must register it first.",owner:requestedOwner,repo:requestedRepo},403);
  const targetOwner=connection.owner;
  const targetRepo=connection.repository;

  try{
    const body=["POST","PUT","DELETE"].includes(req.method)?await req.json():{};

    if(action==="repo"){const r=await gh(`/repos/${targetOwner}/${targetRepo}`);return json(await r.json(),r.status)}
    if(action==="tree"){const r=await gh(`/repos/${targetOwner}/${targetRepo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);return json(await r.json(),r.status)}
    if(action==="file"){if(!path)return json({error:"path required"},400);const r=await gh(`/repos/${targetOwner}/${targetRepo}/contents/${apiPath(path)}?ref=${encodeURIComponent(ref)}`);return json(await r.json(),r.status)}
    if(action==="branches"){const r=await gh(`/repos/${targetOwner}/${targetRepo}/branches?per_page=100`);return json(await r.json(),r.status)}
    if(action==="branch-create"){
      if(!canAdmin)return json({error:"Administrator role required for this operation",role},403);
      const name=String(body?.name||"").trim(), from=String(body?.from||ref||"main").trim();
      if(!/^[A-Za-z0-9._\\/-]+$/.test(name)||name.includes("..")||name.startsWith("/")||name.endsWith("/"))return json({error:"Invalid branch name"},400);
      if(!name||name==="main")return json({error:"A different branch name is required"},400);
      const base=await gh(`/repos/${targetOwner}/${targetRepo}/git/ref/heads/${encodeURIComponent(from)}`),bj=await base.json();
      if(!base.ok)return json(bj,base.status);
      const r=await gh(`/repos/${targetOwner}/${targetRepo}/git/refs`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ref:`refs/heads/${name}`,sha:bj.object?.sha})});
      const out=await r.json(); if(r.ok)await sb.from("audit_logs").insert({actor_id:user.id,action:"github.branch.create",resource:name,details:{from,role}}); return json(out,r.status);
    }
    if(action==="branch-delete"){
      if(!canAdmin)return json({error:"Administrator role required for this operation",role},403);
      const name=String(body?.name||"").trim(); if(!name||name==="main")return json({error:"The main branch cannot be deleted"},400);
      const r=await gh(`/repos/${targetOwner}/${targetRepo}/git/refs/heads/${encodeURIComponent(name)}`,{method:"DELETE"});
      const out=r.status===204?{ok:true}:await r.json(); if(r.ok)await sb.from("audit_logs").insert({actor_id:user.id,action:"github.branch.delete",resource:name,details:{role}}); return json(out,r.status);
    }
    if(action==="rerun"){
      if(!canAdmin)return json({error:"Administrator role required for this operation",role},403);
      const runId=Number(body?.run_id); if(!Number.isInteger(runId)||runId<1)return json({error:"run_id required"},400);
      const r=await gh(`/repos/${targetOwner}/${targetRepo}/actions/runs/${runId}/rerun-failed-jobs`,{method:"POST"});
      const out=r.status===201||r.status===204?{ok:true}:await r.json(); if(r.ok)await sb.from("audit_logs").insert({actor_id:user.id,action:"github.actions.rerun",resource:String(runId),details:{role}}); return json(out,r.status);
    }
    if(action==="commits"){const r=await gh(`/repos/${targetOwner}/${targetRepo}/commits?per_page=30`);return json(await r.json(),r.status)}
    if(action==="runs"){const r=await gh(`/repos/${targetOwner}/${targetRepo}/actions/runs?per_page=30`);return json(await r.json(),r.status)}
    if(action==="workflows"){const r=await gh(`/repos/${targetOwner}/${targetRepo}/actions/workflows?per_page=100`);return json(await r.json(),r.status)}
    if(action==="releases"){const r=await gh(`/repos/${targetOwner}/${targetRepo}/releases?per_page=30`);return json(await r.json(),r.status)}
    if(action==="health"){
      if(!canAdmin)return json({error:"Administrator role required for this operation",role},403);
      if(!GITHUB_TOKEN)return json({ok:false,github_token:"missing",owner:targetOwner,repo:targetRepo},503);
      const r=await gh(`/repos/${targetOwner}/${targetRepo}`);
      const data=await r.json();
      if(!r.ok)return json({ok:false,github_token:r.status===401?"invalid":"rejected",github_status:r.status,owner:targetOwner,repo:targetRepo},r.status===401?401:502);
      const ur=await gh("/user");
      const ud=await ur.json();
      return json({ok:true,github_token:"valid",github_status:r.status,owner:targetOwner,repo:targetRepo,permissions:data?.permissions||null,authenticated_user:ur.ok?ud?.login:null});
    }

    if(!GITHUB_TOKEN)return json({error:"GitHub write token is not configured in Supabase Edge Function secrets."},503);
    if(!canEdit&&["write-file","delete-file","dispatch","branch-create","branch-delete","rerun"].includes(action))return json({error:"Insufficient role for this operation",role},403);
    if(!canAdmin&&["delete-file","dispatch","branch-create","branch-delete","rerun"].includes(action))return json({error:"Administrator role required for this operation",role},403);

    if(action==="dispatch"){
      if(!body.workflow)return json({error:"workflow required"},400);
      const r=await gh(`/repos/${targetOwner}/${targetRepo}/actions/workflows/${encodeURIComponent(String(body.workflow))}/dispatches`,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({ref:body.ref||"main",inputs:body.inputs||{}})
      });
      await sb.from("audit_logs").insert({actor_id:user.id,action:"github.actions.dispatch",resource:String(body.workflow),details:{ref:body.ref||"main",inputs:body.inputs||{}}});
      return r.status===204?json({ok:true}):json(await r.json(),r.status);
    }

    if(action==="write-file"){
      if(!body.path||typeof body.content!=="string")return json({error:"path and content required"},400);
      const p=clean(body.path),b=body.branch||"main";
      if(!p)return json({error:"Invalid repository path"},400);
      const cur=await gh(`/repos/${targetOwner}/${targetRepo}/contents/${apiPath(p)}?ref=${encodeURIComponent(b)}`);
      const cj=await cur.json();
      const payload:any={message:body.message||`admin: update ${p}`,content:b64(body.content),branch:b};
      if(cur.ok&&cj.sha)payload.sha=cj.sha;
      const r=await gh(`/repos/${targetOwner}/${targetRepo}/contents/${apiPath(p)}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const out=await r.json();
      if(r.ok)await sb.from("audit_logs").insert({actor_id:user.id,action:"github.file.write",resource:p,details:{branch:b,role}});
      return json(out,r.status);
    }

    if(action==="delete-file"){
      if(!body.path||!body.sha)return json({error:"path and sha required"},400);
      const p=clean(body.path),b=body.branch||"main";
      if(!p)return json({error:"Invalid repository path"},400);
      const r=await gh(`/repos/${targetOwner}/${targetRepo}/contents/${apiPath(p)}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({message:body.message||`admin: delete ${p}`,sha:body.sha,branch:b})});
      const out=await r.json();
      if(r.ok)await sb.from("audit_logs").insert({actor_id:user.id,action:"github.file.delete",resource:p,details:{branch:b,role}});
      return json(out,r.status);
    }

    return json({error:"Unknown action"},400);
  }catch(e){return json({error:String(e)},500)}
});