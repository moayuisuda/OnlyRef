; Match only the installed app executable. The upstream electron-builder
; prefix check can match the updater installer itself when $INSTDIR is wrong.
Function PiCaptainGetInQuotes
  Exch $R0
  Push $R1
  Push $R2
  Push $R3

  StrCpy $R2 -1
  IntOp $R2 $R2 + 1
  StrCpy $R3 $R0 1 $R2
  StrCmp $R3 "" 0 +3
    StrCpy $R0 ""
    Goto done
  StrCmp $R3 '"' 0 -5

  IntOp $R2 $R2 + 1
  StrCpy $R0 $R0 "" $R2

  StrCpy $R2 0
  IntOp $R2 $R2 + 1
  StrCpy $R3 $R0 1 $R2
  StrCmp $R3 "" 0 +3
    StrCpy $R0 ""
    Goto done
  StrCmp $R3 '"' 0 -5

  StrCpy $R0 $R0 $R2

  done:
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

!macro getQuotedPath _RESULT _COMMAND
  Push "${_COMMAND}"
  Call PiCaptainGetInQuotes
  Pop "${_RESULT}"
!macroend

!macro resolveInstallDirFromRegistryRoot _ROOT _RESULT
  Push $R0
  Push $R1
  Push $R2

  ReadRegStr $R0 ${_ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R0 != ""
  ${andIf} ${FileExists} "$R0\${APP_EXECUTABLE_FILENAME}"
    StrCpy ${_RESULT} "$R0"
  ${endif}

  ${if} ${_RESULT} == ""
    ReadRegStr $R1 ${_ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString
    !ifdef UNINSTALL_REGISTRY_KEY_2
      ${if} $R1 == ""
        ReadRegStr $R1 ${_ROOT} "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
      ${endif}
    !endif

    ${if} $R1 != ""
      !insertmacro getQuotedPath $R2 "$R1"
      ${if} $R2 == ""
        StrCpy $R2 "$R1"
      ${endif}
      ${StdUtils.GetParentPath} $R2 "$R2"
      ${if} ${FileExists} "$R2\${APP_EXECUTABLE_FILENAME}"
        StrCpy ${_RESULT} "$R2"
      ${endif}
    ${endif}
  ${endif}

  Pop $R2
  Pop $R1
  Pop $R0
!macroend

!macro syncInstallDirFromRegistry
  Push $0

  StrCpy $0 ""
  !insertmacro resolveInstallDirFromRegistryRoot HKCU $0
  ${if} $0 == ""
    !insertmacro resolveInstallDirFromRegistryRoot HKLM $0
  ${endif}
  ${if} $0 != ""
    StrCpy $INSTDIR "$0"
  ${endif}

  Pop $0
!macroend

!macro findInstalledAppProcess _RETURN
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "$INSTDIR\${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_INSTALLER_EXE", t "$EXEPATH")'
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "$$target = [System.IO.Path]::GetFullPath($$env:__PICAPTAIN_TARGET_EXE); $$installer = [System.IO.Path]::GetFullPath($$env:__PICAPTAIN_INSTALLER_EXE); if ($$target.Equals($$installer, [System.StringComparison]::CurrentCultureIgnoreCase)) { exit 1 }; $$found = Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and ([System.IO.Path]::GetFullPath($$_.ExecutablePath).Equals($$target, [System.StringComparison]::CurrentCultureIgnoreCase)) }; if ($$found) { exit 0 } else { exit 1 }"`
  Pop ${_RETURN}
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_INSTALLER_EXE", t "")'
!macroend

!macro closeInstalledAppProcess _FORCE
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "$INSTDIR\${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_INSTALLER_EXE", t "$EXEPATH")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_CLOSE_FORCE", t "${_FORCE}")'
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "$$target = [System.IO.Path]::GetFullPath($$env:__PICAPTAIN_TARGET_EXE); $$installer = [System.IO.Path]::GetFullPath($$env:__PICAPTAIN_INSTALLER_EXE); if ($$target.Equals($$installer, [System.StringComparison]::CurrentCultureIgnoreCase)) { exit 0 }; $$force = $$env:__PICAPTAIN_CLOSE_FORCE -eq '1'; Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and ([System.IO.Path]::GetFullPath($$_.ExecutablePath).Equals($$target, [System.StringComparison]::CurrentCultureIgnoreCase)) } | ForEach-Object { if ($$force) { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } else { try { [System.Diagnostics.Process]::GetProcessById($$_.ProcessId).CloseMainWindow() | Out-Null } catch {} } }"`
  Pop $R2
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_INSTALLER_EXE", t "")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_CLOSE_FORCE", t "")'
!macroend

!macro customCheckAppRunning
  !define CheckAppRunningID ${__LINE__}
  Push $R0
  Push $R1
  Push $R2

  !insertmacro IS_POWERSHELL_AVAILABLE
  ${if} $IsPowerShellAvailable != 0
    Abort "PowerShell is required to check whether ${PRODUCT_NAME} is running."
  ${endif}

  ${if} ${isUpdated}
    Sleep 1300
  ${endif}

  custom_check_app_running_${CheckAppRunningID}:
    !insertmacro findInstalledAppProcess $R0
    ${if} $R0 == 0
      ${ifNot} ${isUpdated}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK custom_close_app_running_${CheckAppRunningID}
        Quit
      ${endif}

      custom_close_app_running_${CheckAppRunningID}:
        DetailPrint "$(appClosing)"
        !insertmacro closeInstalledAppProcess 0
        Sleep 1000

        !insertmacro findInstalledAppProcess $R0
        ${if} $R0 == 0
          !insertmacro closeInstalledAppProcess 1
          Sleep 1000
          !insertmacro findInstalledAppProcess $R0
          ${if} $R0 == 0
            MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY custom_check_app_running_${CheckAppRunningID}
            Quit
          ${endif}
        ${endif}
    ${endif}

  Pop $R2
  Pop $R1
  Pop $R0
  !undef CheckAppRunningID
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Var oldInstallDir

    Function .onInstFailed
      ${if} $oldInstallDir != ""
      ${andIf} ${FileExists} "$oldInstallDir\*.*"
        SetOutPath "$PLUGINSDIR"
        ClearErrors
        RMDir /r "$INSTDIR"
        ${if} ${Errors}
          DetailPrint "Failed to remove partial install directory: $INSTDIR"
        ${endif}
        ClearErrors
        Rename "$oldInstallDir" "$INSTDIR"
        ${if} ${Errors}
          DetailPrint "Failed to restore previous install directory: $oldInstallDir"
        ${endif}
      ${endif}
    FunctionEnd
  !endif
!macroend

!macro customInit
  !insertmacro syncInstallDirFromRegistry
  StrCpy $oldInstallDir "$INSTDIR.__old"
!macroend

!macro customRemoveFiles
  Push $R0

  ${if} ${isUpdated}
    StrCpy $R0 "$INSTDIR.__old"
    ${if} ${FileExists} "$R0\*.*"
      ClearErrors
      RMDir /r "$R0"
      ${if} ${Errors}
        Abort `Can't remove stale backup "$R0".`
      ${endif}
    ${endif}

    ; Move the install directory as one unit so a failed update does not
    ; partially remove the currently installed app.
    SetOutPath "$PLUGINSDIR"
    ClearErrors
    Rename "$INSTDIR" "$R0"
    ${if} ${Errors}
      Abort `Can't move "$INSTDIR" to "$R0".`
    ${endif}

  ${else}
    RMDir /r "$INSTDIR"
  ${endif}

  Pop $R0
!macroend

!macro customInstall
  RMDir /r "$oldInstallDir"
!macroend
