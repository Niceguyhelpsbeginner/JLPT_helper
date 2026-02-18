# Minikube 배포 가이드

이 가이드는 Minikube를 사용하여 로컬에서 Kubernetes를 실행하고, 외부 접근을 설정하는 방법을 설명합니다.

## 📋 Minikube 외부 접근 방법

### 방법 1: `minikube tunnel` (권장) ⭐

**가장 간단하고 효과적인 방법입니다!**

#### 장점
- LoadBalancer 타입 서비스 지원
- 외부 IP 자동 할당
- 같은 네트워크 내 다른 기기에서 접근 가능
- 설정이 간단함

#### 사용 방법

```bash
# 1. Minikube 시작
minikube start

# 2. Service를 LoadBalancer 타입으로 변경
# k8s/service-minikube.yaml 사용 또는 service.yaml 수정

# 3. 애플리케이션 배포
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service-minikube.yaml  # LoadBalancer 타입

# 4. 별도 터미널에서 tunnel 실행 (백그라운드로 실행)
minikube tunnel

# 5. 외부 IP 확인
kubectl get service jlpt-helper-service
# EXTERNAL-IP 열에서 IP 확인 (예: 10.96.0.1)

# 6. 접근
# 같은 네트워크의 다른 기기에서: http://<EXTERNAL-IP>
# 또는: http://<minikube-ip> (minikube ip 명령어로 확인)
```

#### 주의사항
- `minikube tunnel`은 별도 터미널에서 계속 실행되어야 합니다
- 관리자 권한이 필요할 수 있습니다
- Windows에서는 PowerShell을 관리자 권한으로 실행해야 합니다

---

### 방법 2: NodePort 사용

#### 장점
- 추가 도구 불필요
- 설정이 간단함

#### 단점
- 같은 네트워크 내에서만 접근 가능
- 포트 번호가 랜덤하게 할당됨

#### 사용 방법

```bash
# 1. Service를 NodePort 타입으로 변경
kubectl apply -f k8s/service-nodeport.yaml

# 2. NodePort 확인
kubectl get service jlpt-helper-service
# PORT(S) 열에서 NodePort 확인 (예: 80:30080/TCP)

# 3. Minikube IP 확인
minikube ip
# 예: 192.168.49.2

# 4. 접근
# 같은 네트워크의 다른 기기에서: http://<minikube-ip>:<NodePort>
# 예: http://192.168.49.2:30080
```

---

### 방법 3: `minikube service` 명령어

#### 장점
- 자동으로 포트 포워딩
- 브라우저 자동 열기

#### 단점
- 로컬 머신에서만 접근 가능
- 외부 기기에서는 접근 불가

#### 사용 방법

```bash
# 브라우저에서 자동으로 열기
minikube service jlpt-helper-service

# 또는 URL만 확인
minikube service jlpt-helper-service --url
```

---

### 방법 4: ngrok 사용 (완전한 외부 접근)

**인터넷 어디서나 접근하고 싶을 때 사용**

#### 장점
- 인터넷 어디서나 접근 가능
- HTTPS 지원
- 공개 URL 제공

#### 단점
- ngrok 계정 필요 (무료 티어 있음)
- 추가 도구 설치 필요

#### 사용 방법

```bash
# 1. ngrok 설치
# https://ngrok.com/download 에서 다운로드

# 2. Minikube 서비스 포트 확인
minikube service jlpt-helper-service --url
# 예: http://127.0.0.1:54321

# 3. ngrok으로 터널 생성
ngrok http 54321

# 4. ngrok이 제공하는 공개 URL 사용
# 예: https://abc123.ngrok.io
```

---

### 방법 5: `kubectl port-forward`

#### 장점
- 추가 설정 불필요
- 빠른 테스트에 적합

#### 단점
- 로컬에서만 접근 가능
- 연결이 끊기면 다시 실행해야 함

#### 사용 방법

```bash
# 포트 포워딩 (로컬 8080 포트로)
kubectl port-forward service/jlpt-helper-service 8080:80

# 접근: http://localhost:8080
```

---

## 🚀 빠른 시작 (Minikube)

