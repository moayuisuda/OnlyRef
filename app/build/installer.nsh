; Match only the installed app executable. The upstream electron-builder
; prefix check can match the updater installer itself when $INSTDIR is wrong.
!macro syncInstallDirFromRegistry
  Push $R0

  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R0 == ""
    ReadRegStr $R0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${endif}

  ${if} $R0 != ""
  ${andIf} ${FileExists} "$R0\${APP_EXECUTABLE_FILENAME}"
    StrCpy $INSTDIR "$R0"
  ${endif}

  Pop $R0
!macroend

!macro findInstalledAppProcess _RETURN
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "$INSTDIR\${APP_EXECUTABLE_FILENAME}")'
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "$$target = [System.IO.Path]::GetFullPath($$env:__PICAPTAIN_TARGET_EXE); $$found = Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and ([System.IO.Path]::GetFullPath($$_.ExecutablePath).Equals($$target, [System.StringComparison]::CurrentCultureIgnoreCase)) }; if ($$found) { exit 0 } else { exit 1 }"`
  Pop ${_RETURN}
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "")'
!macroend

!macro closeInstalledAppProcess _FORCE
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "$INSTDIR\${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_CLOSE_FORCE", t "${_FORCE}")'
  nsExec::Exec `"$PowerShellPath" -NoProfile -ExecutionPolicy Bypass -Command "$$target = [System.IO.Path]::GetFullPath($$env:__PICAPTAIN_TARGET_EXE); $$force = $$env:__PICAPTAIN_CLOSE_FORCE -eq '1'; Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and ([System.IO.Path]::GetFullPath($$_.ExecutablePath).Equals($$target, [System.StringComparison]::CurrentCultureIgnoreCase)) } | ForEach-Object { if ($$force) { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } else { try { [System.Diagnostics.Process]::GetProcessById($$_.ProcessId).CloseMainWindow() | Out-Null } catch {} } }"`
  Pop $R2
  System::Call 'kernel32::SetEnvironmentVariable(t "__PICAPTAIN_TARGET_EXE", t "")'
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
