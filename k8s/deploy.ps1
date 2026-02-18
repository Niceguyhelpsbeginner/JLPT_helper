# Kubernetes 배포 PowerShell 스크립트
# 사용법: .\deploy.ps1 [환경]
# 예: .\deploy.ps1 production

param(
    [string]$Environment = "development"
)

$Namespace = "jlpt-helper-$Environment"

Write-Host "🚀 JLPT Helper Kubernetes 배포 시작" -ForegroundColor Green
Write-Host "환경: $Environment"
Write-Host "네임스페이스: $Namespace"

# 네임스페이스 생성 (없는 경우)
kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f -

# ConfigMap 배포
Write-Host "📦 ConfigMap 배포 중..." -ForegroundColor Yellow
kubectl apply -f configmap.yaml -n $Namespace

# Deployment 배포
Write-Host "🚢 Deployment 배포 중..." -ForegroundColor Yellow
kubectl apply -f deployment.yaml -n $Namespace

# Service 배포
Write-Host "🌐 Service 배포 중..." -ForegroundColor Yellow
kubectl apply -f service.yaml -n $Namespace

# Ingress 배포 (선택사항)
if (Test-Path ingress.yaml) {
    Write-Host "🔀 Ingress 배포 중..." -ForegroundColor Yellow
    kubectl apply -f ingress.yaml -n $Namespace
}

# 배포 상태 확인
Write-Host "⏳ 배포 상태 확인 중..." -ForegroundColor Yellow
kubectl rollout status deployment/jlpt-helper -n $Namespace --timeout=300s

Write-Host "✅ 배포 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 배포 정보:" -ForegroundColor Cyan
kubectl get all -n $Namespace -l app=jlpt-helper

Write-Host ""
Write-Host "🔍 Pod 로그 확인:" -ForegroundColor Cyan
Write-Host "kubectl logs -f -l app=jlpt-helper -n $Namespace"
