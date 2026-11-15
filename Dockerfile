FROM nginx:1.27-alpine

# Instalar wget para healthcheck
RUN apk add --no-cache wget

# Copia el sitio estático
COPY *.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY audio/ /usr/share/nginx/html/audio/
COPY sw.js manifest.json icon-192.png icon-512.png robots.txt sitemap.xml /usr/share/nginx/html/

# Configuración nginx (gzip, caché y 404 reales). `nginx -t` hace fallar el build
# si la configuración es inválida, en vez de fallar el contenedor ya desplegado.
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/index.html || exit 1
