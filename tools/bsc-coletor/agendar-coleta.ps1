# Agenda a coleta do BSC no Windows:
#   - de hora em hora, das 07:00 às 18:00
#   - de 2 em 2 horas, das 18:01 às 06:59 (20:00, 22:00, 00:00, 02:00, 04:00, 06:00)
# Como usar (na pasta tools\bsc-coletor, no PowerShell, com o MESMO usuário do Windows que fez "npm run login"):
#   powershell -ExecutionPolicy Bypass -File .\agendar-coleta.ps1
# Para remover: powershell -ExecutionPolicy Bypass -File .\agendar-coleta.ps1 -Remover

param([switch]$Remover)

$ErrorActionPreference = "Stop"
$pasta = $PSScriptRoot
$nomeDia = "GDF - Coleta BSC (07h-18h, de hora em hora)"
$nomeNoite = "GDF - Coleta BSC (noite, de 2 em 2 horas)"

if ($Remover) {
  foreach ($n in @($nomeDia, $nomeNoite)) {
    if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; Write-Host "Removida: $n" }
  }
  Write-Host "Pronto. Nenhuma coleta automática ficou agendada."
  exit 0
}

# Verificações antes de agendar (cada uma explica o que fazer se falhar).
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js não encontrado. Instale o Node.js (nodejs.org), feche e abra o PowerShell, e rode de novo." }
if (-not (Test-Path (Join-Path $pasta "coletor.mjs"))) { throw "coletor.mjs não está nesta pasta. Rode este script de dentro de tools\bsc-coletor." }
if (-not (Test-Path (Join-Path $pasta "coletar-agendado.cmd"))) { throw "coletar-agendado.cmd não está nesta pasta. Baixe-o de novo (veja as instruções)." }

$acao = New-ScheduledTaskAction -Execute (Join-Path $pasta "coletar-agendado.cmd") -WorkingDirectory $pasta
# Roda só com você conectado ao Windows (o login do Google fica no seu perfil).
$usuario = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
$cfg = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

function Novo-Gatilho($hora, $intervaloHoras, $duracao) {
  $base = New-ScheduledTaskTrigger -Daily -At $hora
  $rep = New-ScheduledTaskTrigger -Once -At $hora -RepetitionInterval (New-TimeSpan -Hours $intervaloHoras) -RepetitionDuration $duracao
  $base.Repetition = $rep.Repetition
  return $base
}

# 07:00, 08:00 ... 18:00 (12 execuções)
$gatilhoDia = Novo-Gatilho "07:00" 1 (New-TimeSpan -Hours 11 -Minutes 30)
# 20:00, 22:00, 00:00, 02:00, 04:00, 06:00 (6 execuções)
$gatilhoNoite = Novo-Gatilho "20:00" 2 (New-TimeSpan -Hours 10 -Minutes 30)

Register-ScheduledTask -TaskName $nomeDia -Action $acao -Trigger $gatilhoDia -Settings $cfg -Principal $principal -Force | Out-Null
Register-ScheduledTask -TaskName $nomeNoite -Action $acao -Trigger $gatilhoNoite -Settings $cfg -Principal $principal -Force | Out-Null

Write-Host ""
Write-Host "Agendado com sucesso:" -ForegroundColor Green
Write-Host "  - $nomeDia"
Write-Host "  - $nomeNoite"
Write-Host ""
Write-Host "Importante:"
Write-Host "  1) O computador precisa estar LIGADO e com você conectado ao Windows. Com a tampa fechada ou desligado, a coleta é pulada (e roda assim que voltar)."
Write-Host "  2) Se o Google pedir login de novo, rode:  npm run login  (e depois confira em coleta.log)."
Write-Host "  3) O resultado de cada coleta fica em coleta.log, nesta pasta."
Write-Host "  4) Para testar agora:  Start-ScheduledTask -TaskName '$nomeDia'"
