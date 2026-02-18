# Kubernetes 배포 가이드

이 가이드는 JLPT Helper 애플리케이션을 Kubernetes 클러스터에 배포하는 방법을 설명합니다.

## 📋 사전 요구사항

1. **Kubernetes 클러스터**
   - **로컬 (무료, 학습용)**:
     - Minikube (로컬 개발용) ⭐ 학습 추천
     - Kind (Kubernetes in Docker)
   - **클라우드 (유료, 프로덕션용)**:
     - AWS EKS (Elastic Kubernetes Service) - 월 $73 + EC2 비용
     - Google GKE (Google Kubernetes Engine)
     - Azure AKS (Azure Kubernetes Service)
   - **자체 관리**: EC2에 직접 설치 (월 $15~30)

> 💡 **AWS 사용 시**: `AWS_DEPLOYMENT.md` 파일을 참고하세요!

2. **kubectl 설치**
   ```bash
   # Windows (Chocolatey)
   choco install kubernetes-cli
   
   # 또는 직접 다운로드
   # https://kubernetes.io/docs/tasks/tools/
   ```

3. **Docker 설치**
   - Docker Desktop 또는 Docker Engine

4. **Docker 이미지 레지스트리** (선택사항)
   - Docker Hub
   - Google Container Registry (GCR)
   - Amazon ECR
   - Azure Container Registry (ACR)
   - 또는 자체 레지스트리

## 🚀 배포 단계

### 1. Docker 이미지 빌드

#### 로컬에서 빌드 (Minikube 사용 시)

```bash
# Minikube의 Docker 데몬 사용
eval $(minikube docker-env)

# 이미지 빌드
docker build -t jlpt-helper:latest .
```

#### 일반 Docker 빌드

```bash
# 이미지 빌드
docker build -t jlpt-helper:latest .

# 이미지 태그 지정 (레지스트리에 푸시하기 위해)
docker tag jlpt-helper:latest your-registry/jlpt-helper:v1.0.0

# 레지스트리에 푸시
docker push your-registry/jlpt-helper:v1.0.0
```

### 2. Kubernetes 매니페스트 파일 수정

#### `k8s/deployment.yaml` 수정

이미지 이름을 실제 빌드한 이미지로 변경:

```yaml
image: jlpt-helper:latest  # 로컬 이미지인 경우
# 또는
image: your-registry/jlpt-helper:v1.0.0  # 레지스트리 이미지인 경우
```

레플리카 수 조정 (필요시):

```yaml
replicas: 3  # 원하는 개수로 변경
```

#### `k8s/ingress.yaml` 수정 (Ingress 사용 시)

도메인 이름 변경:

```yaml
- host: jlpt-helper.example.com  # 실제 도메인으로 변경
```

### 3. Kubernetes 리소스 배포

#### 모든 리소스 배포

```bash
# k8s 디렉토리로 이동
cd k8s

# 모든 리소스 배포
kubectl apply -f .

# 또는 개별적으로 배포
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml  # Ingress 사용 시
```

#### 배포 상태 확인

```bash
# Pod 상태 확인
kubectl get pods -l app=jlpt-helper

# Deployment 상태 확인
kubectl get deployment jlpt-helper

# Service 확인
kubectl get service jlpt-helper-service

# Ingress 확인 (사용 시)
kubectl get ingress jlpt-helper-ingress

# 상세 정보 확인
kubectl describe deployment jlpt-helper
kubectl describe service jlpt-helper-service
```

### 4. 애플리케이션 접근

#### Minikube 사용 시

**로컬 접근만 필요한 경우:**
```bash
# Minikube 서비스 URL 확인
minikube service jlpt-helper-service --url

# 또는 브라우저에서 직접 열기
minikube service jlpt-helper-service
```

**외부 접근이 필요한 경우 (같은 네트워크 내):**
```bash
# 1. Service를 LoadBalancer 타입으로 변경
kubectl apply -f k8s/service-minikube.yaml

# 2. 별도 터미널에서 tunnel 실행 (관리자 권한 필요)
minikube tunnel

# 3. 외부 IP 확인
kubectl get service jlpt-helper-service
# EXTERNAL-IP로 접근 가능

# 또는 NodePort 사용
kubectl apply -f k8s/service-nodeport.yaml
minikube ip  # IP 확인
# http://<minikube-ip>:30080 으로 접근
```

> 💡 **자세한 외부 접근 방법**: [`MINIKUBE_GUIDE.md`](./MINIKUBE_GUIDE.md) 참고

#### NodePort 사용 시

Service 타입을 NodePort로 변경:

```yaml
# k8s/service.yaml
spec:
  type: NodePort
```

포트 확인:

```bash
kubectl get service jlpt-helper-service
# PORT(S) 열에서 NodePort 확인 (예: 80:30080/TCP)
# http://<노드-IP>:30080 으로 접근
```

#### LoadBalancer 사용 시

Service 타입을 LoadBalancer로 변경:

