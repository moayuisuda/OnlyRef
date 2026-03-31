!macro customRemoveFiles
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  ; Preserve the install-local data directory only during update installs.
  ; A normal uninstall should keep its current semantics.
  StrCpy $R6 "0"
  StrCpy $R7 "$INSTDIR\..\${APP_FILENAME}.data.keep"

  ${if} ${isUpdated}
    IfFileExists "$INSTDIR\data\*.*" 0 skipPreserveData
      RMDir /r "$R7"
      ClearErrors
      Rename "$INSTDIR\data" "$R7"
      ${ifNot} ${Errors}
        StrCpy $R6 "1"
      ${endif}
    skipPreserveData:

    CreateDirectory "$PLUGINSDIR\old-install"

    Push ""
    Call un.atomicRMDir
    Pop $R8

    ${if} $R8 != 0
      DetailPrint "File is busy, aborting: $R8"

      Push ""
      Call un.restoreFiles
      Pop $R9

      ${if} $R6 == "1"
        CreateDirectory "$INSTDIR"
        Rename "$R7" "$INSTDIR\data"
      ${endif}

      Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
    ${endif}

    RMDir /r $INSTDIR

    ${if} $R6 == "1"
      CreateDirectory "$INSTDIR"
      Rename "$R7" "$INSTDIR\data"
    ${endif}
  ${else}
    RMDir /r $INSTDIR
  ${endif}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
!macroend
