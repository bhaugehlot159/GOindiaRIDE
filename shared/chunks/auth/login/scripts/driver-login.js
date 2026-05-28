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
  try{await verifyOtpByFirebase(driverConfirmation,otp);await driverLoginOTP(phone);}catch(e){console.error('driver otp verify failed',e);showError(e.message||'OTP verification failed.');}
}
async function driverLoginOTP(phone){
  const driver=findDriverByPhone(phone);
  if(!driver){showError('Driver local record missing hai. Email/password login se account auto-restore karein.');driverResetOTP();return;}
  const risk=evaluateLoginRisk('driver_otp_verify',{role:'driver',driverId:driver.id,phone});
  if(shouldBlockByRisk(risk)){showError('Login blocked by security filter.');notifyAdminSecurityEvent('Driver OTP login blocked','AI risk blocked driver OTP login.',{driverId:driver.id,phone,score:Number(risk.score||0)});driverResetOTP();return;}
  const verifiedDriver=upsertLocalAccountFromBackend('driver',{...driver,phone,isPhoneVerified:true});
  setDriverSession(verifiedDriver);
  const sync=await ensureBackendSessionForRole({record:verifiedDriver,role:'driver',source:'driver_otp'});
  showSuccess(sync.synced?'Login successful. Live booking session connected.':'Login successful. Fallback local session active.');
  setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
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
    setDriverSession(resolvedLogin.record);
    if(readBackendAccessToken())markBackendAuthMode('secure_backend');
    else await ensureBackendSessionForRole({record:resolvedLogin.record,password,role:'driver',source:'driver_backend_login'});
    showSuccess('Login successful.');setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
    return;
  }

  const liveStatus=Number(resolvedLogin.status||0);
  let hasLocalRecord=false;
  let localPasswordMismatch=false;

  let account=findAccountByIdentifier('driver',email);
  if(account.record){
    hasLocalRecord=true;
    const passwordCheck=await verifyPasswordForLogin(password,getAccountPasswordValue(account.record));
    if(passwordCheck.isValid){
      if(passwordCheck.needsMigration){
        const updatedRecord={...account.record,password:passwordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
        if(account.index>=0)account.records[account.index]=updatedRecord;
        else account.records.push(updatedRecord);
        writeRecords(account.storeKeys,account.records);
        account=findAccountByIdentifier('driver',email);
      }
      setDriverSession(account.record);
      const sync=await ensureBackendSessionForRole({record:account.record,password,role:'driver',source:'driver_local_restore'});
      showSuccess(sync.synced?'Login successful.':'Login successful (local account restored).');setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
      return;
    }
    localPasswordMismatch=true;
  }

  const customerAccount=findAccountByIdentifier('customer',email);
  if(customerAccount.record){
    hasLocalRecord=true;
    const customerPasswordCheck=await verifyPasswordForLogin(password,getAccountPasswordValue(customerAccount.record));
    if(customerPasswordCheck.isValid){
      if(customerPasswordCheck.needsMigration){
        const updatedRecord={...customerAccount.record,password:customerPasswordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
        if(customerAccount.index>=0)customerAccount.records[customerAccount.index]=updatedRecord;
        else customerAccount.records.push(updatedRecord);
        writeRecords(customerAccount.storeKeys,customerAccount.records);
      }
      setUserSession(customerAccount.record);
      const sync=await ensureBackendSessionForRole({record:customerAccount.record,password,role:'customer',source:'driver_switch_customer'});
      showSuccess(sync.synced?'Yeh account customer role me hai. Customer portal open kiya ja raha hai.':'Yeh account customer role me hai. Customer portal local restore mode me open ho raha hai.');setTimeout(()=>{window.location.href='./customer-dashboard.html';},700);
      return;
    }
    localPasswordMismatch=true;
  }

  if(localPasswordMismatch){
    if(isServerOrNetworkError(liveStatus)){
      const emergencyReset=await createEmergencyLocalAccount({role:'driver',email,password,forcePasswordReset:true});
      if(emergencyReset.ok){
        setDriverSession(emergencyReset.record);
        await ensureBackendSessionForRole({record:emergencyReset.record,password,role:'driver',source:'driver_emergency_reset'});
        showSuccess('Live server unavailable. Local restore mode me password sync karke login kar diya gaya.');
        setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
        return;
      }
    }
    showError('Local account mila hai, lekin password match nahi hua. Forgot Password se reset karein.');
    return;
  }

  if(isAuthCredentialError(liveStatus)){
    showError(resolveFriendlyLoginError('driver',liveStatus,resolvedLogin.message));
    return;
  }
  if(LIVE_BACKEND_REQUIRED_FOR_LOGIN&&!isServerOrNetworkError(liveStatus)){
    showError(resolveFriendlyLoginError('driver',liveStatus,resolvedLogin.message));
    return;
  }
  if(!hasLocalRecord&&isServerOrNetworkError(liveStatus)){
    const emergency=await createEmergencyLocalAccount({role:'driver',email,password});
    if(emergency.ok){
      setDriverSession(emergency.record);
      await ensureBackendSessionForRole({record:emergency.record,password,role:'driver',source:'driver_emergency_create'});
      showSuccess(emergency.created
        ? 'Live server temporary unavailable. Local restore mode me account recover karke login kar diya gaya.'
        : 'Login successful (local restore mode).');
      setTimeout(()=>{window.location.href='./driver-dashboard.html';},700);
      return;
    }
  }
  if(!hasLocalRecord){
    showError('Is browser me purana local account data nahi mila. Agar account isi device par tha to ek baar hard refresh karke phir try karein.');
    return;
  }
  showError(resolveFriendlyLoginError('driver',liveStatus,resolvedLogin.message));
}
