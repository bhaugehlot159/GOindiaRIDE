const CUSTOMER_STORAGE_KEYS=[...new Set(['users','goride_users','customers','goindiaride_users','goindiaride_customers'])];
const DRIVER_STORAGE_KEYS=[...new Set(['drivers','goride_drivers','goindiaride_drivers'])];
const CUSTOMER_READ_STORAGE_KEYS=[...new Set([
  ...CUSTOMER_STORAGE_KEYS,
  'registeredUsers','registered_users','goindia_users','goindiaride_user_accounts','user_accounts'
])];
const DRIVER_READ_STORAGE_KEYS=[...new Set([
  ...DRIVER_STORAGE_KEYS,
  'registeredDrivers','registered_drivers','goindia_drivers','goindiaride_driver_accounts','driver_accounts'
])];
const ACCOUNT_BACKUP_KEY='goindiaride_accounts_backup_v2';
const LEGACY_ACCOUNT_BACKUP_KEYS=[...new Set([
  ACCOUNT_BACKUP_KEY,
  'goindiaride_accounts_backup_v1',
  'goindiaride_accounts_backup',
  'goride_accounts_backup',
  'goindia_accounts_backup'
])];
const ADMIN_PROFILE_KEY='goindiaride_admin_profile';
const ADMIN_SESSION_KEY='goindiaride_admin_session';
const ADMIN_FAILURE_KEY='goindiaride_admin_failures';
const SECURITY_EVENT_KEY='goindiaride_security_events';
const ADMIN_OTP_KEY='admin2FAOTP';
const ADMIN_OTP_EMAIL_KEY='admin2FAEmail';
const ADMIN_OTP_METHOD_KEY='admin2FAMethod';
const ADMIN_OTP_CONTEXT_KEY='goindiaride_admin_otp_context';
const LOGIN_RISK_THRESHOLD=35;
const LIVE_BACKEND_REQUIRED_FOR_LOGIN=true;
const AUTH_REQUEST_TIMEOUT_MS=12000;
const LOGIN_REDIRECT_DELAY_MS=0;
const ADMIN_MAX_ATTEMPTS=5;
const ADMIN_LOCK_MS=15*60*1000;
const ADMIN_CHALLENGE_TTL_MS=10*60*1000;

let firebaseReady=false;
let firebaseRecaptchaVerifier=null;
let customerConfirmation=null;
let driverConfirmation=null;
let adminMobileConfirmation=null;
let adminStep1Context=null;

