# Paso 1: genera el sitio en dist/ (home en italiano + una home por idioma + sitemap).
# Si build.mjs falla, el build falla y el sitio publicado no cambia.
FROM node:22-alpine AS build
WORKDIR /src
COPY . .
RUN node build.mjs

# Paso 2: nginx sirve dist/ tal cual.
FROM nginx:1.27-alpine

# Instalar wget para healthcheck
RUN apk add --no-cache wget

COPY --from=build /src/dist/ /usr/share/nginx/html/

# Configuración nginx (gzip, caché y 404 reales). `nginx -t` hace fallar el build
# si la configuración es inválida, en vez de fallar el contenedor ya desplegado.
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ || exit 1
