# Nginx를 사용한 정적 웹 애플리케이션 Dockerfile
FROM nginx:alpine

# 작업 디렉토리 설정
WORKDIR /usr/share/nginx/html

# 기존 nginx 기본 파일 제거
RUN rm -rf ./*

# 프로젝트 파일 복사
COPY index.html .
COPY app.js .
COPY styles.css .
COPY favicon.jpg .
COPY public/ ./public/

# Nginx 설정 파일 복사 (SPA 라우팅 지원)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 포트 노출
EXPOSE 80

# Nginx 실행
CMD ["nginx", "-g", "daemon off;"]
