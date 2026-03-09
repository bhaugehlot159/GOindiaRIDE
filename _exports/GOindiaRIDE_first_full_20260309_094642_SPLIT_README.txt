GOindiaRIDE_first_full_20260309_094642.tar ko GitHub 100MB limit ke kaaran 2 parts me store kiya gaya hai.

Rebuild (Windows CMD):
copy /b GOindiaRIDE_first_full_20260309_094642.tar.part01+GOindiaRIDE_first_full_20260309_094642.tar.part02 GOindiaRIDE_first_full_20260309_094642.tar

Rebuild (PowerShell):
 = 'GOindiaRIDE_first_full_20260309_094642.tar.part01','GOindiaRIDE_first_full_20260309_094642.tar.part02'
 = 'GOindiaRIDE_first_full_20260309_094642.tar'
 = [System.IO.File]::Create()
foreach ( in ) {
   = [System.IO.File]::ReadAllBytes()
  .Write(, 0, .Length)
}
.Close()
