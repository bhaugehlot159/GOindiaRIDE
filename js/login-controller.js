const CUSTOMER_STORAGE_KEYS=[...new Set(['users','goride_users','customers','goindiaride_users','goindiaride_customers'])];
const DRIVER_STORAGE_KEYS=[...new Set(['drivers','goride_drivers','goindiaride_drivers'])];
const CUSTOMER_READ_STORAGE_KEYS=[...CUSTOMER_STORAGE_KEYS];
const DRIVER_READ_STORAGE_KEYS=[...DRIVER_STORAGE_KEYS];
const ACCOUNT_BACKUP_KEY='goindiaride_accounts_backup_v2';
const ADMIN_PROFILE_KEY='goindiaride_admin_profile';
const ADMIN_SESSION_KEY='goindiaride_admin_session';
const ADMIN_FAILURE_KEY='goindiaride_admin_failures';
const SECURITY_EVENT_KEY='goindiaride_security_events';
const ADMIN_OTP_KEY='admin2FAOTP';
const ADMIN_OTP_EMAIL_KEY='admin2FAEmail';
const ADMIN_OTP_METHOD_KEY='admin2FAMethod';
const LOGIN_RISK_THRESHOLD=35;
const LIVE_BACKEND_REQUIRED_FOR_LOGIN=true;
const ADMIN_MAX_ATTEMPTS=5;
const ADMIN_LOCK_MS=15*60*1000;
const ADMIN_CHALLENGE_TTL_MS=10*60*1000;

let firebaseReady=false;
let firebaseRecaptchaVerifier=null;
let customerConfirmation=null;
let driverConfirmation=null;

