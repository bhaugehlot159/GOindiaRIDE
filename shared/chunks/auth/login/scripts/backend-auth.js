async function fetchBackendPost(url,body){
  if(typeof AbortController!=='function'){
    return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'include',body});
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),AUTH_REQUEST_TIMEOUT_MS);
  try{
    return await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      credentials:'include',
      body,
      signal:controller.signal
    });
  }finally{
    clearTimeout(timer);
  }
}
async function callBackendAuth(path,payload){
  const normalizedPath=String(path||'');
  const body=JSON.stringify(payload||{});
  const primaryBase=getBackendApiBase();
  const sameOriginBase=String(window.location.origin||'').replace(/\/$/, '');
  const sameOriginBackendBase=sameOriginBase?`${sameOriginBase}/backend`:'';
  const host=String(window.location.hostname||'').toLowerCase();
  const isPrimaryWebsiteHost=host==='goindiaride.in'||host==='www.goindiaride.in'||host.endsWith('.goindiaride.in');
  const isGitHubPagesHost=host==='github.io'||host.endsWith('.github.io');
  const isAuthPath=normalizedPath.toLowerCase().startsWith('/api/auth/');
  const candidateBases=[];
  const pushBase=(value)=>{
    const normalized=String(value||'').trim().replace(/\/$/, '');
    if(!normalized)return;
    if(!/^https?:\/\//i.test(normalized))return;
    if(isAuthPath&&isPrimaryWebsiteHost&&(normalized===sameOriginBase||normalized===sameOriginBackendBase))return;
    if(!candidateBases.includes(normalized))candidateBases.push(normalized);
  };
  if(isPrimaryWebsiteHost){
    pushBase('https://goindiaride.onrender.com');
    pushBase(primaryBase);
    if(sameOriginBackendBase)pushBase(sameOriginBackendBase);
    if(!isGitHubPagesHost&&sameOriginBase)pushBase(sameOriginBase);
  }else{
    pushBase(primaryBase);
    if(sameOriginBackendBase)pushBase(sameOriginBackendBase);
    if(!isGitHubPagesHost&&sameOriginBase)pushBase(sameOriginBase);
  }
  if(!candidateBases.length&&sameOriginBase){
    pushBase(sameOriginBase);
  }

  let lastNetworkError=null;
  let lastHttpFailure=null;
  for(let index=0;index<candidateBases.length;index+=1){
    const base=candidateBases[index];
    if(isAuthPath&&isCloudFunctionsBase(base)){
      continue;
    }
    const url=base+normalizedPath;
    try{
      const res=await fetchBackendPost(url,body);
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

      persistBackendApiBase(base);
      return{ok:true,status:res.status,data};
    }catch(error){
      if(error&&String(error.name||'').toLowerCase()==='aborterror'){
        lastNetworkError=new Error('Request timeout while contacting auth server');
      }else{
        lastNetworkError=error;
      }
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

  const loginPayload={email,password:plainPassword,accountType,website:'',submittedAt:Date.now()-1500,recaptchaToken:createPseudoRecaptchaToken('gir-login-sync')};
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
    saveBackendRefreshToken(loginResult.data.refreshToken||'');
    persistSessionContinuity(accountType,{
      ...record,
      backendUserId:loginResult.data.id||loginResult.data.userId||record?.backendUserId||'',
      isPhoneVerified:Boolean(loginResult.data.isPhoneVerified??record?.isPhoneVerified)
    },{
      refreshToken:loginResult.data.refreshToken||''
    });
    localStorage.setItem('goindiaride_auth_mode','secure_backend');
    return{synced:true};
  }

  return{synced:false,reason:loginResult.data?.message||'backend_auth_failed'};
}
async function ensureBackendSessionForRole({record,password='',role='customer',source='local_session'}){
  const safeRole=String(role||'customer').toLowerCase()==='driver'?'driver':'customer';
  const usablePassword=String(password||'').trim()||getUsableStoredPlainPassword(record);
  if(!record||typeof record!=='object'){
    clearBackendAccessToken();
    markBackendAuthMode('fallback_local',`${source}_missing_record`);
    return{synced:false,reason:'missing_record'};
  }

  if(!sanitizeEmail(record.email||'')){
    clearBackendAccessToken();
    markBackendAuthMode('fallback_local',`${source}_missing_email`);
    return{synced:false,reason:'missing_email'};
  }

  if(!usablePassword){
    clearBackendAccessToken();
    markBackendAuthMode('fallback_local',`${source}_missing_plain_password`);
    return{synced:false,reason:'missing_plain_password'};
  }

  const sync=await syncBackendSessionForLocalAccount({
    record,
    password:usablePassword,
    role:safeRole
  });

  if(sync.synced){
    markBackendAuthMode('secure_backend');
    return sync;
  }

  clearBackendAccessToken();
  markBackendAuthMode('fallback_local',sync.reason||`${source}_backend_sync_failed`);
  return sync;
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
      isPhoneVerified: typeof payload.isPhoneVerified==='boolean'?payload.isPhoneVerified:Boolean(existing?.isPhoneVerified),
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
      isPhoneVerified: typeof payload.isPhoneVerified==='boolean'?payload.isPhoneVerified:Boolean(existing?.isPhoneVerified),
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
    accountType:safeRole,
    website:'',
    submittedAt:Date.now()-1500,
    recaptchaToken:createPseudoRecaptchaToken('gir-login-recovery')
  });

  if(!backendLogin.ok){
    return{ok:false,status:Number(backendLogin.status||0),message:String(backendLogin.data?.message||'Login failed')};
  }

  if(backendLogin.data&&backendLogin.data.accessToken){
    saveBackendAccessToken(backendLogin.data.accessToken);
    saveBackendRefreshToken(backendLogin.data.refreshToken||'');
    localStorage.setItem('goindiaride_auth_mode','secure_backend');
  }

  const backendData=backendLogin.data||{};
  const shouldFetchProfile=!backendData.email||!backendData.id;
  const profile=shouldFetchProfile?await fetchBackendProfile(backendData.accessToken||''):null;
  const profileRole=normalizeAccountRole(profile?.accountType||profile?.role||backendData.accountType||backendData.role,safeRole);
  if(profileRole!==safeRole){
    return{ok:false,status:403,message:`This account is registered as ${profileRole}. Please switch portal.`};
  }

  const restored=upsertLocalAccountFromBackend(safeRole,{
    id:profile?.id||profile?.sub||backendData.id||backendData.userId||'',
    name:profile?.name||backendData.name||'',
    fullname:profile?.name||backendData.name||'',
    email:profile?.email||safeEmail,
    phone:profile?.phone||backendData.phone||'',
    isPhoneVerified:Boolean(profile?.isPhoneVerified ?? backendData.isPhoneVerified ?? false),
    vehicleType:profile?.vehicleType||backendData.vehicleType||'',
    vehicleNumber:profile?.vehicleNumber||backendData.vehicleNumber||''
  });
  persistSessionContinuity(safeRole,restored,{
    refreshToken:backendData.refreshToken||''
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
    return safeMessage||'Access blocked by server policy. Please contact support.';
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
  const normalizedStored=String(storedPassword||'').trim();
  const normalizedEntered=String(enteredPassword||'').trim();
  const hashed=await hashPassword(normalizedEntered);
  if(!normalizedEntered||!normalizedStored)return{isValid:false,needsMigration:false,hashed};
  if(normalizedStored===hashed)return{isValid:true,needsMigration:false,hashed};
  if(normalizedStored===normalizedEntered)return{isValid:true,needsMigration:true,hashed};

  const decoded=tryDecodeBase64(normalizedStored);
  if(decoded&&decoded===normalizedEntered){
    return{isValid:true,needsMigration:true,hashed};
  }

  return{isValid:false,needsMigration:false,hashed};
}
async function createEmergencyLocalAccount({role,email,password,forcePasswordReset=false}){
  const safeRole=String(role||'customer').toLowerCase()==='driver'?'driver':'customer';
  const safeEmail=sanitizeEmail(email||'');
  const plainPassword=String(password||'').trim();
  if(!safeEmail||!plainPassword)return{ok:false,reason:'missing_credentials'};

  const emailIdentifier={kind:'email',value:safeEmail};
  const existing=findAccountByIdentifier(safeRole,emailIdentifier);
  if(existing.record){
    if(!forcePasswordReset){
      return{ok:true,record:existing.record,created:false};
    }
    const hashed=await hashPassword(plainPassword);
    const nowIso=new Date().toISOString();
    const updatedRecord={
      ...existing.record,
      password:hashed,
      passwordUpdatedAt:nowIso,
      emergencyRestored:true,
      emergencyRecoveredAt:nowIso
    };
    if(existing.index>=0)existing.records[existing.index]=updatedRecord;
    else existing.records.push(updatedRecord);
    writeRecords(existing.storeKeys,existing.records);
    return{ok:true,record:updatedRecord,created:false,passwordReset:true};
  }

  const hashed=await hashPassword(plainPassword);
  const nowIso=new Date().toISOString();
  const nameFromEmail=sanitizeInput(safeEmail.split('@')[0].replace(/[._-]+/g,' ').trim())||'GoIndiaRide User';
  const normalizedRecord=safeRole==='driver'
    ? {
      id:createStableAccountId('driver',safeEmail,''),
      role:'driver',
      userType:'driver',
      name:nameFromEmail,
      fullname:nameFromEmail,
      email:safeEmail,
      phone:'',
      password:hashed,
      passwordUpdatedAt:nowIso,
      vehicleType:'economy',
      vehicleNumber:'',
      emergencyRestored:true,
      createdAt:nowIso
    }
    : {
      id:createStableAccountId('customer',safeEmail,''),
      role:'customer',
      userType:'customer',
      fullname:nameFromEmail,
      name:nameFromEmail,
      email:safeEmail,
      phone:'',
      password:hashed,
      passwordUpdatedAt:nowIso,
      emergencyRestored:true,
      createdAt:nowIso
    };

  const records=Array.isArray(existing.records)?existing.records:[];
  records.push(normalizedRecord);
  writeRecords(existing.storeKeys,records);
  return{ok:true,record:normalizedRecord,created:true};
}
async function recoverBackendLoginUsingLocalAccount({role,email,password}){
  const account=findAccountByIdentifier(role,email);
  if(!account.record){
    return{ok:false,message:'Local account not found'};
  }

  const passwordCheck=await verifyPasswordForLogin(password,getAccountPasswordValue(account.record));
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
