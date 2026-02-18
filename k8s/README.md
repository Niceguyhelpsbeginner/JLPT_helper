# Kubernetes 매니페스트 파일

이 디렉토리에는 Kubernetes 배포를 위한 매니페스트 파일들이 포함되어 있습니다.

## 📁 파일 구조

### 기본 파일 (모든 환경 공통)
- `configmap.yaml` - 설정 값 관리
- `deployment.yaml` - 애플리케이션 배포 설정 (로컬/Minikube용)
- `service.yaml` - 클러스터 내부 서비스 노출 (ClusterIP)
- `service-minikube.yaml` - Minikube용 LoadBalancer 타입 (tunnel 사용)
- `service-nodeport.yaml` - NodePort 타입 (같은 네트워크 내 외부 접근)
- `ingress.yaml` - 외부 트래픽 라우팅 (일반 Ingress)

### AWS 전용 파일
- `deployment-aws.yaml` - AWS ECR 이미지를 사용하는 Deployment
- `service-aws.yaml` - AWS LoadBalancer 타입 Service
- `ingress-aws.yaml` - AWS ALB (Application Load Balancer) Ingress

### 배포 스크립트
- `deploy.sh` - Linux/Mac용 배포 스크립트
- `deploy.ps1` - Windows PowerShell용 배포 스크립트

## 🚀 사용 방법

### 로컬/Minikube 배포

**로컬 접근만 필요한 경우:**
```bash
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
minikube service jlpt-helper-service
```

**외부 접근이 필요한 경우 (같은 네트워크 내):**
```bash
# 방법 1: LoadBalancer + tunnel (권장)
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service-minikube.yaml
# 별도 터미널에서: minikube tunnel

# 방법 2: NodePort
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service-nodeport.yaml
# http://<minikube-ip>:30080 으로 접근
```

### AWS EKS 배포

```bash
# AWS ECR 이미지 경로로 deployment-aws.yaml 수정 후
kubectl apply -f configmap.yaml
kubectl apply -f deployment-aws.yaml
kubectl apply -f service-aws.yaml
kubectl apply -f ingress-aws.yaml  # 선택사항
```

### 배포 스크립트 사용

```powershell
# Windows
.\deploy.ps1

# Linux/Mac
chmod +x deploy.sh
./deploy.sh
```

## 📝 주의사항

1. **이미지 경로**: `deployment-aws.yaml`의 이미지 경로를 실제 ECR 경로로 변경해야 합니다.
2. **도메인**: `ingress.yaml`과 `ingress-aws.yaml`의 호스트를 실제 도메인으로 변경해야 합니다.
3. **리소스 제한**: 필요에 따라 `deployment.yaml`의 리소스 요청/제한을 조정하세요.

## 🔗 관련 문서

- [Kubernetes 배포 가이드](../KUBERNETES_DEPLOYMENT.md)
- [Minikube 상세 가이드](../MINIKUBE_GUIDE.md) - 외부 접근 방법 포함
- [AWS 배포 가이드](../AWS_DEPLOYMENT.md)
