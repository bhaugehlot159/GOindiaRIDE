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
function getCustomerDashboardAuthRoute(){return getAuthDashboardRoute('customer');}
function getDriverDashboardAuthRoute(){return getAuthDashboardRoute('driver');}
async function customerVerifyOTP(){
  const otp=readOtpDigits('.customer-otp');const phone=normalizePhoneForLookup(document.getElementById('customerPhone').value);
  try{await verifyOtpByFirebase(customerConfirmation,otp);await customerLoginOTP(phone);}catch(e){console.error('customer otp verify failed',e);showError(e.message||'OTP verification failed.');}
}
async function customerLoginOTP(phone){
  const customer=findCustomerByPhone(phone);
  if(!customer){showError('Customer local record missing hai. Email/password login se account auto-restore karein.');customerResetOTP();return;}
  const risk=evaluateLoginRisk('customer_otp_verify',{role:'customer',customerId:customer.id,phone});
  if(shouldBlockByRisk(risk)){showError('Login blocked by security filter.');notifyAdminSecurityEvent('Customer OTP login blocked','AI risk blocked customer OTP login.',{customerId:customer.id,phone,score:Number(risk.score||0)});customerResetOTP();return;}
  const verifiedCustomer=upsertLocalAccountFromBackend('customer',{...customer,phone,isPhoneVerified:true});
  setUserSession(verifiedCustomer);
  startBackendSessionSync({record:verifiedCustomer,role:'customer',source:'customer_otp'});
  showSuccess('Login successful.');
  redirectAfterLogin(getCustomerDashboardAuthRoute());
}
function customerResetOTP(){customerConfirmation=null;document.getElementById('customerOTPSection').classList.remove('show');document.getElementById('customerPhone').disabled=false;document.querySelectorAll('.customer-otp').forEach((i)=>{i.value='';});}
async function customerLoginEmail(){
  const email=sanitizeEmail(document.getElementById('customerEmail').value);const password=document.getElementById('customerPassword').value;
  if(!email){showError('Please enter valid email address.');return;} if(!password){showError('Please enter your password.');return;}
  const instantLogin=await tryInstantCachedRoleLogin({role:'customer',email,password,target:getCustomerDashboardAuthRoute()});
  if(instantLogin.handled)return;
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
    setUserSession(resolvedLogin.record);
    if(readBackendAccessToken())markBackendAuthMode('secure_backend');
    else await ensureBackendSessionForRole({record:resolvedLogin.record,password,role:'customer',source:'customer_backend_login'});
    showSuccess('Login successful.');redirectAfterLogin(getCustomerDashboardAuthRoute());
    return;
  }

  const liveStatus=Number(resolvedLogin.status||0);
  let hasLocalRecord=false;
  let localPasswordMismatch=false;

  let account=findAccountByIdentifier('customer',email);
  if(account.record){
    hasLocalRecord=true;
    const passwordCheck=await verifyPasswordForLogin(password,getAccountPasswordValue(account.record));
    if(passwordCheck.isValid){
      if(passwordCheck.needsMigration){
        const updatedRecord={...account.record,password:passwordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
        if(account.index>=0)account.records[account.index]=updatedRecord;
        else account.records.push(updatedRecord);
        writeRecords(account.storeKeys,account.records);
        account=findAccountByIdentifier('customer',email);
      }
      setUserSession(account.record);
      startBackendSessionSync({record:account.record,password,role:'customer',source:'customer_local_restore'});
      showSuccess('Login successful.');redirectAfterLogin(getCustomerDashboardAuthRoute());
      return;
    }
    localPasswordMismatch=true;
  }

  const driverAccount=findAccountByIdentifier('driver',email);
  if(driverAccount.record){
    hasLocalRecord=true;
    const driverPasswordCheck=await verifyPasswordForLogin(password,getAccountPasswordValue(driverAccount.record));
    if(driverPasswordCheck.isValid){
      if(driverPasswordCheck.needsMigration){
        const updatedRecord={...driverAccount.record,password:driverPasswordCheck.hashed,passwordUpdatedAt:new Date().toISOString()};
        if(driverAccount.index>=0)driverAccount.records[driverAccount.index]=updatedRecord;
        else driverAccount.records.push(updatedRecord);
        writeRecords(driverAccount.storeKeys,driverAccount.records);
      }
      setDriverSession(driverAccount.record);
      startBackendSessionSync({record:driverAccount.record,password,role:'driver',source:'customer_switch_driver'});
      showSuccess('Yeh account driver role me hai. Driver portal open kiya ja raha hai.');redirectAfterLogin(getDriverDashboardAuthRoute());
      return;
    }
    localPasswordMismatch=true;
  }

  if(localPasswordMismatch){
    if(isServerOrNetworkError(liveStatus)){
      const emergencyReset=await createEmergencyLocalAccount({role:'customer',email,password,forcePasswordReset:true});
      if(emergencyReset.ok){
        setUserSession(emergencyReset.record);
        startBackendSessionSync({record:emergencyReset.record,password,role:'customer',source:'customer_emergency_reset'});
        showSuccess('Live server unavailable. Local restore mode me password sync karke login kar diya gaya.');
        redirectAfterLogin(getCustomerDashboardAuthRoute());
        return;
      }
    }
    showError('Local account mila hai, lekin password match nahi hua. Forgot Password se reset karein.');
    return;
  }

  if(isAuthCredentialError(liveStatus)){
    showError(resolveFriendlyLoginError('customer',liveStatus,resolvedLogin.message));
    return;
  }
  if(LIVE_BACKEND_REQUIRED_FOR_LOGIN&&!isServerOrNetworkError(liveStatus)){
    showError(resolveFriendlyLoginError('customer',liveStatus,resolvedLogin.message));
    return;
  }
  if(!hasLocalRecord&&isServerOrNetworkError(liveStatus)){
    const emergency=await createEmergencyLocalAccount({role:'customer',email,password});
    if(emergency.ok){
      setUserSession(emergency.record);
      startBackendSessionSync({record:emergency.record,password,role:'customer',source:'customer_emergency_create'});
      showSuccess(emergency.created
        ? 'Live server temporary unavailable. Local restore mode me account recover karke login kar diya gaya.'
        : 'Login successful (local restore mode).');
      redirectAfterLogin(getCustomerDashboardAuthRoute());
      return;
    }
  }
  if(!hasLocalRecord){
    showError('Is browser me purana local account data nahi mila. Agar account isi device par tha to ek baar hard refresh karke phir try karein.');
    return;
  }
  showError(resolveFriendlyLoginError('customer',liveStatus,resolvedLogin.message));
}
