FROM alpine:3.19

RUN apk add --no-cache \
    x11vnc \
    xvfb \
    xterm \
    fluxbox \
    supervisor

# Create supervisor config to run Xvfb + fluxbox + x11vnc
RUN mkdir -p /etc/supervisor.d
COPY supervisord.conf /etc/supervisord.conf

# VNC password
RUN mkdir -p /root/.vnc && \
    x11vnc -storepasswd testpass /root/.vnc/passwd

EXPOSE 5900

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
