@echo off
setlocal

set "DOCKER_EXE=C:\Program Files\Docker\Docker\resources\bin\docker.exe"

if not exist "%DOCKER_EXE%" (
  >&2 echo [99freelas-mcp] docker executable not found: %DOCKER_EXE%
  exit /b 1
)

"%DOCKER_EXE%" exec -i -w /app 99freelas-mcp-server node dist/index.js
exit /b %ERRORLEVEL%
