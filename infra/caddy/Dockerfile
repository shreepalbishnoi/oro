# Caddy with the Cloudflare DNS module: certificates are issued through the DNS-01 challenge, so
# HTTPS works while the domain is proxied by Cloudflare (SSL mode "Full (strict)").
FROM caddy:2.10.2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2.10.2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
