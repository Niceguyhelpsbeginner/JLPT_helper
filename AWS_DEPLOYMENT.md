# AWS 배포 가이드

이 문서는 JLPT Helper 애플리케이션을 AWS에 배포하는 여러 방법을 설명합니다.

## 🎯 배포 옵션 비교

### 1. **AWS EKS (Elastic Kubernetes Service)** ⭐ 권장
- **장점**: 완전 관리형 Kubernetes, 확장성 우수, 프로덕션에 적합
- **단점**: 설정이 복잡하고 비용이 높음 (월 $73 + EC2 비용)
- **비용**: 클러스터당 월 $73 + 워커 노드 EC2 비용
- **추천 대상**: Kubernetes를 배우고 싶고, 프로덕션 환경이 필요한 경우

### 2. **AWS ECS (Elastic Container Service)**
- **장점**: Kubernetes보다 간단, AWS 네이티브, 비용 효율적
- **단점**: Kubernetes가 아님 (다른 오케스트레이션 도구)
- **비용**: EC2 또는 Fargate 비용만 (관리 비용 없음)
- **추천 대상**: Kubernetes 학습이 목적이 아니고, 간단하게 배포하고 싶은 경우

### 3. **AWS EC2에 직접 Kubernetes 설치**
- **장점**: 완전한 제어, 학습에 좋음, EKS보다 저렴
- **단점**: 직접 관리해야 함, 설정 복잡
- **비용**: EC2 인스턴스 비용만 (t3.small 기준 월 $15~30)
- **추천 대상**: Kubernetes를 깊이 배우고 싶고, 비용을 절약하고 싶은 경우

### 4. **AWS Elastic Beanstalk**
- **장점**: 가장 간단, 자동 스케일링, 무료 티어
- **단점**: Kubernetes가 아님, 제어권 제한적
- **비용**: EC2 비용만 (무료 티어 1년)
- **추천 대상**: 빠르게 배포하고 싶고, Kubernetes 학습이 목적이 아닌 경우

### 5. **로컬 Kubernetes (Minikube/Kind)** - 무료
- **장점**: 완전 무료, 학습에 최적
- **단점**: 프로덕션에 부적합, 외부 접근 제한
- **비용**: 무료
- **추천 대상**: Kubernetes 학습이 목적이고, 실제 서비스는 다른 방법 사용

## 🚀 AWS EKS 배포 가이드

### 사전 요구사항

1. **AWS 계정** 및 IAM 권한
2. **AWS CLI 설치 및 설정**
   ```bash
   # AWS CLI 설치 (Windows)
   # https://aws.amazon.com/cli/ 에서 다운로드
   
   # AWS 자격 증명 설정
   aws configure
   ```

3. **eksctl 설치** (EKS 클러스터 생성 도구)
   ```bash
   # Windows (Chocolatey)
   choco install eksctl
   
   # 또는 직접 다운로드
   # https://github.com/weaveworks/eksctl/releases
   ```

4. **kubectl 설치**
   ```bash
   choco install kubernetes-cli
   ```

### 1단계: Docker 이미지를 ECR에 푸시

#### ECR 리포지토리 생성

```bash
# AWS 리전 설정 (예: 서울)
aws configure set region ap-northeast-2

# ECR 리포지토리 생성
aws ecr create-repository --repository-name jlpt-helper --region ap-northeast-2

# 로그인 정보 가져오기
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com
```

#### 이미지 빌드 및 푸시

```bash
# 이미지 빌드
docker build -t jlpt-helper:latest .

# ECR 태그 지정 (AWS_ACCOUNT_ID를 실제 계정 ID로 변경)
docker tag jlpt-helper:latest <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/jlpt-helper:latest

# ECR에 푸시
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/jlpt-helper:latest
```

### 2단계: EKS 클러스터 생성

#### eksctl로 클러스터 생성 (가장 간단)

```bash
# 기본 클러스터 생성 (약 15-20분 소요)
eksctl create cluster \
  --name jlpt-helper-cluster \
  --region ap-northeast-2 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 3 \
  --managed

# 또는 더 작은 클러스터 (비용 절약)
eksctl create cluster \
  --name jlpt-helper-cluster \
  --region ap-northeast-2 \
  --nodegroup-name standard-workers \
  --node-type t3.small \
  --nodes 1 \
  --nodes-min 1 \
  --nodes-max 2 \
  --managed
```

#### 클러스터 연결 확인

```bash
# kubeconfig 업데이트
aws eks update-kubeconfig --name jlpt-helper-cluster --region ap-northeast-2

# 클러스터 연결 확인
kubectl get nodes
```

### 3단계: Kubernetes 매니페스트 수정

