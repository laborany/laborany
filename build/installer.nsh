; LaborAny 安装脚本 - 解决进程检测和清理问题

; 自定义进程检测 - 跳过默认的 PowerShell 检测逻辑并在此处执行杀进程逻辑
!macro customCheckAppRunning
  DetailPrint "清理核心进程..."
  nsExec::Exec 'taskkill /F /IM "LaborAny.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-api.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-agent.exe" /T'
  Sleep 800
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -Command "Get-CimInstance -ClassName Win32_Process | ? { ($$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')) -or ($$_.CommandLine -and $$_.CommandLine -like '*$INSTDIR*') } | % { Stop-Process -Id $$_.ProcessId -Force }"`
  Sleep 1200
  nsExec::Exec 'taskkill /F /IM "LaborAny.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-api.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-agent.exe" /T'
  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
  !endif
!macroend

; customInit 在安装初始化时执行，比进程检测更早
!macro customInit
  ; 强制杀死所有可能残留的进程
  DetailPrint "清理残留进程..."
  nsExec::Exec 'taskkill /F /IM "LaborAny.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-api.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-agent.exe" /T'
  Sleep 1000

  ; 彻底清理安装目录下的所有衍生进程 (如 uv, python, bash) 
  ; 防止旧版卸载程序扫描到残留进程而触发报错
  DetailPrint "清理依赖环境进程..."
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -Command "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId -Force }"`
  Sleep 1000
!macroend

!macro customInstall
  ; 安装开始时再次清理（双重保险）
  DetailPrint "再次检查残留进程..."
  nsExec::Exec 'taskkill /F /IM "LaborAny.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-api.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-agent.exe" /T'
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -Command "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId -Force }"`
  Sleep 1000
!macroend

!macro customUnInstall
  ; 卸载前清理进程
  nsExec::Exec 'taskkill /F /IM "LaborAny.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-api.exe" /T'
  nsExec::Exec 'taskkill /F /IM "laborany-agent.exe" /T'
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -Command "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId -Force }"`
  Sleep 1000
!macroend
