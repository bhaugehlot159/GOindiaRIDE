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
function isDemoAdminProfile(profile){
  if(!profile||typeof profile!=='object')return false;
  const email=sanitizeEmail(profile.email||'');
  const phone=normalizePhoneForLookup(profile.phone||profile.mobile||'');
  const id=sanitizeInput(profile.id||'');
  return email==='admin@test.com'||phone==='+918426891471'||id==='admin_1';
}
async function ensureAdminProfile(){
  const existing=safeReadObject(ADMIN_PROFILE_KEY,null);
  if(existing&&existing.email&&existing.passwordHash&&!isDemoAdminProfile(existing))return existing;
  return null;
}
async function verifyStoredAdminProfile(email,password){
  const profile=await ensureAdminProfile();
  if(!profile)return{ok:false,profile:null,reason:'missing_profile'};
  const profileEmail=sanitizeEmail(profile.email||'');
  if(email!==profileEmail)return{ok:false,profile,reason:'email_mismatch'};
  const passwordCheck=await verifyPasswordForLogin(password,profile.passwordHash);
  if(!passwordCheck.isValid)return{ok:false,profile,reason:'password_mismatch'};
  return{ok:true,profile,source:'stored_admin_profile'};
}
async function verifyBackendAdminPassword(email,password){
  const result=await callBackendAuth('/api/auth/admin/password-check',{
    email,
    password,
    accountType:'admin',
    website:'',
    submittedAt:Date.now()-1500,
    recaptchaToken:createPseudoRecaptchaToken('gir-admin-password-check')
  });
  if(!result.ok){
    return{ok:false,status:Number(result.status||0),message:String(result.data?.message||'Admin password verification failed')};
  }
  return{ok:true,profile:result.data?.admin||{email,role:'admin',accountType:'admin'},source:'backend_admin'};
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

function getAdminCredentialFields(){
  return[
    document.getElementById('adminEmail'),
    document.getElementById('adminPassword')
  ].filter(Boolean);
}
function markAdminCredentialManualEdit(event){
  if(event&&event.currentTarget)event.currentTarget.dataset.userEdited='true';
}
function clearAdminCredentialAutofill(force=false){
  getAdminCredentialFields().forEach((field)=>{
    if(!force&&field.dataset.userEdited==='true')return;
    field.value='';
    field.defaultValue='';
  });
}
function scheduleAdminCredentialAutofillClear(){
  [0,80,250,650,1400].forEach((delay)=>{
    setTimeout(()=>clearAdminCredentialAutofill(false),delay);
  });
}
function bindAdminAutofillGuards(){
  getAdminCredentialFields().forEach((field)=>{
    field.setAttribute('autocomplete',field.id==='adminPassword'?'new-password':'off');
    field.addEventListener('keydown',markAdminCredentialManualEdit);
    field.addEventListener('paste',markAdminCredentialManualEdit);
  });
}

function isInvalidFirebaseApiKeyError(error){
  const code=String(error&&error.code||'').trim().toLowerCase();
  const message=String(error&&error.message||'').trim().toLowerCase();
  return code==='auth/invalid-api-key'||message.includes('auth/invalid-api-key')||message.includes('invalid api key');
}
function isUnauthorizedDomainFirebaseError(error){
  const code=String(error&&error.code||'').trim().toLowerCase();
  const message=String(error&&error.message||'').trim().toLowerCase();
  return code==='auth/unauthorized-domain'||message.includes('unauthorized-domain')||message.includes('site_mismatch')||message.includes('domain');
}
function isCaptchaCheckFirebaseError(error){
  const code=String(error&&error.code||'').trim().toLowerCase();
  const message=String(error&&error.message||'').trim().toLowerCase();
  return code==='auth/captcha-check-failed'||message.includes('captcha-check-failed')||message.includes('recaptcha');
}
function isOperationNotAllowedFirebaseError(error){
  const code=String(error&&error.code||'').trim().toLowerCase();
  const message=String(error&&error.message||'').trim().toLowerCase();
  return code==='auth/operation-not-allowed'||message.includes('operation-not-allowed')||message.includes('sign in method')||message.includes('provider');
}
function toFriendlyFirebasePhoneError(error){
  if(isUnauthorizedDomainFirebaseError(error)||isCaptchaCheckFirebaseError(error)){
    const code=String(error&&error.code||'').trim()||'unknown';
    return `Firebase domain/recaptcha mismatch hai (${code}). Authentication > Settings > Authorized domains me goindiaride.in, www.goindiaride.in, goindiaride.onrender.com add karo.`;
  }
  if(isOperationNotAllowedFirebaseError(error)){
    const code=String(error&&error.code||'').trim()||'unknown';
    return `Firebase Phone sign-in disabled hai (${code}). Authentication > Sign-in method me Phone provider enable karo.`;
  }
  if(isInvalidFirebaseApiKeyError(error)){
    const code=String(error&&error.code||'').trim()||'unknown';
    return `Firebase key mismatch lag raha hai (${code}). Project Settings > General se latest Web API key verify karo, aur Render env FIREBASE_KEY bhi same rakho.`;
  }
  return '';
}
async function resetFirebasePhoneAuth(){
  firebaseReady=false;
  if(firebaseRecaptchaVerifier&&typeof firebaseRecaptchaVerifier.clear==='function'){
    try{firebaseRecaptchaVerifier.clear();}catch(_error){}
  }
  firebaseRecaptchaVerifier=null;
  if(window.firebase&&Array.isArray(firebase.apps)&&firebase.apps.length){
    for(const app of firebase.apps.slice()){
      if(app&&typeof app.delete==='function'){
        try{await app.delete();}catch(_error){}
      }
    }
  }
}
async function initFirebasePhoneAuth(options={}){
  const forceRefresh=Boolean(options&&options.forceRefresh);
  if(firebaseReady&&!forceRefresh)return true;
  if(!window.firebase||typeof firebase.auth!=='function'){showError('Firebase Auth library load nahi hui. Page reload karein.');return false;}
  if(forceRefresh)await resetFirebasePhoneAuth();
  const cfg=typeof window.resolveGoIndiaFirebaseConfig==='function'
    ? await window.resolveGoIndiaFirebaseConfig({forceRefresh})
    : (window.GOINDIARIDE_FIREBASE_CONFIG||{});
  const required=['apiKey','authDomain','projectId','appId'];
  const missing=required.filter((k)=>!cfg[k]);
  if(missing.length){showError('Firebase config missing hai.');return false;}
  try{if(!firebase.apps.length)firebase.initializeApp(cfg);firebaseReady=true;return true;}
  catch(e){console.error('firebase init failed',e);showError(toFriendlyFirebasePhoneError(e)||'Firebase initialize nahi ho paya.');return false;}
}
async function ensureRecaptcha(){
  if(!await initFirebasePhoneAuth())return null;
  if(firebaseRecaptchaVerifier)return firebaseRecaptchaVerifier;
  try{firebaseRecaptchaVerifier=new firebase.auth.RecaptchaVerifier('firebaseRecaptchaContainer',{size:'invisible'});firebaseRecaptchaVerifier.render();return firebaseRecaptchaVerifier;}catch(e){console.error('recaptcha failed',e);showError('OTP reCAPTCHA setup failed.');return null;}
}
async function sendOtpByFirebase(phoneInput,retried=false){
  const phone=normalizePhoneForOtp(phoneInput); if(!phone)throw new Error('Please enter valid mobile with country code.');
  const verifier=await ensureRecaptcha(); if(!verifier)throw new Error('Firebase OTP setup incomplete hai.');
  try{return await firebase.auth().signInWithPhoneNumber(phone,verifier);}
  catch(e){
    if(!retried&&isInvalidFirebaseApiKeyError(e)){
      const reloaded=await initFirebasePhoneAuth({forceRefresh:true});
      if(reloaded)return sendOtpByFirebase(phone,true);
    }
    throw(toFriendlyFirebasePhoneError(e)?new Error(toFriendlyFirebasePhoneError(e)):e);
  }
}
async function verifyOtpByFirebase(confirmation,otp){
  if(!confirmation)throw new Error('Pehle OTP send karein.');
  if(!/^\d{6}$/.test(otp))throw new Error('Please enter valid 6-digit OTP.');
  return confirmation.confirm(otp);
}
function readOtpDigits(selector){return Array.from(document.querySelectorAll(selector)).map((i)=>i.value).join('');}
function setUserSession(user){
  const normalizedUser={id:user.id,backendUserId:user.backendUserId||user.userId||'',fullname:user.fullname||user.name||'Customer',name:user.name||user.fullname||'Customer',email:user.email||'',phone:normalizePhoneForLookup(user.phone||user.mobile||''),isPhoneVerified:Boolean(user.isPhoneVerified||user.phoneVerified),role:'customer'};
  localStorage.setItem('currentUser',JSON.stringify(normalizedUser));
  localStorage.setItem('userRole','customer');
  window.currentUser=normalizedUser;
  persistSessionContinuity('customer',normalizedUser);
}
function setDriverSession(driver){
  const normalizedDriver={id:driver.id,backendUserId:driver.backendUserId||driver.userId||'',name:driver.name||driver.fullname||'Driver',fullname:driver.fullname||driver.name||'Driver',email:driver.email||'',phone:normalizePhoneForLookup(driver.phone||driver.mobile||''),isPhoneVerified:Boolean(driver.isPhoneVerified||driver.phoneVerified),vehicleType:driver.vehicleType||'economy',vehicleNumber:driver.vehicleNumber||'',role:'driver'};
  localStorage.setItem('currentDriver',JSON.stringify(normalizedDriver));
  localStorage.setItem('userRole','driver');
  window.currentDriver=normalizedDriver;
  persistSessionContinuity('driver',normalizedDriver);
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
  if(demoCustomer)demoCustomer.style.display=role==='customer'?'inline':'none';
  if(demoDriver)demoDriver.style.display=role==='driver'?'inline':'none';
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
