$REGION = "us-east-1"
$ACCOUNT = "331240720676"

$SERVICES = @(
#     "auth-service",
#     "users-service",
#     "brain-games-service",
    "books-service"
#     "nutritional-service",
#     "resource-center-service",
#     "relaxing-sounds-service",
#     "spiritual-service",
#     "mental-service",
#     "specialty-care-service",
#     "landing-pages-service",
#     "podcasts-service",
#     "workouts-service",
#     "videos-service",
#     "sleep-service",
#     "readiness-contents-service",
#     "chat-service",
#     "classes-service",
#     "call-request-service",
#     "telemedicine-service",
#     "events-service",
#     "group-challenges-service",
#     "run-walking-service",
#     "pro-trainer-workouts-service",
#     "user-records-service"
)

# $SERVICES = @(
#     "notifications-service",
#     "pdf-generator-service",
#     "email-service",
#     "file-processor-service",
#     "admin"
# )

Write-Host "Fazendo login no ECR..." -ForegroundColor Cyan
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

foreach ($SERVICE in $SERVICES) {
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "Processando: $SERVICE" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    
    $SOURCE = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/staging-services-$SERVICE-repo:latest"
    $TARGET = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/base-core-$SERVICE-repo:latest"

    # if($SERVICE -eq "admin"){
    #     $SOURCE = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/staging-services-valornet-frontend-repo:latest"
    # }

    # if($SERVICE -eq "file-processor-service"){
    #     $SOURCE = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/staging-services-file-processor-lambda-service-repo:latest"
    # }

    $NGINX_SOURCE = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/staging-services-$SERVICE-nginx-repo:latest"
    $NGINX_TARGET = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/base-core-$SERVICE-nginx-repo:latest"
    
    Write-Host "Pulling $SOURCE..." -ForegroundColor Yellow
    docker pull $SOURCE
    
    Write-Host "Tagging para $TARGET..." -ForegroundColor Yellow
    docker tag $SOURCE $TARGET
    
    Write-Host "Pushing $TARGET..." -ForegroundColor Yellow
    docker push $TARGET
    
    Write-Host "Pulling NGINX $NGINX_SOURCE..." -ForegroundColor Yellow
    docker pull $NGINX_SOURCE
    
    Write-Host "Tagging para NGINX $NGINX_TARGET..." -ForegroundColor Yellow
    docker tag $NGINX_SOURCE $NGINX_TARGET
    
    Write-Host "Pushing NGINX $NGINX_TARGET..." -ForegroundColor Yellow
    docker push $NGINX_TARGET
    
    Write-Host "✓ Concluído: $SERVICE" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host "Migração concluída!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green