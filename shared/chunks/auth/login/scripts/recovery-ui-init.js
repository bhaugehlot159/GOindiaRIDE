function openForgotPassword(role='customer'){
  const section=document.getElementById('forgotPasswordSection');const forgotRole=document.getElementById('forgotRole');if(!section||!forgotRole)return;
  forgotRole.value=role==='admin'?'admin':(role==='driver'?'driver':'customer');document.getElementById('forgotIdentifier').value='';document.getElementById('forgotOtp').value='';document.getElementById('forgotNewPassword').value='';document.getElementById('forgotConfirmPassword').value='';section.classList.add('show');
}
function closeForgotPassword(){const section=document.getElementById('forgotPasswordSection');if(section)section.classList.remove('show');}
function updateLocalPasswordRecordAfterReset(role,identifier,newPassword){
  return hashPassword(newPassword).then((hashedPassword)=>{
    if(role==='admin'){
      const profile=safeReadObject(ADMIN_PROFILE_KEY,null);
      if(profile&&sanitizeEmail(profile.email||'')===identifier.value&&!isDemoAdminProfile(profile)){
        localStorage.setItem(ADMIN_PROFILE_KEY,JSON.stringify({...profile,passwordHash:hashedPassword,passwordUpdatedAt:new Date().toISOString()}));
      }
      return;
    }

    const account=findAccountByIdentifier(role,identifier);
    if(!account.record)return;
    const updatedRecord={...account.record,password:hashedPassword,passwordUpdatedAt:new Date().toISOString()};
    if(account.index>=0)account.records[account.index]=updatedRecord;
    else account.records.push(updatedRecord);
    writeRecords(account.storeKeys,account.records);
  });
}
async function sendForgotPasswordOtp(){
  const role=document.getElementById('forgotRole').value;
  const identifier=normalizeIdentifier(document.getElementById('forgotIdentifier').value);
  if(identifier.kind==='unknown'){showError('Password reset OTP ke liye registered email ya mobile required hai.');return;}
  const payload={
    accountType:role,
    website:'',
    submittedAt:Date.now()-1500,
    recaptchaToken:createPseudoRecaptchaToken('gir-forgot-password-request')
  };
  if(identifier.kind==='email')payload.email=identifier.value;
  if(identifier.kind==='phone')payload.phone=identifier.value;
  const result=await callBackendAuth('/api/auth/forgot-password/request',payload);
  if(!result.ok){showError(result.data?.message||'Password reset OTP send nahi ho paya. SMTP settings check karein.');return;}
  const delivery=result.data?.delivery||null;
  if(delivery&&delivery.sent===false){
    showError(result.data?.message||'Password reset OTP email deliver nahi hua. SMTP settings check karein.');
    return;
  }
  showSuccess(delivery&&delivery.target
    ? `Password reset OTP ${delivery.target} par sent hai. Inbox/spam check karein.`
    : (result.data?.message||'Password reset OTP sent. Email check karein.'));
}
async function handleForgotPasswordReset(){
  const role=document.getElementById('forgotRole').value;
  const identifier=normalizeIdentifier(document.getElementById('forgotIdentifier').value);
  const otp=sanitizeInput(document.getElementById('forgotOtp').value||'');
  const newPassword=document.getElementById('forgotNewPassword').value;
  const confirm=document.getElementById('forgotConfirmPassword').value;
  if(identifier.kind==='unknown'){showError('Please enter registered email or mobile number.');return;}
  const passValidation=validatePassword(newPassword);if(!passValidation.isValid){showError(passValidation.message);return;}
  if(newPassword!==confirm){showError('New password and confirm password do not match.');return;}
  if(identifier.kind==='email'||identifier.kind==='phone'){
    if(!/^\d{4,8}$/.test(otp)){showError('Please enter valid reset OTP from email.');return;}
    const payload={
      accountType:role,
      otp,
      newPassword,
      website:'',
      submittedAt:Date.now()-1500,
      recaptchaToken:createPseudoRecaptchaToken('gir-forgot-password-confirm')
    };
    if(identifier.kind==='email')payload.email=identifier.value;
    if(identifier.kind==='phone')payload.phone=identifier.value;
    const result=await callBackendAuth('/api/auth/forgot-password/confirm',payload);
    if(!result.ok){showError(result.data?.message||'Password reset failed.');return;}
    await updateLocalPasswordRecordAfterReset(role,identifier,newPassword);
    notifyAdminSecurityEvent('Password reset',role+' account password reset completed.',{role,identifierKind:identifier.kind,source:'backend_otp'});
    showSuccess(result.data?.message||'Password reset successful. Ab aap login kar sakte hain.');
    closeForgotPassword();
    return;
  }
  if(role==='admin'){showError('Admin password reset ke liye registered admin email aur OTP required hai.');return;}
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
  const shouldOpenAdmin=typeof shouldOpenAdminLoginFromQuery==='function'?shouldOpenAdminLoginFromQuery():query.get('admin')==='1';
  if(shouldOpenAdmin){
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
function showError(msg){
  const errorDiv=document.getElementById('errorMessage');
  const errorText=document.getElementById('errorText');
  if(!errorDiv||!errorText){console.error(msg);return;}
  errorDiv.style.background='#ffebee';
  errorDiv.style.color='#c62828';
  errorDiv.style.borderLeft='4px solid #c62828';
  errorText.textContent=String(msg||'Something went wrong');
  errorDiv.classList.add('show');
  if(window.__goindiaMessageTimer)clearTimeout(window.__goindiaMessageTimer);
  window.__goindiaMessageTimer=setTimeout(()=>errorDiv.classList.remove('show'),4500);
}
function showSuccess(msg){
  const errorDiv=document.getElementById('errorMessage');
  const errorText=document.getElementById('errorText');
  if(!errorDiv||!errorText){console.log(msg);return;}
  errorDiv.style.background='#e8f5e9';
  errorDiv.style.color='#1b5e20';
  errorDiv.style.borderLeft='4px solid #2e7d32';
  errorText.textContent=String(msg||'Success');
  errorDiv.classList.add('show');
  if(window.__goindiaMessageTimer)clearTimeout(window.__goindiaMessageTimer);
  window.__goindiaMessageTimer=setTimeout(()=>errorDiv.classList.remove('show'),2500);
}

window.addEventListener('load',async()=>{
  if(window.GoIndiaDataPreservation&&typeof window.GoIndiaDataPreservation.restoreAll==='function')window.GoIndiaDataPreservation.restoreAll();
  restoreAccountBackupIfNeeded();
  restoreAccountsFromSessionArtifacts();
  ensureStableAccountIds();
  persistAccountBackup();
  if(window.GoIndiaDataPreservation&&typeof window.GoIndiaDataPreservation.snapshotAll==='function')window.GoIndiaDataPreservation.snapshotAll();
  await ensureAdminProfile();
  bindAdminAutofillGuards();
  clearAdminCredentialAutofill(true);
  if(typeof shouldOpenAdminLoginFromQuery==='function'&&shouldOpenAdminLoginFromQuery()){
    const adminButton=document.querySelector('.admin-portal-link');
    if(adminButton)adminButton.style.display='inline-flex';
    const adminForm=document.getElementById('adminForm');
    if(adminForm&&adminForm.style.display==='none')toggleAdminLogin();
  }else{
    updateLoginMethod();
  }
initFirebasePhoneAuth().catch(()=>{});
  initializeAdminAccessGate();
  scheduleAdminCredentialAutofillClear();
  console.log('Login page ready');
});



