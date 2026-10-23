@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
    echo ERROR: Could not open the project directory.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_npm

if exist "node_modules\" goto start
echo Installing project dependencies...
if exist "package-lock.json" (
    call npm.cmd ci
) else (
    call npm.cmd install
)
if errorlevel 1 goto install_failed

:start
echo Starting the React development server and opening your browser...
echo Press Ctrl+C to stop the server.
call npm.cmd run dev -- --open
set "dev_exit_code=%errorlevel%"
if not "%dev_exit_code%"=="0" (
    echo ERROR: The development server exited with code %dev_exit_code%.
    pause
)
popd
exit /b %dev_exit_code%

:missing_node
echo ERROR: Node.js is not installed or is missing from PATH.
echo Install Node.js, then run this file again.
goto failed

:missing_npm
echo ERROR: npm is not installed or is missing from PATH.
echo Install Node.js with npm, then run this file again.
goto failed

:install_failed
echo ERROR: Dependency installation failed. Check the output above.

:failed
popd
pause
exit /b 1
