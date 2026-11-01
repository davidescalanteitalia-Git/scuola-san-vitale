FROM nginx:1.27-alpine

# Instalar wget para healthcheck
RUN apk add --no-cache wget

# Copia el sitio estático
COPY *.html /usr/share/nginx/html/

# Configuración nginx liviana: gzip + cache headers
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    gzip on;\n\
    gzip_types text/html text/css application/javascript;\n\
    add_header Cache-Control "public, max-age=3600";\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/index.html || exit 1