#### `k8s/deployment.yaml` 수정

ECR 이미지 경로로 변경:

```yaml
containers:
- name: jlpt-helper
  image: <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/jlpt-helper:latest
  imagePullPolicy: Always
```

### 4단계: 애플리케이션 배포

```bash
# ConfigMap 배포
kubectl apply -f k8s/configmap.yaml

# Deployment 배포
kubectl apply -f k8s/deployment.yaml

# Service 배포
kubectl apply -f k8s/service.yaml

# 배포 상태 확인
kubectl get pods -l app=jlpt-helper
kubectl get services
```

### 5단계: 외부 접근 설정

#### LoadBalancer 타입으로 Service 변경

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: jlpt-helper-service
spec:
  type: LoadBalancer  # ClusterIP에서 LoadBalancer로 변경
  selector:
    app: jlpt-helper
  ports:
  - port: 80
    targetPort: 80
```

```bash
# Service 업데이트
kubectl apply -f k8s/service.yaml

# LoadBalancer 외부 IP 확인 (몇 분 소요)
kubectl get service jlpt-helper-service
# EXTERNAL-IP 열에서 주소 확인
```

#### 또는 Ingress 사용 (도메인 + HTTPS)

```bash
# AWS Load Balancer Controller 설치
kubectl apply -k "https://github.com/aws/eks-charts/stable/aws-load-balancer-controller/crds?ref=master"

helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=jlpt-helper-cluster

# Ingress 배포
kubectl apply -f k8s/ingress.yaml
```

## 💰 AWS EKS 비용 예상

### 최소 구성 (학습용)
- **EKS 클러스터**: 월 $73
- **t3.small 워커 노드 1개**: 월 약 $15
- **총 비용**: 월 약 **$88**

### 권장 구성 (프로덕션)
- **EKS 클러스터**: 월 $73
- **t3.medium 워커 노드 2개**: 월 약 $60
- **총 비용**: 월 약 **$133**

### 비용 절감 팁
1. **개발 환경**: 클러스터를 사용하지 않을 때 삭제
2. **Spot 인스턴스**: 워커 노드에 Spot 인스턴스 사용 (최대 90% 할인)
3. **Fargate**: 서버리스 컨테이너 사용 (필요할 때만 과금)

## 🔄 AWS ECS 배포 (Kubernetes 대안)

ECS는 Kubernetes보다 간단하고 비용 효율적입니다.

### 1. ECR에 이미지 푸시 (위와 동일)

### 2. ECS 클러스터 및 서비스 생성

```bash
# ECS 클러스터 생성
aws ecs create-cluster --cluster-name jlpt-helper-cluster

# Task Definition 생성 (task-definition.json 파일 필요)
aws ecs register-task-definition --cli-input-json file://task-definition.json

# 서비스 생성
aws ecs create-service \
  --cluster jlpt-helper-cluster \
  --service-name jlpt-helper-service \
  --task-definition jlpt-helper \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

## 🎓 학습 추천 경로

### 1단계: 로컬에서 시작 (무료)
```bash
# Minikube 설치 및 실행
minikube start
kubectl apply -f k8s/
minikube service jlpt-helper-service
```

### 2단계: AWS EC2에 직접 설치 (저렴)
- EC2 인스턴스에 kubeadm으로 Kubernetes 설치
- 비용: 월 $15~30

### 3단계: AWS EKS 사용 (프로덕션)
- 관리형 Kubernetes로 실제 서비스 배포
- 비용: 월 $88~133

## 📚 추가 리소스

- [AWS EKS 공식 문서](https://docs.aws.amazon.com/eks/)
- [eksctl 가이드](https://eksctl.io/)
- [AWS EKS 가격](https://aws.amazon.com/eks/pricing/)
- [AWS ECS vs EKS 비교](https://aws.amazon.com/containers/)

## ⚠️ 주의사항

1. **비용 관리**: EKS 클러스터는 실행 중일 때 계속 비용이 발생합니다
2. **리소스 정리**: 테스트 후 클러스터를 삭제하여 비용 절감
3. **보안 그룹**: 적절한 보안 그룹 설정 필수
4. **IAM 권한**: EKS 생성을 위한 충분한 IAM 권한 필요

## 🗑️ 리소스 삭제

### EKS 클러스터 삭제

```bash
# 클러스터 삭제 (모든 리소스 포함)
eksctl delete cluster --name jlpt-helper-cluster --region ap-northeast-2
```

### ECR 리포지토리 삭제

```bash
# 이미지 삭제
aws ecr batch-delete-image --repository-name jlpt-helper --image-ids imageTag=latest

# 리포지토리 삭제
aws ecr delete-repository --repository-name jlpt-helper --force
```
