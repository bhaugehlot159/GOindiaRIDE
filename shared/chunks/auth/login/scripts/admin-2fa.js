async function adminStep1Login(){
  const email=sanitizeEmail(document.getElementById('adminEmail').value);
  const password=document.getElementById('adminPassword').value;
  const lockedUntil=isAdminLocked();
  adminStep1Context=null;
  if(lockedUntil){const mins=Math.max(1,Math.ceil((lockedUntil-Date.now())/60000));showError('Admin login locked. Retry after '+mins+' minutes.');return;}
  if(!email||!password){showError('Admin email and password required.');return;}

  const backendCheck=await verifyBackendAdminPassword(email,password);
  let profile=backendCheck.ok?backendCheck.profile:null;
  let source=backendCheck.ok?backendCheck.source:'';

  if(!backendCheck.ok){
    const storedCheck=await verifyStoredAdminProfile(email,password);
    if(storedCheck.ok){
      profile=storedCheck.profile;
      source=storedCheck.source;
    }
  }

  if(!profile){
    const fail=registerAdminFailure();
    notifyAdminSecurityEvent('Admin login failed','Admin step-1 login failed.',{email,failureCount:fail.count,locked:fail.locked,status:backendCheck.status||0});
    const backendUnavailable=[0,404,405,500,502,503,504].includes(Number(backendCheck.status||0));
    showError(fail.locked
      ? 'Too many failed attempts. Admin login locked for 15 minutes.'
      : (backendUnavailable?'Live admin auth unavailable hai. Registered admin backend/profile check karein.':'Wrong admin credentials.'));
    return;
  }

  clearAdminFailures();
  adminStep1Context={email,password,profile,source};
  localStorage.setItem(ADMIN_OTP_EMAIL_KEY,email);
  localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({
    challengeIssuedAt:new Date().toISOString(),
    email,
    phone:normalizePhoneForLookup(profile.phone||profile.mobile||''),
    name:sanitizeInput(profile.name||profile.fullname||'Admin'),
    adminId:sanitizeInput(profile.id||profile._id||''),
    source
  }));
  document.getElementById('adminStep1').style.display='none';
  document.getElementById('adminStep2').style.display='block';
}
function updateAdmin2FAMethod(){}
function setAdminAuthMode(active){
  const enabled=Boolean(active);
  document.documentElement.classList.toggle('admin-auth-mode',enabled);
  if(document.body)document.body.classList.toggle('admin-auth-mode',enabled);
}
function formatOtpDeliveryTarget(delivery){
  if(!delivery||typeof delivery!=='object')return'';
  const target=sanitizeInput(delivery.target||'');
  if(!target)return'';
  return delivery.channel==='email'?` (${target})`:` (${target})`;
}
function getAdminOtpPhone(profile){
  const phone=normalizePhoneForLookup(profile?.phone||profile?.mobile||'');
  return phone;
}
function openAdminOtpEntryStep(){
  document.getElementById('adminStep2').style.display='none';
  document.getElementById('adminStep3').style.display='block';
  setupOTPInputs('.admin2fa-otp');
}
async function completeAdminLogin(verifiedData={}){
  const challenge=safeReadObject(ADMIN_SESSION_KEY,{});
  const profile=(adminStep1Context&&adminStep1Context.profile)||await ensureAdminProfile()||{};
  if(verifiedData?.accessToken)saveBackendAccessToken(verifiedData.accessToken);
  if(verifiedData?.refreshToken)saveBackendRefreshToken(verifiedData.refreshToken);
  const adminSession={
    id:verifiedData?.id||challenge.adminId||profile.id||'admin',
    name:verifiedData?.name||challenge.name||profile.name||'Admin',
    email:sanitizeEmail(verifiedData?.email||challenge.email||profile.email||''),
    phone:getAdminOtpPhone(verifiedData)||getAdminOtpPhone(challenge)||getAdminOtpPhone(profile)||'',
    role:'admin'
  };
  localStorage.setItem('currentAdmin',JSON.stringify(adminSession));
  localStorage.setItem('userRole','admin');
  localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({active:true,email:adminSession.email,loggedInAt:new Date().toISOString()}));
  localStorage.removeItem(ADMIN_OTP_KEY);localStorage.removeItem(ADMIN_OTP_EMAIL_KEY);localStorage.removeItem(ADMIN_OTP_METHOD_KEY);localStorage.removeItem(ADMIN_OTP_CONTEXT_KEY);
  adminMobileConfirmation=null;
  adminStep1Context=null;
  showSuccess('Admin login successful.');
  const nextPath=resolveAdminNextPath();
  setTimeout(()=>{redirectAfterLogin(nextPath);},700);
}
async function sendAdmin2FAOTP(){
  const method=document.querySelector('input[name="admin2FAMethod"]:checked').value;
  const challenge=safeReadObject(ADMIN_SESSION_KEY,null);
  if(!challenge||!challenge.challengeIssuedAt){showError('Admin session expired. Please login again.');toggleAdminLogin();toggleAdminLogin();return;}
  const profile=(adminStep1Context&&adminStep1Context.profile)||await ensureAdminProfile()||challenge||{};
  const channel=method==='email'?'email':'sms';
  const email=sanitizeEmail(challenge.email||profile.email||'');
  const phone=getAdminOtpPhone(profile);
  const password=String(adminStep1Context?.password||'');
  if(channel==='email'&&!email){showError('Registered admin email missing hai. Admin profile update karein.');return;}
  if(channel==='sms'&&!phone){showError('Registered admin mobile missing hai. Admin profile update karein.');return;}
  if(!password){showError('Admin password session expired. Please start admin login again.');toggleAdminLogin();toggleAdminLogin();return;}

  const payload={
    channel,
    accountType:'admin',
    email:channel==='email'?email:undefined,
    phone:channel==='sms'?phone:undefined,
    password,
    website:'',
    submittedAt:Date.now()-1500,
    recaptchaToken:createPseudoRecaptchaToken('gir-admin-otp-send')
  };
  const context={
    method,
    channel,
    email,
    phone,
    delivery:null,
    deviceFingerprint:getLoginDeviceFingerprint(),
    issuedAt:new Date().toISOString()
  };
  localStorage.setItem(ADMIN_OTP_CONTEXT_KEY,JSON.stringify(context));

  if(channel==='sms'){
    try{
      adminMobileConfirmation=await sendOtpByFirebase(phone);
      context.provider='firebase-phone';
      context.issuedAt=new Date().toISOString();
      localStorage.setItem(ADMIN_OTP_CONTEXT_KEY,JSON.stringify(context));
      localStorage.removeItem(ADMIN_OTP_KEY);
      localStorage.setItem(ADMIN_OTP_METHOD_KEY,method);
      showSuccess(`OTP sent through Firebase to registered admin mobile (${phone.replace(/^\+(\d{2})\d+(\d{4})$/,'+$1******$2')}).`);
      openAdminOtpEntryStep();
      return;
    }catch(e){
      adminMobileConfirmation=null;
      context.firebasePhoneError=e.message||'firebase_phone_failed';
      localStorage.setItem(ADMIN_OTP_CONTEXT_KEY,JSON.stringify(context));
      showError(e.message||'Firebase mobile OTP failed. Firebase Phone Auth setup check karein.');
      return;
    }
  }

  const result=await callBackendAuth(resolveAuthEndpoint('otpRequest'),payload);
  if(!result.ok){
    const status=Number(result.status||0);
    const backendMessage=result.data?.message||'Admin OTP send nahi ho paya. SMTP/SMS settings check karein.';
    localStorage.removeItem(ADMIN_OTP_CONTEXT_KEY);
    showError(backendMessage);
    return;
  }

  context.delivery=result.data?.delivery||null;
  context.issuedAt=new Date().toISOString();
  localStorage.setItem(ADMIN_OTP_CONTEXT_KEY,JSON.stringify(context));
  localStorage.removeItem(ADMIN_OTP_KEY);
  localStorage.setItem(ADMIN_OTP_METHOD_KEY,method);
  showSuccess(method==='email'
    ? `OTP sent to registered admin email${formatOtpDeliveryTarget(result.data?.delivery)}.`
    : `OTP sent to registered admin mobile${formatOtpDeliveryTarget(result.data?.delivery)}.`);
  openAdminOtpEntryStep();
}
function resolveAdminNextPath(){
  if(window.GoIndiaRideAuthRoutes&&typeof window.GoIndiaRideAuthRoutes.resolveAdminNextPath==='function'){
    return window.GoIndiaRideAuthRoutes.resolveAdminNextPath();
  }
  const fallback=getAuthUiRoute('adminHome');
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
function shouldOpenAdminLoginFromQuery(){
  try{
    const query=new URLSearchParams(window.location.search||'');
    const adminParam=String(query.get('admin')||'').trim().toLowerCase();
    const next=String(query.get('next')||'').trim().toLowerCase();
    return adminParam==='1'||adminParam==='true'||next.startsWith('/admin/')||next.startsWith('../admin/')||next.startsWith('./admin/');
  }catch(_error){
    return false;
  }
}
async function verifyAdmin2FA(){
  const otp=readOtpDigits('.admin2fa-otp');
  if(!/^\d{6}$/.test(otp)){showError('Please enter valid 6-digit OTP.');return;}
  const otpContext=safeReadObject(ADMIN_OTP_CONTEXT_KEY,null);
  if(!otpContext||!otpContext.channel){showError('Pehle admin OTP send karein.');adminResetTo2FAMethod();return;}
  const challenge=safeReadObject(ADMIN_SESSION_KEY,null);
  if(!challenge||!challenge.challengeIssuedAt){showError('Admin 2FA session expired.');toggleAdminLogin();toggleAdminLogin();return;}
  const issuedAt=new Date(challenge.challengeIssuedAt).getTime();
  if(!Number.isFinite(issuedAt)||Date.now()-issuedAt>ADMIN_CHALLENGE_TTL_MS){showError('Admin 2FA challenge expired.');toggleAdminLogin();toggleAdminLogin();return;}
  console.log('Admin OTP Context:', otpContext);
  if(otpContext.provider==='firebase-phone'){
    try{
      await verifyOtpByFirebase(adminMobileConfirmation,otp);
      await completeAdminLogin({});
    }catch(e){
      showError(e.message||'Mobile OTP verification failed.');
    }
    return;
  }
  const verifyPayload={
    channel:otpContext.channel,
    accountType:'admin',
    email:otpContext.channel==='email'?otpContext.email:undefined,
    phone:otpContext.channel==='sms'?otpContext.phone:undefined,
    otp,
    deviceFingerprint:otpContext.deviceFingerprint||getLoginDeviceFingerprint(),
    website:'',
    submittedAt:Date.now()-1500,
    recaptchaToken:createPseudoRecaptchaToken('gir-admin-otp-verify')
  };
  const verified=await callBackendAuth(resolveAuthEndpoint('otpVerify'),verifyPayload);
  if(!verified.ok){showError(verified.data?.message||'Wrong 2FA code.');return;}
  await completeAdminLogin(verified.data||{});
}
function adminResetTo2FAMethod(){document.getElementById('adminStep2').style.display='block';document.getElementById('adminStep3').style.display='none';adminMobileConfirmation=null;localStorage.removeItem(ADMIN_OTP_CONTEXT_KEY);document.querySelectorAll('.admin2fa-otp').forEach((i)=>{i.value='';});}
function toggleAdminLogin(){
  const adminForm=document.getElementById('adminForm');
  const roleSelector=document.getElementById('roleSelector');
  const methodSelector=document.getElementById('loginMethodSelector');
  const customerForm=document.getElementById('customerForm');
  const driverForm=document.getElementById('driverForm');
  closeForgotPassword();
  if(adminForm.style.display==='none'){
    setAdminAuthMode(true);
    adminForm.style.display='block';roleSelector.style.display='none';methodSelector.style.display='none';customerForm.style.display='none';driverForm.style.display='none';
    document.getElementById('adminStep1').style.display='block';document.getElementById('adminStep2').style.display='none';document.getElementById('adminStep3').style.display='none';
    getAdminCredentialFields().forEach((field)=>{delete field.dataset.userEdited;});
    clearAdminCredentialAutofill(true);
    scheduleAdminCredentialAutofillClear();
    adminMobileConfirmation=null;
    adminStep1Context=null;
    localStorage.removeItem(ADMIN_OTP_CONTEXT_KEY);
  }else{
    setAdminAuthMode(false);
    adminStep1Context=null;adminForm.style.display='none';roleSelector.style.display='grid';methodSelector.style.display='grid';updateLoginMethod();
  }
}
