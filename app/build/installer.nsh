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
