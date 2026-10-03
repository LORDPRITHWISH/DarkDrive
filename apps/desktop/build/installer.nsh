; DarkDrive in Explorer's right-click menu, for this user: "DarkDrive" on a
; folder (sync it, open it in DarkDrive, pause or resume sync) and "Open in
; DarkDrive" on a file. Each starts the app with an argument, which the
; running copy acts on (handle() in src/main.ts). electron-builder includes
; this file by its name.
;
; On Windows 11 these sit under "Show more options": the short menu only takes
; packaged apps. Sync-status overlays aren't here at all, they need a COM
; shell extension (see src/filemanager.ts).

!define DD_FOLDER "Software\Classes\Directory\shell\DarkDrive"
!define DD_FILE "Software\Classes\*\shell\DarkDrive"

!macro customInstall
  WriteRegStr HKCU "${DD_FOLDER}" "MUIVerb" "DarkDrive"
  WriteRegStr HKCU "${DD_FOLDER}" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ; Empty: the entries are the keys under shell, below.
  WriteRegStr HKCU "${DD_FOLDER}" "SubCommands" ""
  WriteRegStr HKCU "${DD_FOLDER}\shell\1sync" "MUIVerb" "Sync with DarkDrive"
  WriteRegStr HKCU "${DD_FOLDER}\shell\1sync\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dd-sync "%1"'
  WriteRegStr HKCU "${DD_FOLDER}\shell\2open" "MUIVerb" "Open in DarkDrive"
  WriteRegStr HKCU "${DD_FOLDER}\shell\2open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dd-open "%1"'
  WriteRegStr HKCU "${DD_FOLDER}\shell\3pause" "MUIVerb" "Pause or resume sync"
  WriteRegStr HKCU "${DD_FOLDER}\shell\3pause\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dd-toggle'

  WriteRegStr HKCU "${DD_FILE}" "" "Open in DarkDrive"
  WriteRegStr HKCU "${DD_FILE}" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "${DD_FILE}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --dd-open "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "${DD_FOLDER}"
  DeleteRegKey HKCU "${DD_FILE}"
  ; darkdrive:// links, which the app registers itself when it runs.
  DeleteRegKey HKCU "Software\Classes\darkdrive"
  ; Launching at login, likewise the app's own: named by its appId (registerAutostart in src/main.ts).
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "live.zenux.darkdrive"
!macroend