function safeReadArray(key){
  try{const raw=localStorage.getItem(key);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(e){return[];}
}
function safeReadObject(key,fallback={}){
  try{const raw=localStorage.getItem(key);const parsed=raw?JSON.parse(raw):fallback;return parsed&&typeof parsed==='object'?parsed:fallback;}catch(e){return fallback;}
}
function fnv1aHash(input){
  let hash=0x811c9dc5;
  const text=String(input||'');
  for(let i=0;i<text.length;i+=1){
    hash^=text.charCodeAt(i);
    hash=(hash>>>0)*0x01000193;
  }
  return (hash>>>0).toString(16);
}
function createStableAccountId(role,email,phone){
  const safeRole=String(role||'customer').toLowerCase()==='driver'?'driver':'user';
  const identity=`${sanitizeEmail(email||'')}|${normalizePhoneForLookup(phone||'')}`;
  return `${safeRole}_${fnv1aHash(identity||('fallback_'+Date.now()))}`;
}
function createPseudoRecaptchaToken(prefix='gir'){
  const partA=Math.random().toString(36).slice(2,16);
  const partB=Math.random().toString(36).slice(2,16);
  return `${prefix}_${Date.now()}_${partA}_${partB}`;
}
function isCustomerRecord(record){
  if(!record||typeof record!=='object')return false;
  const role=String(record.role||record.userType||'customer').toLowerCase();
  return ['customer','user','passenger','rider','client'].includes(role);
}
function isDriverRecord(record){
  if(!record||typeof record!=='object')return false;
  const role=String(record.role||record.userType||'driver').toLowerCase();
  return ['driver','captain','chauffeur'].includes(role);
}
function mergeRecords(keys){
  const map=new Map();
  keys.forEach((key)=>{
    safeReadArray(key).forEach((r)=>{
      if(!r||typeof r!=='object')return;
      const id=r.id||[sanitizeEmail(r.email||''),normalizePhoneForLookup(r.phone||r.mobile||''),String(r.role||'user').toLowerCase()].join('|');
      map.set(id,map.has(id)?{...map.get(id),...r}:{...r});
    });
  });
  return Array.from(map.values());
}
function persistAccountBackup(){
  const customers=mergeRecords(CUSTOMER_READ_STORAGE_KEYS).filter((row)=>isCustomerRecord(row));
  const drivers=mergeRecords(DRIVER_READ_STORAGE_KEYS).filter((row)=>isDriverRecord(row));
  const payload={version:2,updatedAt:new Date().toISOString(),customers,drivers};
  localStorage.setItem(ACCOUNT_BACKUP_KEY,JSON.stringify(payload));
}
function restoreAccountBackupIfNeeded(){
  const payload=safeReadObject(ACCOUNT_BACKUP_KEY,null);
  if(!payload||typeof payload!=='object')return;

  const safeCustomers=Array.isArray(payload.customers)?payload.customers.filter((row)=>isCustomerRecord(row)):[];
  const safeDrivers=Array.isArray(payload.drivers)?payload.drivers.filter((row)=>isDriverRecord(row)):[];

  if(!mergeRecords(CUSTOMER_READ_STORAGE_KEYS).length&&safeCustomers.length){
    CUSTOMER_STORAGE_KEYS.forEach((key)=>localStorage.setItem(key,JSON.stringify(safeCustomers)));
  }
  if(!mergeRecords(DRIVER_READ_STORAGE_KEYS).length&&safeDrivers.length){
    DRIVER_STORAGE_KEYS.forEach((key)=>localStorage.setItem(key,JSON.stringify(safeDrivers)));
  }
}
function writeRecords(keys,records){
  const arr=Array.isArray(records)?records:[];
  keys.forEach((k)=>localStorage.setItem(k,JSON.stringify(arr)));
  persistAccountBackup();
}
function normalizePhoneForLookup(value){
  const raw=sanitizeInput(value||''); if(!raw)return'';
  let n=raw.replace(/\s+/g,''); if(n.startsWith('00'))n='+'+n.slice(2);
  if(n.startsWith('+')){const d=n.slice(1).replace(/\D/g,''); return d.length>=8&&d.length<=15?('+'+d):'';}
  const digits=n.replace(/\D/g,'');
  if(digits.length===10&&/^[6-9]/.test(digits))return '+91'+digits;
  if(digits.length>=8&&digits.length<=15)return '+'+digits;
  return'';
}
function normalizePhoneForOtp(v){const p=normalizePhoneForLookup(v);return p.startsWith('+')?p:'';}
function isPhoneMatch(a,b){const x=normalizePhoneForLookup(a);const y=normalizePhoneForLookup(b);return Boolean(x&&y&&x===y);}
function normalizeIdentifier(v){
  const raw=sanitizeInput(v||''); if(!raw)return{kind:'unknown',value:''};
  const email=sanitizeEmail(raw); if(email)return{kind:'email',value:email};
  const phone=normalizePhoneForLookup(raw); if(phone)return{kind:'phone',value:phone};
  return{kind:'unknown',value:''};
}
function saveBackendAccessToken(token){
  const normalized=String(token||'').trim();
  if(!normalized)return;
  localStorage.setItem('accessToken',normalized);
  localStorage.setItem('authToken',normalized);
  localStorage.setItem('token',normalized);
}
function clearBackendAccessToken(){
  localStorage.removeItem('accessToken');
  localStorage.removeItem('authToken');
  localStorage.removeItem('token');
}
function getBackendApiBase(){
  const host=String(window.location.hostname||'').toLowerCase();
  const isLocalHost=host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]';
  const localBackendBase='http://localhost:5000';
  const fromRuntimeOrigin=sanitizeInput(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__||window.__GOINDIARIDE_API_ORIGIN__||'');
  const fromWindow=sanitizeInput(window.GOINDIARIDE_API_BASE||'');
  const fromStorage=sanitizeInput(localStorage.getItem('goindiaride_api_base')||'');

  const normalizeCandidate=(value)=>{
    const text=String(value||'').trim();
    if(!text)return'';
    return text.replace(/\/$/, '');
  };

  const resolveCandidate=(candidate)=>{
    const normalized=normalizeCandidate(candidate);
    if(!normalized)return'';
    if(!isLocalHost)return normalized;
    try{
      const parsed=new URL(normalized);
      const apiHost=String(parsed.hostname||'').toLowerCase();
      const apiPort=String(parsed.port||(parsed.protocol==='https:'?'443':'80'));
      const isLocalApi=apiHost==='localhost'||apiHost==='127.0.0.1'||apiHost==='::1'||apiHost==='[::1]';
      if(isLocalApi&&apiPort!=='5000')return'';
      return normalized;
    }catch(_error){
      return'';
    }
  };

  const runtimePreferred=resolveCandidate(fromRuntimeOrigin)||resolveCandidate(fromWindow);
  if(runtimePreferred)return runtimePreferred;

  if(isLocalHost){
    const storedPreferred=resolveCandidate(fromStorage);
    return storedPreferred||localBackendBase;
  }

  return String(window.location.origin||'').replace(/\/$/, '');
}
async function callBackendAuth(path,payload){
  const normalizedPath=String(path||'');
  const body=JSON.stringify(payload||{});
  const primaryBase=getBackendApiBase();
  const sameOriginBase=String(window.location.origin||'').replace(/\/$/, '');
  const host=String(window.location.hostname||'').toLowerCase();
  const isPrimaryWebsiteHost=host==='goindiaride.in'||host==='www.goindiaride.in';
  const candidateBases=[];
  if(isPrimaryWebsiteHost){
    if(sameOriginBase)candidateBases.push(sameOriginBase);
  }else{
    if(primaryBase)candidateBases.push(primaryBase);
    if(sameOriginBase&&!candidateBases.includes(sameOriginBase))candidateBases.push(sameOriginBase);
  }

  let lastNetworkError=null;
  let lastHttpFailure=null;
  for(let index=0;index<candidateBases.length;index+=1){
    const base=candidateBases[index];
    const url=base+normalizedPath;
    try{
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'include',body});
      const rawText=await res.text().catch(()=>'');
      let data={};
      if(rawText){
        try{data=JSON.parse(rawText);}catch(_error){data={raw:rawText.slice(0,220)};}
      }

      if(!res.ok){
        const resolvedMessage=sanitizeInput(
          data?.message||
          data?.error||
          data?.detail||
          data?.raw||
          res.statusText||
          `HTTP ${res.status}`
        )||`HTTP ${res.status}`;
        lastHttpFailure={ok:false,status:res.status,data:{...data,message:resolvedMessage}};

        const hasNextCandidate=index<candidateBases.length-1;
        const shouldTryNextBase=[404,405,500,502,503,504].includes(Number(res.status||0));
        if(hasNextCandidate&&shouldTryNextBase){
          continue;
        }
        return lastHttpFailure;
      }

      return{ok:true,status:res.status,data};
    }catch(error){
      lastNetworkError=error;
    }
  }

  if(lastHttpFailure)return lastHttpFailure;

  return{
    ok:false,
    status:0,
    data:{message:lastNetworkError&&lastNetworkError.message?lastNetworkError.message:'Network error'}
  };
}
async function syncBackendSessionForLocalAccount({record,password,role}){
  const email=sanitizeEmail(record?.email||'');
  const phone=normalizePhoneForLookup(record?.phone||record?.mobile||'');
  const name=sanitizeInput(record?.fullname||record?.name||'GoIndiaRide User');
  const plainPassword=String(password||'').trim();
  const accountType=String(role||'customer').toLowerCase()==='driver'?'driver':'customer';
  if(!email||!phone||!plainPassword)return{synced:false,reason:'missing_identity'};

  const loginPayload={email,password:plainPassword,website:'',submittedAt:Date.now()-1500,recaptchaToken:createPseudoRecaptchaToken('gir-login-sync')};
  let loginResult=await callBackendAuth('/api/auth/login',loginPayload);

  if(!loginResult.ok&&(loginResult.status===401||loginResult.status===404||loginResult.status===409)){
    await callBackendAuth('/api/auth/register',{
      name,
      email,
      phone,
      password:plainPassword,
      role:'user',
      accountType,
      website:'',
      submittedAt:Date.now()-1500,
      recaptchaToken:createPseudoRecaptchaToken('gir-register-sync')
    });

    loginResult=await callBackendAuth('/api/auth/login',loginPayload);
  }

  if(loginResult.ok&&loginResult.data&&loginResult.data.accessToken){
    saveBackendAccessToken(loginResult.data.accessToken);
    localStorage.setItem('goindiaride_auth_mode','secure_backend');
    return{synced:true};
  }

  return{synced:false,reason:loginResult.data?.message||'backend_auth_failed'};
}
function getStoreKeysByRole(role){return String(role||'customer').toLowerCase()==='driver'?DRIVER_STORAGE_KEYS:CUSTOMER_STORAGE_KEYS;}
function getReadKeysByRole(role){return String(role||'customer').toLowerCase()==='driver'?DRIVER_READ_STORAGE_KEYS:CUSTOMER_READ_STORAGE_KEYS;}
function matchesRoleRecord(role,record){
  return String(role||'customer').toLowerCase()==='driver'?isDriverRecord(record):isCustomerRecord(record);
}
function isSameAccount(a,b){
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(a.id&&b.id&&String(a.id)===String(b.id))return true;
  const emailA=sanitizeEmail(a.email||'');
  const emailB=sanitizeEmail(b.email||'');
  if(emailA&&emailB&&emailA===emailB)return true;
  return isPhoneMatch(a.phone||a.mobile||'',b.phone||b.mobile||'');
}
function findAccountByIdentifier(role,identifierInput){
  const safeRole=String(role||'customer').toLowerCase();
  const storeKeys=getStoreKeysByRole(safeRole);
  const canonicalRecords=mergeRecords(storeKeys);
  const records=mergeRecords(getReadKeysByRole(safeRole));
  const identifier=typeof identifierInput==='object'&&identifierInput?identifierInput:normalizeIdentifier(identifierInput);
  const record=records.find((r)=>{
    if(!r||typeof r!=='object')return false;
    if(!matchesRoleRecord(safeRole,r))return false;
    if(identifier.kind==='email')return sanitizeEmail(r.email||'')===identifier.value;
    if(identifier.kind==='phone')return isPhoneMatch(r.phone||r.mobile||'',identifier.value);
    return false;
  });
  const index=record?canonicalRecords.findIndex((item)=>isSameAccount(item,record)):-1;
  return{index,record:record||null,records:canonicalRecords,storeKeys,identifier};
}
function findCustomerByPhone(phone){return mergeRecords(CUSTOMER_READ_STORAGE_KEYS).find((u)=>isCustomerRecord(u)&&isPhoneMatch(phone,u.phone||u.mobile||''))||null;}
function findDriverByPhone(phone){return mergeRecords(DRIVER_READ_STORAGE_KEYS).find((d)=>isDriverRecord(d)&&isPhoneMatch(phone,d.phone||d.mobile||''))||null;}
function upsertLocalAccountFromBackend(role,payload={}){
  const safeRole=String(role||'customer').toLowerCase()==='driver'?'driver':'customer';
  const safeEmail=sanitizeEmail(payload.email||'');
  const safePhone=normalizePhoneForLookup(payload.phone||payload.mobile||'');
  const providedId=sanitizeInput(payload.id||payload.userId||'');
  const identifier=safeEmail?{kind:'email',value:safeEmail}:(safePhone?{kind:'phone',value:safePhone}:{kind:'unknown',value:''});
  const account=findAccountByIdentifier(safeRole,identifier);
  const records=Array.isArray(account.records)?account.records:[];
  let index=account.index;
  if(index<0&&providedId){index=records.findIndex((item)=>String(item?.id||'')===String(providedId));}
  const existing=index>=0?records[index]:(account.record||null);
  const resolvedEmail=safeEmail||sanitizeEmail(existing?.email||'');
  const resolvedPhone=safePhone||normalizePhoneForLookup(existing?.phone||existing?.mobile||'');
  const deterministicId=createStableAccountId(safeRole,resolvedEmail,resolvedPhone);
  const stableId=String(existing?.id||deterministicId||providedId).trim();
  const nowIso=new Date().toISOString();

  const normalizedRecord=safeRole==='driver'
    ? {
      ...existing,
      id:stableId,
      role:'driver',
      userType:'driver',
      name:sanitizeInput(payload.name||payload.fullname||existing?.name||existing?.fullname||'Driver'),
      fullname:sanitizeInput(payload.fullname||payload.name||existing?.fullname||existing?.name||'Driver'),
      email:safeEmail||sanitizeEmail(existing?.email||''),
      phone:safePhone||normalizePhoneForLookup(existing?.phone||existing?.mobile||''),
      backendUserId:providedId||sanitizeInput(existing?.backendUserId||''),
      vehicleType:sanitizeInput(payload.vehicleType||existing?.vehicleType||'economy'),
      vehicleNumber:sanitizeInput(payload.vehicleNumber||existing?.vehicleNumber||''),
      createdAt:existing?.createdAt||nowIso,
      syncedFromBackendAt:nowIso
    }
    : {
      ...existing,
      id:stableId,
      role:'customer',
      userType:'customer',
      fullname:sanitizeInput(payload.fullname||payload.name||existing?.fullname||existing?.name||'Customer'),
      name:sanitizeInput(payload.name||payload.fullname||existing?.name||existing?.fullname||'Customer'),
      email:safeEmail||sanitizeEmail(existing?.email||''),
      phone:safePhone||normalizePhoneForLookup(existing?.phone||existing?.mobile||''),
      backendUserId:providedId||sanitizeInput(existing?.backendUserId||''),
      createdAt:existing?.createdAt||nowIso,
      syncedFromBackendAt:nowIso
    };

  if(index>=0)records[index]=normalizedRecord;
  else records.push(normalizedRecord);
  writeRecords(account.storeKeys,records);
  return normalizedRecord;
}
function ensureStableAccountIds(){
  const fixRecords=(role)=>{
    const safeRole=normalizeAccountRole(role,'customer');
    const keys=getStoreKeysByRole(safeRole);
    const rows=mergeRecords(getReadKeysByRole(safeRole));
    let changed=false;
    const normalized=rows.map((row)=>{
      const safeRow=row&&typeof row==='object'?{...row}:{};
      if(!safeRow.id){
        const email=sanitizeEmail(safeRow.email||'');
        const phone=normalizePhoneForLookup(safeRow.phone||safeRow.mobile||'');
        safeRow.id=createStableAccountId(safeRole,email,phone);
        changed=true;
      }
      if(!safeRow.role){
        safeRow.role=safeRole;
        changed=true;
      }
      if(!safeRow.userType){
        safeRow.userType=safeRole;
        changed=true;
      }
      return safeRow;
    });
    if(changed)writeRecords(keys,normalized);
  };
  fixRecords('customer');
  fixRecords('driver');
}
async function fetchBackendProfile(accessToken){
  const token=String(accessToken||'').trim();
  if(!token)return null;
  try{
    const response=await fetch(`${getBackendApiBase()}/api/user/profile`,{
      method:'GET',
      headers:{Accept:'application/json',Authorization:`Bearer ${token}`},
      credentials:'include'
    });
    if(!response.ok)return null;
    const payload=await response.json().catch(()=>({}));
    return payload&&payload.user?payload.user:null;
  }catch(_error){
    return null;
  }
}
function normalizeAccountRole(value,fallback='customer'){
  const normalized=String(value||'').trim().toLowerCase();
  if(normalized==='driver')return'driver';
  if(normalized==='customer'||normalized==='user')return'customer';
  return String(fallback||'customer').toLowerCase()==='driver'?'driver':'customer';
}
async function loginViaBackendAndRestoreLocal({role,email,password}){
  const safeRole=normalizeAccountRole(role,'customer');
  const safeEmail=sanitizeEmail(email||'');
  const safePassword=String(password||'').trim();
  if(!safeEmail||!safePassword){
    return{ok:false,status:400,message:'Email and password required'};
  }

  const backendLogin=await callBackendAuth('/api/auth/login',{
    email:safeEmail,
    password:safePassword,
    website:'',
    submittedAt:Date.now()-1500,
    recaptchaToken:createPseudoRecaptchaToken('gir-login-recovery')
  });

  if(!backendLogin.ok){
    return{ok:false,status:Number(backendLogin.status||0),message:String(backendLogin.data?.message||'Login failed')};
  }

  if(backendLogin.data&&backendLogin.data.accessToken){
    saveBackendAccessToken(backendLogin.data.accessToken);
    localStorage.setItem('goindiaride_auth_mode','secure_backend');
  }

  const profile=await fetchBackendProfile(backendLogin.data?.accessToken||'');
  const profileRole=normalizeAccountRole(profile?.accountType||profile?.role||backendLogin.data?.accountType,safeRole);
  if(profileRole!==safeRole){
    return{ok:false,status:403,message:`This account is registered as ${profileRole}. Please switch portal.`};
  }

  const restored=upsertLocalAccountFromBackend(safeRole,{
    id:profile?.id||profile?.sub||backendLogin.data?.id||backendLogin.data?.userId||'',
    name:profile?.name||backendLogin.data?.name||'',
    fullname:profile?.name||backendLogin.data?.name||'',
    email:profile?.email||safeEmail,
    phone:profile?.phone||backendLogin.data?.phone||'',
    vehicleType:profile?.vehicleType||backendLogin.data?.vehicleType||'',
    vehicleNumber:profile?.vehicleNumber||backendLogin.data?.vehicleNumber||''
  });

  return{ok:true,status:200,record:restored,source:'backend'};
}
function isAuthCredentialError(statusCode){
  return[400,401,403,409].includes(Number(statusCode||0));
}
function isServerOrNetworkError(statusCode){
  const code=Number(statusCode||0);
  return code===0||code===404||code===405||code>=500;
}
function resolveFriendlyLoginError(role,statusCode,message){
  const safeRole=String(role||'customer').toLowerCase()==='driver'?'driver':'customer';
  const code=Number(statusCode||0);
  const safeMessage=sanitizeInput(message||'');

  if(code===401||code===404){
    return safeRole==='driver'
      ? 'Account nahi mila ya password galat hai. Driver account details check karke dubara login karein.'
      : 'Account nahi mila ya password galat hai. Customer account details check karke dubara login karein.';
  }
  if(code===403){
    return 'Access blocked by server policy. Please contact support.';
  }
  if(code===429){
    return 'Too many attempts. Thodi der baad dubara try karein.';
  }
  if(code===405){
    return 'Login API route website host par allow nahi hai. Local account fallback try karein.';
  }
  if(code===0||code>=500){
    return 'Live server temporary issue. Local account fallback try ho raha hai.';
  }
  if(code===404){
    return 'Live login route unavailable ya account missing. Local account fallback try karein.';
  }
  return safeMessage||'Live login failed. Please try again.';
}
async function verifyPasswordForLogin(enteredPassword,storedPassword){
  const hashed=await hashPassword(enteredPassword);
  if(storedPassword===hashed)return{isValid:true,needsMigration:false,hashed};
  if(typeof storedPassword==='string'&&storedPassword===enteredPassword)return{isValid:true,needsMigration:true,hashed};
  return{isValid:false,needsMigration:false,hashed};
}
async function recoverBackendLoginUsingLocalAccount({role,email,password}){
  const account=findAccountByIdentifier(role,email);
  if(!account.record){
    return{ok:false,message:'Local account not found'};
  }

  const passwordCheck=await verifyPasswordForLogin(password,account.record.password);
  if(!passwordCheck.isValid){
    return{ok:false,message:'Wrong credentials'};
  }

  if(passwordCheck.needsMigration){
    const updatedRecord={...account.record,password:passwordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
    if(account.index>=0)account.records[account.index]=updatedRecord;
    else account.records.push(updatedRecord);
    writeRecords(account.storeKeys,account.records);
  }

  const sync=await syncBackendSessionForLocalAccount({
    record:account.record,
    password,
    role
  });
  if(!sync.synced){
    return{ok:false,message:sync.reason||'Backend sync failed'};
  }

  const recovered=await loginViaBackendAndRestoreLocal({role,email,password});
  if(!recovered.ok){
    return{ok:false,message:recovered.message||'Recovered login failed'};
  }
  return{ok:true,record:recovered.record};
}
function evaluateLoginRisk(action,payload={}){
  if(!window.GoIndiaAuthenticityEngine||typeof GoIndiaAuthenticityEngine.registerAction!=='function')return null;
  try{return GoIndiaAuthenticityEngine.registerAction('login',action,payload);}catch(e){console.warn('risk unavailable',e);return null;}
}
function shouldBlockByRisk(snapshot){return snapshot&&Number(snapshot.score||0)<LOGIN_RISK_THRESHOLD;}
function notifyAdminSecurityEvent(title,message,metadata={}){
  const events=safeReadArray(SECURITY_EVENT_KEY);
  events.unshift({id:'sec_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),title,message,metadata,createdAt:new Date().toISOString()});
  localStorage.setItem(SECURITY_EVENT_KEY,JSON.stringify(events.slice(0,300)));
  if(window.PortalConnector&&typeof PortalConnector.createNotification==='function'){
    PortalConnector.createNotification({type:'warning',title,message,sourcePortal:'login',targetPortals:['admin'],metadata});
  }
}
async function ensureAdminProfile(){
  const existing=safeReadObject(ADMIN_PROFILE_KEY,null);
  if(existing&&existing.email&&existing.passwordHash)return existing;
  const seeded={id:'admin_1',name:'Admin User',email:'admin@test.com',phone:'+917654321098',passwordHash:await hashPassword('123456'),updatedAt:new Date().toISOString()};
  localStorage.setItem(ADMIN_PROFILE_KEY,JSON.stringify(seeded));
  return seeded;
}
function isAdminLocked(){
  const state=safeReadObject(ADMIN_FAILURE_KEY,{count:0,lockUntil:null});
  if(!state.lockUntil)return 0;
  const until=new Date(state.lockUntil).getTime();
  return Number.isFinite(until)&&until>Date.now()?until:0;
}
function registerAdminFailure(){
  const state=safeReadObject(ADMIN_FAILURE_KEY,{count:0,lockUntil:null});
  const now=Date.now();
  const oldUntil=state.lockUntil?new Date(state.lockUntil).getTime():0;
  if(oldUntil&&oldUntil<=now){state.count=0;state.lockUntil=null;}
  state.count=Number(state.count||0)+1;
  if(state.count>=ADMIN_MAX_ATTEMPTS)state.lockUntil=new Date(now+ADMIN_LOCK_MS).toISOString();
  localStorage.setItem(ADMIN_FAILURE_KEY,JSON.stringify(state));
  return{count:state.count,locked:Boolean(state.lockUntil&&new Date(state.lockUntil).getTime()>now),lockUntil:state.lockUntil||null};
}
function clearAdminFailures(){localStorage.removeItem(ADMIN_FAILURE_KEY);}

function initFirebasePhoneAuth(){
  if(firebaseReady)return true;
  if(!window.firebase||typeof firebase.auth!=='function'){showError('Firebase Auth library load nahi hui. Page reload karein.');return false;}
  const cfg=window.GOINDIARIDE_FIREBASE_CONFIG||{};
  const required=['apiKey','authDomain','projectId','appId'];
  const missing=required.filter((k)=>!cfg[k]);
  if(missing.length){showError('Firebase config missing hai. js/firebase-config.js me project keys fill karein.');return false;}
  try{if(!firebase.apps.length)firebase.initializeApp(cfg);firebaseReady=true;return true;}catch(e){console.error('firebase init failed',e);showError('Firebase initialize nahi ho paya.');return false;}
}
function ensureRecaptcha(){
  if(!initFirebasePhoneAuth())return null;
  if(firebaseRecaptchaVerifier)return firebaseRecaptchaVerifier;
  try{firebaseRecaptchaVerifier=new firebase.auth.RecaptchaVerifier('firebaseRecaptchaContainer',{size:'invisible'});firebaseRecaptchaVerifier.render();return firebaseRecaptchaVerifier;}catch(e){console.error('recaptcha failed',e);showError('OTP reCAPTCHA setup failed.');return null;}
}
async function sendOtpByFirebase(phoneInput){
  const phone=normalizePhoneForOtp(phoneInput); if(!phone)throw new Error('Please enter valid mobile with country code.');
  const verifier=ensureRecaptcha(); if(!verifier)throw new Error('Firebase OTP setup incomplete hai.');
  return firebase.auth().signInWithPhoneNumber(phone,verifier);
}
async function verifyOtpByFirebase(confirmation,otp){
  if(!confirmation)throw new Error('Pehle OTP send karein.');
  if(!/^\d{6}$/.test(otp))throw new Error('Please enter valid 6-digit OTP.');
  return confirmation.confirm(otp);
}
function readOtpDigits(selector){return Array.from(document.querySelectorAll(selector)).map((i)=>i.value).join('');}
function setUserSession(user){
  localStorage.setItem('currentUser',JSON.stringify({id:user.id,fullname:user.fullname||user.name||'Customer',email:user.email||'',phone:normalizePhoneForLookup(user.phone||user.mobile||''),role:'customer'}));
  localStorage.setItem('userRole','customer');
}
function setDriverSession(driver){
  localStorage.setItem('currentDriver',JSON.stringify({id:driver.id,name:driver.name||driver.fullname||'Driver',email:driver.email||'',phone:normalizePhoneForLookup(driver.phone||driver.mobile||''),vehicleType:driver.vehicleType||'economy',vehicleNumber:driver.vehicleNumber||'',role:'driver'}));
  localStorage.setItem('userRole','driver');
}

function updateLoginMethod(){
  const role=document.querySelector('input[name="role"]:checked').value;
  const methodSelector=document.getElementById('loginMethodSelector');
  const customerForm=document.getElementById('customerForm');
  const driverForm=document.getElementById('driverForm');
  const demoCustomer=document.getElementById('demoCustomer');
  const demoDriver=document.getElementById('demoDriver');
  methodSelector.style.display='grid';
  customerForm.style.display=role==='customer'?'block':'none';
  driverForm.style.display=role==='driver'?'block':'none';
  demoCustomer.style.display=role==='customer'?'inline':'none';
  demoDriver.style.display=role==='driver'?'inline':'none';
  closeForgotPassword();
  updateSelectedLoginMethod();
}
function updateSelectedLoginMethod(){
  const role=document.querySelector('input[name="role"]:checked').value;
  const method=document.querySelector('input[name="loginMethod"]:checked')?.value||'mobile';
  const customerMobile=document.getElementById('customerMobileOTP');
  const customerEmail=document.getElementById('customerEmailPassword');
  const driverMobile=document.getElementById('driverMobileOTP');
  const driverEmail=document.getElementById('driverEmailPassword');
  if(role==='customer'){
    customerMobile.style.display=method==='mobile'?'block':'none';
    customerEmail.style.display=method==='password'?'block':'none';
    driverMobile.style.display='none';
    driverEmail.style.display='none';
    customerResetOTP();
  }else{
    driverMobile.style.display=method==='mobile'?'block':'none';
    driverEmail.style.display=method==='password'?'block':'none';
    customerMobile.style.display='none';
    customerEmail.style.display='none';
    driverResetOTP();
  }
  closeForgotPassword();
}
function togglePasswordVisibility(inputId){
  const input=document.getElementById(inputId);const icon=document.getElementById(inputId+'Icon');if(!input||!icon)return;
  if(input.type==='password'){input.type='text';icon.classList.remove('fa-eye');icon.classList.add('fa-eye-slash');}
  else{input.type='password';icon.classList.remove('fa-eye-slash');icon.classList.add('fa-eye');}
}
async function customerSendOTP(){
  const phone=normalizePhoneForLookup(document.getElementById('customerPhone').value);
  if(!phone){showError('Please enter valid mobile with country code (example: +919876543210).');return;}
  const customer=findCustomerByPhone(phone);
  if(!customer){showError('Local customer record nahi mila. Email/password login karein, account auto-restore ho jayega.');return;}
  const risk=evaluateLoginRisk('customer_otp_send',{role:'customer',customerId:customer.id,phone});
  if(shouldBlockByRisk(risk)){showError('Security check failed. Please use email login or try later.');notifyAdminSecurityEvent('Customer OTP blocked','AI risk filter blocked customer OTP send.',{customerId:customer.id,phone,score:Number(risk.score||0)});return;}
  try{customerConfirmation=await sendOtpByFirebase(phone);document.getElementById('customerOTPSection').classList.add('show');document.getElementById('customerPhone').disabled=true;showSuccess('OTP sent successfully.');setupOTPInputs('.customer-otp');}
  catch(e){console.error('customer otp send failed',e);customerConfirmation=null;showError(e.message||'OTP send failed.');}
}
async function customerVerifyOTP(){
  const otp=readOtpDigits('.customer-otp');const phone=normalizePhoneForLookup(document.getElementById('customerPhone').value);
  try{await verifyOtpByFirebase(customerConfirmation,otp);customerLoginOTP(phone);}catch(e){console.error('customer otp verify failed',e);showError(e.message||'OTP verification failed.');}
}
function customerLoginOTP(phone){
  const customer=findCustomerByPhone(phone);
  if(!customer){showError('Customer local record missing hai. Email/password login se account auto-restore karein.');customerResetOTP();return;}
  const risk=evaluateLoginRisk('customer_otp_verify',{role:'customer',customerId:customer.id,phone});
  if(shouldBlockByRisk(risk)){showError('Login blocked by security filter.');notifyAdminSecurityEvent('Customer OTP login blocked','AI risk blocked customer OTP login.',{customerId:customer.id,phone,score:Number(risk.score||0)});customerResetOTP();return;}
  setUserSession(customer);showSuccess('Login successful.');setTimeout(()=>{window.location.href='./customer-dashboard.html';},700);
}
function customerResetOTP(){customerConfirmation=null;document.getElementById('customerOTPSection').classList.remove('show');document.getElementById('customerPhone').disabled=false;document.querySelectorAll('.customer-otp').forEach((i)=>{i.value='';});}
async function customerLoginEmail(){
  const email=sanitizeEmail(document.getElementById('customerEmail').value);const password=document.getElementById('customerPassword').value;
  if(!email){showError('Please enter valid email address.');return;} if(!password){showError('Please enter your password.');return;}
  const liveLogin=await loginViaBackendAndRestoreLocal({role:'customer',email,password});
  let resolvedLogin=liveLogin;
  if(!resolvedLogin.ok){
    const canAttemptRecovery=[0,401,409,500,502,503].includes(Number(resolvedLogin.status||0));
    if(canAttemptRecovery){
      const recovered=await recoverBackendLoginUsingLocalAccount({role:'customer',email,password});
      if(recovered.ok){
        resolvedLogin={ok:true,record:recovered.record,status:200,message:'Recovered from local account'};
      }
    }
  }
  if(resolvedLogin.ok){
    const risk=evaluateLoginRisk('customer_email_login',{role:'customer',customerId:resolvedLogin.record.id,email,source:'backend_live'});
    if(shouldBlockByRisk(risk)){showError('Login blocked by security filter.');notifyAdminSecurityEvent('Customer email login blocked','AI risk blocked customer email login.',{customerId:resolvedLogin.record.id,email,score:Number(risk.score||0)});return;}
    setUserSession(resolvedLogin.record);showSuccess('Login successful.');setTimeout(()=>{window.location.href='./customer-dashboard.html';},700);
    return;
  }

  const liveStatus=Number(resolvedLogin.status||0);
  let account=findAccountByIdentifier('customer',email);
  if(account.record){
    const passwordCheck=await verifyPasswordForLogin(password,account.record.password);
    if(passwordCheck.isValid){
      if(passwordCheck.needsMigration){
        const updatedRecord={...account.record,password:passwordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
        if(account.index>=0)account.records[account.index]=updatedRecord;
        else account.records.push(updatedRecord);
        writeRecords(account.storeKeys,account.records);
        account=findAccountByIdentifier('customer',email);
      }
      setUserSession(account.record);showSuccess('Login successful (local account restored).');setTimeout(()=>{window.location.href='./customer-dashboard.html';},700);
      return;
    }
  }

  if(isAuthCredentialError(liveStatus)){
    showError(resolveFriendlyLoginError('customer',liveStatus,resolvedLogin.message));
    return;
  }
  if(LIVE_BACKEND_REQUIRED_FOR_LOGIN&&!isServerOrNetworkError(liveStatus)){
    showError(resolveFriendlyLoginError('customer',liveStatus,resolvedLogin.message));
    return;
  }
  showError(resolveFriendlyLoginError('customer',liveStatus,resolvedLogin.message));
}

async function driverSendOTP(){
  const phone=normalizePhoneForLookup(document.getElementById('driverPhone').value);
  if(!phone){showError('Please enter valid mobile with country code (example: +919876543210).');return;}
  const driver=findDriverByPhone(phone);
  if(!driver){showError('Local driver record nahi mila. Email/password login karein, account auto-restore ho jayega.');return;}
  const risk=evaluateLoginRisk('driver_otp_send',{role:'driver',driverId:driver.id,phone});
  if(shouldBlockByRisk(risk)){showError('Security check failed. Please use email login or contact support.');notifyAdminSecurityEvent('Driver OTP blocked','AI risk filter blocked driver OTP send.',{driverId:driver.id,phone,score:Number(risk.score||0)});return;}
  try{driverConfirmation=await sendOtpByFirebase(phone);document.getElementById('driverOTPSection').classList.add('show');document.getElementById('driverPhone').disabled=true;showSuccess('OTP sent successfully.');setupOTPInputs('.driver-otp');}
  catch(e){console.error('driver otp send failed',e);driverConfirmation=null;showError(e.message||'OTP send failed.');}
}
async function driverVerifyOTP(){
  const otp=readOtpDigits('.driver-otp');const phone=normalizePhoneForLookup(document.getElementById('driverPhone').value);
  try{await verifyOtpByFirebase(driverConfirmation,otp);driverLoginOTP(phone);}catch(e){console.error('driver otp verify failed',e);showError(e.message||'OTP verification failed.');}
}
function driverLoginOTP(phone){
  const driver=findDriverByPhone(phone);
  if(!driver){showError('Driver local record missing hai. Email/password login se account auto-restore karein.');driverResetOTP();return;}
  const risk=evaluateLoginRisk('driver_otp_verify',{role:'driver',driverId:driver.id,phone});
  if(shouldBlockByRisk(risk)){showError('Login blocked by security filter.');notifyAdminSecurityEvent('Driver OTP login blocked','AI risk blocked driver OTP login.',{driverId:driver.id,phone,score:Number(risk.score||0)});driverResetOTP();return;}
  setDriverSession(driver);showSuccess('Login successful.');setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
}
function driverResetOTP(){driverConfirmation=null;document.getElementById('driverOTPSection').classList.remove('show');document.getElementById('driverPhone').disabled=false;document.querySelectorAll('.driver-otp').forEach((i)=>{i.value='';});}
async function driverLoginEmail(){
  const email=sanitizeEmail(document.getElementById('driverEmail').value);const password=document.getElementById('driverPassword').value;
  if(!email){showError('Please enter valid email address.');return;} if(!password){showError('Please enter your password.');return;}
  const liveLogin=await loginViaBackendAndRestoreLocal({role:'driver',email,password});
  let resolvedLogin=liveLogin;
  if(!resolvedLogin.ok){
    const canAttemptRecovery=[0,401,409,500,502,503].includes(Number(resolvedLogin.status||0));
    if(canAttemptRecovery){
      const recovered=await recoverBackendLoginUsingLocalAccount({role:'driver',email,password});
      if(recovered.ok){
        resolvedLogin={ok:true,record:recovered.record,status:200,message:'Recovered from local account'};
      }
    }
  }
  if(resolvedLogin.ok){
    const risk=evaluateLoginRisk('driver_email_login',{role:'driver',driverId:resolvedLogin.record.id,email,source:'backend_live'});
    if(shouldBlockByRisk(risk)){showError('Login blocked by security filter.');notifyAdminSecurityEvent('Driver email login blocked','AI risk blocked driver email login.',{driverId:resolvedLogin.record.id,email,score:Number(risk.score||0)});return;}
    setDriverSession(resolvedLogin.record);showSuccess('Login successful.');setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
    return;
  }

  const liveStatus=Number(resolvedLogin.status||0);
  let account=findAccountByIdentifier('driver',email);
  if(account.record){
    const passwordCheck=await verifyPasswordForLogin(password,account.record.password);
    if(passwordCheck.isValid){
      if(passwordCheck.needsMigration){
        const updatedRecord={...account.record,password:passwordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
        if(account.index>=0)account.records[account.index]=updatedRecord;
        else account.records.push(updatedRecord);
        writeRecords(account.storeKeys,account.records);
        account=findAccountByIdentifier('driver',email);
      }
      setDriverSession(account.record);showSuccess('Login successful (local account restored).');setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
      return;
    }
  }

  if(isAuthCredentialError(liveStatus)){
    showError(resolveFriendlyLoginError('driver',liveStatus,resolvedLogin.message));
    return;
  }
  if(LIVE_BACKEND_REQUIRED_FOR_LOGIN&&!isServerOrNetworkError(liveStatus)){
    showError(resolveFriendlyLoginError('driver',liveStatus,resolvedLogin.message));
    return;
  }
  showError(resolveFriendlyLoginError('driver',liveStatus,resolvedLogin.message));
}
async function adminStep1Login(){
  const email=sanitizeEmail(document.getElementById('adminEmail').value);
  const password=document.getElementById('adminPassword').value;
  const lockedUntil=isAdminLocked();
  if(lockedUntil){const mins=Math.max(1,Math.ceil((lockedUntil-Date.now())/60000));showError('Admin login locked. Retry after '+mins+' minutes.');return;}
  if(!email||!password){showError('Admin email and password required.');return;}
  const profile=await ensureAdminProfile();
  const hash=await hashPassword(password);
  if(email!==String(profile.email||'').toLowerCase()||hash!==profile.passwordHash){
    const fail=registerAdminFailure();
    notifyAdminSecurityEvent('Admin login failed','Admin step-1 login failed.',{email,failureCount:fail.count,locked:fail.locked});
    showError(fail.locked?'Too many failed attempts. Admin login locked for 15 minutes.':'Wrong credentials.');
    return;
  }
  clearAdminFailures();
  localStorage.setItem(ADMIN_OTP_EMAIL_KEY,email);
  localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({challengeIssuedAt:new Date().toISOString(),email}));
  document.getElementById('adminStep1').style.display='none';
  document.getElementById('adminStep2').style.display='block';
}
function updateAdmin2FAMethod(){}
function sendAdmin2FAOTP(){
  const method=document.querySelector('input[name="admin2FAMethod"]:checked').value;
  const challenge=safeReadObject(ADMIN_SESSION_KEY,null);
  if(!challenge||!challenge.challengeIssuedAt){showError('Admin session expired. Please login again.');toggleAdminLogin();toggleAdminLogin();return;}
  localStorage.setItem(ADMIN_OTP_KEY,'123456');
  localStorage.setItem(ADMIN_OTP_METHOD_KEY,method);
  showSuccess(method==='email'?'OTP sent to registered admin email.':'OTP sent to registered admin mobile.');
  document.getElementById('adminStep2').style.display='none';
  document.getElementById('adminStep3').style.display='block';
  setupOTPInputs('.admin2fa-otp');
}
function resolveAdminNextPath(){
  const fallback='../admin/index.html';
  try{
    const query=new URLSearchParams(window.location.search||'');
    const next=String(query.get('next')||'').trim();
    if(!next)return fallback;

    if(next.startsWith('/admin/'))return '..'+next;
    if(next.startsWith('../admin/'))return next;
    if(next.startsWith('./admin/'))return next;
    return fallback;
  }catch(_error){
    return fallback;
  }
}
async function verifyAdmin2FA(){
  const otp=readOtpDigits('.admin2fa-otp');const expected=localStorage.getItem(ADMIN_OTP_KEY)||'';
  if(!expected||otp!==expected){showError('Wrong 2FA code.');return;}
  const challenge=safeReadObject(ADMIN_SESSION_KEY,null);
  if(!challenge||!challenge.challengeIssuedAt){showError('Admin 2FA session expired.');toggleAdminLogin();toggleAdminLogin();return;}
  const issuedAt=new Date(challenge.challengeIssuedAt).getTime();
  if(!Number.isFinite(issuedAt)||Date.now()-issuedAt>ADMIN_CHALLENGE_TTL_MS){showError('Admin 2FA challenge expired.');toggleAdminLogin();toggleAdminLogin();return;}
  const profile=await ensureAdminProfile();
  localStorage.setItem('currentAdmin',JSON.stringify({id:profile.id||'admin_1',name:profile.name||'Admin User',email:profile.email,phone:profile.phone||'+917654321098',role:'admin'}));
  localStorage.setItem('userRole','admin');
  localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({active:true,email:profile.email,loggedInAt:new Date().toISOString()}));
  localStorage.removeItem(ADMIN_OTP_KEY);localStorage.removeItem(ADMIN_OTP_EMAIL_KEY);localStorage.removeItem(ADMIN_OTP_METHOD_KEY);
  showSuccess('Admin login successful.');
  const nextPath=resolveAdminNextPath();
  setTimeout(()=>{window.location.href=nextPath;},700);
}
function adminResetTo2FAMethod(){document.getElementById('adminStep2').style.display='block';document.getElementById('adminStep3').style.display='none';document.querySelectorAll('.admin2fa-otp').forEach((i)=>{i.value='';});}
function toggleAdminLogin(){
  const adminForm=document.getElementById('adminForm');
  const roleSelector=document.getElementById('roleSelector');
  const methodSelector=document.getElementById('loginMethodSelector');
  const customerForm=document.getElementById('customerForm');
  const driverForm=document.getElementById('driverForm');
  const adminText=document.getElementById('adminDemoText');
  closeForgotPassword();
  if(adminForm.style.display==='none'){
    adminForm.style.display='block';roleSelector.style.display='none';methodSelector.style.display='none';customerForm.style.display='none';driverForm.style.display='none';adminText.style.display='inline';
    document.getElementById('adminStep1').style.display='block';document.getElementById('adminStep2').style.display='none';document.getElementById('adminStep3').style.display='none';
    document.getElementById('adminEmail').value='';document.getElementById('adminPassword').value='';
  }else{
    adminForm.style.display='none';roleSelector.style.display='grid';methodSelector.style.display='grid';adminText.style.display='none';updateLoginMethod();
  }
}
function openForgotPassword(role='customer'){
  const section=document.getElementById('forgotPasswordSection');const forgotRole=document.getElementById('forgotRole');if(!section||!forgotRole)return;
  forgotRole.value=role==='driver'?'driver':'customer';document.getElementById('forgotIdentifier').value='';document.getElementById('forgotNewPassword').value='';document.getElementById('forgotConfirmPassword').value='';section.classList.add('show');
}
function closeForgotPassword(){const section=document.getElementById('forgotPasswordSection');if(section)section.classList.remove('show');}
async function handleForgotPasswordReset(){
  const role=document.getElementById('forgotRole').value;
  const identifier=normalizeIdentifier(document.getElementById('forgotIdentifier').value);
  const newPassword=document.getElementById('forgotNewPassword').value;
  const confirm=document.getElementById('forgotConfirmPassword').value;
  if(identifier.kind==='unknown'){showError('Please enter registered email or mobile number.');return;}
  const passValidation=validatePassword(newPassword);if(!passValidation.isValid){showError(passValidation.message);return;}
  if(newPassword!==confirm){showError('New password and confirm password do not match.');return;}
  const account=findAccountByIdentifier(role,identifier);
  if(!account.record){showError('Account not found. New account create nahi hoga, sirf registered account reset hota hai.');return;}
  const updatedRecord={...account.record,password:await hashPassword(newPassword),passwordUpdatedAt:new Date().toISOString()};
  if(account.index>=0)account.records[account.index]=updatedRecord;
  else account.records.push(updatedRecord);
  writeRecords(account.storeKeys,account.records);
  notifyAdminSecurityEvent('Password reset',role+' account password reset completed.',{role,accountId:account.record.id,identifierKind:account.identifier.kind});
  showSuccess('Password reset successful. Ab aap login kar sakte hain.');
  closeForgotPassword();
}
function initializeAdminAccessGate(){
  const adminButton=document.querySelector('.admin-portal-link');if(!adminButton)return;
  const query=new URLSearchParams(window.location.search||'');
  if(query.get('admin')==='1'){
    adminButton.style.display='inline-flex';
    const adminForm=document.getElementById('adminForm');
    if(adminForm&&adminForm.style.display==='none')toggleAdminLogin();
  }
  document.addEventListener('keydown',(event)=>{if(event.ctrlKey&&event.shiftKey&&String(event.key||'').toLowerCase()==='a'){adminButton.style.display='inline-flex';showSuccess('Admin access unlocked.');}});
}
function setupOTPInputs(selector){
  const inputs=document.querySelectorAll(selector);if(!inputs.length)return;
  inputs.forEach((input,index)=>{input.value='';input.oninput=(e)=>{e.target.value=e.target.value.replace(/[^0-9]/g,'');if(e.target.value&&index<inputs.length-1)inputs[index+1].focus();};input.onkeydown=(e)=>{if(e.key==='Backspace'&&input.value===''&&index>0)inputs[index-1].focus();};});
  inputs[0].focus();
}
function showError(msg){const errorDiv=document.getElementById('errorMessage');const errorText=document.getElementById('errorText');errorText.textContent=msg;errorDiv.classList.add('show');setTimeout(()=>errorDiv.classList.remove('show'),4500);}
function showSuccess(msg){alert(msg);}

window.addEventListener('load',async()=>{
  restoreAccountBackupIfNeeded();
  ensureStableAccountIds();
  persistAccountBackup();
  await ensureAdminProfile();
  updateLoginMethod();
  initFirebasePhoneAuth();
  initializeAdminAccessGate();
  console.log('Login page ready');
});