```yaml
# k8s/service.yaml
spec:
  type: LoadBalancer
```

외부 IP 확인:

```bash
kubectl get service jlpt-helper-service
# EXTERNAL-IP 열에서 IP 확인
```

#### Ingress 사용 시

Ingress Controller가 설치되어 있어야 합니다:

```bash
# Nginx Ingress Controller 설치 (예시)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

# Ingress IP 확인
kubectl get ingress jlpt-helper-ingress
```

## 🔧 설정 및 커스터마이징

### 리소스 제한 조정

`k8s/deployment.yaml`에서 리소스 요청/제한 수정:

```yaml
resources:
  requests:
    memory: "64Mi"   # 최소 메모리
    cpu: "50m"       # 최소 CPU
  limits:
    memory: "128Mi"  # 최대 메모리
    cpu: "100m"      # 최대 CPU
```

### 레플리카 수 조정

```yaml
spec:
  replicas: 5  # 원하는 개수로 변경
```

### 헬스 체크 설정

`k8s/deployment.yaml`에서 헬스 체크 경로/간격 조정:

```yaml
livenessProbe:
  httpGet:
    path: /
    port: 80
  initialDelaySeconds: 30  # 초기 지연 시간
  periodSeconds: 10         # 체크 간격
```

## 📊 모니터링 및 로그

### Pod 로그 확인

```bash
# 모든 Pod 로그
kubectl logs -l app=jlpt-helper

# 특정 Pod 로그
kubectl logs <pod-name>

# 실시간 로그 스트리밍
kubectl logs -f -l app=jlpt-helper
```

### Pod 상태 확인

```bash
# Pod 상세 정보
kubectl describe pod <pod-name>

# Pod 내부 접속 (디버깅용)
kubectl exec -it <pod-name> -- /bin/sh
```

## 🔄 업데이트 및 롤백

### 이미지 업데이트

```bash
# 새 이미지 빌드
docker build -t jlpt-helper:v1.1.0 .

# Deployment 이미지 업데이트
kubectl set image deployment/jlpt-helper jlpt-helper=jlpt-helper:v1.1.0

# 롤아웃 상태 확인
kubectl rollout status deployment/jlpt-helper
```

### 롤백

```bash
# 이전 버전으로 롤백
kubectl rollout undo deployment/jlpt-helper

# 특정 리비전으로 롤백
kubectl rollout undo deployment/jlpt-helper --to-revision=2

# 롤아웃 히스토리 확인
kubectl rollout history deployment/jlpt-helper
```

## 🗑️ 삭제

### 리소스 삭제

```bash
# 모든 리소스 삭제
kubectl delete -f k8s/

# 또는 개별 삭제
kubectl delete deployment jlpt-helper
kubectl delete service jlpt-helper-service
kubectl delete ingress jlpt-helper-ingress
kubectl delete configmap jlpt-helper-config
```

## 🐛 문제 해결

### Pod가 시작되지 않는 경우

```bash
# Pod 이벤트 확인
kubectl describe pod <pod-name>

# Pod 로그 확인
kubectl logs <pod-name>
```

### 이미지를 찾을 수 없는 경우

- 이미지 이름이 올바른지 확인
- 이미지가 레지스트리에 푸시되었는지 확인
- `imagePullPolicy` 설정 확인 (로컬 이미지는 `IfNotPresent` 또는 `Never`)

### 서비스에 접근할 수 없는 경우

- Service의 selector가 Pod의 label과 일치하는지 확인
- 포트 번호가 올바른지 확인
- 방화벽 규칙 확인

## 📚 추가 학습 자료

- [Kubernetes 공식 문서](https://kubernetes.io/docs/)
- [kubectl 치트시트](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Kubernetes 실습 튜토리얼](https://kubernetes.io/docs/tutorials/)

## 💡 팁

1. **로컬 개발**: Minikube나 Kind를 사용하여 로컬에서 테스트 (무료)
2. **AWS 배포**: AWS EKS 사용 시 `AWS_DEPLOYMENT.md` 참고
3. **스테이징 환경**: 클러스터에 별도 네임스페이스 생성하여 스테이징 배포
4. **프로덕션**: 고가용성을 위해 최소 3개의 레플리카 사용 권장
5. **모니터링**: Prometheus와 Grafana를 사용한 모니터링 설정 고려
6. **CI/CD**: GitHub Actions나 GitLab CI를 사용한 자동 배포 파이프라인 구축

## 🌐 클라우드 배포 옵션

### AWS 배포
- **AWS EKS**: 완전 관리형 Kubernetes (월 $73 + EC2 비용)
- **AWS ECS**: Kubernetes 대안, 더 간단하고 저렴
- **자세한 내용**: [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) 참고

### 다른 클라우드 옵션
- **Google GKE**: Google Cloud의 관리형 Kubernetes
- **Azure AKS**: Azure의 관리형 Kubernetes
- **DigitalOcean**: 간단하고 저렴한 Kubernetes 서비스
