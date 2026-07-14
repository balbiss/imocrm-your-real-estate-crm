# Script de Deploy Automático do backend (crm-oka-backend) para Portainer
# Uso: .\deploy.ps1 -DockerUser "seu-usuario"

param (
    [Parameter(Mandatory=$true)]
    [string]$DockerUser,

    [Parameter(Mandatory=$false)]
    [string]$ImageName = "crm-oka-backend",

    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = "" # Cole aqui a URL do Webhook do Portainer, se tiver
)

$FullImageName = "${DockerUser}/${ImageName}:latest"

Write-Host "--- Iniciando Build da Imagem: $FullImageName ---" -ForegroundColor Cyan

docker build --no-cache -t $FullImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build da imagem!" -ForegroundColor Red
    exit 1
}

Write-Host "--- Enviando para o Registry ---" -ForegroundColor Cyan

docker push $FullImageName

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao enviar imagem! Certifique-se de estar logado (docker login)." -ForegroundColor Red
    exit 1
}

if ($WebhookUrl -ne "") {
    Write-Host "--- Notificando Portainer para atualização ---" -ForegroundColor Cyan
    Invoke-RestMethod -Method Post -Uri $WebhookUrl
    Write-Host "Deploy finalizado!" -ForegroundColor Green
} else {
    Write-Host "Imagem enviada! Agora atualize a Stack no Portainer (Pull latest image)." -ForegroundColor Yellow
}
