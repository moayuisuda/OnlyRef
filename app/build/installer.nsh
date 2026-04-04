!macro customRemoveFiles
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  ; 仅在“更新安装”时保留安装目录下的 data 文件夹。
  ; 常规卸载保持原行为，避免改变用户主动卸载语义。
  StrCpy $R6 "0"
  StrCpy $R7 "$INSTDIR\..\${APP_FILENAME}.data.keep"

  ${if} ${isUpdated}
    ${if} ${FileExists} "$INSTDIR\data\*.*"
      RMDir /r "$R7"
      ClearErrors
      Rename "$INSTDIR\data" "$R7"
      ${ifNot} ${Errors}
        StrCpy $R6 "1"
      ${endif}
    ${endif}

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
