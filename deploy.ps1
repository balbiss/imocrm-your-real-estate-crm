# Script de Deploy Automático para Portainer
# Uso: .\deploy.ps1 -DockerUser "seu-usuario" -ImageName "crm-oka"

param (
    [Parameter(Mandatory=$true)]
    [string]$DockerUser,
    
    [Parameter(Mandatory=$false)]
    [string]$ImageName = "crm-oka",
    
    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = "" # Cole aqui a URL do Webhook do Portainer
)

# 1. Carregar variáveis do .env
if (Test-Path .env) {
    Get-Content .env | Where-Object { $_ -match '=' -and $_ -notmatch '^#' } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        $value = $value.Trim('"').Trim("'")
        Set-Item -Path "Env:$name" -Value $value
    }
}

$FullImageName = "${DockerUser}/${ImageName}:latest"

Write-Host "--- Iniciando Build da Imagem: $FullImageName ---" -ForegroundColor Cyan

# 2. Build da Imagem com argumentos do Vite
docker build --no-cache `
    --build-arg VITE_SUPABASE_URL=$Env:VITE_SUPABASE_URL `
    --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=$Env:VITE_SUPABASE_PUBLISHABLE_KEY `
    -t $FullImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build da imagem!" -ForegroundColor Red
    exit 1
}

Write-Host "--- Enviando para o Registry ---" -ForegroundColor Cyan

# 3. Push da Imagem
docker push $FullImageName

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao enviar imagem! Certifique-se de estar logado (docker login)." -ForegroundColor Red
    exit 1
}

# 4. Acionar Webhook do Portainer (se fornecido)
if ($WebhookUrl -ne "") {
    Write-Host "--- Notificando Portainer para atualização ---" -ForegroundColor Cyan
    Invoke-RestMethod -Method Post -Uri $WebhookUrl
    Write-Host "Deploy finalizado!" -ForegroundColor Green
} else {
    Write-Host "Imagem enviada! Agora atualize a Stack no Portainer (Pull latest image)." -ForegroundColor Yellow
}
