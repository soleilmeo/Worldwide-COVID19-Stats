
setlocal
set /A webUseGzip=0

@echo off
echo Worldwide COVID-19 Statistics - Final Web Project by Thuy Van ^& Tuan Kiet (Group Assignment)
echo ------------------------
echo Compressed web files may help boosting web performance. However, this will not automatically compress those files.
echo If you've made any changes to your project files without having them compressed,
echo it's suggested to run the server without serving GZIP files. It saves development time as well.
choice /n /m "Use GZIP files? (y/n)"
if %errorlevel% equ 1 set /A webUseGzip=1
if %errorlevel% equ 2 set /A webUseGzip=0
echo:
echo It is recommended to have SSL disabled for general testing due to the certificates being self-signed.
choice /n /m "Enable SSL anyway? (y/n)"
if %errorlevel% equ 1 goto ssl
if %errorlevel% equ 2 goto nossl
echo Something went wrong.
goto exitFail

:nossl
echo:
echo Running project Worldwide COVID-19 Statistics on-demand with SSL disabled.
echo ---
echo Cannot run command? Make sure you've installed Node.js on your system. Get it from: https://nodejs.org/en
echo ---
echo If failed, please refer to online sources such as https://www.npmjs.com/package/http-server for additional methods.
echo:
if %webUseGzip% equ 0 npx http-server ./ --cors || goto unsuccess
if %webUseGzip% equ 1 npx http-server ./ --cors -g || goto unsuccess
goto exitSuccess

:ssl
echo:
echo Running project Worldwide COVID-19 Statistics on-demand with SSL enabled.
echo ---
echo Cannot run command? Make sure you've installed Node.js on your system. Get it from: https://nodejs.org/en
echo ---
echo If failed, please refer to online sources such as https://www.npmjs.com/package/http-server for additional methods.
echo:
if %webUseGzip% equ 0 npx http-server ./ --cors -S -C ssl/cert.pem -K ssl/key.pem || goto unsuccess
if %webUseGzip% equ 1 npx http-server ./ --cors -g -S -C ssl/cert.pem -K ssl/key.pem || goto unsuccess
goto exitSuccess

:unsuccess
echo:
echo That doesn't seem to work. You may have not installed Node.js yet.
choice /n /m "Install Node.js? (y/n)"
if %errorlevel% equ 1 goto install
if %errorlevel% equ 2 goto dontinstall
goto exitFail

:install
echo:
echo You've chosen "Yes". Redirecting you to installation website...
start "" "https://nodejs.org/en"
echo You can now close this window and continue the installation. After that, run this file again.
goto exitSuccess

:dontinstall
echo:
echo You've chosen "No". Unfortunately, this batch file requires Node.js to work :(
echo You can now close this window.
goto exitSuccess

:exitSuccess
endlocal
pause
exit /b 0

:exitFail
endlocal
pause
exit /b 1