function extractArrayLike(parsed){
  if(Array.isArray(parsed))return parsed;
  if(!parsed||typeof parsed!=='object')return[];

  const preferredKeys=['items','data','records','users','drivers','customers','list','results','rows'];
  for(let i=0;i<preferredKeys.length;i+=1){
    const key=preferredKeys[i];
    if(Array.isArray(parsed[key]))return parsed[key];
  }

  const values=Object.values(parsed);
  const nestedArray=values.find((value)=>Array.isArray(value));
  if(Array.isArray(nestedArray))return nestedArray;

  const objectValues=values.filter((value)=>value&&typeof value==='object'&&!Array.isArray(value));
  if(objectValues.length>=2&&objectValues.length===values.length)return objectValues;

  return[];
}
function safeReadArray(key){
  try{
    const raw=localStorage.getItem(key);
    const parsed=raw?JSON.parse(raw):[];
    return extractArrayLike(parsed);
  }catch(e){return[];}
}
function safeReadObject(key,fallback={}){
  try{const raw=localStorage.getItem(key);const parsed=raw?JSON.parse(raw):fallback;return parsed&&typeof parsed==='object'?parsed:fallback;}catch(e){return fallback;}
}
function safeReadObjectFromStorage(storage,key,fallback=null){
  try{
    if(!storage||typeof storage.getItem!=='function')return fallback;
    const raw=storage.getItem(key);
    if(!raw)return fallback;
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'?parsed:fallback;
  }catch(_error){
    return fallback;
  }
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
function getLoginDeviceFingerprint(){
  if(window.GoIndiaSessionContinuity&&typeof window.GoIndiaSessionContinuity.buildClientDeviceFingerprint==='function'){
    return window.GoIndiaSessionContinuity.buildClientDeviceFingerprint();
  }
  const key='goindiaride_device_fingerprint_v1';
  const existing=sanitizeInput(localStorage.getItem(key)||'');
  if(existing)return existing;
  const parts=[
    navigator.userAgent||'',
    navigator.language||'',
    navigator.platform||'',
    window.screen?`${screen.width||0}x${screen.height||0}`:'',
    window.devicePixelRatio||'',
    typeof Intl!=='undefined'&&Intl.DateTimeFormat?Intl.DateTimeFormat().resolvedOptions().timeZone:''
  ];
  const fingerprint='web_'+fnv1aHash(parts.join('|'));
  localStorage.setItem(key,fingerprint);
  return fingerprint;
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
  let payload=null;
  for(let i=0;i<LEGACY_ACCOUNT_BACKUP_KEYS.length;i+=1){
    const candidate=safeReadObject(LEGACY_ACCOUNT_BACKUP_KEYS[i],null);
    if(candidate&&typeof candidate==='object'){
      payload=candidate;
      break;
    }
  }
  if(!payload||typeof payload!=='object')return;

  const baseCustomers=Array.isArray(payload.customers)
    ? payload.customers
    : (Array.isArray(payload.users)?payload.users:extractArrayLike(payload.customerAccounts||payload.customerData||[]));
  const baseDrivers=Array.isArray(payload.drivers)
    ? payload.drivers
    : extractArrayLike(payload.driverAccounts||payload.driverData||[]);
  const accounts=Array.isArray(payload.accounts)?payload.accounts:[];

  const accountCustomers=accounts.filter((row)=>isCustomerRecord(row));
  const accountDrivers=accounts.filter((row)=>isDriverRecord(row));

  const safeCustomers=[...baseCustomers,...accountCustomers].filter((row)=>isCustomerRecord(row));
  const safeDrivers=[...baseDrivers,...accountDrivers].filter((row)=>isDriverRecord(row));

  if(!mergeRecords(CUSTOMER_READ_STORAGE_KEYS).length&&safeCustomers.length){
    CUSTOMER_STORAGE_KEYS.forEach((key)=>localStorage.setItem(key,JSON.stringify(safeCustomers)));
  }
  if(!mergeRecords(DRIVER_READ_STORAGE_KEYS).length&&safeDrivers.length){
    DRIVER_STORAGE_KEYS.forEach((key)=>localStorage.setItem(key,JSON.stringify(safeDrivers)));
  }
}
function upsertSessionCustomerArtifact(record){
  const safeEmail=sanitizeEmail(record?.email||record?.userEmail||'');
  const safePhone=normalizePhoneForLookup(record?.phone||record?.mobile||record?.contact||record?.contact1||'');
  if(!safeEmail&&!safePhone)return false;

  const identifier=safeEmail?{kind:'email',value:safeEmail}:{kind:'phone',value:safePhone};
  const account=findAccountByIdentifier('customer',identifier);
  const records=Array.isArray(account.records)?account.records:[];
  const normalized={
    ...(account.record||{}),
    id:String(account.record?.id||createStableAccountId('customer',safeEmail,safePhone)).trim(),
    role:'customer',
    userType:'customer',
    fullname:sanitizeInput(record?.fullname||record?.name||account.record?.fullname||account.record?.name||'Customer'),
    name:sanitizeInput(record?.name||record?.fullname||account.record?.name||account.record?.fullname||'Customer'),
    email:safeEmail||sanitizeEmail(account.record?.email||''),
    phone:safePhone||normalizePhoneForLookup(account.record?.phone||account.record?.mobile||''),
    password:getAccountPasswordValue(account.record||record),
    passwordHash:sanitizeInput(record?.passwordHash||account.record?.passwordHash||''),
    createdAt:account.record?.createdAt||sanitizeInput(record?.createdAt||'')||new Date().toISOString(),
    recoveredFromSessionAt:new Date().toISOString()
  };
  if(account.index>=0)records[account.index]=normalized;
  else records.push(normalized);
  writeRecords(account.storeKeys,records);
  return true;
}
function upsertSessionDriverArtifact(record){
  const safeEmail=sanitizeEmail(record?.email||record?.userEmail||'');
  const safePhone=normalizePhoneForLookup(record?.phone||record?.mobile||record?.contact||record?.contact1||'');
  if(!safeEmail&&!safePhone)return false;

  const identifier=safeEmail?{kind:'email',value:safeEmail}:{kind:'phone',value:safePhone};
  const account=findAccountByIdentifier('driver',identifier);
  const records=Array.isArray(account.records)?account.records:[];
  const normalized={
    ...(account.record||{}),
    id:String(account.record?.id||createStableAccountId('driver',safeEmail,safePhone)).trim(),
    role:'driver',
    userType:'driver',
    name:sanitizeInput(record?.name||record?.fullname||account.record?.name||account.record?.fullname||'Driver'),
    fullname:sanitizeInput(record?.fullname||record?.name||account.record?.fullname||account.record?.name||'Driver'),
    email:safeEmail||sanitizeEmail(account.record?.email||''),
    phone:safePhone||normalizePhoneForLookup(account.record?.phone||account.record?.mobile||''),
    password:getAccountPasswordValue(account.record||record),
    passwordHash:sanitizeInput(record?.passwordHash||account.record?.passwordHash||''),
    vehicleType:sanitizeInput(record?.vehicleType||account.record?.vehicleType||'economy'),
    vehicleNumber:sanitizeInput(record?.vehicleNumber||account.record?.vehicleNumber||''),
    createdAt:account.record?.createdAt||sanitizeInput(record?.createdAt||'')||new Date().toISOString(),
    recoveredFromSessionAt:new Date().toISOString()
  };
  if(account.index>=0)records[account.index]=normalized;
  else records.push(normalized);
  writeRecords(account.storeKeys,records);
  return true;
}
function restoreAccountsFromSessionArtifacts(){
  const localCurrentUser=safeReadObjectFromStorage(localStorage,'currentUser',null);
  const localCurrentDriver=safeReadObjectFromStorage(localStorage,'currentDriver',null);
  const sessionCurrentUser=safeReadObjectFromStorage(sessionStorage,'currentUser',null);
  const sessionCurrentDriver=safeReadObjectFromStorage(sessionStorage,'currentDriver',null);
  const runtimeProfile=safeReadObjectFromStorage(localStorage,'goindiaride.profile.runtime',null)||safeReadObjectFromStorage(localStorage,'goindiaride_profile_runtime',null);
  const roleHint=String(localStorage.getItem('userRole')||sessionStorage.getItem('userRole')||'').toLowerCase();

  let changed=false;
  [localCurrentUser,sessionCurrentUser].forEach((artifact)=>{
    if(artifact&&upsertSessionCustomerArtifact(artifact))changed=true;
  });
  [localCurrentDriver,sessionCurrentDriver].forEach((artifact)=>{
    if(artifact&&upsertSessionDriverArtifact(artifact))changed=true;
  });

  if(runtimeProfile){
    if(roleHint==='driver'){
      if(upsertSessionDriverArtifact(runtimeProfile))changed=true;
    }else{
      if(upsertSessionCustomerArtifact(runtimeProfile))changed=true;
    }
  }

  if(changed)persistAccountBackup();
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
  if(window.GoIndiaSessionContinuity&&typeof window.GoIndiaSessionContinuity.storeAuthArtifacts==='function'){
    try{
      window.GoIndiaSessionContinuity.storeAuthArtifacts({
        accessToken:normalized,
        apiBase:getBackendApiBase()
      });
    }catch(_error){
    }
  }
}
function saveBackendRefreshToken(token){
  const normalized=String(token||'').trim();
  if(!normalized)return;
  localStorage.setItem('goindiaride_refresh_token',normalized);
  localStorage.setItem('goindiaride_refresh_token_v1',normalized);
  if(window.GoIndiaSessionContinuity&&typeof window.GoIndiaSessionContinuity.storeAuthArtifacts==='function'){
    try{
      window.GoIndiaSessionContinuity.storeAuthArtifacts({
        refreshToken:normalized,
        apiBase:getBackendApiBase()
      });
    }catch(_error){
    }
  }
}
function clearBackendAccessToken(){
  localStorage.removeItem('accessToken');
  localStorage.removeItem('authToken');
  localStorage.removeItem('token');
}
function persistSessionContinuity(role,user,overrides={}){
  if(!window.GoIndiaSessionContinuity||typeof window.GoIndiaSessionContinuity.storeAuthArtifacts!=='function')return;
  try{
    window.GoIndiaSessionContinuity.storeAuthArtifacts({
      accountType:role,
      user:user&&typeof user==='object'?user:null,
      accessToken:readBackendAccessToken(),
      refreshToken:String(overrides.refreshToken||'').trim(),
      apiBase:getBackendApiBase()
    });
  }catch(_error){
  }
}
function markBackendAuthMode(mode,reason=''){
  const normalizedMode=String(mode||'').trim()||'fallback_local';
  localStorage.setItem('goindiaride_auth_mode',normalizedMode);
  const normalizedReason=sanitizeInput(reason||'',180);
  if(normalizedReason)localStorage.setItem('goindiaride_auth_reason',normalizedReason);
  else localStorage.removeItem('goindiaride_auth_reason');
}
function readBackendAccessToken(){
  return String(
    localStorage.getItem('accessToken')||
    localStorage.getItem('authToken')||
    localStorage.getItem('token')||
    ''
  ).trim();
}
function readBackendRefreshToken(){
  return String(
    localStorage.getItem('goindiaride_refresh_token')||
    localStorage.getItem('goindiaride_refresh_token_v1')||
    ''
  ).trim();
}
function redirectAfterLogin(target){
  const nextUrl=String(target||'').trim();
  if(!nextUrl)return;
  const run=()=>{window.location.replace(nextUrl);};
  const delay=Number(LOGIN_REDIRECT_DELAY_MS||0);
  if(delay>0){setTimeout(run,delay);return;}
  if(typeof requestAnimationFrame==='function'){requestAnimationFrame(run);return;}
  run();
}
function isInstantCachedLoginEligible(record){
  if(!record||typeof record!=='object')return false;
  if(readBackendAccessToken()||readBackendRefreshToken())return true;
  return Boolean(record.backendUserId||record.syncedFromBackendAt||record.recoveredFromSessionAt||record.emergencyRestored);
}
function startBackendSessionSync({record,password,role,source}){
  Promise.resolve()
    .then(()=>ensureBackendSessionForRole({record,password,role,source}))
    .catch(()=>{});
}
async function tryInstantCachedRoleLogin({role,email,password,target}){
  const safeRole=normalizeAccountRole(role,'customer');
  const safeEmail=sanitizeEmail(email||'');
  const account=findAccountByIdentifier(safeRole,safeEmail);
  if(!account.record)return{handled:false,reason:'missing_local_record'};

  const passwordCheck=await verifyPasswordForLogin(password,getAccountPasswordValue(account.record));
  if(!passwordCheck.isValid)return{handled:false,reason:'password_mismatch'};

  let resolvedRecord=account.record;
  if(passwordCheck.needsMigration){
    resolvedRecord={...account.record,password:passwordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
    if(account.index>=0)account.records[account.index]=resolvedRecord;
    else account.records.push(resolvedRecord);
    writeRecords(account.storeKeys,account.records);
  }

  if(!isInstantCachedLoginEligible(resolvedRecord)){
    return{handled:false,reason:'needs_live_backend'};
  }

  if(safeRole==='driver')setDriverSession(resolvedRecord);
  else setUserSession(resolvedRecord);

  markBackendAuthMode(readBackendAccessToken()?'secure_backend':'fast_local_restore','instant_cached_login');
  showSuccess('Login successful.');
  startBackendSessionSync({
    record:resolvedRecord,
    password,
    role:safeRole,
    source:`${safeRole}_instant_cached_login`
  });
  redirectAfterLogin(target);
  return{handled:true,record:resolvedRecord};
}
function getAccountPasswordValue(record){
  if(!record||typeof record!=='object')return'';
  return String(record.password||record.passwordHash||record.pass||'').trim();
}
function tryDecodeBase64(text){
  const raw=String(text||'').trim();
  if(!raw||!/^[A-Za-z0-9+/=]+$/.test(raw)||raw.length%4!==0)return'';
  try{
    if(typeof window!=='undefined'&&typeof window.atob==='function'){
      return String(window.atob(raw)||'');
    }
  }catch(_error){}
  return'';
}
function getUsableStoredPlainPassword(record){
  const raw=String(record?.password||record?.pass||'').trim();
  if(!raw)return'';
  if(/^[a-f0-9]{64}$/i.test(raw))return'';

  const decoded=tryDecodeBase64(raw);
  const candidate=String(decoded||raw).trim();
  if(candidate.length<6||candidate.length>160)return'';
  if(/[\x00-\x08\x0E-\x1F]/.test(candidate))return'';
  return candidate;
}
function normalizeApiBaseCandidate(value){
  return String(value||'').trim().replace(/\/$/, '');
}
function isTrustedPublicApiBase(value){
  const normalized=normalizeApiBaseCandidate(value);
  if(!normalized)return false;
  try{
    const parsed=new URL(normalized);
    const apiHost=String(parsed.hostname||'').toLowerCase();
    return apiHost==='goindiaride.onrender.com'||apiHost==='goindiaride.in'||apiHost==='www.goindiaride.in'||apiHost.endsWith('.goindiaride.in');
  }catch(_error){
    return false;
  }
}
function persistBackendApiBase(base){
  const normalized=normalizeApiBaseCandidate(base);
  if(!normalized)return;
  const host=String(window.location.hostname||'').toLowerCase();
  const isPrimaryWebsiteHost=host==='goindiaride.in'||host==='www.goindiaride.in'||host.endsWith('.goindiaride.in');
  const isGitHubPagesHost=host==='github.io'||host.endsWith('.github.io');
  const sameOriginBase=String(window.location.origin||'').replace(/\/$/, '');
  const sameOriginBackendBase=sameOriginBase?`${sameOriginBase}/backend`:'';
  if((isPrimaryWebsiteHost||isGitHubPagesHost)&&(normalized===sameOriginBase||normalized===sameOriginBackendBase))return;
  if((isPrimaryWebsiteHost||isGitHubPagesHost)&&!isTrustedPublicApiBase(normalized))return;
  try{
    localStorage.setItem('goindiaride_api_base',normalized);
  }catch(_error){
  }
}
function getBackendApiBase(){
  const host=String(window.location.hostname||'').toLowerCase();
  const isLocalHost=host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]';
  const isPrimaryWebsiteHost=host==='goindiaride.in'||host==='www.goindiaride.in'||host.endsWith('.goindiaride.in');
  const isGitHubPagesHost=host==='github.io'||host.endsWith('.github.io');
  const sameOriginBase=String(window.location.origin||'').replace(/\/$/, '');
  const sameOriginBackendBase=sameOriginBase?`${sameOriginBase}/backend`:'';
  const localBackendBase='http://localhost:5000';
  const fromRuntimeOrigin=sanitizeInput(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__||window.__GOINDIARIDE_API_ORIGIN__||'');
  const fromWindow=sanitizeInput(window.GOINDIARIDE_API_BASE||'');
  const fromStorage=normalizeApiBaseCandidate(localStorage.getItem('goindiaride_api_base')||'');

  const normalizeCandidate=(value)=>{
    const text=String(value||'').trim();
    if(!text)return'';
    return text.replace(/\/$/, '');
  };

  const resolveCandidate=(candidate)=>{
    const normalized=normalizeCandidate(candidate);
    if(!normalized)return'';
    if((isPrimaryWebsiteHost||isGitHubPagesHost)&&(normalized===sameOriginBase||normalized===sameOriginBackendBase))return'';
    if((isPrimaryWebsiteHost||isGitHubPagesHost)&&normalizeCandidate(candidate)===fromStorage&&!isTrustedPublicApiBase(normalized))return'';
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

  const runtimePreferred=resolveCandidate(fromRuntimeOrigin)||resolveCandidate(fromWindow)||resolveCandidate(fromStorage);
  if(runtimePreferred)return runtimePreferred;

  if(isLocalHost){
    return localBackendBase;
  }

  if(isPrimaryWebsiteHost||isGitHubPagesHost)return'https://goindiaride.onrender.com';

  return String(window.location.origin||'').replace(/\/$/, '');
}
function isCloudFunctionsBase(base){
  const normalized=String(base||'').trim();
  if(!normalized)return false;
  try{
    const parsed=new URL(normalized);
    return /\.cloudfunctions\.net$/i.test(String(parsed.hostname||''));
  }catch(_error){
    return false;
  }
}
