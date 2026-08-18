@echo off
chcp 65001 >nul 2>&1
echo.
echo ========================================
echo            AI 调解员 - 启动中
echo ========================================
echo.

echo [1/2] 启动后端 (端口 3001) ...
start "AI-Mediator-Backend" cmd /c "cd /d "D:\4.开发工具\code\app\server" && npx tsx src/index.ts"
echo        等待后端就绪 ...

:: 等待后端准备好
:checkBackend
curl -s http://localhost:3001/api/health >nul 2>&1
if %errorlevel% equ 0 goto startFrontend
timeout /t 1 /nobreak >nul
goto checkBackend

:startFrontend
echo [2/2] 启动前端 (端口 3000) ...
start "AI-Mediator-Frontend" cmd /c "cd /d "D:\4.开发工具\code\app" && npx vite --host"
timeout /t 3 /nobreak >nul
echo.
echo ========================================
echo   启动完成! 浏览器打开 http://localhost:3000
echo   两个黑色窗口不要关闭, 用完再关
echo ========================================
echo.

:: 自动打开浏览器
start "" http://localhost:3000

pause
