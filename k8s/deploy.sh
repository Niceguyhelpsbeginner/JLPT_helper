#!/bin/bash

# Kubernetes 배포 스크립트
# 사용법: ./deploy.sh [환경]
# 예: ./deploy.sh production

set -e

ENVIRONMENT=${1:-development}
NAMESPACE="jlpt-helper-${ENVIRONMENT}"

echo "🚀 JLPT Helper Kubernetes 배포 시작"
echo "환경: ${ENVIRONMENT}"
echo "네임스페이스: ${NAMESPACE}"

# 네임스페이스 생성 (없는 경우)
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# ConfigMap 배포
echo "📦 ConfigMap 배포 중..."
kubectl apply -f configmap.yaml -n ${NAMESPACE}

# Deployment 배포
echo "🚢 Deployment 배포 중..."
kubectl apply -f deployment.yaml -n ${NAMESPACE}

# Service 배포
echo "🌐 Service 배포 중..."
kubectl apply -f service.yaml -n ${NAMESPACE}

# Ingress 배포 (선택사항)
if [ -f ingress.yaml ]; then
    echo "🔀 Ingress 배포 중..."
    kubectl apply -f ingress.yaml -n ${NAMESPACE}
fi

# 배포 상태 확인
echo "⏳ 배포 상태 확인 중..."
kubectl rollout status deployment/jlpt-helper -n ${NAMESPACE} --timeout=300s

echo "✅ 배포 완료!"
echo ""
echo "📊 배포 정보:"
kubectl get all -n ${NAMESPACE} -l app=jlpt-helper

echo ""
echo "🔍 Pod 로그 확인:"
echo "kubectl logs -f -l app=jlpt-helper -n ${NAMESPACE}"
