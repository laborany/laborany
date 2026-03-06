@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT_DIR=%cd%"
set "RELEASE_DIR=%ROOT_DIR%\release"
set "OUTPUT_DIR=%ROOT_DIR%\output"

echo [1/5] Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  exit /b 1
)

echo [2/5] Ensuring dependencies are installed...
call :install_if_missing "%ROOT_DIR%"
if errorlevel 1 goto :fail
call :install_if_missing "%ROOT_DIR%\shared"
if errorlevel 1 goto :fail
call :install_if_missing "%ROOT_DIR%\src-api"
if errorlevel 1 goto :fail
call :install_if_missing "%ROOT_DIR%\agent-service"
if errorlevel 1 goto :fail
call :install_if_missing "%ROOT_DIR%\frontend"
if errorlevel 1 goto :fail

echo [3/5] Building Windows app...
call npm run build:electron
if errorlevel 1 goto :fail

if not exist "%RELEASE_DIR%" (
  echo [ERROR] Build finished but release folder was not found: "%RELEASE_DIR%"
  goto :fail
)

echo [4/5] Preparing output folder...
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
mkdir "%OUTPUT_DIR%"

echo [5/5] Copying artifacts from release to output...
xcopy "%RELEASE_DIR%\*" "%OUTPUT_DIR%\" /E /I /Y >nul
if errorlevel 1 goto :fail

echo.
echo Build completed successfully.
echo Output folder: "%OUTPUT_DIR%"
echo Files:
dir /b "%OUTPUT_DIR%"
exit /b 0

:install_if_missing
set "TARGET_DIR=%~1"
if exist "%TARGET_DIR%\node_modules" (
  echo [deps] node_modules exists: "%TARGET_DIR%"
  exit /b 0
)

echo [deps] Installing dependencies in "%TARGET_DIR%"...
pushd "%TARGET_DIR%"
call npm install
set "INSTALL_EXIT=%ERRORLEVEL%"
popd

if not "%INSTALL_EXIT%"=="0" (
  echo [ERROR] npm install failed in "%TARGET_DIR%"
  exit /b %INSTALL_EXIT%
)
exit /b 0

:fail
echo.
echo Build failed.
exit /b 1
