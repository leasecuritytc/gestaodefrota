@echo off
rem Executado pelo Agendador de Tarefas do Windows. Roda a coleta do BSC e anota o resultado em coleta.log.
cd /d "%~dp0"
echo [%date% %time%] iniciando coleta >> coleta.log
call npm run coletar >> coleta.log 2>&1
echo [%date% %time%] fim (codigo %errorlevel%) >> coleta.log