### 1단계: Minikube 설치 및 시작

```bash
# Windows (Chocolatey)
choco install minikube

# 또는 직접 다운로드
# https://minikube.sigs.k8s.io/docs/start/

# Minikube 시작
minikube start

# 상태 확인
minikube status
```

### 2단계: Docker 이미지 빌드

```bash
# Minikube의 Docker 데몬 사용 (중요!)
minikube docker-env
# 출력된 명령어를 실행 (Windows PowerShell)
# 예: & minikube -p minikube docker-env | Invoke-Expression

# 이미지 빌드
docker build -t jlpt-helper:latest .

# 이미지 확인
docker images | grep jlpt-helper
```

### 3단계: Kubernetes 리소스 배포

```bash
# ConfigMap 배포
kubectl apply -f k8s/configmap.yaml

# Deployment 배포
kubectl apply -f k8s/deployment.yaml

# Service 배포 (원하는 방법에 따라 선택)
# 방법 1: LoadBalancer (tunnel 사용)
kubectl apply -f k8s/service-minikube.yaml

# 방법 2: NodePort
kubectl apply -f k8s/service-nodeport.yaml

# 배포 상태 확인
kubectl get pods
kubectl get services
```

### 4단계: 외부 접근 설정

#### LoadBalancer + Tunnel 사용 (권장)

```bash
# 별도 PowerShell 창을 관리자 권한으로 열고
minikube tunnel

# 원래 창에서 서비스 확인
kubectl get service jlpt-helper-service
# EXTERNAL-IP 확인 후 접근
```

#### NodePort 사용

```bash
# NodePort 확인
kubectl get service jlpt-helper-service

# Minikube IP 확인
minikube ip

# 접근: http://<minikube-ip>:<NodePort>
```

---

## 📱 접근 방법 비교

| 방법 | 로컬 접근 | 같은 네트워크 | 인터넷 접근 | 설정 난이도 |
|------|----------|--------------|------------|------------|
| `minikube service` | ✅ | ❌ | ❌ | ⭐ 쉬움 |
| `kubectl port-forward` | ✅ | ❌ | ❌ | ⭐ 쉬움 |
| NodePort | ✅ | ✅ | ❌ | ⭐⭐ 보통 |
| `minikube tunnel` | ✅ | ✅ | ❌ | ⭐⭐ 보통 |
| ngrok | ✅ | ✅ | ✅ | ⭐⭐⭐ 복잡 |

---

## 🔧 문제 해결

### Minikube가 시작되지 않는 경우

```bash
# Minikube 삭제 후 재시작
minikube delete
minikube start

# 드라이버 확인
minikube start --driver=hyperv  # Windows Hyper-V
# 또는
minikube start --driver=docker
```

### Tunnel이 작동하지 않는 경우

```bash
# 관리자 권한으로 PowerShell 실행
# Windows 방화벽 확인
# Minikube 재시작
minikube stop
minikube start
minikube tunnel
```

### 이미지를 찾을 수 없는 경우

```bash
# Minikube의 Docker 데몬 사용 확인
minikube docker-env
# 출력된 명령어 실행

# 이미지 다시 빌드
docker build -t jlpt-helper:latest .
```

### 포트가 이미 사용 중인 경우

```bash
# 사용 중인 포트 확인 (Windows)
netstat -ano | findstr :30080

# 다른 포트 사용하거나 프로세스 종료
```

---

## 💡 추천 설정

### 학습 목적 (로컬에서만)
- **방법**: `minikube service` 또는 `kubectl port-forward`
- **이유**: 가장 간단하고 빠름

### 같은 네트워크 내 공유
- **방법**: `minikube tunnel` + LoadBalancer
- **이유**: 설정이 간단하고 안정적

### 인터넷 공개 (데모/테스트)
- **방법**: ngrok
- **이유**: 완전한 외부 접근 가능

---

## 📚 추가 리소스

- [Minikube 공식 문서](https://minikube.sigs.k8s.io/docs/)
- [Minikube 시작 가이드](https://minikube.sigs.k8s.io/docs/start/)
- [ngrok 문서](https://ngrok.com/docs)
